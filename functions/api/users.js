import { getSessionUser, hashPassword, verifyPassword, json, unauthorized } from './_auth.js';

function adminOnly(user) {
  if (!user || user.role !== 'admin') return unauthorized();
  return null;
}

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  const err = adminOnly(user);
  if (err) return err;

  const { results } = await env.DB.prepare(
    `SELECT id, username, role, created_at FROM users ORDER BY created_at ASC`
  ).all();

  return json({ users: results });
}

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  const err = adminOnly(user);
  if (err) return err;

  const { username, password, role } = await request.json();
  if (!username?.trim() || !password) return json({ error: 'Username and password required' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

  const hash = await hashPassword(password);
  try {
    const result = await env.DB.prepare(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`
    ).bind(username.toLowerCase().trim(), hash, role === 'admin' ? 'admin' : 'user').run();

    const newId = result.meta.last_row_id;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO settings (user_id, voice_on, web_search, system_prompt) VALUES (?, 1, 0, '')`
    ).bind(newId).run();

    return json({ ok: true, id: newId });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return json({ error: 'Username already exists' }, 409);
    return json({ error: 'Server error' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const { id, username, password, role, current_password } = await request.json();

  // No id means "update my own account"
  const targetId = id ?? user.user_id;
  if (user.role !== 'admin' && targetId !== user.user_id) return unauthorized();

  if (password) {
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
    // Changing your own password requires proving you know the current one
    if (targetId === user.user_id) {
      const row = await env.DB.prepare(`SELECT password_hash FROM users WHERE id = ?`).bind(targetId).first();
      if (!current_password || !(await verifyPassword(current_password, row?.password_hash))) {
        return json({ error: 'Current password is incorrect' }, 403);
      }
    }
    const hash = await hashPassword(password);
    await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(hash, targetId).run();
  }
  if (username && user.role === 'admin') {
    await env.DB.prepare(`UPDATE users SET username = ? WHERE id = ?`).bind(username.toLowerCase().trim(), targetId).run();
  }
  if (role && user.role === 'admin') {
    if (targetId === user.user_id && role !== 'admin') return json({ error: 'Cannot demote your own account' }, 400);
    await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role === 'admin' ? 'admin' : 'user', targetId).run();
  }

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  const err = adminOnly(user);
  if (err) return err;

  const { id } = await request.json();
  if (id === user.user_id) return json({ error: 'Cannot delete your own account' }, 400);

  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}