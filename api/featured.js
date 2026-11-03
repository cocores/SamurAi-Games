// POST {key: "<uid>~<gameId>"}: feature or unfeature a game (moderators only).
import { route, readJson, fail } from "../lib/http.js";
import { requireUser, isAdmin } from "../lib/auth.js";
import { getFeatured, setFeatured, getCreator } from "../lib/store.js";

export default route({
  async POST(req) {
    const user = await requireUser(req);
    if (!isAdmin(user)) fail(403, "Only moderators can feature games.");
    const { key } = await readJson(req);
    const [uid, gid] = String(key || "").split("~");
    const f = await getFeatured();
    if (f.includes(key)) {
      await setFeatured(f.filter(k => k !== key));
      return { featured: f.filter(k => k !== key) };
    }
    const c = uid && (await getCreator(uid));
    if (!c || !(c.games || []).some(g => g.id === gid)) fail(404, "That game no longer exists.");
    const next = [key, ...f].slice(0, 12);
    await setFeatured(next);
    return { featured: next };
  },
});
