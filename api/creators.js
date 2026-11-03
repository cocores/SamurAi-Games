// GET: every creator with their games, plus featured keys (public).
// PUT {profile}: create or update your own profile.
// DELETE {uid}: remove a profile (your own, or anyone's for moderators).
import { cmd } from "../lib/redis.js";
import { route, readJson, fail } from "../lib/http.js";
import { requireUser, isAdmin } from "../lib/auth.js";
import { cleanProfile, publicCreator } from "../lib/validate.js";
import { listCreators, getCreator, saveCreator, getFeatured, unfeature, deleteImage, ratingStats, clearRatings } from "../lib/store.js";

export default route({
  async GET() {
    const [creators, featured, ratings] = await Promise.all([listCreators(), getFeatured(), ratingStats()]);
    return { creators: creators.filter(c => c.name && c.handle).map(publicCreator), featured, ratings };
  },

  async PUT(req) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const p = cleanProfile(body.profile);
    if (!p.name) fail(400, "Add a name for your profile.");
    if (p.handle.length < 2) fail(400, "Pick a page address of at least 2 letters or numbers.");

    const cur = await getCreator(user.uid);
    if (!cur || cur.handle !== p.handle) {
      const ok = await cmd("SET", "handle:" + p.handle, user.uid, "NX");
      if (ok !== "OK" && (await cmd("GET", "handle:" + p.handle)) !== user.uid) fail(409, "That page address is taken. Try another.");
      if (cur && cur.handle) await cmd("DEL", "handle:" + cur.handle);
    }
    if (cur && cur.avatar && cur.avatar !== p.avatar) await deleteImage(cur.avatar, user.uid);

    const now = Date.now();
    const next = { ...(cur || { games: [], createdAt: now }), ...p, uid: user.uid, updatedAt: now };
    await saveCreator(next);
    await cmd("SADD", "creators", user.uid);
    return { creator: publicCreator(next) };
  },

  async DELETE(req) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const uid = String(body.uid || user.uid);
    const mod = isAdmin(user);
    if (uid !== user.uid && !mod) fail(403, "You can only remove your own profile.");
    const c = await getCreator(uid);
    if (!c) return { ok: true };
    if (c.handle && (await cmd("GET", "handle:" + c.handle)) === uid) await cmd("DEL", "handle:" + c.handle);
    await Promise.all([c.avatar, ...(c.games || []).map(g => g.thumb)].filter(Boolean).map(id => deleteImage(id, uid, true)));
    await cmd("SREM", "creators", uid);
    await cmd("DEL", "creator:" + uid);
    await unfeature(k => k.startsWith(uid + "~"));
    await Promise.all((c.games || []).map(g => clearRatings(uid + "~" + g.id)));
    return { ok: true };
  },
});
