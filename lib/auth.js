import crypto from "node:crypto";
import { cmd, getJson } from "./redis.js";
import { fail, clientIp } from "./http.js";

const COOKIE = "sg_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    const e = new Error("Set SESSION_SECRET (a random string of at least 16 characters) in the Vercel project's environment variables, then redeploy.");
    e.code = "CONFIG"; throw e;
  }
  return s;
}
const sign = v => crypto.createHmac("sha256", secret()).update(v).digest("base64url");
const secure = () => (process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "");

export const newId = (prefix, bytes = 12) => prefix + crypto.randomBytes(bytes).toString("base64url");

export function setSession(res, uid) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const v = `${uid}.${exp}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${v}.${sign(v)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure()}`);
}
export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);
}

function readCookie(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionUid(req) {
  const c = readCookie(req);
  if (!c) return null;
  const i = c.lastIndexOf(".");
  if (i < 0) return null;
  const v = c.slice(0, i), sig = Buffer.from(c.slice(i + 1)), good = Buffer.from(sign(v));
  if (sig.length !== good.length || !crypto.timingSafeEqual(sig, good)) return null;
  const [uid, exp] = v.split(".");
  if (!uid || !(Number(exp) * 1000 > Date.now())) return null;
  return uid;
}

export async function currentUser(req) {
  const uid = sessionUid(req);
  return uid ? getJson("user:" + uid) : null;
}
export async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in to do that.");
  return u;
}

export function isAdmin(user) {
  if (!user || !user.emailVerified) return false;
  const list = String(process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(user.email);
}

/** Fixed-window rate limit per client IP; throws 429 when over. */
export async function limit(req, bucket, max, windowSec) {
  const key = `rl:${bucket}:${clientIp(req)}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const n = await cmd("INCR", key);
  if (n === 1) await cmd("EXPIRE", key, windowSec);
  if (n > max) fail(429, "Too many attempts. Wait a few minutes and try again.");
}
