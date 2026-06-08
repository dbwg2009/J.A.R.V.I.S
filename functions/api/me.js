import { getSessionUser, json, unauthorized } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();
  return json({ user: { username: user.username, role: user.role } });
}