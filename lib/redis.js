// Minimal Upstash Redis REST client (no dependencies).
// Set MEMORY_DB=1 to use an in-process store for local development only.

// Vercel's Upstash integration names these KV_REST_API_URL / KV_REST_API_TOKEN, or adds a
// custom prefix (e.g. STORAGE_KV_REST_API_URL). Upstash's own names are UPSTASH_REDIS_REST_*.
// The read-only token (…KV_REST_API_READ_ONLY_TOKEN) is deliberately never matched.
function findEnv(names) {
  for (const n of names) if (process.env[n]) return { name: n, value: process.env[n] };
  for (const [k, v] of Object.entries(process.env)) if (v && names.some(n => k.endsWith("_" + n))) return { name: k, value: v };
  return null;
}
function connection() {
  const url = findEnv(["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]);
  const token = findEnv(["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]);
  return url && token ? { url: url.value, token: token.value } : null;
}

function configError() {
  const tcpOnly = Object.keys(process.env).some(k => /(^|_)(REDIS_URL|KV_URL)$/.test(k) && process.env[k]);
  const e = new Error(tcpOnly
    ? "The site found a Redis database it can't use: Vercel only provided a REDIS_URL. In Vercel, open Storage and connect Upstash for Redis (from the Marketplace), which adds KV_REST_API_URL and KV_REST_API_TOKEN, then redeploy."
    : "The database isn't connected. In Vercel, open Storage, connect Upstash for Redis to this project (with Production ticked), then redeploy.");
  e.code = "CONFIG";
  return e;
}

export async function cmd(...args) {
  if (process.env.MEMORY_DB === "1") return memory(args);
  const conn = connection();
  if (!conn) throw configError();
  const r = await fetch(conn.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
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
    case "HSET": { const m = get(a[0]) instanceof Map ? get(a[0]) : new Map(); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!m.has(a[i])) n++; m.set(a[i], a[i+1]); } mem.set(a[0], m); return n; }
    case "HGET": { const m = get(a[0]); return m instanceof Map && m.has(a[1]) ? m.get(a[1]) : null; }
    case "HDEL": { const m = get(a[0]); let n = 0; if (m instanceof Map) for (const f of a.slice(1)) n += m.delete(f) ? 1 : 0; return n; }
    case "HVALS": { const m = get(a[0]); return m instanceof Map ? [...m.values()] : []; }
    case "HGETALL": { const m = get(a[0]); return m instanceof Map ? [...m].flat() : []; }
    default: throw new Error("memory db: unsupported " + op);
  }
}
