/** Sync merge logic shared by the Node server and the Netlify function. Pure: no I/O. */
export const COLLECTIONS = new Set(["foods", "recipes", "entries", "savedMeals", "water", "fasts", "weights", "measurements", "photos", "profile", "dayOverrides", "exercises", "programs", "workouts", "biometrics"]);

export function emptyStore() {
  return { seq: 0, collections: {} };
}

/**
 * Apply a client's pushed changes (last-writer-wins on updatedAt) and return
 * everything newer than `since` that the client did not just push.
 * Mutates and returns `store`.
 */
export function applySync(store, since, changes) {
  let accepted = 0;
  const pushedIds = new Set();
  for (const c of changes) {
    if (!c || !COLLECTIONS.has(c.collection) || !c.row || typeof c.row.id !== "string") continue;
    const col = (store.collections[c.collection] ||= {});
    const cur = col[c.row.id];
    if (!cur || (c.row.updatedAt || 0) >= (cur.row.updatedAt || 0)) {
      store.seq += 1;
      col[c.row.id] = { row: c.row, seq: store.seq };
      accepted += 1;
      pushedIds.add(`${c.collection}:${c.row.id}`); // don't echo what this client just wrote
    }
    // a rejected (older) push is NOT suppressed: the client must receive the newer row
  }
  const out = [];
  for (const [name, col] of Object.entries(store.collections)) {
    for (const [id, rec] of Object.entries(col)) {
      if (rec.seq > since && !pushedIds.has(`${name}:${id}`)) out.push({ collection: name, row: rec.row });
    }
  }
  return { store, result: { seq: store.seq, changes: out, accepted }, changed: accepted > 0 };
}

export function rowCount(store) {
  let n = 0;
  for (const c of Object.values(store.collections)) n += Object.keys(c).length;
  return n;
}

/** Constant-time-ish token compare. */
export function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  const a = String(given).padEnd(64), b = String(expected).padEnd(64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
