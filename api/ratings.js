// GET: your own ratings ({mine: {"<uid>~<gameId>": 1..5}}); empty when signed out.
// POST {key: "<uid>~<gameId>", score: 1..5 | 0}: rate a game (0 clears your rating).
// Returns the game's new aggregate {rating: {avg, count} | null, score}.
import { route, readJson, fail } from "../lib/http.js";
import { currentUser, requireUser, limit } from "../lib/auth.js";
import { getCreator, myRatings, setRating } from "../lib/store.js";

export default route({
  async GET(req) {
    const user = await currentUser(req);
    return { mine: user ? await myRatings(user.uid) : {} };
  },

  async POST(req) {
    const user = await requireUser(req);
    await limit(req, "rate", 120, 3600);
    const { key, score } = await readJson(req);
    const s = Number(score);
    if (!Number.isInteger(s) || s < 0 || s > 5) fail(400, "Pick a rating from 1 to 5 stars.");
    const [uid, gid] = String(key || "").split("~");
    const c = uid && gid ? await getCreator(uid) : null;
    if (!c || !(c.games || []).some(g => g.id === gid)) fail(404, "That game no longer exists.");
    if (uid === user.uid) fail(403, "You can't rate your own game.");
    const rating = await setRating(`${uid}~${gid}`, user.uid, s);
    return { rating, score: s };
  },
});
