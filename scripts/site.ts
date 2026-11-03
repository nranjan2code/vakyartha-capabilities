// The public marketplace page, generated from the same index the desktop app
// verifies. Browse only: nothing here installs anything. Self-contained: no
// external fonts, scripts or trackers. Cards are rendered statically so the page
// reads without scripts; the script adds search, filters and the detail view.
import type { Index, IndexItem } from "./catalog-build.ts";
import { APP_GROUPS, SKILL_GROUPS } from "./catalog.ts";

const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const kb = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
/** Kinds in the order people browse them, each with its own fixed groups. */
const KINDS: { kind: string; plural: string; singular: string; groups: Record<string, string> }[] = [
  { kind: "app", plural: "Apps", singular: "App", groups: APP_GROUPS },
  { kind: "skill", plural: "Skills", singular: "Skill", groups: SKILL_GROUPS },
];
const kindOf = (k: string) => KINDS.find(x => x.kind === k)!;
const label = (i: IndexItem) => kindOf(i.kind).groups[i.category] ?? i.category;

/** Plain statements of what an item can reach, from its own declarations. */
export function accessLines(i: IndexItem): string[] {
  const a = i.access, lines: string[] = [];
  if (i.kind === "app") {
    lines.push(a.network === "none" ? "Works offline: no network and no tools" : `Reaches data only through ${a.tools.length} governed tool${a.tools.length === 1 ? "" : "s"}, each one approved by you`);
    if (a.database) lines.push("Keeps its records in a local database on your computer");
    if (a.schedule) lines.push("Can refresh on a schedule while you allow it to keep running");
  } else {
    lines.push(a.tools.length ? `Instructions that may use ${a.tools.length} Vakyartha tool${a.tools.length === 1 ? "" : "s"}` : "Instructions only: uses no tools");
    lines.push("Contains text files only; nothing in it runs on its own");
  }
  return lines;
}

const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

function chips(i: IndexItem): string {
  const a = i.access, out: string[] = [];
  if (i.kind === "app") {
    out.push(a.network === "none" ? `<span class="chip ok">Offline</span>` : `<span class="chip">${a.tools.length} governed tool${a.tools.length === 1 ? "" : "s"}</span>`);
    if (a.database) out.push(`<span class="chip">Local database</span>`);
    if (a.schedule) out.push(`<span class="chip">Scheduled</span>`);
  } else out.push(a.tools.length ? `<span class="chip">${a.tools.length} tool${a.tools.length === 1 ? "" : "s"}</span>` : `<span class="chip ok">No tools</span>`);
  return out.join("");
}

function card(i: IndexItem): string {
  const key = `${i.kind}-${i.id}`, k = kindOf(i.kind);
  return `<li class="card" data-key="${esc(key)}" data-kind="${i.kind}" data-group="${esc(`${i.kind}:${i.category}`)}" data-name="${esc(i.name.toLowerCase())}" data-text="${esc(`${i.name} ${i.id} ${i.description} ${label(i)}`.toLowerCase())}">
<a class="card-link" href="#${esc(key)}" aria-label="${esc(`${i.name}, ${k.singular}: details`)}">
<span class="card-top"><span class="mono-tile ${i.kind}" aria-hidden="true">${esc(initials(i.name))}</span><span class="card-meta">${esc(k.singular)} · ${esc(label(i))}</span><span class="ver">v${esc(i.version)}</span></span>
<span class="card-name">${esc(i.name)}</span>
<span class="card-desc">${esc(i.description)}</span>
<span class="chips">${chips(i)}</span>
</a></li>`;
}

export function site(index: Index): string {
  const count = (kind: string, cat?: string) => index.items.filter(i => i.kind === kind && (!cat || i.category === cat)).length;
  const kinds = KINDS.filter(k => count(k.kind) > 0);
  const order = (a: IndexItem, b: IndexItem) => KINDS.findIndex(k => k.kind === a.kind) - KINDS.findIndex(k => k.kind === b.kind) || a.name.localeCompare(b.name);
  const items = [...index.items].sort(order);
  const groups = kinds.map(k => ({ ...k, total: count(k.kind), cats: Object.entries(k.groups).map(([id, name]) => ({ id, name, n: count(k.kind, id) })).filter(c => c.n > 0) }));
  const data = JSON.stringify(items.map(i => ({ key: `${i.kind}-${i.id}`, kind: i.kind, singular: kindOf(i.kind).singular, owner: kindOf(i.kind).plural, name: i.name, version: i.version, group: label(i), description: i.description, access: accessLines(i), tools: i.access.tools, requires: i.requires, files: i.access.files, file: i.file, sha256: i.sha256, size: kb(i.bytes) }))).replace(/</g, "\\u003c");
  const range = `${index.requires.vakyartha.min} up to (not including) ${index.requires.vakyartha.below}`;
  const summary = groups.map(g => `${g.total} ${g.plural}`).join(", ");
  const navButton = (id: string, text: string, n: number, sub = false) => `<li><button type="button" class="nav-item${sub ? " sub" : ""}" data-group="${esc(id)}" aria-current="${id === "all" ? "true" : "false"}"><span>${esc(text)}</span><span class="n">${n}</span></button></li>`;
  const nav = [navButton("all", "Everything", index.items.length), ...groups.flatMap(g => [navButton(g.kind, g.plural, g.total), ...g.cats.map(c => navButton(`${g.kind}:${c.id}`, c.name, c.n, true))])].join("");
  const options = [`<option value="all">Everything (${index.items.length})</option>`, ...groups.map(g => `<optgroup label="${esc(g.plural)}"><option value="${g.kind}">All ${esc(g.plural)} (${g.total})</option>${g.cats.map(c => `<option value="${esc(`${g.kind}:${c.id}`)}">${esc(c.name)} (${c.n})</option>`).join("")}</optgroup>`)].join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Vakyartha Capabilities</title>
<meta name="description" content="${esc(summary)} for Vakyartha ${esc(range)}. Every item is hash-pinned and arrives in Vakyartha as a draft you review.">
<style>
/* Layout: a catalog with a grouped shelf on the left, one results column with search, sort and paging, and one detail sheet. */
:root{
  --paper:#f7f8fa; --surface:#ffffff; --ink:#151b26; --ink-2:#4b5466; --ink-3:#6c7486; --rule:#e1e5eb; --hover:#eef1f5;
  --accent:#1f2937; --accent-ink:#ffffff; --soft:#eef1f5; --ok:#1d6b4a; --ok-soft:#e6f2eb; --app:#2c4a6e; --skill:#5a4a7a; --integration:#2f6159;
  --display:"Iowan Old Style","New York",ui-serif,Georgia,serif;
  --body:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace; --radius:12px; color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#111419;--surface:#181c23;--ink:#e9edf3;--ink-2:#b5bdcb;--ink-3:#8c95a5;--rule:#2a303a;--hover:#1f242c;--accent:#e9edf3;--accent-ink:#111419;--soft:#232a33;--ok:#86d1aa;--ok-soft:#18302a;--app:#a3c2e3;--skill:#c7b6e4;--integration:#93cfc3;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#111419;--surface:#181c23;--ink:#e9edf3;--ink-2:#b5bdcb;--ink-3:#8c95a5;--rule:#2a303a;--hover:#1f242c;--accent:#e9edf3;--accent-ink:#111419;--soft:#232a33;--ok:#86d1aa;--ok-soft:#18302a;--app:#a3c2e3;--skill:#c7b6e4;--integration:#93cfc3;color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--body);padding-top:env(safe-area-inset-top,0px)}
.wrap{max-width:80rem;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
a{color:inherit}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:6px}
button{font:inherit;color:inherit}
header.top{background:var(--surface);border-bottom:1px solid var(--rule)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-block:14px}
.brand{display:flex;align-items:baseline;gap:10px;text-decoration:none}
.brand b{font:600 1.25rem/1 var(--display)}
.brand span{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
nav.links{display:flex;gap:18px;flex-wrap:wrap;font-size:.875rem}
nav.links a{color:var(--ink-2);text-decoration:none}
nav.links a:hover{color:var(--ink);text-decoration:underline}
.intro{padding-block:32px 8px;display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap}
.intro h1{font:600 clamp(1.75rem,3.4vw,2.4rem)/1.15 var(--display);margin:0 0 8px;text-wrap:balance}
.intro p{margin:0;color:var(--ink-2);max-width:40rem}
.facts{display:flex;gap:8px;flex-wrap:wrap;font-size:.8125rem;color:var(--ink-2);margin:0;padding:0;list-style:none}
.facts li{border:1px solid var(--rule);background:var(--surface);border-radius:999px;padding:4px 12px}
.facts code{font:.75rem var(--mono)}
.layout{display:grid;grid-template-columns:15rem minmax(0,1fr);gap:28px;padding-block:24px 56px;align-items:start}
.shelf{position:sticky;top:16px}
.shelf h2{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin:0 0 8px 10px;font-weight:600}
.shelf ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.nav-item{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;border:0;background:transparent;padding:7px 10px;border-radius:8px;cursor:pointer;text-align:left;font-weight:600}
.nav-item.sub{font-weight:400;padding-left:22px;color:var(--ink-2)}
.nav-item:hover{background:var(--hover)}
.nav-item[aria-current="true"]{background:var(--soft);color:var(--ink)}
.nav-item .n{font-size:.75rem;color:var(--ink-3);font-variant-numeric:tabular-nums;font-weight:400}
.picker{display:none}
.results{min-width:0;display:grid;gap:16px}
.tools-row{display:flex;gap:10px;flex-wrap:wrap}
.search{flex:1 1 16rem;min-width:0;position:relative}
.search input{width:100%;font:inherit;padding:10px 12px 10px 36px;border:1px solid var(--rule);border-radius:10px;background:var(--surface);color:var(--ink)}
.search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;fill:none;stroke:var(--ink-3);stroke-width:2}
select{font:inherit;padding:9px 10px;border:1px solid var(--rule);border-radius:10px;background:var(--surface);color:var(--ink)}
.status{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.status h2{margin:0;font:600 1.25rem/1.2 var(--display)}
.status span{font-size:.8125rem;color:var(--ink-3);font-variant-numeric:tabular-nums}
.grid{list-style:none;margin:0;padding:0;display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))}
.card{min-width:0}
.card-link{height:100%;display:grid;grid-template-rows:auto auto 1fr auto;gap:8px;padding:16px;border:1px solid var(--rule);border-radius:var(--radius);background:var(--surface);text-decoration:none;transition:border-color .15s}
.card-link:hover{border-color:var(--ink-3)}
.card-top{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center}
.mono-tile{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font:600 .8125rem/1 var(--body);color:var(--surface)}
.mono-tile.app{background:var(--app)} .mono-tile.skill{background:var(--skill)} .mono-tile.integration{background:var(--integration)}
.card-meta{font-size:.8125rem;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ver{font:.75rem var(--mono);color:var(--ink-3)}
.card-name{font-weight:600;font-size:1rem;line-height:1.3;overflow-wrap:anywhere}
.card-desc{color:var(--ink-2);font-size:.875rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:.75rem;padding:2px 9px;border-radius:999px;background:var(--soft);color:var(--ink-2)}
.chip.ok{background:var(--ok-soft);color:var(--ok)}
.empty{padding-block:40px;text-align:center;color:var(--ink-3);margin:0}
.pager{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pages{display:flex;gap:4px;flex-wrap:wrap}
.pages button{min-width:2.25rem;padding:6px 10px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);cursor:pointer;font-variant-numeric:tabular-nums}
.pages button[aria-current="page"]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.pages button:disabled{opacity:.45;cursor:default}
.pager .range{font-size:.8125rem;color:var(--ink-3);font-variant-numeric:tabular-nums}
footer{border-top:1px solid var(--rule);background:var(--surface)}
footer .wrap{padding-block:22px;display:grid;gap:6px;font-size:.8125rem;color:var(--ink-3)}
dialog{width:min(40rem,calc(100% - 32px));max-height:calc(100% - 48px);padding:0;border:1px solid var(--rule);border-radius:16px;background:var(--surface);color:var(--ink)}
dialog::backdrop{background:rgba(10,14,22,.45)}
.sheet{display:grid;gap:18px;padding:24px}
.sheet:focus{outline:none}
.sheet-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center}
.sheet h2{font:600 1.45rem/1.2 var(--display);margin:0;overflow-wrap:anywhere}
.sheet .sub{font-size:.8125rem;color:var(--ink-3)}
.close{font-size:.875rem;border:1px solid var(--rule);background:transparent;border-radius:8px;padding:6px 12px;cursor:pointer}
.sheet p{margin:0;color:var(--ink-2)}
.sheet h3{margin:0 0 6px;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.sheet ul{margin:0;padding-left:1.1rem;display:grid;gap:4px;color:var(--ink-2)}
.tool-list{display:flex;flex-wrap:wrap;gap:6px}
.tool-list code{font:.75rem var(--mono);padding:2px 6px;border-radius:6px;background:var(--soft);overflow-wrap:anywhere}
.steps{list-style:none;padding:0!important;counter-reset:s}
.steps li{counter-increment:s;display:grid;grid-template-columns:1.5rem minmax(0,1fr);gap:8px}
.steps li::before{content:counter(s);font:600 .75rem/1.5rem var(--body);height:1.5rem;border-radius:50%;background:var(--soft);text-align:center}
.pin{display:grid;gap:8px;padding:12px;border:1px solid var(--rule);border-radius:10px;background:var(--paper)}
.pin dl{margin:0;display:grid;grid-template-columns:5rem minmax(0,1fr);gap:4px 12px;font-size:.8125rem}
.pin dt{color:var(--ink-3)}
.pin dd{margin:0;font-family:var(--mono);overflow-wrap:anywhere}
.copy{justify-self:start;font-size:.8125rem;border:1px solid var(--rule);background:var(--surface);border-radius:8px;padding:5px 10px;cursor:pointer}
@media (max-width:820px){.layout{grid-template-columns:minmax(0,1fr);gap:16px;padding-block:16px 40px}.shelf{display:none}.picker{display:block}.picker select{width:100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="./"><b>Vakyartha</b><span>Capabilities</span></a>
<nav class="links" aria-label="Catalog files"><a href="index.json">index.json</a><a href="SHA256SUMS.txt">SHA256SUMS</a><a href="https://github.com/nranjan2code/vakyartha-capabilities/releases/tag/capabilities-v${esc(index.version)}">Release ${esc(index.version)}</a></nav>
</div></header>
<main class="wrap">
<section class="intro">
<div><h1>Capabilities for Vakyartha</h1><p>${esc(summary)}, each published as one exact, hash-pinned version. Add them from inside Vakyartha, where every item arrives as a draft you review before it can run.</p></div>
<ul class="facts"><li>Release <code>${esc(index.version)}</code></li><li>For Vakyartha ${esc(range)}</li></ul>
</section>
<div class="layout">
<aside class="shelf" aria-label="Browse by group"><h2>Browse</h2><ul>${nav}</ul></aside>
<section class="results" aria-labelledby="group-title">
<label class="picker"><span hidden>Group</span><select id="group">${options}</select></label>
<div class="tools-row" role="search">
<label class="search"><span hidden>Search</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="Search by name or what it does" autocomplete="off"></label>
<select id="sort" aria-label="Sort"><option value="group">By group</option><option value="az">Name A–Z</option><option value="za">Name Z–A</option></select>
</div>
<div class="status"><h2 id="group-title">Everything</h2><span id="count">${index.items.length} items</span></div>
<ul class="grid" id="grid">
${items.map(card).join("\n")}
</ul>
<p class="empty" id="empty" hidden>Nothing matches. Try a shorter search or another group.</p>
<nav class="pager" id="pager" aria-label="Pages" hidden><span class="range" id="range"></span><div class="pages" id="pages"></div></nav>
</section>
</div>
</main>
<footer><div class="wrap">
<span>Each archive is named by its content hash and listed with its SHA-256. Vakyartha installs only the exact version and hash you reviewed.</span>
<span>Vakyartha Capabilities ${esc(index.version)}</span>
</div></footer>
<dialog id="detail" aria-labelledby="d-name"><div class="sheet" id="sheet" tabindex="-1"></div></dialog>
<script id="catalog-data" type="application/json">${data}</script>
<script>
(() => {
  const PAGE = 24;
  const items = JSON.parse(document.getElementById("catalog-data").textContent);
  const byKey = new Map(items.map(i => [i.key, i]));
  const $ = id => document.getElementById(id);
  const grid = $("grid"), q = $("q"), sort = $("sort"), picker = $("group"), title = $("group-title"), count = $("count"), empty = $("empty"), pager = $("pager"), pages = $("pages"), range = $("range"), dialog = $("detail"), sheet = $("sheet");
  const cards = [...grid.children], groupOrder = new Map(cards.map((c, n) => [c, n]));
  const navs = [...document.querySelectorAll(".nav-item")];
  const labels = new Map(navs.map(b => [b.dataset.group, b.querySelector("span").textContent]));
  let group = "all", page = 1;
  function matches(c) {
    const words = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    const inGroup = group === "all" || (group.includes(":") ? c.dataset.group === group : c.dataset.kind === group);
    return inGroup && words.every(w => c.dataset.text.includes(w));
  }
  function render(scroll) {
    const shown = cards.filter(matches);
    if (sort.value !== "group") shown.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name) * (sort.value === "az" ? 1 : -1));
    else shown.sort((a, b) => groupOrder.get(a) - groupOrder.get(b));
    const total = Math.max(1, Math.ceil(shown.length / PAGE));
    page = Math.min(page, total);
    const from = (page - 1) * PAGE, visible = new Set(shown.slice(from, from + PAGE));
    for (const c of cards) c.hidden = !visible.has(c);
    grid.append(...shown.slice(from, from + PAGE));
    title.textContent = labels.get(group) || "Everything";
    count.textContent = shown.length + (shown.length === 1 ? " item" : " items") + (q.value.trim() ? " match" + (shown.length === 1 ? "es" : "") : "");
    empty.hidden = shown.length > 0;
    pager.hidden = shown.length <= PAGE;
    range.textContent = shown.length ? (from + 1) + "–" + Math.min(from + PAGE, shown.length) + " of " + shown.length : "";
    const btn = (text, to, opts = {}) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; Object.assign(b, opts); if (to === page && !opts.disabled && /^\\d+$/.test(text)) b.setAttribute("aria-current", "page"); b.addEventListener("click", () => { page = to; render(true); }); return b; };
    const list = [btn("Previous", page - 1, { disabled: page === 1, ariaLabel: "Previous page" })];
    for (let n = 1; n <= total; n++) list.push(btn(String(n), n, { ariaLabel: "Page " + n }));
    list.push(btn("Next", page + 1, { disabled: page === total, ariaLabel: "Next page" }));
    pages.replaceChildren(...list);
    if (scroll) title.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function choose(next) {
    group = labels.has(next) ? next : "all"; page = 1;
    for (const b of navs) b.setAttribute("aria-current", String(b.dataset.group === group));
    picker.value = group; render(false);
  }
  for (const b of navs) b.addEventListener("click", () => choose(b.dataset.group));
  picker.addEventListener("change", () => choose(picker.value));
  q.addEventListener("input", () => { page = 1; render(false); });
  sort.addEventListener("change", () => { page = 1; render(false); });
  const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props || {}); for (const k of kids) if (k != null) n.append(k); return n; };
  function show(key) {
    const i = byKey.get(key); if (!i) return;
    const tile = el("span", { className: "mono-tile " + i.kind, textContent: i.name.split(/\\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() }); tile.setAttribute("aria-hidden", "true");
    const close = el("button", { type: "button", className: "close", textContent: "Close" }); close.addEventListener("click", () => dialog.close());
    const hash = el("dd", { textContent: i.sha256 }), copy = el("button", { type: "button", className: "copy", textContent: "Copy SHA-256" });
    copy.addEventListener("click", () => { navigator.clipboard?.writeText(i.sha256).then(() => { copy.textContent = "Copied"; }, () => { getSelection().selectAllChildren(hash); copy.textContent = "Selected"; }); });
    const dl = el("dl"); for (const [k, v] of [["Version", i.version], ["Size", i.size + " · " + i.files + " file" + (i.files === 1 ? "" : "s")], ["Archive", i.file]]) dl.append(el("dt", { textContent: k }), el("dd", { textContent: v }));
    dl.append(el("dt", { textContent: "SHA-256" }), hash);
    sheet.replaceChildren(...[
      el("div", { className: "sheet-head" }, tile, el("div", {}, el("h2", { id: "d-name", textContent: i.name }), el("div", { className: "sub", textContent: i.singular + " · " + i.group + " · v" + i.version })), close),
      el("p", { textContent: i.description }),
      el("section", {}, el("h3", { textContent: "What it can use" }), el("ul", {}, ...i.access.map(t => el("li", { textContent: t })))),
      i.tools.length ? el("section", {}, el("h3", { textContent: "Tools it asks for" }), el("div", { className: "tool-list" }, ...i.tools.map(t => el("code", { textContent: t })))) : null,
      i.requires.length ? el("section", {}, el("h3", { textContent: "Works with" }), el("p", { textContent: i.requires.join(", ") })) : null,
      el("section", {}, el("h3", { textContent: "Add it to Vakyartha" }), el("ol", { className: "steps" },
        el("li", { textContent: "Open " + i.owner + " in Vakyartha." }),
        el("li", { textContent: "Choose Vakyartha catalog, find " + i.name + " and choose Add as draft." }),
        el("li", { textContent: "Review the draft. It runs only after you publish it." }))),
      el("div", { className: "pin" }, el("h3", { textContent: "Exact release" }), dl, copy)].filter(Boolean));
    if (!dialog.open) dialog.showModal();
    sheet.focus({ preventScroll: true }); dialog.scrollTop = 0;
  }
  dialog.addEventListener("close", () => { if (byKey.has(location.hash.slice(1))) history.replaceState(null, "", location.pathname + location.search); });
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  grid.addEventListener("click", e => { const a = e.target.closest(".card-link"); if (!a) return; e.preventDefault(); const key = a.closest(".card").dataset.key; history.replaceState(null, "", "#" + key); show(key); });
  const fromHash = () => { const key = decodeURIComponent(location.hash.slice(1)); if (byKey.has(key)) show(key); };
  addEventListener("hashchange", fromHash);
  render(false); fromHash();
})();
</script>
</body>
</html>
`;
}
