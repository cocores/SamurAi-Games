// Verifies Firebase Auth ID tokens without firebase-admin.
// Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
import crypto from "node:crypto";
import { fail } from "./http.js";

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "samurai-10ad7";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cache = { keys: null, until: 0 };
async function signingKeys(force) {
  if (!force && cache.keys && Date.now() < cache.until) return cache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error("Couldn't fetch Firebase signing keys: " + r.status);
  const j = await r.json();
  const maxAge = Number((/max-age=(\d+)/.exec(r.headers.get("cache-control") || "") || [])[1]) || 3600;
  const keys = {};
  for (const k of j.keys || []) if (k.kid) keys[k.kid] = crypto.createPublicKey({ key: k, format: "jwk" });
  cache = { keys, until: Date.now() + maxAge * 1000 };
  return keys;
}

const decode = part => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const invalid = () => fail(401, "Your sign-in has expired. Sign in again.");

/** Returns the verified token payload, or throws a 401 HttpError. */
export async function verifyIdToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || token.length > 8192) invalid();
  let header, payload;
  try { header = decode(parts[0]); payload = decode(parts[1]); } catch { invalid(); }
  if (header.alg !== "RS256" || typeof header.kid !== "string") invalid();

  let key = (await signingKeys())[header.kid];
  if (!key) key = (await signingKeys(true))[header.kid]; // keys rotate
  if (!key) invalid();
  const signed = Buffer.from(parts[0] + "." + parts[1]);
  if (!crypto.verify("RSA-SHA256", signed, key, Buffer.from(parts[2], "base64url"))) invalid();

  const now = Math.floor(Date.now() / 1000), skew = 300;
  const ok =
    payload.aud === PROJECT_ID &&
    payload.iss === `https://securetoken.google.com/${PROJECT_ID}` &&
    typeof payload.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 128 &&
    Number(payload.exp) > now &&
    Number(payload.iat) <= now + skew &&
    Number(payload.auth_time) <= now + skew;
  if (!ok) invalid();
  return payload;
}
