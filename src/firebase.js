// Firebase setup for the site. Bundled to public/firebase.js by `npm run build`.
// The web config below is meant to be public: it identifies the Firebase project,
// it doesn't grant access. Access is controlled by Firebase security rules.
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";

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
