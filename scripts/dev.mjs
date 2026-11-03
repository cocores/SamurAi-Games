// Local dev server that mimics Vercel: serves public/, routes /api/<name> to api/<name>.js,
// and rewrites /img/<id> to the images route. Without Redis env vars it uses an in-memory store.
//   npm run dev            -> http://localhost:3000
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
  process.env.MEMORY_DB = "1";
  console.log("No Redis configured: using an in-memory store (data resets on restart).");
}
process.env.SESSION_SECRET ||= "dev-only-secret-change-me-please";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const port = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    let m = /^\/img\/([^/]+)$/.exec(url.pathname);
    if (m) { url.pathname = "/api/images"; url.searchParams.set("id", decodeURIComponent(m[1])); req.url = url.pathname + url.search; }
    m = /^\/api\/([a-z-]+)$/.exec(url.pathname);
    if (m) {
      const mod = await import(join(root, "api", m[1] + ".js")).catch(() => null);
      if (!mod) { res.statusCode = 404; return res.end("Not found"); }
      req.query = Object.fromEntries(url.searchParams);
      return mod.default(req, res);
    }
    const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
    const body = await readFile(join(root, "public", rel));
    res.setHeader("Content-Type", TYPES[extname(rel)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404; res.end("Not found");
  }
}).listen(port, () => console.log(`SamurAi Games running at http://localhost:${port}`));
