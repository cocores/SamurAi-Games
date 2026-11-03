export const GENRES = ["Action","Arcade","Puzzle","Strategy","RPG","Platformer","Racing","Rhythm","Word","Card & board","Simulation","Idle","Narrative","Other"];
export const CONTROLS = ["Keyboard","Mouse","Touch","Gamepad"];
export const LENGTHS = ["Under 5 min","5–15 min","15–60 min","Hours","Endless"];
export const MAX_GAMES = 200;

export function safeUrl(u) {
  try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" ? x.href : null; } catch { return null; }
}
export function slug(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}
const str = (v, n) => String(v ?? "").trim().slice(0, n);
export const isImageId = v => typeof v === "string" && /^i[A-Za-z0-9_-]{16}$/.test(v);

export function cleanProfile(p) {
  return {
    kind: p?.kind === "studio" ? "studio" : "solo",
    name: str(p?.name, 60),
    handle: slug(p?.handle),
    bio: str(p?.bio, 600),
    website: safeUrl(p?.website) || "",
    avatar: isImageId(p?.avatar) ? p.avatar : null,
  };
}

export function cleanGame(g) {
  return {
    title: str(g?.title, 70),
    tagline: str(g?.tagline, 110),
    url: safeUrl(g?.url),
    description: str(g?.description, 2000),
    genre: GENRES.includes(g?.genre) ? g.genre : "Other",
    controls: CONTROLS.filter(c => Array.isArray(g?.controls) && g.controls.includes(c)),
    length: LENGTHS.includes(g?.length) ? g.length : "",
    builtWith: str(g?.builtWith, 60),
    thumb: isImageId(g?.thumb) ? g.thumb : null,
  };
}

export function publicCreator(c) {
  return {
    uid: c.uid, kind: c.kind, name: c.name, handle: c.handle, bio: c.bio, website: c.website,
    avatar: c.avatar, createdAt: c.createdAt, updatedAt: c.updatedAt, games: c.games || [],
  };
}
