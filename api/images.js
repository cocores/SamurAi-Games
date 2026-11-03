// GET ?id=…: serve an uploaded image (also reachable as /img/<id>).
// POST {data: "data:image/webp;base64,…"}: upload an image, returns {id, url}.
// DELETE {id}: remove an image you uploaded (e.g. after cancelling a form).
import { cmd, getJson, setJson } from "../lib/redis.js";
import { route, readJson, query, fail } from "../lib/http.js";
import { requireUser, newId, limit } from "../lib/auth.js";
import { isImageId } from "../lib/validate.js";
import { deleteImage } from "../lib/store.js";

const MAX_BYTES = 900 * 1024;
const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.slice(0, 4).toString("latin1") === "GIF8") return "image/gif";
  return null;
}

export default route({
  async GET(req, res) {
    const id = query(req).id;
    if (!isImageId(id)) fail(404, "Not found.");
    const img = await getJson("img:" + id);
    if (!img) fail(404, "Not found.");
    res.statusCode = 200;
    res.setHeader("Content-Type", img.type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.end(Buffer.from(img.b64, "base64"));
  },

  async POST(req) {
    const user = await requireUser(req);
    await limit(req, "upload", 60, 3600);
    const { data } = await readJson(req);
    const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ""));
    if (!m) fail(400, "Upload a PNG, JPEG, WebP or GIF image.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_BYTES) fail(413, "That image is too large. Try a smaller one.");
    const type = sniff(buf);
    if (!type || type !== TYPES[m[1]]) fail(400, "That file isn't a valid image.");
    const id = newId("i", 12);
    await setJson("img:" + id, { owner: user.uid, type, b64: buf.toString("base64"), createdAt: Date.now() });
    return { id, url: "/img/" + id };
  },

  async DELETE(req) {
    const user = await requireUser(req);
    const { id } = await readJson(req);
    if (isImageId(id)) await deleteImage(id, user.uid);
    return { ok: true };
  },
});
