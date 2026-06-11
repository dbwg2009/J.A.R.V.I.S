import { hashPassword, verifyPassword, isLegacyHash, generateToken, setCookieHeader, json } from './_auth.js';

const MAX_ATTEMPTS = 5;       // failed attempts per username/IP
const WINDOW = '-15 minutes'; // within this window

let attemptsTableEnsured = false;
async function ensureAttemptsTable(db) {
  if (attemptsTableEnsured) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  attemptsTableEnsured = true;
}

export async function onRequestPost({ request, env }) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return json({ error: 'Missing credentials' }, 400);

    const uname = username.toLowerCase().trim();
    const ip = request.headers.get('CF-Connecting-IP') || '';

    await ensureAttemptsTable(env.DB);
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM login_attempts WHERE (username = ? OR (ip <> '' AND ip = ?)) AND created_at > datetime('now', ?)`
    ).bind(uname, ip, WINDOW).first();
    if (recent && recent.n >= MAX_ATTEMPTS) {
      return json({ error: 'Too many failed attempts. Access locked for 15 minutes.' }, 429);
    }

    const user = await env.DB.prepare(
      `SELECT id, username, role, password_hash FROM users WHERE username = ?`
    ).bind(uname).first();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await env.DB.prepare(`INSERT INTO login_attempts (username, ip) VALUES (?, ?)`).bind(uname, ip).run();
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

    // Housekeeping: clear this user's failed attempts and drop expired sessions
    await env.DB.prepare(`DELETE FROM login_attempts WHERE username = ? OR created_at <= datetime('now', ?)`).bind(uname, WINDOW).run();
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO settings (user_id, voice_on, web_search, system_prompt) VALUES (?, 1, 0, '')`
    ).bind(user.id).run();

    // Flag accounts still using the well-known default password so the UI can warn
    const defaultPassword = password === 'password';

    return json({ ok: true, user: { username: user.username, role: user.role, default_password: defaultPassword } }, 200, {
      'Set-Cookie': setCookieHeader(token),
    });
  } catch (e) {
    return json({ error: 'Server error' }, 500);
  }
}
