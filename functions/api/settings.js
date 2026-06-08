import { getSessionUser, json, unauthorized } from './_auth.js';

const SYS_DEFAULT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's AI assistant. Highly intelligent, slightly witty, professional. Address user as "sir" or "ma'am". Refined British wit. Keep responses concise — 2-3 sentences when speaking aloud. Simulate smart home commands. Always stay in character.`;

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const row = await env.DB.prepare(
    `SELECT voice_on, web_search, system_prompt FROM settings WHERE user_id = ?`
  ).bind(user.user_id).first();

  return json({
    voice_on: row ? !!row.voice_on : true,
    web_search: row ? !!row.web_search : false,
    system_prompt: row?.system_prompt || SYS_DEFAULT,
  });
}

export async function onRequestPut({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const body = await request.json();
  const { voice_on, web_search, system_prompt } = body;

  await env.DB.prepare(`
    INSERT INTO settings (user_id, voice_on, web_search, system_prompt, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      voice_on = excluded.voice_on,
      web_search = excluded.web_search,
      system_prompt = excluded.system_prompt,
      updated_at = excluded.updated_at
  `).bind(
    user.user_id,
    voice_on ? 1 : 0,
    web_search ? 1 : 0,
    system_prompt || SYS_DEFAULT
  ).run();

  return json({ ok: true });
}