// GET: who is signed in.
// POST {action: "firebase", idToken}: exchange a Firebase Auth ID token for a site session.
// POST {action: "logout"}: end the site session.
import { cmd, getJson, setJson } from "../lib/redis.js";
import { route, readJson, fail } from "../lib/http.js";
import { currentUser, setSession, clearSession, isAdmin, limit, newId } from "../lib/auth.js";
import { verifyIdToken } from "../lib/firebase-token.js";

function view(user) {
  return user
    ? { user: { uid: user.uid, email: user.email, emailVerified: !!user.emailVerified }, canMod: isAdmin(user) }
    : { user: null, canMod: false };
}

export default route({
  async GET(req) {
    return view(await currentUser(req));
  },

  async POST(req, res) {
    const body = await readJson(req);

    if (body.action === "logout") { clearSession(res); return view(null); }

    if (body.action === "firebase") {
      await limit(req, "login", 30, 900);
      const t = await verifyIdToken(body.idToken);
      const email = typeof t.email === "string" ? t.email.trim().toLowerCase() : "";
      const verified = t.email_verified === true;
      if (!email) fail(400, "Your account needs an email address to sign in here.");

      // One site account per Firebase user. An account created before Firebase sign-in
      // is linked only when Firebase has verified that the person owns the email.
      let uid = await cmd("GET", "fb:" + t.sub);
      if (!uid) {
        const legacy = verified ? await cmd("GET", "email:" + email) : null;
        const candidate = legacy || newId("u");
        await cmd("SET", "fb:" + t.sub, candidate, "NX");
        uid = await cmd("GET", "fb:" + t.sub);
      }

      const now = Date.now();
      const user = (await getJson("user:" + uid)) || { uid, createdAt: now };
      delete user.pass;
      Object.assign(user, {
        uid, firebaseUid: t.sub, email, emailVerified: verified,
        provider: (t.firebase && t.firebase.sign_in_provider) || "", lastSignInAt: now,
      });
      await setJson("user:" + uid, user);
      setSession(res, uid);
      return view(user);
    }

    fail(400, "Unknown action.");
  },
});
