// GET: every creator with their games, featured keys and rating totals (public, cached briefly).
// PUT {profile}: create or update your own profile.
// DELETE {uid}: remove a profile (your own, or anyone's for moderators).
import { route, readJson, fail, query } from "../lib/http.js";
import { requireUser, isAdmin } from "../lib/auth.js";
import { cleanProfile, publicCreator } from "../lib/validate.js";
import {
  listCreators, getCreator, saveCreator, deleteCreatorDoc, claimHandle, releaseHandle,
  getFeatured, unfeature, deleteImage, ratingStats, clearRatings,
} from "../lib/store.js";

export default route({
  async GET(req, res) {
    const [creators, featured, ratings] = await Promise.all([listCreators(), getFeatured(), ratingStats()]);
    // Visitors share a 15-second CDN copy; someone who just changed something asks with ?fresh.
    if (!query(req).fresh) res.setHeader("Cache-Control", "public, max-age=0, s-maxage=15, stale-while-revalidate=60");
    return { creators: creators.filter(c => c.name && c.handle).map(publicCreator), featured, ratings };
  },

  async PUT(req) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const p = cleanProfile(body.profile);
    if (!p.name) fail(400, "Add a name for your profile.");
    if (p.handle.length < 2) fail(400, "Pick a page address of at least 2 letters or numbers.");

    const cur = await getCreator(user.uid);
    if (!cur || cur.handle !== p.handle) await claimHandle(p.handle, user.uid, cur && cur.handle);
    if (cur && cur.avatar && cur.avatar !== p.avatar) await deleteImage(cur.avatar, user.uid);

    const now = Date.now();
    const next = { ...(cur || { games: [], createdAt: now }), ...p, uid: user.uid, updatedAt: now };
    await saveCreator(next);
    return { creator: publicCreator(next) };
  },

  async DELETE(req) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const uid = String(body.uid || user.uid);
    if (uid !== user.uid && !isAdmin(user)) fail(403, "You can only remove your own profile.");
    const c = await getCreator(uid);
    if (!c) return { ok: true };
    await releaseHandle(c.handle, uid);
    await Promise.all([c.avatar, ...(c.games || []).map(g => g.thumb)].filter(Boolean).map(id => deleteImage(id, uid, true)));
    await deleteCreatorDoc(uid);
    await unfeature(k => k.startsWith(uid + "~"));
    await clearRatings((c.games || []).map(g => uid + "~" + g.id));
    return { ok: true };
  },
});
