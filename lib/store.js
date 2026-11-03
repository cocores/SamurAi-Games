// Data access shared by the API routes.
// Keys: creators (set of uids), creator:<uid> (profile + games), handle:<handle> -> uid,
//       img:<id> (image), featured (array of "<uid>~<gameId>").
import { cmd, getJson, setJson } from "./redis.js";

export const getCreator = uid => getJson("creator:" + uid);
export const saveCreator = c => setJson("creator:" + c.uid, c);

export async function listCreators() {
  const uids = await cmd("SMEMBERS", "creators");
  if (!uids || !uids.length) return [];
  const raw = await cmd("MGET", ...uids.map(u => "creator:" + u));
  return raw.map(v => { try { return v ? JSON.parse(v) : null; } catch { return null; } }).filter(Boolean);
}

export async function getFeatured() {
  const f = await getJson("featured");
  return Array.isArray(f) ? f.filter(k => typeof k === "string") : [];
}
export const setFeatured = list => setJson("featured", list.slice(0, 12));

/* Ratings. ratings:<gameKey> = hash voter -> 1..5; myratings:<voter> = hash gameKey -> 1..5;
   ratingstats = hash gameKey -> "sum|count", recomputed from ratings:<gameKey> on every change. */
const pairs = flat => { const o = {}; for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; };

export async function ratingStats() {
  const out = {};
  for (const [k, v] of Object.entries(pairs(await cmd("HGETALL", "ratingstats")))) {
    const [sum, count] = String(v).split("|").map(Number);
    if (count > 0) out[k] = { avg: Math.round((sum / count) * 100) / 100, count };
  }
  return out;
}
export async function myRatings(voter) {
  const out = {};
  for (const [k, v] of Object.entries(pairs(await cmd("HGETALL", "myratings:" + voter)))) out[k] = Number(v);
  return out;
}
async function recompute(key) {
  const vals = (await cmd("HVALS", "ratings:" + key)).map(Number).filter(n => n >= 1 && n <= 5);
  if (!vals.length) { await cmd("HDEL", "ratingstats", key); return null; }
  const sum = vals.reduce((a, b) => a + b, 0);
  await cmd("HSET", "ratingstats", key, `${sum}|${vals.length}`);
  return { avg: Math.round((sum / vals.length) * 100) / 100, count: vals.length };
}
export async function setRating(key, voter, score) {
  if (score) { await cmd("HSET", "ratings:" + key, voter, score); await cmd("HSET", "myratings:" + voter, key, score); }
  else { await cmd("HDEL", "ratings:" + key, voter); await cmd("HDEL", "myratings:" + voter, key); }
  return recompute(key);
}
export async function clearRatings(key) {
  await cmd("DEL", "ratings:" + key);
  await cmd("HDEL", "ratingstats", key);
}

export async function unfeature(pred) {
  const f = await getFeatured();
  const next = f.filter(k => !pred(k));
  if (next.length !== f.length) await setFeatured(next);
}

/** Delete an image if `uid` uploaded it (moderators pass force). Best effort. */
export async function deleteImage(id, uid, force) {
  if (!id) return;
  const img = await getJson("img:" + id);
  if (img && (force || img.owner === uid)) await cmd("DEL", "img:" + id);
}
