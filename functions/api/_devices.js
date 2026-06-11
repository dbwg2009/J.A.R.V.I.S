// Shared device helpers — devices are persisted per-user in D1.
// The table is created lazily so existing deployments need no manual migration.

let ensured = false;

export async function ensureDevices(db) {
  if (ensured) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS devices (
    user_id INTEGER NOT NULL,
    id TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '',
    on_state INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  )`).run();
  ensured = true;
}

const DEFAULT_DEVICES = [
  ['lights', 'Lab Lights', '💡', 1],
  ['security', 'Security', '🛡️', 1],
  ['hvac', 'Climate', '❄️', 0],
  ['comms', 'Comms Array', '📡', 0],
];

export async function listDevices(db, userId) {
  await ensureDevices(db);
  let { results } = await db.prepare(
    `SELECT id, label, icon, on_state FROM devices WHERE user_id = ? ORDER BY rowid`
  ).bind(userId).all();

  if (!results.length) {
    await db.batch(DEFAULT_DEVICES.map(d =>
      db.prepare(`INSERT OR IGNORE INTO devices (user_id, id, label, icon, on_state) VALUES (?, ?, ?, ?, ?)`)
        .bind(userId, ...d)
    ));
    ({ results } = await db.prepare(
      `SELECT id, label, icon, on_state FROM devices WHERE user_id = ? ORDER BY rowid`
    ).bind(userId).all());
  }

  return results.map(d => ({ id: d.id, label: d.label, icon: d.icon, on: !!d.on_state }));
}

export async function setDevice(db, userId, id, on) {
  await listDevices(db, userId); // ensures table + default rows exist
  const r = await db.prepare(
    `UPDATE devices SET on_state = ? WHERE user_id = ? AND id = ?`
  ).bind(on ? 1 : 0, userId, id).run();
  return r.meta.changes > 0;
}
