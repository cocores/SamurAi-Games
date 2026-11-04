// Firestore data access shared by the API routes. Only the server touches Firestore
// (firestore.rules denies all direct browser access).
//
//   users/{uid}        sign-in record (email, provider); never sent to other people
//   creators/{uid}     public profile + games[]
//   handles/{handle}   {uid}, keeps page addresses unique
//   images/{id}        {owner, type, data (bytes)}
//   ratings/{uid}      {scores: {gameKey: 1..5}}, one voter's ratings
//   site/featured      {keys: [gameKey]}
//   site/ratings       {stats: {gameKey: {sum, count}}}
// gameKey is "<creatorUid>~<gameId>".
import { db } from "./firebase-admin.js";
import { HttpError } from "./http.js";

const col = name => db().collection(name);
const round2 = n => Math.round(n * 100) / 100;

/* users */
export async function recordSignIn(user) {
  const ref = col("users").doc(user.uid);
  const snap = await ref.get();
  await ref.set({ ...user, lastSignInAt: Date.now(), ...(snap.exists ? {} : { createdAt: Date.now() }) }, { merge: true });
}

/* creators */
export async function getCreator(uid) {
  const s = await col("creators").doc(uid).get();
  return s.exists ? s.data() : null;
}
export const saveCreator = c => col("creators").doc(c.uid).set(c);
export async function listCreators() {
  return (await col("creators").get()).docs.map(d => d.data());
}
export const deleteCreatorDoc = uid => col("creators").doc(uid).delete();

/** Claim `handle` for `uid` (releasing `oldHandle`); throws 409 if someone else has it. */
export async function claimHandle(handle, uid, oldHandle) {
  await db().runTransaction(async tx => {
    const ref = col("handles").doc(handle);
    const oldRef = oldHandle && oldHandle !== handle ? col("handles").doc(oldHandle) : null;
    const [snap, oldSnap] = await Promise.all([tx.get(ref), oldRef ? tx.get(oldRef) : null]);
    if (snap.exists && snap.get("uid") !== uid) throw new HttpError(409, "That page address is taken. Try another.");
    tx.set(ref, { uid });
    if (oldSnap && oldSnap.exists && oldSnap.get("uid") === uid) tx.delete(oldRef);
  });
}
export async function releaseHandle(handle, uid) {
  if (!handle) return;
  const ref = col("handles").doc(handle);
  const s = await ref.get();
  if (s.exists && s.get("uid") === uid) await ref.delete();
}

/* featured */
export async function getFeatured() {
  const s = await col("site").doc("featured").get();
  const keys = s.exists ? s.get("keys") : [];
  return Array.isArray(keys) ? keys.filter(k => typeof k === "string") : [];
}
export const setFeatured = keys => col("site").doc("featured").set({ keys: keys.slice(0, 12) });
export async function unfeature(pred) {
  const f = await getFeatured();
  const next = f.filter(k => !pred(k));
  if (next.length !== f.length) await setFeatured(next);
}

/* ratings */
export async function ratingStats() {
  const s = await col("site").doc("ratings").get();
  const stats = (s.exists && s.get("stats")) || {};
  const out = {};
  for (const [k, v] of Object.entries(stats)) if (v && v.count > 0) out[k] = { avg: round2(v.sum / v.count), count: v.count };
  return out;
}
export async function myRatings(voter) {
  const s = await col("ratings").doc(voter).get();
  return (s.exists && s.get("scores")) || {};
}
/** Set (1..5) or clear (0) one voter's rating; updates the game's totals in the same transaction. */
export async function setRating(key, voter, score) {
  return db().runTransaction(async tx => {
    const vRef = col("ratings").doc(voter), sRef = col("site").doc("ratings");
    const [v, st] = await Promise.all([tx.get(vRef), tx.get(sRef)]);
    const scores = { ...((v.exists && v.get("scores")) || {}) };
    const stats = { ...((st.exists && st.get("stats")) || {}) };
    const cur = { sum: 0, count: 0, ...(stats[key] || {}) };
    const prev = scores[key] || 0;
    if (prev) { cur.sum -= prev; cur.count -= 1; }
    if (score) { cur.sum += score; cur.count += 1; scores[key] = score; } else delete scores[key];
    if (cur.count > 0) stats[key] = cur; else delete stats[key];
    tx.set(vRef, { scores });
    tx.set(sRef, { stats });
    return cur.count > 0 ? { avg: round2(cur.sum / cur.count), count: cur.count } : null;
  });
}
/** Drop the totals for deleted games. Voters' own maps keep the stale keys, which nothing shows. */
export async function clearRatings(keys) {
  if (!keys.length) return;
  await db().runTransaction(async tx => {
    const sRef = col("site").doc("ratings");
    const st = await tx.get(sRef);
    const stats = { ...((st.exists && st.get("stats")) || {}) };
    let changed = false;
    for (const k of keys) if (k in stats) { delete stats[k]; changed = true; }
    if (changed) tx.set(sRef, { stats });
  });
}

/* images */
export async function getImage(id) {
  const s = await col("images").doc(id).get();
  return s.exists ? s.data() : null;
}
export const saveImage = (id, img) => col("images").doc(id).set(img);
/** Delete an image if `uid` uploaded it (moderators and cleanup pass force). Best effort. */
export async function deleteImage(id, uid, force) {
  if (!id) return;
  const ref = col("images").doc(id);
  const s = await ref.get();
  if (s.exists && (force || s.get("owner") === uid)) await ref.delete();
}
