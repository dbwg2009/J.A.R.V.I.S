import { getSessionUser, json, unauthorized } from './_auth.js';

const SYS_DEFAULT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's AI assistant. Highly intelligent, slightly witty, professional. Address user as "sir" or "ma'am". Refined British wit. Keep responses concise — 2-3 sentences when speaking aloud. Simulate smart home commands. Always stay in character.`;

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'API key not configured on server. Ask your admin to set ANTHROPIC_API_KEY.' }, 503);

  const { messages, web_search, system_prompt } = await request.json();
  if (!messages?.length) return json({ error: 'Messages required' }, 400);

  const sysPrompt = system_prompt || SYS_DEFAULT;

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: sysPrompt,
    messages,
  };

  if (web_search) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  try {
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
    if (data.error) return json({ error: data.error.message }, res.status);

    const reply = data.content?.map(b => b.type === 'text' ? b.text : '').filter(Boolean).join('\n')
      || "I encountered an anomaly, sir.";

    const lastUser = messages[messages.length - 1];
    await env.DB.prepare(`INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`).bind(user.user_id, lastUser.role, lastUser.content).run();
    await env.DB.prepare(`INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`).bind(user.user_id, 'assistant', reply).run();

    await env.DB.prepare(`DELETE FROM chat_history WHERE user_id = ? AND id NOT IN (SELECT id FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100)`).bind(user.user_id, user.user_id).run();

    return json({ reply });
  } catch (e) {
    return json({ error: `Worker error: ${e.message}` }, 500);
  }
}