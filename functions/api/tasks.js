import { getSessionUser, json, unauthorized } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT id, text, done, created_at FROM tasks WHERE user_id = ? ORDER BY created_at ASC`
  ).bind(user.user_id).all();

  return json({ tasks: results.map(t => ({ ...t, done: !!t.done })) });
}

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const { text } = await request.json();
  if (!text?.trim()) return json({ error: 'Text required' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO tasks (user_id, text, done) VALUES (?, ?, 0)`
  ).bind(user.user_id, text.trim()).run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestPut({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const { id, done, text } = await request.json();

  if (typeof done !== 'undefined') {
    await env.DB.prepare(
      `UPDATE tasks SET done = ? WHERE id = ? AND user_id = ?`
    ).bind(done ? 1 : 0, id, user.user_id).run();
  }
  if (text) {
    await env.DB.prepare(
      `UPDATE tasks SET text = ? WHERE id = ? AND user_id = ?`
    ).bind(text.trim(), id, user.user_id).run();
  }

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const { id } = await request.json();
  await env.DB.prepare(
    `DELETE FROM tasks WHERE id = ? AND user_id = ?`
  ).bind(id, user.user_id).run();

  return json({ ok: true });
}