import { getSessionUser, clearCookieHeader, json } from './_auth.js';

export async function onRequestPost({ request, env }) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/jarvis_session=([^;]+)/);
  if (match) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(match[1]).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookieHeader() });
}