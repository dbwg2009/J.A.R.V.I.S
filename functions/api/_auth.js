// Shared auth helpers

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getSessionUser(request, db) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/jarvis_session=([^;]+)/);
  if (!match) return null;

  const token = match[1];
  const session = await db.prepare(
    `SELECT s.user_id, s.expires_at, u.username, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  return session || null;
}

export function setCookieHeader(token, maxAge = 60 * 60 * 24 * 30) {
  return `jarvis_session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookieHeader() {
  return `jarvis_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}