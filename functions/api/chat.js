import { getSessionUser, json, unauthorized } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  // Latest 50 messages, returned in chronological order
  const { results } = await env.DB.prepare(
    `SELECT id, role, content, created_at FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 50`
  ).bind(user.user_id).all();

  return json({ messages: results.reverse() });
}

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const { role, content } = await request.json();
  if (!role || !content) return json({ error: 'Missing role or content' }, 400);

  await env.DB.prepare(
    `INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`
  ).bind(user.user_id, role, content).run();

  await env.DB.prepare(`
    DELETE FROM chat_history WHERE user_id = ? AND id NOT IN (
      SELECT id FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 100
    )
  `).bind(user.user_id, user.user_id).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  await env.DB.prepare(`DELETE FROM chat_history WHERE user_id = ?`).bind(user.user_id).run();
  return json({ ok: true });
}