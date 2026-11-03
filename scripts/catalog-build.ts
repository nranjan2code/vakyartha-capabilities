// Builds the distributable catalog from capabilities/: one deterministic archive per
// capability plus index.json. Output is static files; hosting is separate (docs/marketplace/DISTRIBUTION.md).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tree = path.join(root, "capabilities");
const out = path.resolve(process.argv[2] ?? path.join(root, "dist-catalog"));

function files(dir: string, prefix = ""): [string, Buffer][] {
  const found: [string, Buffer][] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isSymbolicLink()) throw new Error(`Capabilities cannot contain links: ${prefix}${entry.name}`);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) found.push(...files(path.join(dir, entry.name), `${relative}/`));
    else found.push([relative, readFileSync(path.join(dir, entry.name))]);
  }
  return found;
}

const manifest = JSON.parse(readFileSync(path.join(tree, "capabilities.json"), "utf8"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const items: { kind: string; id: string; version: string; file: string; sha256: string; bytes: number }[] = [];
function pack(kind: string, id: string, entries: [string, Buffer][]) {
  const body = JSON.stringify({ schema: 1, kind, id, files: Object.fromEntries(entries.map(([name, data]) => [name, data.toString("base64")])) });
  const data = Buffer.from(body);
  const file = `${kind}-${id}-${manifest.version}.vkcap.json`;
  writeFileSync(path.join(out, file), data);
  items.push({ kind, id, version: manifest.version, file, sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length });
}

for (const kind of ["skills", "apps"] as const) {
  for (const entry of readdirSync(path.join(tree, kind), { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    pack(kind === "skills" ? "skill" : "app", entry.name, files(path.join(tree, kind, entry.name)));
  }
}
pack("mcp", "catalog", files(path.join(tree, "mcp")));

const index = { schema: 1, name: manifest.name, version: manifest.version, requires: manifest.requires, items };
writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`catalog ${manifest.version}: ${items.length} archives → ${path.relative(root, out) || out}`);

// Static website: browse only. Installing happens in the desktop app, which verifies every hash.
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const label = (k: string) => (k === "skill" ? "Skill" : k === "app" ? "App" : "MCP catalog");
const rows = items.map((i) => `<li data-t="${esc(`${i.kind} ${i.id}`.toLowerCase())}"><strong>${esc(i.id)}</strong> <span>${label(i.kind)} · v${esc(i.version)} · ${Math.ceil(i.bytes / 1024)} KB</span><code>sha256 ${i.sha256.slice(0, 16)}…</code></li>`).join("\n");
writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vakyartha capabilities</title>
<style>body{font:16px system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#222}input{width:100%;padding:.6rem;font:inherit;margin:1rem 0}ul{list-style:none;padding:0}li{padding:.6rem 0;border-bottom:1px solid #ddd}li span{color:#666;margin-left:.5rem}code{display:block;color:#888;font-size:.8rem}@media(prefers-color-scheme:dark){body{background:#161616;color:#eee}li{border-color:#333}}</style></head>
<body><h1>Vakyartha capabilities ${esc(manifest.version)}</h1>
<p>For Vakyartha ${esc(manifest.requires.vakyartha.min)} up to (not including) ${esc(manifest.requires.vakyartha.below)}. To add one: open Vakyartha, then Settings → Library → Browse online catalog. Every item is hash-checked and arrives as a draft you review.</p>
<input id="q" type="search" placeholder="Search skills and apps" aria-label="Search">
<ul id="l">
${rows}
</ul>
<script>document.getElementById("q").addEventListener("input",e=>{const v=e.target.value.toLowerCase();for(const li of document.querySelectorAll("#l li"))li.hidden=!li.dataset.t.includes(v)})</script>
</body></html>
`);
