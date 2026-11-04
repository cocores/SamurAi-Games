import { explainFirebaseError } from "./firebase-admin.js";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!res.getHeader("Cache-Control") || status !== 200) res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export function query(req) {
  if (req.query && typeof req.query === "object") return req.query;
  return Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    try { return JSON.parse(String(req.body) || "{}"); } catch { fail(400, "The request body must be JSON."); }
  }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 3_000_000) fail(413, "That request is too large."); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { fail(400, "The request body must be JSON."); }
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

/** Wrap per-method handlers with JSON errors and a CSRF guard (writes must be JSON). */
export function route(methods) {
  return async (req, res) => {
    try {
      const fn = methods[req.method];
      if (!fn) { res.setHeader("Allow", Object.keys(methods).join(", ")); return send(res, 405, { error: "Method not allowed." }); }
      if (req.method !== "GET" && !String(req.headers["content-type"] || "").startsWith("application/json")) {
        return send(res, 415, { error: "Send the request as JSON." });
      }
      const out = await fn(req, res);
      if (out !== undefined && !res.writableEnded) send(res, 200, out);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      const setup = e.code === "CONFIG" ? e.message : explainFirebaseError(e);
      send(res, 500, { error: setup || "Something went wrong on the server. Try again." });
    }
  };
}
