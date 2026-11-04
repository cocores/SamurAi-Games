// Build-time check: load every API route the way Vercel's runtime does.
// Vercel's Node runtime doesn't allow require() of ES modules, so this runs with
// --no-experimental-require-module (see the "build" script). If a dependency breaks that,
// the deploy fails here with the real error instead of the live site crashing.
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../api/", import.meta.url));
const routes = (await readdir(apiDir)).filter(f => f.endsWith(".js"));
for (const f of routes) {
  const mod = await import(new URL("../api/" + f, import.meta.url));
  if (typeof mod.default !== "function") throw new Error(`api/${f} has no default export`);
}
// firebase-admin's Auth module loads its token-verification dependencies on import.
await import("firebase-admin/auth");
await import("firebase-admin/firestore");
console.log(`Server check passed: ${routes.length} API routes load under Vercel's module rules.`);
