// GET: who is signed in.
// POST {action: "firebase", idToken}: exchange a Firebase Auth ID token for a session cookie.
// POST {action: "logout"}: end the session.
import { route, readJson, fail } from "../lib/http.js";
import { currentUser, startSession, clearSession, isAdmin, limit } from "../lib/auth.js";
import { recordSignIn } from "../lib/store.js";

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
      const user = await startSession(res, body.idToken);
      if (!user.email) { clearSession(res); fail(400, "Your account needs an email address to sign in here."); }
      await recordSignIn(user);
      return view(user);
    }
    fail(400, "Unknown action.");
  },
});
