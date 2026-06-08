import { hashPassword, generateToken, setCookieHeader, json } from './_auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return json({ error: 'Missing credentials' }, 400);

    const hash = await hashPassword(password);
    const user = await env.DB.prepare(
      `SELECT id, username, role FROM users WHERE username = ? AND password_hash = ?`
    ).bind(username.toLowerCase().trim(), hash).first();

    if (!user) return json({ error: 'Invalid username or password' }, 401);

    const token = generateToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(token, user.id, expires).run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO settings (user_id, voice_on, web_search, system_prompt) VALUES (?, 1, 0, '')`
    ).bind(user.id).run();

    return json({ ok: true, user: { username: user.username, role: user.role } }, 200, {
      'Set-Cookie': setCookieHeader(token),
    });
  } catch (e) {
    return json({ error: 'Server error' }, 500);
  }
}