(() => {
"use strict";
const GENRES = ["Action","Arcade","Puzzle","Strategy","RPG","Platformer","Racing","Rhythm","Word","Card & board","Simulation","Idle","Narrative","Other"];
const CONTROLS = ["Keyboard","Mouse","Touch","Gamepad"];
const LENGTHS = ["Under 5 min","5–15 min","15–60 min","Hours","Endless"];

const S = {
  uid:null, email:null, canMod:false, sessionKnown:false,
  ready:false, loadError:null,
  creators:new Map(), featured:[], ratings:{}, mine:{},
  q:"", genre:"All", sort:"new", ckind:"all",
  view:"games", handle:null,
  edit:null, profDraft:null, authMode:"signup",
  dirty:false, modal:null, confirmKey:null
};

/* ---------- helpers ---------- */
const $ = (s, el=document) => el.querySelector(s);
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
function hash(str){ let x = 2166136261; for (const c of String(str)) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
function safeUrl(u){ try { const x = new URL(String(u||"").trim()); return x.protocol === "https:" ? x.href : null; } catch { return null; } }
function slug(s){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32); }
function initial(s){ const t = String(s||"?").trim(); return (t[0] || "?").toUpperCase(); }
function ago(ts){
  if (!ts) return "";
  const d = (Date.now() - ts)/1000;
  if (d < 3600) return Math.max(1, Math.round(d/60)) + " min ago";
  if (d < 86400) return Math.round(d/3600) + " h ago";
  if (d < 86400*30) return Math.round(d/86400) + " d ago";
  return new Date(ts).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
}
function hostOf(u){ try { return new URL(u).host.replace(/^www\./,""); } catch { return ""; } }
const imgUrl = id => "/img/" + encodeURIComponent(id);

let toastT;
function toast(msg, bad){ const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3600); }

async function api(path, method="GET", body){
  const opts = {method, credentials:"same-origin", headers:{}};
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  if (method !== "GET") S.freshUntil = Date.now() + 60000;
  let r;
  try { r = await fetch(path, opts); } catch { throw new Error("Can't reach the server. Check your connection and try again."); }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(j.error || "Something went wrong. Try again."); e.status = r.status; throw e; }
  return j;
}
function apiError(e){
  if (e.status === 401) { S.uid = null; renderAcct(); }
  toast(e.message, true);
}

/* generated covers: seigaiha waves on a hue taken from the title */
function artStyle(seed){
  const hue = hash(seed) % 360;
  const a = `hsl(${hue} 48% 30%)`, b = `hsl(${(hue+38)%360} 52% 18%)`;
  const ring = "rgba(255,255,255,.13)";
  const w = `radial-gradient(circle at 50% 100%, transparent 0 18%, ${ring} 18% 24%, transparent 24% 38%, ${ring} 38% 44%, transparent 44% 58%, ${ring} 58% 64%, transparent 64%)`;
  return `background-image:${w},${w},linear-gradient(135deg, ${a}, ${b})`;
}
function cover(game, ownerUid, opts={}){
  const el = h(opts.tag || "div", Object.assign({class:"cover"}, opts.attrs || {}));
  el.append(h("div",{class:"art", style:artStyle(ownerUid + game.title)}), h("div",{class:"glyph","aria-hidden":"true", text:initial(game.title)}));
  if (game.thumb) {
    const img = h("img",{src:imgUrl(game.thumb), alt:"", loading:"lazy"});
    img.addEventListener("error", () => img.remove());
    el.append(img);
  }
  if (opts.seal) el.append(h("span",{class:"seal", text:"選 Featured"}));
  return el;
}
function avatar(c, size){
  const el = h("span",{class:"av" + (size ? " " + size : ""), style:`background:hsl(${hash(c.uid) % 360} 42% 34%)`, "aria-hidden":"true", text:initial(c.name)});
  if (c.avatar) { const img = h("img",{src:imgUrl(c.avatar), alt:""}); img.addEventListener("error", () => img.remove()); el.append(img); }
  return el;
}

/* ---------- data ---------- */
function allGames(){
  const out = [];
  for (const c of S.creators.values()) for (const g of (c.games || [])) if (g && g.id && g.title && safeUrl(g.url)) out.push({g, c, key: c.uid + "~" + g.id});
  return out;
}
const me = () => S.uid ? S.creators.get(S.uid) : null;
function byHandle(hd){ for (const c of S.creators.values()) if (c.handle === hd) return c; return null; }

async function load(){
  try {
    const j = await api("/api/creators" + (Date.now() < (S.freshUntil || 0) ? "?fresh=" + Date.now() : ""));
    S.creators = new Map(j.creators.map(c => [c.uid, c]));
    S.featured = j.featured || [];
    S.ratings = j.ratings || {};
    S.loadError = null;
  } catch(e){ S.loadError = e.message; }
  S.ready = true;
  render();
}
async function loadSession(){
  try { const j = await api("/api/session"); setUser(j); if (S.uid) await loadMine(); }
  catch { S.uid = null; }
  S.sessionKnown = true;
  renderAcct();
}

/* ---------- analytics (Firebase, see src/firebase.js) ---------- */
window.samuraiTrackQueue = window.samuraiTrackQueue || [];
function track(name, params){
  try {
    if (typeof window.samuraiTrack === "function") window.samuraiTrack(name, params);
    else if (window.samuraiTrackQueue.length < 100) window.samuraiTrackQueue.push([name, params]);
  } catch {}
}
let firstRoute = true;

/* ---------- routing ---------- */
function route(){
  const raw = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (raw.startsWith("by-")) { S.view = "profile"; S.handle = raw.slice(3); }
  else if (raw === "creators" || raw === "you" || raw === "about") { S.view = raw; S.handle = null; }
  else { S.view = "games"; S.handle = null; }
  document.querySelectorAll(".tabs a").forEach(a => { if (a.dataset.view === S.view) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  document.querySelectorAll(".flinks a").forEach(a => { if (a.getAttribute("href") === "#" + S.view) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  closeModal();
  render(true);
  window.scrollTo(0,0);
  // Analytics logs the first page view itself; log in-page navigation here.
  if (firstRoute) firstRoute = false;
  else track("page_view", {page_title: document.title, page_location: location.href, page_path: "/" + location.hash});
}

/* ---------- render ---------- */
function render(force){
  if (!force && S.view === "you" && S.dirty) return; // keep forms stable while typing
  const app = $("#app");
  app.replaceChildren(
    S.view === "games" ? viewGames() :
    S.view === "creators" ? viewCreators() :
    S.view === "profile" ? viewProfile() :
    S.view === "about" ? viewAbout() : viewYou()
  );
  if (S.modal) openModal(S.modal.key, true);
}

function renderAcct(){
  const el = $("#acct");
  if (!S.sessionKnown) return el.replaceChildren();
  if (S.uid) el.replaceChildren(h("span",{class:"who", title:S.email, text:S.email}), h("button",{type:"button", onclick:signOut, text:"Sign out"}));
  else el.replaceChildren(h("button",{type:"button", onclick:() => { S.authMode = "login"; location.hash = "#you"; render(true); }, text:"Sign in"}));
}
function setUser(j){
  S.uid = j.user ? j.user.uid : null; S.email = j.user ? j.user.email : null;
  S.emailVerified = !!(j.user && j.user.emailVerified); S.canMod = !!j.canMod;
}
async function signOut(){
  try { await api("/api/session","POST",{action:"logout"}); } catch {}
  try { const fa = window.samuraiAuth; if (fa) await fa.signOut(); } catch {}
  S.uid = null; S.email = null; S.emailVerified = false; S.canMod = false; S.mine = {}; S.edit = null; S.profDraft = null; S.dirty = false;
  renderAcct(); render(true); toast("Signed out");
}

function statusNotice(){
  if (S.loadError) return h("div",{class:"notice"}, h("b",{text:"The arcade couldn't load. "}), S.loadError);
  if (!S.ready) return h("div",{class:"notice", text:"Loading the arcade…"});
  return null;
}

function viewGames(){
  const games = allGames();
  const studios = [...S.creators.values()].filter(c => c.kind === "studio").length;
  const players = S.creators.size - studios;
  const mast = h("section",{class:"mast wave"}, h("div",{class:"wrap"},
    h("div",null,
      h("h1",null,"Games made with ", h("em",{text:"Claude"}), "."),
      h("p",{text:"An open arcade for browser games built with Claude. Play what studios and solo makers have shipped, or set up a profile and post your own."}),
      h("div",{class:"stats"},
        h("div",null,h("strong",{text:String(games.length)}),h("span",{text:games.length === 1 ? "game" : "games"})),
        h("div",null,h("strong",{text:String(studios)}),h("span",{text:studios === 1 ? "studio" : "studios"})),
        h("div",null,h("strong",{text:String(players)}),h("span",{text:players === 1 ? "solo maker" : "solo makers"})))),
    h("a",{class:"btn onink", href:"#you"}, me() ? "Post a game" : "Create your profile")));

  const q = S.q.trim().toLowerCase();
  let list = games.filter(({g,c}) =>
    (S.genre === "All" || g.genre === S.genre) &&
    (!q || [g.title, g.tagline, g.description, c.name, g.genre].join(" ").toLowerCase().includes(q)));
  if (S.sort === "new") list.sort((a,b) => (b.g.createdAt||0) - (a.g.createdAt||0));
  else if (S.sort === "az") list.sort((a,b) => a.g.title.localeCompare(b.g.title));
  else if (S.sort === "top") list.sort((a,b) => ratingRank(b.key) - ratingRank(a.key) || (b.g.createdAt||0) - (a.g.createdAt||0));
  else if (S.sort === "creator") list.sort((a,b) => (a.c.name||"").localeCompare(b.c.name||"") || a.g.title.localeCompare(b.g.title));

  const feat = S.featured.map(k => games.find(x => x.key === k)).filter(Boolean);
  const usedGenres = new Set(games.map(x => x.g.genre));

  const searchIn = h("input",{id:"q", type:"search", placeholder:"Search games, makers, genres", value:S.q, "aria-label":"Search games",
    oninput:e => { S.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#q"); if (n){ n.focus(); n.setSelectionRange(pos,pos); } }});
  const sortSel = h("select",{id:"sort","aria-label":"Sort games", onchange:e => { S.sort = e.target.value; render(); }},
    [["new","Newest first"],["top","Top rated"],["az","Title A–Z"],["creator","By maker"]].map(([v,t]) => h("option",{value:v, selected:S.sort===v, text:t})));

  const main = h("main",{class:"wrap"},
    statusNotice(),
    feat.length && !q && S.genre === "All" ? h("section",{class:"featured"},
      h("div",{class:"sec"}, h("h2",{text:"Featured"}), h("span",{class:"label", text:"Picked by the moderators"})),
      h("div",{class:"grid"}, feat.slice(0,3).map(x => gameCard(x, true))), h("div",{style:"height:32px"})) : null,
    h("div",{class:"sec"}, h("h2",{text:"All games"}), h("span",{class:"label mono", text: list.length + (list.length === 1 ? " game" : " games")})),
    h("div",{class:"toolbar"}, h("label",{class:"search"}, h("span",{"aria-hidden":"true", class:"label", text:"⌕"}), searchIn), sortSel),
    h("div",{class:"chips", role:"group", "aria-label":"Filter by genre"},
      ["All", ...GENRES.filter(g => usedGenres.has(g))].map(g => h("button",{class:"chip", type:"button", "aria-pressed":String(S.genre===g), onclick:() => { S.genre = g; render(); }, text:g}))),
    list.length ? h("div",{class:"grid"}, list.map(x => gameCard(x))) :
      S.ready && !S.loadError ? h("div",{class:"empty"},
        h("h3",{text: games.length ? "No games match that" : "The arcade is empty so far"}),
        h("p",{text: games.length ? "Try another search or genre." : "Set up a profile and post the first game. Any https link works, including a published Claude artifact."}),
        games.length ? null : h("a",{class:"btn primary", href:"#you"}, "Post the first game")) : null
  );
  return h("div",null, mast, main);
}

function gameCard({g,c,key}, featured){
  const url = safeUrl(g.url);
  return h("article",{class:"card"},
    cover(g, c.uid, {tag:"button", attrs:{type:"button","aria-label":"Details for " + g.title, onclick:() => openModal(key)}, seal:featured}),
    h("div",{class:"body"},
      h("h3",null, h("button",{class:"linkbtn", type:"button", onclick:() => openModal(key), text:g.title})),
      g.tagline ? h("p",{class:"tagline", text:g.tagline}) : null,
      ratingLine(key),
      h("div",{class:"meta"}, g.genre ? h("span",{class:"tag", text:g.genre}) : null, (g.controls||[]).slice(0,3).map(x => h("span",{class:"tag", text:x}))),
      h("div",{class:"foot"},
        h("a",{class:"by", href:"#by-" + c.handle, title:c.name}, avatar(c), h("span",{text:c.name})),
        url ? h("a",{class:"btn primary sm", href:url, target:"_blank", rel:"noopener noreferrer", onclick:() => track("play_game", {game_id:key, game_title:g.title})}, "Play ↗") : null)));
}

function viewCreators(){
  const all = [...S.creators.values()].filter(c => c.handle && c.name);
  const list = all.filter(c => S.ckind === "all" || c.kind === S.ckind)
    .sort((a,b) => (b.games||[]).length - (a.games||[]).length || a.name.localeCompare(b.name));
  return h("main",{class:"wrap"},
    statusNotice(),
    h("div",{class:"sec"}, h("h2",{text:"Creators"}), h("span",{class:"label mono", text:list.length + (list.length === 1 ? " profile" : " profiles")})),
    h("div",{class:"chips", role:"group", "aria-label":"Filter creators"},
      [["all","Everyone"],["studio","Studios & companies"],["solo","Solo makers"]].map(([v,t]) =>
        h("button",{class:"chip", type:"button", "aria-pressed":String(S.ckind===v), onclick:() => { S.ckind = v; render(); }, text:t}))),
    list.length ? h("div",{class:"grid"}, list.map(c => h("a",{class:"ccard", href:"#by-" + c.handle},
      avatar(c, "md"),
      h("div",{class:"txt"},
        h("span",{class:"kind", text:c.kind === "studio" ? "Studio" : "Solo maker"}),
        h("h3",{text:c.name}),
        c.bio ? h("p",{text:c.bio}) : null,
        h("span",{class:"label mono", text:(c.games||[]).length + ((c.games||[]).length === 1 ? " game" : " games")}))))) :
      S.ready && !S.loadError ? h("div",{class:"empty"}, h("h3",{text:"No profiles yet"}), h("p",{text:"Studios, companies and solo makers each get a page that lists their games."}), h("a",{class:"btn primary", href:"#you"}, "Create yours")) : null
  );
}

function viewProfile(){
  const c = byHandle(S.handle);
  if (!c) return h("main",{class:"wrap"}, statusNotice(), S.ready && !S.loadError ? h("div",{class:"empty"}, h("h3",{text:"No profile at this address"}), h("p",{text:"It may have been renamed or removed."}), h("a",{class:"btn", href:"#creators"}, "See all creators")) : null);
  const site = safeUrl(c.website);
  const games = (c.games||[]).filter(g => g && g.title && safeUrl(g.url)).sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  const head = h("section",{class:"phead wave"}, h("div",{class:"wrap"},
    avatar(c, "lg"),
    h("div",{class:"txt"},
      h("span",{class:"kind", text:c.kind === "studio" ? "Studio · company" : "Solo maker"}),
      h("h1",{text:c.name}),
      c.bio ? h("p",{text:c.bio}) : null,
      site ? h("p",null, h("a",{class:"site", href:site, target:"_blank", rel:"noopener noreferrer", text:hostOf(site) + " ↗"})) : null),
    c.uid === S.uid ? h("a",{class:"btn onink", href:"#you"}, "Edit profile") : null,
    S.canMod && c.uid !== S.uid ? modControl("p:" + c.uid, "Remove profile", async () => {
      try { await api("/api/creators","DELETE",{uid:c.uid}); toast("Profile removed"); await load(); location.hash = "#creators"; } catch(e){ apiError(e); }
    }, true) : null));
  return h("div",null, head, h("main",{class:"wrap"},
    h("div",{class:"sec"}, h("h2",{text:"Games"}), h("span",{class:"label mono", text:games.length + (games.length === 1 ? " game" : " games")})),
    games.length ? h("div",{class:"grid"}, games.map(g => gameCard({g, c, key:c.uid + "~" + g.id}, S.featured.includes(c.uid + "~" + g.id)))) :
      h("div",{class:"empty"}, h("h3",{text:"Nothing posted yet"}), h("p",{text: c.uid === S.uid ? "Your games will appear here once you post them." : "Check back soon."}))));
}

function viewAbout(){
  const games = allGames().length, makers = S.creators.size;
  const head = h("section",{class:"about-head wave"}, h("div",{class:"wrap"},
    h("img",{src:"/brand/samurai-mark-light.png", alt:"", width:"120", height:"146"}),
    h("div",{class:"txt"},
      h("span",{class:"kind", style:"color:#f2d68c", text:"About"}),
      h("h1",{text:"About SamurAi Games"}),
      h("p",{text:"SamurAi Games is an open arcade for browser games built with Claude. It gives studios, companies and solo makers one place to show what they've made, and gives players one place to find it."}))));
  const faq = [
    ["Who can post?", "Anyone with an account. Create one from Your profile, choose whether you're a studio or company or a solo maker, and you can start posting."],
    ["Where are the games hosted?", "Makers host their own games, for example as a published Claude artifact or on their own site. SamurAi Games lists them and links out, so you always play the maker's own version."],
    ["What can I post?", "Games you made, or helped make, with Claude. Each listing needs a title and an https play link; a cover image, description, genre and controls help people find it."],
    ["How do ratings work?", "Signed-in players can give any game 1 to 5 stars, except their own. Each game shows its average and how many people rated it, and you can change or clear your rating any time. Top rated sorting gives a little extra weight to games with more ratings."],
    ["How are games featured?", "The arcade's moderators pick a few games for the Featured row. They can also remove listings or profiles that break the rules or don't work."],
    ["Can I change or remove my games?", "Yes. Open Your profile to edit any listing, swap its cover image or delete it. Changes show up straight away."],
  ];
  return h("div",null, head, h("main",{class:"wrap"},
    h("div",{class:"about"},
      h("section",{class:"panel"},
        h("h2",{text:"What it is"}),
        h("p",{text:"Claude has made it possible to go from an idea to a playable game in an afternoon. Those games tend to end up scattered across chats, links and personal sites. SamurAi Games collects them in one arcade where they're easy to browse, search and share."}),
        h("p",null, "Right now the arcade lists ", h("b",{class:"mono", text:String(games)}), games === 1 ? " game" : " games", " from ", h("b",{class:"mono", text:String(makers)}), makers === 1 ? " maker." : " makers.")),
      h("section",{class:"panel"},
        h("h2",{text:"Post your game"}),
        h("ol",{class:"steps"},
          h("li",{text:"Create an account from Your profile."}),
          h("li",{text:"Set up a studio, company or solo-maker profile with a name, logo and short bio."}),
          h("li",{text:"Post a game: paste its play link, add a cover image and pick a genre."})),
        h("div",{class:"actions", style:"margin-top:16px"}, h("a",{class:"btn primary", href:"#you"}, me() ? "Post a game" : "Create your profile"), h("a",{class:"btn", href:"#games"}, "Browse games")))),
    h("section",{class:"panel", style:"margin-top:20px"},
      h("h2",{style:"margin-bottom:14px", text:"Questions"}),
      h("div",{class:"faq"}, faq.map(([q,a]) => h("div",null, h("h3",{text:q}), h("p",{text:a})))))));
}

/* ---------- ratings ---------- */
async function loadMine(){ try { S.mine = (await api("/api/ratings")).mine || {}; } catch { S.mine = {}; } }
// Rank with a light prior (3 stars, weight 2) so one 5-star vote doesn't outrank many 4.8s.
function ratingRank(key){ const r = S.ratings[key]; return r ? (r.avg * r.count + 3 * 2) / (r.count + 2) : 0; }
function stars(avg, size){
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  return h("span",{class:"stars" + (size ? " " + size : ""), "aria-hidden":"true"},
    h("span",{class:"stars-bg", text:"★★★★★"}), h("span",{class:"stars-fg", style:`width:${pct}%`, text:"★★★★★"}));
}
function ratingLine(key){
  const r = S.ratings[key];
  if (!r) return h("div",{class:"rline muted"}, stars(0), h("span",{text:"No ratings yet"}));
  return h("div",{class:"rline", "aria-label":`Rated ${r.avg.toFixed(1)} out of 5 from ${r.count} ${r.count === 1 ? "rating" : "ratings"}`},
    stars(r.avg), h("b",{class:"mono", text:r.avg.toFixed(1)}), h("span",{class:"mono", text:`(${r.count})`}));
}
function rateBox(key, c){
  const r = S.ratings[key];
  const summary = h("div",{class:"rsum"},
    h("span",{class:"rbig mono", text: r ? r.avg.toFixed(1) : "–"}),
    h("div",null, stars(r ? r.avg : 0, "lg"), h("div",{class:"label", text: r ? `${r.count} ${r.count === 1 ? "rating" : "ratings"}` : "No ratings yet"})));
  let you;
  if (!S.uid) you = h("p",{class:"rnote"}, h("a",{href:"#you", onclick:() => { S.authMode = "login"; }, text:"Sign in"}), " to rate this game.");
  else if (c.uid === S.uid) you = h("p",{class:"rnote", text:"This is your game, so you can't rate it."});
  else {
    const mine = S.mine[key] || 0;
    const group = h("div",{class:"rate", role:"radiogroup", "aria-label":"Your rating"},
      [1,2,3,4,5].map(n => h("button",{type:"button", role:"radio", "aria-checked":String(mine === n), "aria-label":`${n} ${n === 1 ? "star" : "stars"}`, class: n <= mine ? "on" : "",
        onclick:() => rate(key, n), text:"★"})));
    you = h("div",{class:"ryou"}, h("span",{class:"label", text: mine ? "Your rating" : "Rate this game"}), group,
      mine ? h("button",{class:"linkbtn rclear", type:"button", onclick:() => rate(key, 0), text:"Clear"}) : null);
  }
  return h("div",{class:"ratebox"}, summary, you);
}
async function rate(key, score){
  const prev = S.mine[key];
  if (score) S.mine[key] = score; else delete S.mine[key];
  if (S.modal) openModal(S.modal.key, true);
  try {
    const j = await api("/api/ratings","POST",{key, score});
    if (j.rating) S.ratings[key] = j.rating; else delete S.ratings[key];
    toast(score ? `Rated ${score} ${score === 1 ? "star" : "stars"}` : "Rating cleared");
    if (score) track("rate_game", {game_id:key, score});
  } catch(e){
    if (prev) S.mine[key] = prev; else delete S.mine[key];
    apiError(e);
  }
  render(true);
}

/* inline two-step confirm */
function modControl(key, label, run, onInk){
  if (S.confirmKey !== key) return h("button",{class:"btn sm danger" + (onInk ? "" : " ghost"), type:"button", onclick:() => { S.confirmKey = key; refresh(); }, text:label});
  return h("span",{class:"confirm"}, h("span",{text:"Sure?"}),
    h("button",{class:"btn sm danger", type:"button", onclick:async () => { S.confirmKey = null; await run(); }, text:"Yes, remove"}),
    h("button",{class:"btn sm ghost", type:"button", onclick:() => { S.confirmKey = null; refresh(); }, text:"Cancel"}));
}
function refresh(){ if (S.modal) openModal(S.modal.key, true); render(true); }

/* ---------- game detail modal ---------- */
function openModal(key, quiet){
  const x = allGames().find(y => y.key === key);
  const ov = $("#overlay");
  if (!x) { closeModal(); return; }
  S.modal = {key};
  const {g, c} = x;
  const url = safeUrl(g.url);
  const isFeat = S.featured.includes(key);
  const facts = [["Genre", g.genre], ["Controls", (g.controls||[]).join(", ")], ["Session", g.length], ["Built with", g.builtWith], ["Posted", ago(g.createdAt)], ["Hosted on", hostOf(url)]].filter(f => f[1]);
  const box = h("div",{class:"modal", role:"dialog", "aria-modal":"true", "aria-label":g.title},
    h("div",{style:"position:relative"}, cover(g, c.uid, {seal:isFeat}), h("button",{class:"close", type:"button", "aria-label":"Close", onclick:closeModal, text:"×"})),
    h("div",{class:"mb"},
      h("h2",{text:g.title}),
      g.tagline ? h("p",{style:"margin:0;color:var(--muted)", text:g.tagline}) : null,
      h("a",{class:"by", href:"#by-" + c.handle}, avatar(c), h("span",{text:"by " + c.name})),
      g.description ? h("p",{class:"desc", text:g.description}) : null,
      rateBox(key, c),
      facts.length ? h("div",{class:"facts"}, facts.map(([k,v]) => h("div",null, h("span",{class:"label", text:k}), h("b",{text:v})))) : null,
      h("div",{class:"actions"},
        url ? h("a",{class:"btn primary", href:url, target:"_blank", rel:"noopener noreferrer", onclick:() => track("play_game", {game_id:key, game_title:g.title})}, "Play now ↗") : null,
        url ? h("button",{class:"btn", type:"button", onclick:() => copy(url)}, "Copy game link") : null,
        S.canMod ? h("button",{class:"btn ghost", type:"button", onclick:() => toggleFeature(key), text: isFeat ? "Unfeature" : "Feature"}) : null,
        S.canMod || c.uid === S.uid ? modControl("g:" + key, "Remove game", async () => {
          try { await api("/api/games","DELETE",{uid:c.uid, id:g.id}); closeModal(); toast("Game removed"); await load(); } catch(e){ apiError(e); }
        }) : null)));
  ov.replaceChildren(box);
  ov.hidden = false;
  if (!quiet) { const b = box.querySelector(".close"); b && b.focus(); }
}
function closeModal(){ S.modal = null; S.confirmKey = null; const ov = $("#overlay"); ov.hidden = true; ov.replaceChildren(); }
$("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && S.modal) closeModal(); });

async function copy(text){
  try { await navigator.clipboard.writeText(text); toast("Link copied"); }
  catch { toast("Copy didn't work here. The link is: " + text); }
}
async function toggleFeature(key){
  try { const j = await api("/api/featured","POST",{key}); S.featured = j.featured; toast(j.featured.includes(key) ? "Featured" : "Removed from featured"); render(true); }
  catch(e){ apiError(e); }
}

/* ---------- You: sign in, profile, your games ---------- */
function viewYou(){
  S.dirty = false;
  const wrap = h("main",{class:"wrap"}, statusNotice());
  if (!S.sessionKnown || !S.ready) return wrap;
  if (!S.uid) { wrap.append(authForm()); return wrap; }
  const vn = verifyNotice(); if (vn) wrap.append(vn);
  const mine = me();
  if (!mine || S.profDraft) { wrap.append(profileForm(mine)); return wrap; }

  const games = (mine.games||[]).slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  const left = h("div",{class:"panel"},
    h("div",{style:"display:flex;gap:14px;align-items:center;margin-bottom:14px"}, avatar(mine,"md"),
      h("div",{style:"min-width:0"}, h("span",{class:"kind", text:mine.kind === "studio" ? "Studio · company" : "Solo maker"}), h("h2",{style:"overflow-wrap:anywhere", text:mine.name}),
        h("span",{class:"label mono", text:"#by-" + mine.handle}))),
    mine.bio ? h("p",{style:"margin:0 0 14px;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere", text:mine.bio}) : null,
    h("div",{class:"actions"},
      h("a",{class:"btn", href:"#by-" + mine.handle}, "View public page"),
      h("button",{class:"btn ghost", type:"button", onclick:() => { S.profDraft = Object.assign({}, mine); render(true); }, text:"Edit profile"})));

  const right = S.edit ? gameForm(S.edit) : h("div",{class:"panel"},
    h("div",{class:"sec", style:"margin-top:0"}, h("h2",{text:"Your games"}),
      h("button",{class:"btn primary", type:"button", onclick:() => { S.edit = {id:null, title:"", tagline:"", url:"", description:"", genre:"Arcade", controls:["Keyboard"], length:"5–15 min", builtWith:"", thumb:null}; render(true); }, text:"Post a game"})),
    games.length ? h("div",{class:"mine"}, games.map(g => h("div",{class:"mrow"},
      h("div",{class:"thumbprev"}, cover(g, mine.uid)),
      h("div",{class:"txt"}, h("b",{text:g.title}), h("div",{class:"tagline", text:g.tagline || hostOf(g.url)})),
      h("button",{class:"btn sm", type:"button", onclick:() => { S.edit = Object.assign({controls:[]}, g); render(true); }, text:"Edit"}))))
    : h("div",{class:"empty"}, h("h3",{text:"No games yet"}), h("p",{text:"Paste the link to a game you built with Claude, such as a published artifact. Add a screenshot so it stands out in the grid."})));
  wrap.append(h("div",{class:"cols"}, left, right));
  return wrap;
}

function field(label, input, hint, full){
  return h("label",{class:"field" + (full ? " full" : "")}, h("span",{text:label}), input, hint ? h("small",{text:hint}) : null);
}
function markDirty(){ S.dirty = true; }

/* ---------- sign in / sign up (Firebase Auth, see src/firebase.js) ---------- */
function firebaseAuth(){
  if (window.samuraiAuth) return Promise.resolve(window.samuraiAuth);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Sign-in couldn't load. Check your connection and reload the page.")), 12000);
    window.addEventListener("samurai-auth-ready", () => { clearTimeout(t); resolve(window.samuraiAuth); }, {once:true});
  });
}
const AUTH_ERRORS = {
  "auth/email-already-in-use": "An account with that email already exists. Sign in instead.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/weak-password": "Use a stronger password of at least 8 characters.",
  "auth/missing-password": "Enter your password.",
  "auth/invalid-credential": "That email and password don't match.",
  "auth/invalid-login-credentials": "That email and password don't match.",
  "auth/wrong-password": "That email and password don't match.",
  "auth/user-not-found": "That email and password don't match.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Can't reach the sign-in service. Check your connection and try again.",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  "auth/account-exists-with-different-credential": "That email already has an account with a different sign-in method. Use that method instead.",
  "auth/operation-not-allowed": "This sign-in method isn't turned on yet. The site owner needs to enable it in Firebase.",
  "auth/no-current-user": "Sign in again to continue.",
  "auth/unauthorized-domain": "Sign-in isn't set up for this web address yet. The site owner needs to add it in Firebase.",
};
const SILENT = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);
function authMessage(e){ return (e && AUTH_ERRORS[e.code]) || (e && e.message && !String(e.code||"").startsWith("auth/") ? e.message : "Sign-in didn't work. Try again."); }

// Firebase proves who the person is; /api/session turns that into a site session.
async function completeSignIn(res, method){
  const j = await api("/api/session","POST",{action:"firebase", idToken:res.token});
  setUser(j);
  loadMine().then(() => { if (S.modal) openModal(S.modal.key, true); });
  renderAcct(); render(true);
  toast(res.isNew ? "Account created" : "Signed in");
  track(res.isNew ? "sign_up" : "login", {method});
}

const GOOGLE_G = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

function authForm(){
  const signup = S.authMode === "signup";
  const email = h("input",{type:"email", id:"a-email", autocomplete:"email", required:true, placeholder:"you@studio.com"});
  const pw = h("input",{type:"password", id:"a-pw", autocomplete:signup ? "new-password" : "current-password", required:true, minlength:signup ? "8" : null});
  const err = h("small",{style:"color:var(--seal)", role:"alert"});
  const note = h("small",{style:"color:var(--ok)", role:"status"});
  const btn = h("button",{class:"btn primary", type:"submit", text: signup ? "Create account" : "Sign in"});
  const busy = (on, label) => { btn.disabled = on; gbtn.disabled = on; if (label) btn.textContent = label; };

  const gbtn = h("button",{class:"btn gbtn", type:"button", onclick:async () => {
    err.textContent = ""; note.textContent = ""; busy(true);
    try { const fa = await firebaseAuth(); await completeSignIn(await fa.google(), "google"); }
    catch(e){ if (!SILENT.has(e && e.code)) err.textContent = authMessage(e); busy(false); }
  }});
  gbtn.innerHTML = GOOGLE_G;
  gbtn.append(document.createTextNode("Continue with Google"));

  const form = h("form",{class:"form", novalidate:true, onsubmit:async e => {
    e.preventDefault();
    note.textContent = "";
    if (!email.value.trim()) return err.textContent = "Enter your email address.";
    if (signup && pw.value.length < 8) return err.textContent = "Use a password of at least 8 characters.";
    err.textContent = ""; busy(true, signup ? "Creating account…" : "Signing in…");
    try {
      const fa = await firebaseAuth();
      const res = signup ? await fa.signUp(email.value.trim(), pw.value) : await fa.signIn(email.value.trim(), pw.value);
      await completeSignIn(res, "password");
    } catch(e2){ err.textContent = authMessage(e2); busy(false, signup ? "Create account" : "Sign in"); }
  }},
    field("Email", email),
    field("Password", pw, signup ? "At least 8 characters." : null),
    h("div",null, err, note, h("div",{class:"actions"}, btn,
      signup ? null : h("button",{class:"linkbtn forgot", type:"button", text:"Forgot password?", onclick:async () => {
        err.textContent = ""; note.textContent = "";
        if (!email.value.trim()) { err.textContent = "Enter your email above, then choose Forgot password."; return; }
        try { const fa = await firebaseAuth(); await fa.resetPassword(email.value.trim()); note.textContent = "If there's an account for that email, a reset link is on its way."; }
        catch(e3){ if (e3 && e3.code === "auth/user-not-found") note.textContent = "If there's an account for that email, a reset link is on its way."; else err.textContent = authMessage(e3); }
      }}))));
  return h("div",{class:"panel auth"},
    h("h2",{text: signup ? "Join the arcade" : "Welcome back"}),
    h("p",{class:"sub", text: signup ? "Create an account to set up a studio or maker profile and post your games." : "Sign in to manage your profile and games."}),
    gbtn,
    h("div",{class:"or"}, h("span",{text:"or use email"})),
    form,
    h("p",{class:"switch"}, signup ? "Already have an account? " : "New here? ",
      h("button",{type:"button", onclick:() => { S.authMode = signup ? "login" : "signup"; render(true); }, text: signup ? "Sign in" : "Create an account"})));
}

function verifyNotice(){
  if (!S.uid || S.emailVerified) return null;
  const msg = h("span",{text:" We sent a link to " + S.email + ". Verifying keeps your account recoverable."});
  const status = h("span",{role:"status"});
  return h("div",{class:"notice verify"},
    h("b",{text:"Verify your email."}), msg,
    h("span",{class:"vactions"},
      h("button",{class:"btn sm", type:"button", text:"I've verified it", onclick:async () => {
        try {
          const fa = await firebaseAuth(); const r = await fa.refresh();
          if (!r.emailVerified) { status.textContent = " Not verified yet. Open the link in the email first."; return; }
          setUser(await api("/api/session","POST",{action:"firebase", idToken:r.token})); renderAcct(); render(true); toast("Email verified");
        } catch(e){ status.textContent = " " + authMessage(e); }
      }}),
      h("button",{class:"btn sm ghost", type:"button", text:"Resend email", onclick:async () => {
        try { const fa = await firebaseAuth(); await fa.resendVerification(); status.textContent = " Sent. Check your inbox."; }
        catch(e){ status.textContent = " " + authMessage(e); }
      }})),
    status);
}

/* Resize in the browser so uploads stay small, then send to /api/images. */
async function shrink(file, maxW, maxH){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), hgt = Math.max(1, Math.round(img.naturalHeight * scale));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = hgt;
    cv.getContext("2d").drawImage(img, 0, 0, w, hgt);
    for (const q of [0.85, 0.7, 0.55]) {
      const d = cv.toDataURL("image/webp", q);
      const out = d.startsWith("data:image/webp") ? d : cv.toDataURL("image/jpeg", q);
      if (out.length < 990_000) return out; // stays under the server's 750 KB limit
    }
    return cv.toDataURL("image/jpeg", 0.45);
  } finally { URL.revokeObjectURL(url); }
}

function uploader(current, onPick, key, previewFor, maxW, maxH){
  const prev = h("div",{class:"thumbprev"});
  const paint = id => prev.replaceChildren(previewFor(id));
  paint(current);
  const status = h("small",{style:"color:var(--muted)"});
  const input = h("input",{type:"file", accept:"image/png,image/jpeg,image/webp,image/gif", id:"up-" + key, hidden:true});
  const pickBtn = h("button",{class:"btn sm", type:"button", text:"Upload image", onclick:() => input.click()});
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0]; input.value = "";
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { status.textContent = "That image is over 15 MB. Pick a smaller one."; return; }
    pickBtn.disabled = true; status.textContent = "Uploading…";
    try {
      const data = await shrink(f, maxW, maxH);
      const r = await api("/api/images","POST",{data});
      onPick(r.id); paint(r.id); markDirty(); status.textContent = "Uploaded. Save to keep it.";
    } catch(e){ status.textContent = e && e.message ? e.message : "Upload failed. Try again."; }
    pickBtn.disabled = false;
  });
  const clear = h("button",{class:"btn sm ghost", type:"button", text:"Remove image", onclick:() => { onPick(null); paint(null); markDirty(); }});
  return h("div",{class:"uprow"}, prev, h("div",{style:"display:flex;flex-direction:column;gap:6px;align-items:flex-start"}, h("div",{class:"actions", style:"margin:0"}, pickBtn, clear, input), status));
}
function discardUpload(id, original){ if (id && id !== original) api("/api/images","DELETE",{id}).catch(() => {}); }

function profileForm(mine){
  const d = S.profDraft || {kind:"solo", name:"", handle:"", bio:"", website:"", avatar:null};
  if (!S.profDraft) S.profDraft = d;
  let handleTouched = !!d.handle;
  const handle = h("input",{type:"text", id:"p-handle", maxlength:"32", required:true, value:d.handle, placeholder:"ronin-labs", oninput:e => { handleTouched = true; d.handle = e.target.value; markDirty(); }});
  const name = h("input",{type:"text", id:"p-name", maxlength:"60", required:true, value:d.name, placeholder:"Ronin Labs", oninput:e => { d.name = e.target.value; if (!handleTouched && !mine) { handle.value = slug(d.name); d.handle = handle.value; } markDirty(); }});
  const bio = h("textarea",{id:"p-bio", maxlength:"600", placeholder:"What you make, and why.", oninput:e => { d.bio = e.target.value; markDirty(); }}); bio.value = d.bio || "";
  const site = h("input",{type:"url", id:"p-site", maxlength:"200", value:d.website || "", placeholder:"https://", oninput:e => { d.website = e.target.value; markDirty(); }});
  const kind = h("div",{class:"seg", role:"radiogroup", "aria-label":"Profile type"},
    [["studio","Studio or company"],["solo","Solo maker"]].map(([v,t]) => h("label",null, h("input",{type:"radio", name:"kind", value:v, checked:d.kind===v, onchange:() => { d.kind = v; markDirty(); }}), t)));
  const err = h("small",{style:"color:var(--seal)", role:"alert"});
  const save = h("button",{class:"btn primary", type:"submit", text: mine ? "Save profile" : "Create profile"});
  const form = h("form",{class:"form", novalidate:true, onsubmit:async e => {
    e.preventDefault();
    const nm = d.name.trim(), hd = slug(d.handle), ws = (d.website||"").trim();
    if (!nm) return err.textContent = "Add a name for your profile.";
    if (hd.length < 2) return err.textContent = "Pick an address of at least 2 letters or numbers.";
    const taken = byHandle(hd); if (taken && taken.uid !== S.uid) return err.textContent = "That address is taken. Try another.";
    if (ws && !safeUrl(ws)) return err.textContent = "The website needs to start with https://";
    err.textContent = ""; save.disabled = true; save.textContent = "Saving…";
    try {
      const j = await api("/api/creators","PUT",{profile:{kind:d.kind, name:nm, handle:hd, bio:d.bio || "", website:ws, avatar:d.avatar || null}});
      S.creators.set(S.uid, j.creator);
      S.profDraft = null; S.dirty = false; toast(mine ? "Profile saved" : "Profile created"); render(true);
    } catch(e2){ err.textContent = e2.message; save.disabled = false; save.textContent = mine ? "Save profile" : "Create profile"; }
  }},
    h("div",{class:"field full"}, h("span",{text:"Profile type"}), kind),
    field("Name", name, "Your studio, company or maker name."),
    field("Page address", handle, "Letters, numbers and dashes. Your page lives at #by-your-address."),
    field("About", bio, null, true),
    field("Website", site, "Optional. Must start with https://"),
    h("div",{class:"field"}, h("span",{text:"Logo or avatar"}), uploader(d.avatar, id => d.avatar = id, "avatar", id => avatar({uid:S.uid || "x", name:d.name, avatar:id}, "lg"), 400, 400)),
    h("div",{class:"full"}, err, h("div",{class:"actions"}, save, mine ? h("button",{class:"btn ghost", type:"button", onclick:() => { discardUpload(d.avatar, mine.avatar); S.profDraft = null; S.dirty = false; render(true); }, text:"Cancel"}) : null)));
  return h("div",{class:"panel", style:"max-width:820px"},
    h("h2",{text: mine ? "Edit your profile" : "Set up your profile"}),
    h("p",{class:"sub", text: mine ? "Changes show on your public page right away." : "Studios and companies get a branded page; solo makers get one too. Your games are listed on it."}),
    form);
}

function gameForm(d){
  const mine = me();
  const original = d.id ? (mine.games||[]).find(g => g.id === d.id) : null;
  const inp = (id, key, attrs) => h("input", Object.assign({type:"text", id, value:d[key] || "", oninput:e => { d[key] = e.target.value; markDirty(); }}, attrs));
  const title = inp("g-title","title",{maxlength:"70", placeholder:"Katana Rush", required:true});
  const tagline = inp("g-tag","tagline",{maxlength:"110", placeholder:"One-button duels against a shrinking clock"});
  const url = inp("g-url","url",{type:"url", maxlength:"500", placeholder:"https://claude.ai/…", required:true});
  const built = inp("g-built","builtWith",{maxlength:"60", placeholder:"Claude Code, artifacts…"});
  const desc = h("textarea",{id:"g-desc", maxlength:"2000", placeholder:"How to play, what's special, credits.", oninput:e => { d.description = e.target.value; markDirty(); }}); desc.value = d.description || "";
  const genre = h("select",{id:"g-genre", onchange:e => { d.genre = e.target.value; markDirty(); }}, GENRES.map(g => h("option",{value:g, selected:d.genre===g, text:g})));
  const length = h("select",{id:"g-len", onchange:e => { d.length = e.target.value; markDirty(); }}, LENGTHS.map(g => h("option",{value:g, selected:d.length===g, text:g})));
  const controls = h("div",{class:"seg", role:"group", "aria-label":"Controls"}, CONTROLS.map(c => h("label",null,
    h("input",{type:"checkbox", value:c, checked:(d.controls||[]).includes(c), onchange:e => { const s = new Set(d.controls||[]); e.target.checked ? s.add(c) : s.delete(c); d.controls = CONTROLS.filter(x => s.has(x)); markDirty(); }}), c)));
  const err = h("small",{style:"color:var(--seal)", role:"alert"});
  const save = h("button",{class:"btn primary", type:"submit", text: d.id ? "Save changes" : "Post game"});
  const done = () => { S.edit = null; S.dirty = false; render(true); };
  const form = h("form",{class:"form", novalidate:true, onsubmit:async e => {
    e.preventDefault();
    if (!(d.title||"").trim()) return err.textContent = "Give the game a title.";
    if (!safeUrl(d.url)) return err.textContent = "Add a play link that starts with https://";
    err.textContent = ""; save.disabled = true; save.textContent = "Saving…";
    try {
      await api("/api/games","POST",{game:{id:d.id || undefined, title:d.title, tagline:d.tagline, url:d.url, description:d.description, genre:d.genre, controls:d.controls, length:d.length, builtWith:d.builtWith, thumb:d.thumb}});
      toast(d.id ? "Game updated" : "Game posted"); if (!d.id) track("post_game", {genre:d.genre}); S.edit = null; S.dirty = false; await load();
    } catch(e2){ err.textContent = e2.message; save.disabled = false; save.textContent = d.id ? "Save changes" : "Post game"; }
  }},
    field("Title", title),
    field("Play link", url, "Where people play it. A published Claude artifact or your own site."),
    field("Tagline", tagline, "One line for the card.", true),
    field("Description", desc, null, true),
    field("Genre", genre),
    field("Session length", length),
    h("div",{class:"field full"}, h("span",{text:"Controls"}), controls),
    field("Built with", built, "Optional, e.g. the Claude tools you used."),
    h("div",{class:"field"}, h("span",{text:"Cover image"}), uploader(d.thumb, id => d.thumb = id, "thumb", id => cover({title:d.title || "Game", thumb:id}, S.uid), 1280, 800)),
    h("div",{class:"full"}, err, h("div",{class:"actions"}, save,
      h("button",{class:"btn ghost", type:"button", onclick:() => { discardUpload(d.thumb, original && original.thumb); done(); }, text:"Cancel"}),
      d.id ? modControl("mine:" + d.id, "Delete game", async () => {
        try { await api("/api/games","DELETE",{id:d.id}); toast("Game deleted"); S.edit = null; S.dirty = false; await load(); } catch(e2){ apiError(e2); }
      }) : null)));
  return h("div",{class:"panel"}, h("h2",{text: d.id ? "Edit game" : "Post a game"}), h("p",{class:"sub", text:"It shows in the arcade grid and on your profile as soon as you save."}), form);
}

/* ---------- boot ---------- */
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !S.dirty) load(); });
route();
Promise.all([loadSession(), load()]).then(() => render());
})();
