import { getSessionUser, json, unauthorized } from './_auth.js';

const SYS_DEFAULT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's AI assistant. Highly intelligent, slightly witty, professional. Address user as "sir" or "ma'am". Refer to yourself as JARVIS. Keep responses concise but thorough.`;

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const apiKey = env.ANTHROPIC_API_KEY;
  const openrouterKey = env.OPENROUTER_API_KEY;
  
  if (!apiKey && !openrouterKey) {
    return json({ error: 'No LLM API key configured on server. Ask your admin to set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.' }, 503);
  }

  const { messages, web_search, system_prompt } = await request.json();
  if (!messages?.length) return json({ error: 'Messages required' }, 400);

  const sysPrompt = system_prompt || SYS_DEFAULT;

  // Determine which provider to use
  const useOpenRouter = !apiKey || (env.PREFER_OPENROUTER === 'true');

  try {
    let reply;
    
    if (useOpenRouter && openrouterKey) {
      // Use OpenRouter
      reply = await handleOpenRouter(messages, sysPrompt, openrouterKey);
    } else if (apiKey) {
      // Use Anthropic (Claude)
      reply = await handleAnthropic(messages, sysPrompt, web_search, apiKey);
    } else {
      return json({ error: 'No LLM API key configured' }, 503);
    }

    const lastUser = messages[messages.length - 1];
    await env.DB.prepare(`INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`).bind(user.user_id, lastUser.role, lastUser.content).run();
    await env.DB.prepare(`INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`).bind(user.user_id, 'assistant', reply).run();

    await env.DB.prepare(`DELETE FROM chat_history WHERE user_id = ? AND id NOT IN (SELECT id FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100)`).bind(user.user_id, user.user_id).run();

    return json({ reply });
  } catch (e) {
    return json({ error: `Worker error: ${e.message}` }, 500);
  }
}

async function handleAnthropic(messages, sysPrompt, web_search, apiKey) {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: sysPrompt,
    messages,
  };

  if (web_search) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const reply = data.content?.map(b => b.type === 'text' ? b.text : '').filter(Boolean).join('\n')
    || "I encountered an anomaly, sir.";

  return reply;
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

  const reply = data.choices?.[0]?.message?.content
    || "I encountered an anomaly, sir.";

  return reply;
}
