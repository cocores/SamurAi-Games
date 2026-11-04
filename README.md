# SamurAi Games

An open arcade for games made with Claude. Anyone can browse and play. People create an account, set up a **studio/company** or **solo maker** profile, and post games (a play link plus cover art, genre, controls and more). Moderators can feature games and remove anything.

Plain HTML/JS front end plus Vercel serverless functions, with Upstash Redis for storage and Firebase for analytics. The only build step bundles Firebase with esbuild.

## Deploy to Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Leave the framework preset as **Other**; `vercel.json` already points the site at `public/`.
2. **Add a database.** In the project, open **Storage → Create Database → Upstash for Redis** (free tier is fine) and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. **Add environment variables** under **Settings → Environment Variables**:
   - `SESSION_SECRET`: a long random string that signs login cookies. Generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ADMIN_EMAILS`: comma-separated emails of moderators (e.g. your own). Those accounts can feature and remove games and profiles once the email is verified.
   - Also turn on Firebase sign-in (see **Firebase** below).
4. **Redeploy** so the new variables take effect. Then open the site, go to **Your profile**, and create your account using an email listed in `ADMIN_EMAILS`.

## Firebase (sign-in and Analytics)

**Turn on sign-in** in the [Firebase console](https://console.firebase.google.com/project/samurai-10ad7/authentication/providers) for project `samurai-10ad7`:

1. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
2. **Authentication → Settings → Authorized domains**: add your Vercel domain (e.g. `samurai-games.vercel.app`) and any custom domain. `localhost` is allowed by default.
3. Optional: **Authentication → Templates** to customize the verification and password-reset emails.

People sign in with Google or with email and password (with email verification and password reset). The browser signs in through Firebase, then `api/session.js` checks the Firebase ID token against Google's public keys (project, issuer, expiry, signature) and starts the site's own session. Moderators listed in `ADMIN_EMAILS` only get their rights once Firebase has verified that email, so the easiest path is signing in with Google.

**Analytics:**

`src/firebase.js` initializes the Firebase project `samurai-10ad7` and Google Analytics. `npm run build` bundles it into `public/firebase.js` (Vercel runs this on every deploy; the output isn't committed). Besides page views, the site logs `sign_up`, `login`, `post_game`, `play_game` and `rate_game` events. See them in the Firebase console under Analytics (Realtime and DebugView).

The Firebase web config in that file is public by design; it identifies the project and doesn't grant access.

## Run locally

```sh
npm install
npm run dev   # builds the Firebase bundle, then serves http://localhost:3000
```

Without Redis variables it uses an in-memory store that resets on restart. To use your real database locally, copy `.env.example` to `.env`, fill it in, and run `node --env-file=.env scripts/dev.mjs`.

## How it fits together

| Path | What it does |
| --- | --- |
| `public/index.html`, `public/app.js` | The site: games grid, creators, profile pages, account and posting forms |
| `api/session.js` | Turns a verified Firebase Auth sign-in into a site session (signed HttpOnly cookie); sign out |
| `api/creators.js` | List all creators and games; create/update/delete your profile |
| `api/games.js` | Post, edit, delete games |
| `api/images.js` | Upload cover and avatar images (resized in the browser, served at `/img/<id>`) |
| `api/featured.js` | Feature/unfeature games (moderators) |
| `api/ratings.js` | 1–5 star ratings: one per player per game, averaged per game (you can't rate your own) |
| `lib/` | Redis client, auth, validation, data helpers |

Notes:
- Games are listed by link. Makers host their games elsewhere (a published Claude artifact, their own site, itch.io, etc.).
- Images are stored in Redis (up to about 900 KB each after resizing). For heavy image traffic you could move them to Vercel Blob later.
- Sign-up, sign-in and uploads are rate limited per IP address.

`samurai-games.html` is the earlier claude.ai artifact version of the page and isn't used by the Vercel site.
