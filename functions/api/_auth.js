// Shared auth helpers

const PBKDF2_ITERATIONS = 100000;

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

// Accepts both the current salted PBKDF2 format and legacy unsalted SHA-256 hex digests.
// Fails closed (returns false) on malformed stored hashes rather than throwing.
export async function verifyPassword(password, stored) {
  if (!stored) return false;
  try {
    if (stored.startsWith('pbkdf2$')) {
      const parts = stored.split('$');
      if (parts.length !== 4) return false;
      const [, iter, saltHex, hashHex] = parts;
      const iterations = Number.parseInt(iter, 10);
      if (!Number.isSafeInteger(iterations) || iterations <= 0) return false;
      if (!/^(?:[0-9a-f]{2})+$/i.test(saltHex) || !/^(?:[0-9a-f]{2})+$/i.test(hashHex)) return false;
      const hash = await pbkdf2(password, fromHex(saltHex), iterations);
      return toHex(hash) === hashHex.toLowerCase();
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return toHex(new Uint8Array(digest)) === stored;
  } catch {
    return false;
  }
}

export function isLegacyHash(stored) {
  return !!stored && !stored.startsWith('pbkdf2$');
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