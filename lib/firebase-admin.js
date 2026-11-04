// Server-side Firebase (Firestore + Auth) via firebase-admin.
// Production: set FIREBASE_SERVICE_ACCOUNT to the service account key JSON (raw JSON or base64).
// Local: `npm run dev:emulators` sets FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST instead.
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "samurai-10ad7";

export function configError(message) {
  const e = new Error(message);
  e.code = "CONFIG";
  return e;
}

/**
 * Reads the service account key from FIREBASE_SERVICE_ACCOUNT, forgiving the usual paste
 * mistakes (wrapping quotes, "NAME=" prefix, base64, smart quotes, real line breaks inside the
 * private key, JSON pasted as a quoted string). As a fallback it also accepts the key split
 * into FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 * Error messages describe the value's shape only; they never include any of it.
 */
export function parseServiceAccount(rawValue) {
  // Drop invisible characters editors and web pages sneak in (zero-width spaces, BOM, NBSP).
  let t = String(rawValue || "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\u00A0/g, " ").trim();
  if (!t) return null;
  t = t.replace(/^FIREBASE_SERVICE_ACCOUNT\s*=\s*/, "");

  // Every reasonable reading of the pasted value: as-is, with wrapping quotes removed, base64.
  const bases = [t];
  for (let x = t, i = 0; i < 3; i++) {
    const m = /^(['"`\u201C\u201D\u2018\u2019])([\s\S]*)['"`\u201C\u201D\u2018\u2019]$/.exec(x);
    if (!m) break;
    x = m[2].trim();
    bases.push(x);
  }
  // Text around the key (a label, stray characters): take the outermost { … }.
  const first = t.indexOf("{"), last = t.lastIndexOf("}");
  if (first >= 0 && last > first && (first > 0 || last < t.length - 1)) bases.push(t.slice(first, last + 1));
  // The opening brace lost when selecting the first line.
  if (first === -1 || first > t.indexOf('"type"')) {
    const body = t.slice(Math.max(0, t.indexOf('"type"')));
    if (body.startsWith('"type"')) bases.push("{" + body + (body.trimEnd().endsWith("}") ? "" : "}"));
  }
  for (const b of [...bases]) {
    if (!b.startsWith("{") && /^[A-Za-z0-9+/=_\-\s]+$/.test(b)) {
      const decoded = Buffer.from(b, "base64").toString("utf8").trim();
      if (decoded.startsWith("{")) bases.push(decoded);
    }
  }
  const fixQuotes = x => x.replace(/[\u201C\u201D\u2033]/g, '"').replace(/[\u2018\u2019]/g, "'");
  const fixKeyNewlines = x => x.replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----\s*/g, k => k.replace(/\r?\n/g, "\\n"));

  for (const b of bases) {
    for (const attempt of [b, fixQuotes(b), fixKeyNewlines(b), fixKeyNewlines(fixQuotes(b))]) {
      let v;
      try { v = JSON.parse(attempt); } catch { continue; }
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { continue; } }
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      if (typeof v.private_key === "string") v.private_key = v.private_key.replace(/\\n/g, "\n");
      if (!v.private_key || !v.client_email) {
        throw configError("FIREBASE_SERVICE_ACCOUNT is readable but doesn't contain a private key. Make sure you pasted the service account key file (it has \"type\": \"service_account\"), not the web app config from src/firebase.js.");
      }
      return v;
    }
  }
  throw configError(describeBadKey(bases[bases.length - 1]));
}

function describeBadKey(t) {
  const fix = " In Vercel, open the downloaded .json key file in a text editor, select all, copy, and paste it as the value of FIREBASE_SERVICE_ACCOUNT, then redeploy.";
  // Describe the value's shape only. Never echo any of it back.
  const c = t[0] || "";
  const firstChar = /[A-Za-z0-9]/.test(c) ? "a letter or number" : `the character U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}${/[!-~]/.test(c) ? ` (${c})` : ""}`;
  const has = w => t.includes(w) ? "contains" : "doesn't contain";
  const shape = ` It's ${t.length} characters, starts with ${firstChar}, ${has('"private_key"')} "private_key" and ${has("service_account")} "service_account".`;
  if (/^([A-Za-z]:[\\/]|\/|~[\\/])/.test(t) || /\.json$/i.test(t)) return "FIREBASE_SERVICE_ACCOUNT looks like a file name or path, not the file's contents." + fix;
  if (/^(const |var |let |import |firebaseConfig)/.test(t) || /apiKey\s*:/.test(t)) return "FIREBASE_SERVICE_ACCOUNT looks like the web app config (apiKey, authDomain…), not the service account key. Download the key from Firebase → Project settings → Service accounts → Generate new private key." + fix;
  if (t.startsWith("{") && !t.endsWith("}")) return `FIREBASE_SERVICE_ACCOUNT seems cut off: it starts with "{" but doesn't end with "}".${shape}` + fix;
  return `FIREBASE_SERVICE_ACCOUNT couldn't be read as the key file.${shape}` + fix;
}

function serviceAccount() {
  let sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!sa && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    sa = {
      project_id: process.env.FIREBASE_PROJECT_ID || PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL.trim(),
      private_key: process.env.FIREBASE_PRIVATE_KEY.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\\n/g, "\n"),
    };
  }
  if (!sa) return null;
  if (sa.project_id && sa.project_id !== PROJECT_ID) {
    throw configError(`FIREBASE_SERVICE_ACCOUNT is for the Firebase project "${sa.project_id}", but the site uses "${PROJECT_ID}". Generate the key from the ${PROJECT_ID} project.`);
  }
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(sa.private_key)) {
    throw configError("The private key in FIREBASE_SERVICE_ACCOUNT is incomplete (it should run from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----). Generate a new key and paste the whole file.");
  }
  return sa;
}

let app, firestore;
function firebaseApp() {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]);
  const emulated = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const sa = serviceAccount();
  if (!sa && !emulated) {
    throw configError("The server isn't connected to Firebase yet. In Vercel, add FIREBASE_SERVICE_ACCOUNT (Firebase → Project settings → Service accounts → Generate new private key, then paste the whole file), and redeploy.");
  }
  app = initializeApp(sa ? { credential: cert(sa), projectId: PROJECT_ID } : { projectId: PROJECT_ID });
  return app;
}

export function db() {
  if (!firestore) {
    firestore = getFirestore(firebaseApp());
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}
export const adminAuth = () => getAuth(firebaseApp());

/** Turns common Firebase setup problems into instructions; null for anything else. */
export function explainFirebaseError(e) {
  const m = `${e && e.code} ${e && e.message}`;
  if (/database \(default\) does not exist|NOT_FOUND: The database/i.test(m)) {
    return "Firestore isn't set up yet. In the Firebase console, open Firestore Database and click Create database (production mode), then try again.";
  }
  if (/Cloud Firestore API has not been used|firestore\.googleapis\.com.*(disabled|not been used)/i.test(m)) {
    return "Firestore isn't turned on for this project yet. In the Firebase console, open Firestore Database and create the database, wait a minute, then try again.";
  }
  if (/app\/invalid-credential|invalid_grant|invalid-credential|UNAUTHENTICATED|insufficient-permission|PERMISSION_DENIED/i.test(m)) {
    return "Firebase refused the server's key. Generate a new private key (Firebase → Project settings → Service accounts), paste the whole file into FIREBASE_SERVICE_ACCOUNT in Vercel, then redeploy.";
  }
  return null;
}
