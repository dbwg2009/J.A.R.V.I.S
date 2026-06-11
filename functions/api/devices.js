import { getSessionUser, json, unauthorized } from './_auth.js';
import { listDevices, setDevice } from './_devices.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  return json({ devices: await listDevices(env.DB, user.user_id) });
}

export async function onRequestPut({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const { id, on } = await request.json();
  if (typeof id !== 'string' || typeof on !== 'boolean') {
    return json({ error: 'id (string) and on (boolean) required' }, 400);
  }

  const ok = await setDevice(env.DB, user.user_id, id, on);
  if (!ok) return json({ error: 'Unknown device' }, 404);
  return json({ ok: true });
}
