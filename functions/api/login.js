import { hashPassword, verifyPassword, isLegacyHash, generateToken, setCookieHeader, json } from './_auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return json({ error: 'Missing credentials' }, 400);

    const user = await env.DB.prepare(
      `SELECT id, username, role, password_hash FROM users WHERE username = ?`
    ).bind(username.toLowerCase().trim()).first();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return json({ error: 'Invalid username or password' }, 401);
    }

    // Transparently upgrade legacy unsalted SHA-256 hashes to salted PBKDF2
    if (isLegacyHash(user.password_hash)) {
      const upgraded = await hashPassword(password);
      await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(upgraded, user.id).run();
    }

    const token = generateToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(token, user.id, expires).run();

    // Housekeeping: drop expired sessions
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();

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
