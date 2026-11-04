// Firebase setup for the site. Bundled to public/firebase.js by `npm run build`.
// The web config below is meant to be public: it identifies the Firebase project,
// it doesn't grant access. Access is controlled by Firebase security rules.
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, getAdditionalUserInfo, signOut, connectAuthEmulator,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBy4QD9ibGrasXJ5Q3UlLJv6FAmzeZd7WY",
  authDomain: "samurai-10ad7.firebaseapp.com",
  projectId: "samurai-10ad7",
  storageBucket: "samurai-10ad7.firebasestorage.app",
  messagingSenderId: "782464743925",
  appId: "1:782464743925:web:ed0e55652dcfd5ce2308bc",
  measurementId: "G-4VHHGZNX2E",
};

export const app = initializeApp(firebaseConfig);

// Analytics only runs in browsers that support it (not in private modes that block storage, etc.).
// app.js queues events in window.samuraiTrackQueue until this module has loaded.
let analytics = null;
const pending = [];
window.samuraiTrack = (name, params) => {
  if (analytics) logEvent(analytics, name, params);
  else if (pending.length < 100) pending.push([name, params]);
};
for (const [name, params] of window.samuraiTrackQueue || []) window.samuraiTrack(name, params);

isSupported()
  .then(ok => {
    if (!ok) return;
    analytics = getAnalytics(app);
    for (const [name, params] of pending.splice(0)) logEvent(analytics, name, params);
  })
  .catch(() => {});

// Sign-in. app.js calls these, then sends the returned ID token to /api/session,
// which verifies it and starts the site session.
const auth = getAuth(app);
// Set only by scripts/dev.mjs under `npm run dev:emulators`; never on the deployed site.
if (window.SAMURAI_EMULATORS && window.SAMURAI_EMULATORS.auth) connectAuthEmulator(auth, window.SAMURAI_EMULATORS.auth, { disableWarnings: true });
const result = async cred => ({
  token: await cred.user.getIdToken(),
  isNew: !!(getAdditionalUserInfo(cred) || {}).isNewUser,
  emailVerified: cred.user.emailVerified,
});
window.samuraiAuth = {
  async signUp(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try { await sendEmailVerification(cred.user); } catch {}
    return result(cred);
  },
  signIn: async (email, password) => result(await signInWithEmailAndPassword(auth, email, password)),
  async google() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return result(await signInWithPopup(auth, provider));
  },
  resetPassword: email => sendPasswordResetEmail(auth, email),
  async resendVerification() {
    if (!auth.currentUser) throw Object.assign(new Error("Sign in again to resend the email."), { code: "auth/no-current-user" });
    await sendEmailVerification(auth.currentUser);
  },
  // After the person clicks the link in the verification email.
  async refresh() {
    if (!auth.currentUser) throw Object.assign(new Error("Sign in again to continue."), { code: "auth/no-current-user" });
    await auth.currentUser.reload();
    return { token: await auth.currentUser.getIdToken(true), emailVerified: auth.currentUser.emailVerified };
  },
  signOut: () => signOut(auth),
};
window.dispatchEvent(new Event("samurai-auth-ready"));
