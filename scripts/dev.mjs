// Local dev server that mimics Vercel: serves public/, routes /api/<name> to api/<name>.js,
// and rewrites /img/<id> to the images route.
//   npm run dev:emulators  -> local Firebase Auth + Firestore emulators (no keys needed)
//   npm run dev            -> your real Firebase project (needs FIREBASE_SERVICE_ACCOUNT, e.g. via .env)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (authEmulator) console.log("Using Firebase emulators: Auth at " + authEmulator + ", Firestore at " + process.env.FIRESTORE_EMULATOR_HOST);
else if (!process.env.FIREBASE_SERVICE_ACCOUNT) console.log("No FIREBASE_SERVICE_ACCOUNT set: the API will report it. Use `npm run dev:emulators` to run without keys.");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const port = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    let m = /^\/img\/([^/]+)$/.exec(url.pathname);
    if (m) { url.pathname = "/api/images"; url.searchParams.set("id", decodeURIComponent(m[1])); req.url = url.pathname + url.search; }
    m = /^\/api\/([a-z-]+)$/.exec(url.pathname);
    if (m) {
      const mod = await import(join(root, "api", m[1] + ".js")).catch(e => { if (e.code !== "ERR_MODULE_NOT_FOUND" || !String(e.message).includes("/api/")) console.error(e); return null; });
      if (!mod) { res.statusCode = 404; return res.end("Not found"); }
      req.query = Object.fromEntries(url.searchParams);
      return mod.default(req, res);
    }
    const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
    let body = await readFile(join(root, "public", rel));
    if (rel === "/index.html" && authEmulator) {
      body = String(body).replace('<script src="/app.js">', `<script>window.SAMURAI_EMULATORS = { auth: "http://${authEmulator}" };</script>\n<script src="/app.js">`);
    }
    res.setHeader("Content-Type", TYPES[extname(rel)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404; res.end("Not found");
  }
}).listen(port, () => console.log(`SamurAi Games running at http://localhost:${port}`));
