// POST {game}: post a new game (no id) or update one of yours (with id).
// DELETE {id, uid?}: remove one of your games, or anyone's for moderators.
import { route, readJson, fail } from "../lib/http.js";
import { requireUser, isAdmin, newId } from "../lib/auth.js";
import { cleanGame, MAX_GAMES } from "../lib/validate.js";
import { getCreator, saveCreator, unfeature, deleteImage } from "../lib/store.js";

export default route({
  async POST(req) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const c = await getCreator(user.uid);
    if (!c) fail(400, "Set up your profile before posting a game.");

    const g = cleanGame(body.game);
    if (!g.title) fail(400, "Give the game a title.");
    if (!g.url) fail(400, "Add a play link that starts with https://");

    const games = c.games || [];
    const id = typeof body.game?.id === "string" ? body.game.id : null;
    const old = id ? games.find(x => x.id === id) : null;
    if (id && !old) fail(404, "That game no longer exists.");
    if (!old && games.length >= MAX_GAMES) fail(400, `You can list up to ${MAX_GAMES} games.`);

    const now = Date.now();
    const game = { ...g, id: old ? old.id : newId("g", 8), createdAt: old ? old.createdAt : now, updatedAt: now };
    if (old && old.thumb && old.thumb !== game.thumb) await deleteImage(old.thumb, user.uid);

    c.games = [game, ...games.filter(x => x.id !== game.id)];
    c.updatedAt = now;
    await saveCreator(c);
    return { game };
  },

  async DELETE(req) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const uid = String(body.uid || user.uid);
    if (uid !== user.uid && !isAdmin(user)) fail(403, "You can only remove your own games.");
    const c = await getCreator(uid);
    const game = c && (c.games || []).find(x => x.id === body.id);
    if (!game) return { ok: true };
    c.games = c.games.filter(x => x.id !== game.id);
    c.updatedAt = Date.now();
    await saveCreator(c);
    await deleteImage(game.thumb, uid, true);
    await unfeature(k => k === uid + "~" + game.id);
    return { ok: true };
  },
});
