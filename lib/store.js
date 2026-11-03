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
