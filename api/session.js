// GET: who is signed in. POST {action: "signup" | "login" | "logout", email, password}
import { cmd, getJson, setJson } from "../lib/redis.js";
import { route, readJson, fail } from "../lib/http.js";
import { currentUser, setSession, clearSession, hashPassword, verifyPassword, isAdmin, limit, newId } from "../lib/auth.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function view(user) {
  return user ? { user: { uid: user.uid, email: user.email }, canMod: isAdmin(user) } : { user: null, canMod: false };
}

export default route({
  async GET(req) {
    return view(await currentUser(req));
  },

  async POST(req, res) {
    const body = await readJson(req);
    const action = body.action;

    if (action === "logout") { clearSession(res); return view(null); }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!EMAIL.test(email)) fail(400, "Enter a valid email address.");

    if (action === "signup") {
      await limit(req, "signup", 10, 3600);
      if (password.length < 8) fail(400, "Use a password of at least 8 characters.");
      if (password.length > 200) fail(400, "That password is too long.");
      const uid = newId("u");
      const claimed = await cmd("SET", "email:" + email, uid, "NX");
      if (claimed !== "OK") fail(409, "An account with that email already exists. Sign in instead.");
      const user = { uid, email, pass: await hashPassword(password), createdAt: Date.now() };
      await setJson("user:" + uid, user);
      setSession(res, uid);
      return view(user);
    }

    if (action === "login") {
      await limit(req, "login", 20, 900);
      const uid = await cmd("GET", "email:" + email);
      const user = uid ? await getJson("user:" + uid) : null;
      if (!user || !(await verifyPassword(password, user.pass))) fail(401, "That email and password don't match.");
      setSession(res, user.uid);
      return view(user);
    }

    fail(400, "Unknown action.");
  },
});
