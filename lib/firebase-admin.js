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

function serviceAccount() {
  let raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
  let sa;
  try { sa = JSON.parse(raw); } catch {
    throw configError("FIREBASE_SERVICE_ACCOUNT isn't valid JSON. In Vercel, paste the whole contents of the downloaded key file, then redeploy.");
  }
  if (!sa.private_key || !sa.client_email) throw configError("FIREBASE_SERVICE_ACCOUNT is missing its private key. Generate a new key in Firebase (Project settings → Service accounts) and paste the whole file.");
  if (sa.project_id && sa.project_id !== PROJECT_ID) {
    throw configError(`FIREBASE_SERVICE_ACCOUNT is for the Firebase project "${sa.project_id}", but the site uses "${PROJECT_ID}". Generate the key from the ${PROJECT_ID} project.`);
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
