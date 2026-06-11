import { getSessionUser, json, unauthorized } from './_auth.js';
import { listDevices, setDevice } from './_devices.js';

const SYS_DEFAULT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's AI assistant. Highly intelligent, slightly witty, professional. Address user as "sir" or "ma'am". Refer to yourself as JARVIS. Keep responses concise but thorough.`;

const SYS_CAPABILITIES = `

You have tools to manage the user's task list and to control the home devices shown on their HOME panel. Use them whenever the user asks to add, complete, list or delete tasks, or to switch devices on or off, and confirm the action briefly afterwards.

Your replies are read aloud via text-to-speech. Keep them short and speakable: plain prose, no markdown, no bullet lists, no code blocks unless explicitly asked.`;

const MAX_CONTEXT_MESSAGES = 24; // cap what we send to the LLM per turn
const MAX_TOOL_ROUNDS = 5;
const DEFAULT_MODEL = 'claude-sonnet-4-6';

const TOOLS = [
  {
    name: 'add_task',
    description: 'Add a task to the user\'s task list. Call this when the user asks to add, create, or remember a task or to-do item.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The task description' } },
      required: ['text'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List the user\'s tasks with their ids and completion status. Call this when the user asks what is on their list, and before completing or deleting a task when you do not know its id.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done (or back to not done). Call list_tasks first if you do not know the task id.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The task id' },
        done: { type: 'boolean', description: 'Defaults to true' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task permanently. Call list_tasks first if you do not know the task id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'The task id' } },
      required: ['id'],
    },
  },
  {
    name: 'list_devices',
    description: 'List the smart home devices on the HOME panel and whether each is on or off.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_weather',
    description: 'Get the current weather and today\'s forecast at the user\'s location. Call this when the user asks about the weather, temperature, wind, rain, or conditions outside.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_device',
    description: 'Turn a home device on or off. Call this when the user asks to switch the lights, security, climate, or comms array. Known device ids: lights, security, hvac, comms — call list_devices if unsure.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The device id' },
        on: { type: 'boolean', description: 'true to switch on, false to switch off' },
      },
      required: ['id', 'on'],
    },
  },
];

export async function onRequestPost({ request, env, waitUntil }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const apiKey = env.ANTHROPIC_API_KEY;
  const openrouterKey = env.OPENROUTER_API_KEY;

  if (!apiKey && !openrouterKey) {
    return json({ error: 'No LLM API key configured on server. Ask your admin to set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.' }, 503);
  }

  const { messages: rawMessages, web_search, system_prompt, location: rawLocation } = await request.json();
  const location = (rawLocation && Number.isFinite(rawLocation.lat) && Number.isFinite(rawLocation.lon))
    ? { lat: rawLocation.lat, lon: rawLocation.lon }
    : null;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) return json({ error: 'Messages required' }, 400);

  // Keep only valid roles/fields, cap the context, and drop any leading assistant
  // messages (the UI greeting) — the Anthropic API requires a user-first conversation.
  const cleaned = rawMessages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }))
    .slice(-MAX_CONTEXT_MESSAGES);
  const firstUser = cleaned.findIndex(m => m.role === 'user');
  const messages = firstUser >= 0 ? cleaned.slice(firstUser) : [];
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'Conversation must end with a user message' }, 400);
  }

  const sysPrompt = (system_prompt || SYS_DEFAULT) + SYS_CAPABILITIES
    + `\n\nCurrent date and time (UTC): ${new Date().toUTCString()}.`;
  const useOpenRouter = !apiKey || (env.PREFER_OPENROUTER === 'true');
  const lastUser = messages[messages.length - 1];

  const saveHistory = async (reply) => {
    if (!reply) return;
    await env.DB.prepare(`INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`).bind(user.user_id, 'user', lastUser.content).run();
    await env.DB.prepare(`INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`).bind(user.user_id, 'assistant', reply).run();
    await env.DB.prepare(`DELETE FROM chat_history WHERE user_id = ? AND id NOT IN (SELECT id FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 100)`).bind(user.user_id, user.user_id).run();
  };

  try {
    if (useOpenRouter && openrouterKey) {
      // OpenRouter path stays non-streaming; the reply is sent as one chunk.
      const reply = await handleOpenRouter(messages, sysPrompt, openrouterKey);
      await saveHistory(reply);
      return new Response(reply, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
    }
    return streamAnthropic({ env, userId: user.user_id, messages, sysPrompt, webSearch: !!web_search, apiKey, waitUntil, saveHistory, location });
  } catch (e) {
    return json({ error: `Worker error: ${e.message}` }, 500);
  }
}

// Streams plain-text chunks to the client while running the agentic tool loop:
// text deltas are forwarded as they arrive; when Claude stops to call a tool we
// execute it against D1, append the result, and continue the conversation.
function streamAnthropic({ env, userId, messages, sysPrompt, webSearch, apiKey, waitUntil, saveHistory, location }) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let full = '';

  const tools = [...TOOLS];
  if (webSearch) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 3 });

  const run = (async () => {
    try {
      let convo = messages.map(m => ({ role: m.role, content: m.content }));

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: env.CHAT_MODEL || DEFAULT_MODEL,
            max_tokens: 1024,
            system: sysPrompt,
            messages: convo,
            tools,
            stream: true,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `Anthropic API error ${res.status}`);
        }

        const { content, stopReason } = await consumeSSE(res, async (text) => {
          full += text;
          await writer.write(encoder.encode(text));
        });

        if (stopReason === 'tool_use') {
          const toolUses = content.filter(b => b.type === 'tool_use');
          const results = [];
          for (const tu of toolUses) {
            results.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: await executeTool(tu.name, tu.input, env, userId, location),
            });
          }
          convo = [...convo, { role: 'assistant', content: echoBlocks(content) }, { role: 'user', content: results }];
          continue;
        }
        if (stopReason === 'pause_turn') {
          // Server-side tool (web search) hit its iteration limit — resend to resume.
          convo = [...convo, { role: 'assistant', content: echoBlocks(content) }];
          continue;
        }
        break;
      }
    } catch (e) {
      const msg = full ? `\n[Systems disruption: ${e.message}]` : `Systems disruption detected, sir. ${e.message}`;
      full += msg;
      try { await writer.write(encoder.encode(msg)); } catch {}
    } finally {
      try { await writer.close(); } catch {}
      try { await saveHistory(full.trim()); } catch {}
    }
  })();
  waitUntil(run);

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}

// Parses the Anthropic SSE stream, forwarding text deltas via onText and
// reconstructing the content blocks so tool_use inputs can be executed.
async function consumeSSE(res, onText) {
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  const blocks = [];
  let stopReason = null;
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }

      if (ev.type === 'content_block_start') {
        blocks[ev.index] = { ...ev.content_block };
        if (ev.content_block.type === 'tool_use') blocks[ev.index]._json = '';
      } else if (ev.type === 'content_block_delta') {
        const b = blocks[ev.index];
        if (!b) continue;
        if (ev.delta.type === 'text_delta') {
          b.text = (b.text || '') + ev.delta.text;
          await onText(ev.delta.text);
        } else if (ev.delta.type === 'input_json_delta') {
          b._json += ev.delta.partial_json;
        }
      } else if (ev.type === 'content_block_stop') {
        const b = blocks[ev.index];
        if (b && b.type === 'tool_use') {
          try { b.input = b._json ? JSON.parse(b._json) : {}; } catch { b.input = {}; }
          delete b._json;
        }
      } else if (ev.type === 'message_delta') {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
      }
    }
  }

  return { content: blocks.filter(Boolean), stopReason };
}

// Reduce reconstructed blocks to the fields the API accepts when echoed back.
function echoBlocks(content) {
  return content
    .filter(b => (b.type === 'text' && b.text) || b.type === 'tool_use')
    .map(b => b.type === 'text'
      ? { type: 'text', text: b.text }
      : { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} });
}

// WMO weather interpretation codes (Open-Meteo `weather_code`)
const WMO_DESC = { 0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail' };

async function executeTool(name, input, env, userId, location) {
  try {
    switch (name) {
      case 'add_task': {
        const text = (input.text || '').trim();
        if (!text) return JSON.stringify({ error: 'text required' });
        const r = await env.DB.prepare(`INSERT INTO tasks (user_id, text, done) VALUES (?, ?, 0)`).bind(userId, text).run();
        return JSON.stringify({ ok: true, id: r.meta.last_row_id });
      }
      case 'list_tasks': {
        const { results } = await env.DB.prepare(`SELECT id, text, done FROM tasks WHERE user_id = ? ORDER BY id`).bind(userId).all();
        return JSON.stringify({ tasks: results.map(t => ({ id: t.id, text: t.text, done: !!t.done })) });
      }
      case 'complete_task': {
        const r = await env.DB.prepare(`UPDATE tasks SET done = ? WHERE id = ? AND user_id = ?`).bind(input.done === false ? 0 : 1, input.id, userId).run();
        return JSON.stringify(r.meta.changes > 0 ? { ok: true } : { error: 'task not found' });
      }
      case 'delete_task': {
        const r = await env.DB.prepare(`DELETE FROM tasks WHERE id = ? AND user_id = ?`).bind(input.id, userId).run();
        return JSON.stringify(r.meta.changes > 0 ? { ok: true } : { error: 'task not found' });
      }
      case 'get_weather': {
        if (!location) return JSON.stringify({ error: 'Location unavailable — the user has not granted location access in the app (the HOME tab requests it).' });
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto`);
        if (!r.ok) return JSON.stringify({ error: `weather service error ${r.status}` });
        const w = await r.json();
        const c = w.current || {};
        return JSON.stringify({
          conditions: WMO_DESC[c.weather_code] || 'unknown',
          temperature_c: c.temperature_2m,
          feels_like_c: c.apparent_temperature,
          humidity_pct: c.relative_humidity_2m,
          wind_kmh: c.wind_speed_10m,
          today_max_c: w.daily?.temperature_2m_max?.[0],
          today_min_c: w.daily?.temperature_2m_min?.[0],
          precipitation_chance_pct: w.daily?.precipitation_probability_max?.[0],
        });
      }
      case 'list_devices':
        return JSON.stringify({ devices: await listDevices(env.DB, userId) });
      case 'set_device': {
        const ok = await setDevice(env.DB, userId, String(input.id), !!input.on);
        return JSON.stringify(ok ? { ok: true } : { error: 'unknown device id' });
      }
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

async function handleOpenRouter(messages, sysPrompt, openrouterKey) {
  const body = {
    model: 'openrouter/auto:free',
    messages: [
      { role: 'system', content: sysPrompt },
      ...messages,
    ],
    max_tokens: 1000,
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://jarvis.dbwg2009.uk',
      'X-Title': 'J.A.R.V.I.S.',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return data.choices?.[0]?.message?.content || 'I encountered an anomaly, sir.';
}
