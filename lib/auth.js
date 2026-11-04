// Sessions use Firebase session cookies: the browser signs in with Firebase Auth, the server
// swaps the ID token for an HttpOnly session cookie, and verifies that cookie on each request.
import crypto from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, db } from "./firebase-admin.js";
import { fail, clientIp } from "./http.js";

const COOKIE = "sg_session";
const MAX_AGE_SEC = 14 * 24 * 60 * 60; // Firebase's maximum for session cookies
const secure = () => (process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "");

export const newId = (prefix, bytes = 12) => prefix + crypto.randomBytes(bytes).toString("base64url");

const userFrom = t => ({
  uid: t.uid,
  email: typeof t.email === "string" ? t.email.trim().toLowerCase() : "",
  emailVerified: t.email_verified === true,
  provider: (t.firebase && t.firebase.sign_in_provider) || "",
});

/** Verify a Firebase ID token, set the session cookie, and return the user. */
export async function startSession(res, idToken) {
  let decoded, cookie;
  try {
    decoded = await adminAuth().verifyIdToken(String(idToken || ""));
    cookie = await adminAuth().createSessionCookie(String(idToken), { expiresIn: MAX_AGE_SEC * 1000 });
  } catch (e) {
    if (e.code === "CONFIG" || !String(e.code || "").startsWith("auth/") || /credential|permission/i.test(e.code)) throw e;
    fail(401, "Your sign-in has expired. Sign in again.");
  }
  res.setHeader("Set-Cookie", `${COOKIE}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure()}`);
  return userFrom(decoded);
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

export async function currentUser(req) {
  const c = readCookie(req);
  if (!c) return null;
  try { return userFrom(await adminAuth().verifySessionCookie(c)); }
  catch (e) { if (e.code === "CONFIG") throw e; return null; }
}
export async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in to do that.");
  return u;
}

/** Moderators: emails in ADMIN_EMAILS, once Firebase has verified the address. */
export function isAdmin(user) {
  if (!user || !user.emailVerified) return false;
  const list = String(process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(user.email);
}

/** Fixed-window rate limit per client IP; throws 429 when over. Old windows expire via expireAt. */
export async function limit(req, bucket, max, windowSec) {
  const win = Math.floor(Date.now() / 1000 / windowSec);
  const ip = crypto.createHash("sha256").update(clientIp(req)).digest("base64url").slice(0, 16);
  const ref = db().collection("ratelimits").doc(`${bucket}_${ip}_${win}`);
  await ref.set({ n: FieldValue.increment(1), expireAt: Timestamp.fromMillis((win + 1) * windowSec * 1000 + 3600_000) }, { merge: true });
  if (((await ref.get()).get("n") || 0) > max) fail(429, "Too many attempts. Wait a few minutes and try again.");
}
