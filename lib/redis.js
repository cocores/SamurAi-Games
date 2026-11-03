// Minimal Upstash Redis REST client (no dependencies).
// Set MEMORY_DB=1 to use an in-process store for local development only.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function configError() {
  const e = new Error("The database isn't connected. In Vercel, open Storage, add Upstash for Redis and connect it to this project, then redeploy.");
  e.code = "CONFIG";
  return e;
}

export async function cmd(...args) {
  if (process.env.MEMORY_DB === "1") return memory(args);
  if (!URL_ || !TOKEN) throw configError();
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args.map(String)),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("Redis: " + (j.error || r.status));
  return j.result;
}

export async function getJson(key) {
  const v = await cmd("GET", key);
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return null; }
}
export const setJson = (key, value) => cmd("SET", key, JSON.stringify(value));

/* ---- in-memory store for `npm run dev` ---- */
const mem = globalThis.__samuraiMem || (globalThis.__samuraiMem = new Map());
function memory([op, ...a]) {
  op = String(op).toUpperCase();
  a = a.map(String);
  const get = k => mem.get(k);
  switch (op) {
    case "GET": { const v = get(a[0]); return typeof v === "string" ? v : null; }
    case "SET": {
      if (a.slice(2).map(x => x.toUpperCase()).includes("NX") && mem.has(a[0])) return null;
      mem.set(a[0], a[1]); return "OK";
    }
    case "DEL": { let n = 0; for (const k of a) n += mem.delete(k) ? 1 : 0; return n; }
    case "MGET": return a.map(k => (typeof get(k) === "string" ? get(k) : null));
    case "INCR": { const n = parseInt(get(a[0]) || "0", 10) + 1; mem.set(a[0], String(n)); return n; }
    case "EXPIRE": return 1;
    case "SADD": { const s = get(a[0]) instanceof Set ? get(a[0]) : new Set(); let n = 0; for (const m of a.slice(1)) if (!s.has(m)) { s.add(m); n++; } mem.set(a[0], s); return n; }
    case "SREM": { const s = get(a[0]); let n = 0; if (s instanceof Set) for (const m of a.slice(1)) n += s.delete(m) ? 1 : 0; return n; }
    case "SMEMBERS": { const s = get(a[0]); return s instanceof Set ? [...s] : []; }
    default: throw new Error("memory db: unsupported " + op);
  }
}
