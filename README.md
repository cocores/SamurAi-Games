# SamurAi Games

An open arcade for games made with Claude. Anyone can browse and play. People create an account, set up a **studio/company** or **solo maker** profile, and post games (a play link plus cover art, genre, controls and more). Players rate games 1–5 stars. Moderators can feature games and remove anything.

Plain HTML/JS front end plus Vercel serverless functions. Everything else is **Firebase** (project `samurai-10ad7`): Authentication for sign-in, Firestore for all data and images, and Google Analytics. The only build step bundles the Firebase browser SDK with esbuild.

## Set up Firebase

In the [Firebase console](https://console.firebase.google.com/project/samurai-10ad7) for project `samurai-10ad7`:

1. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
2. **Authentication → Settings → Authorized domains**: add your Vercel domain (e.g. `samuraigames.vercel.app`) and any custom domain.
3. **Firestore Database → Create database**: choose **production mode** and a location near your visitors. Then open the **Rules** tab and paste the contents of `firestore.rules` (it blocks all direct browser access; the site's server is the only thing that reads and writes). Publish.
4. **Project settings → Service accounts → Generate new private key**. This downloads a JSON file the server uses to reach Firestore and Auth. Keep it private: don't commit it or share it.
5. Optional: **Authentication → Templates** to customize the verification and password-reset emails. Optional: in the Google Cloud console, add a TTL policy on the `ratelimits` collection's `expireAt` field so old rate-limit counters delete themselves.

## Deploy to Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Leave the framework preset as **Other**; `vercel.json` handles the build and output folder.
2. **Settings → Environment Variables** (for Production, and Preview if you use it):
   - `FIREBASE_SERVICE_ACCOUNT`: paste the **entire contents** of the JSON key file from step 4 above.
   - `ADMIN_EMAILS`: comma-separated moderator emails (e.g. your own). They only count once Firebase has verified the email, so sign in with Google or verify your email.
3. **Redeploy** so the variables take effect, then sign in on the site with an email from `ADMIN_EMAILS`.

No other database or secret is needed: sessions are Firebase session cookies.

## Run locally

```sh
npm install
npm run dev:emulators   # local Firebase Auth + Firestore emulators (needs Java 11+), no keys needed
```

This serves http://localhost:3000 against throwaway local data. To use your real Firebase project instead, copy `.env.example` to `.env`, fill it in, and run `npm run build && node --env-file=.env scripts/dev.mjs`.

## How it fits together

| Path | What it does |
| --- | --- |
| `public/index.html`, `public/app.js` | The site: games grid, creators, profile pages, About, sign-in and posting forms |
| `src/firebase.js` | Browser Firebase: Auth (Google, email/password, verification, reset) and Analytics. Bundled to `public/firebase.js` |
| `api/session.js` | Verifies a Firebase sign-in and sets an HttpOnly Firebase session cookie (14 days); sign out |
| `api/creators.js` | List all creators, games, featured picks and ratings (CDN-cached 15 s); create/update/delete your profile |
| `api/games.js` | Post, edit, delete games |
| `api/images.js` | Upload cover and logo images (resized in the browser, stored in Firestore, served at `/img/<id>`) |
| `api/featured.js` | Feature/unfeature games (moderators) |
| `api/ratings.js` | 1–5 star ratings: one per player per game, totals updated in a transaction (you can't rate your own game) |
| `lib/` | Firebase Admin setup, sessions, validation, Firestore data helpers |
| `firestore.rules`, `firebase.json` | Firestore rules (deny all direct access) and local emulator settings |

Firestore collections: `users` (private sign-in records), `creators` (public profiles with their games), `handles` (unique page addresses), `images`, `ratings` (each player's scores), `site/featured`, `site/ratings` (per-game totals), `ratelimits`.

Analytics logs page views plus `sign_up`, `login`, `post_game`, `play_game` and `rate_game`; see Firebase console → Analytics. The Firebase web config in `src/firebase.js` is public by design; it identifies the project and doesn't grant access.

Notes:
- Games are listed by link. Makers host their games elsewhere (a published Claude artifact, their own site, itch.io, etc.).
- Images are kept in Firestore (up to 750 KB each after resizing), so Firebase Storage and the Blaze plan aren't needed. Free-tier limits: 1 GiB stored, 50,000 reads and 20,000 writes per day.
- Sign-ins, uploads and ratings are rate limited per IP address.

`samurai-games.html` is the earlier claude.ai artifact version of the page and isn't used by the Vercel site.
