// Reads the capabilities tree and enforces the one set of rules every item follows.
// The checker, the builder and the tests all go through here, so a rule cannot
// hold in one place and not another. The rules are written out in DEPENDENCIES.md.
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = 1;
/** Every app runs on the Node line Vakyartha ships. Nothing else is accepted. */
export const APP_ENGINE = "node26";
const SEMVER = /^\d+\.\d+\.\d+$/;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_FILE = 1 << 20, MAX_FILES = 200, MAX_ITEM = 8 << 20;
const SECRET = /sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-ant-|[0-9]{8,10}:[A-Za-z0-9_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

/** The fixed groups people browse by. A new group is a deliberate change here, never ad hoc. */
export const APP_GROUPS: Record<string, string> = { productivity: "Productivity", finance: "Finance", developer: "Developer", utilities: "Utilities" };
export const SKILL_GROUPS: Record<string, string> = {
  reports: "Dashboards and reports", writing: "Writing", code: "Code and terminal", decisions: "Decisions",
  "live-data": "Live data", everyday: "Everyday",
};
export const INTEGRATION_GROUPS: Record<string, string> = { search: "Search", files: "Files and notes", developer: "Developer docs", data: "Data", finance: "Finance" };
export type Kind = "app" | "skill" | "integration";
export const KIND_DIRS: Record<Kind, string> = { app: "apps", skill: "skills", integration: "integrations" };
const GROUPS: Record<Kind, Record<string, string>> = { app: APP_GROUPS, skill: SKILL_GROUPS, integration: INTEGRATION_GROUPS };

export interface Manifest {
  schema: number; name: string; version: string;
  requires: { vakyartha: { min: string; below: string; provides: { skills: string[]; integrations: string[] } } };
  provides: { apps: number; skills: number; integrations: number };
}
/** A reference such as skill:interactive-ui. One requirement may list alternatives (any one satisfies it). */
export interface Ref { kind: Kind; id: string }
/** What a person is told before adding an item. Derived from the item's own declarations only. */
export interface Access { network: "none" | "governed tools" | "hosts"; tools: string[]; hosts: string[]; database: boolean; schedule: boolean; files: number; credentials: string[] }
/** A skill that ships inside an app and lives and dies with it. */
export interface PartSkill { name: string; description: string; path: string; requires: Ref[][] }
export interface Item {
  kind: Kind; id: string; version: string; name: string; description: string;
  category: string; author: string; access: Access;
  requires: Ref[][]; enhances: Ref[]; skills: PartSkill[];
  files: [string, Buffer][];
}

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(path.join(ROOT, "capabilities.json"), "utf8")) as Manifest;
}

function walk(dir: string, prefix = ""): [string, Buffer][] {
  const found: [string, Buffer][] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name), rel = `${prefix}${name}`;
    const stat = lstatSync(full);
    if (name.startsWith(".")) throw new Error(`${rel}: hidden files are not allowed`);
    if (stat.isSymbolicLink()) throw new Error(`${rel}: links are not allowed`);
    if (stat.isDirectory()) found.push(...walk(full, `${rel}/`));
    else found.push([rel, readFileSync(full)]);
  }
  return found;
}

/** The small YAML subset skill frontmatter uses: scalars, folded blocks and one nested map. */
// The primary model is a 4B local model: a skill body is a procedure it can follow, and
// reference detail lives in references/ files that the body names and the model reads on demand.
export const MAX_SKILL_BODY = 6000;
function procedure(text: string, where: string, present: (path: string) => boolean): void {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  if (body.length > MAX_SKILL_BODY) throw new Error(`${where}: body is ${body.length} characters; keep it to ${MAX_SKILL_BODY} and move reference detail to references/`);
  for (const [, file] of body.matchAll(/`(references\/[\w.-]+)`/g)) if (!present(file!)) throw new Error(`${where}: names ${file}, which is missing`);
  // A procedure that always draws loads the canvas grammar in the same step, so a small
  // model never spends a second round (or draws without it) to fetch interactive-ui.
  const fm = frontmatter(text);
  if (fm["metadata.requires-canvas"] === "true" && !(fm["metadata.loads-with"] ?? "").split(/[\s,]+/).includes("interactive-ui")) throw new Error(`${where}: requires-canvas needs loads-with "interactive-ui"`);
}

export function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error("SKILL.md has no frontmatter");
  const out: Record<string, string> = {};
  const lines = m[1]!.split("\n");
  let parent = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const nested = /^ {2}([a-z-]+):\s*(.*)$/.exec(line);
    const top = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (nested && parent) { out[`${parent}.${nested[1]}`] = unquote(nested[2]!); continue; }
    if (!top) continue;
    const key = top[1]!, raw = top[2]!;
    if (raw === "") { parent = key; continue; }
    parent = "";
    if (raw === ">" || raw === "|") {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      out[key] = block.join(raw === ">" ? " " : "\n");
    } else out[key] = unquote(raw);
  }
  return out;
}
const unquote = (v: string) => v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").trim();

function ref(text: string, where: string): Ref {
  const m = /^(app|skill|integration):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(text);
  if (!m) throw new Error(`${where}: ${text} is not kind:id`);
  return { kind: m[1] as Kind, id: m[2]! };
}
/** "skill:a integration:b|integration:c" → [[a], [b, c]]: every group is needed, any one member satisfies it. */
const requirements = (text: string | undefined, where: string): Ref[][] => (text ?? "").split(/\s+/).filter(Boolean).map(g => g.split("|").map(r => ref(r, where)));
const optional = (text: string | undefined, where: string): Ref[] => (text ?? "").split(/\s+/).filter(Boolean).map(r => ref(r, where));
export const refText = (r: Ref) => `${r.kind}:${r.id}`;

function checkFiles(label: string, files: [string, Buffer][]): void {
  if (!files.length || files.length > MAX_FILES) throw new Error(`${label}: needs 1 to ${MAX_FILES} files`);
  let total = 0;
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  for (const [name, data] of files) {
    total += data.length;
    if (data.length > MAX_FILE) throw new Error(`${label}/${name}: larger than 1 MiB`);
    let text: string;
    try { text = utf8.decode(data); } catch { throw new Error(`${label}/${name}: not UTF-8 text`); }
    if (SECRET.test(text)) throw new Error(`${label}/${name}: looks like it contains a key`);
    // Items are self-contained: code may import only files inside its own folder, never Vakyartha or another item.
    if (/\.(ts|mts|mjs|js)$/.test(name)) for (const spec of text.matchAll(/^\s*(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm)) {
      const target = (spec[1] ?? spec[2] ?? spec[3])!;
      if (target.startsWith("node:")) continue;
      if (!target.startsWith("./") && !target.startsWith("../")) throw new Error(`${label}/${name}: imports package ${target}; items cannot depend on packages`);
      if (path.posix.normalize(path.posix.join(path.posix.dirname(name), target)).startsWith("..")) throw new Error(`${label}/${name}: imports ${target} from outside the item`);
    }
  }
  if (total > MAX_ITEM) throw new Error(`${label}: larger than 8 MiB`);
}

function group(kind: Kind, id: string, category: string): string {
  if (!Object.hasOwn(GROUPS[kind], category)) throw new Error(`${KIND_DIRS[kind]}/${id}: category must be one of ${Object.keys(GROUPS[kind]).join(", ")}`);
  return category;
}

function skill(id: string): Item {
  const files = walk(path.join(ROOT, "skills", id));
  checkFiles(`skills/${id}`, files);
  const text = files.find(([n]) => n === "SKILL.md")?.[1].toString("utf8");
  if (!text) throw new Error(`skills/${id}: missing SKILL.md`);
  procedure(text, `skills/${id}`, (f) => files.some(([n]) => n === f));
  const fm = frontmatter(text);
  if (fm.name !== id) throw new Error(`skills/${id}: frontmatter name must be ${id}`);
  if (!fm.description || fm.description.length > 1024) throw new Error(`skills/${id}: needs a description up to 1024 characters`);
  const version = fm["metadata.version"] ?? "";
  if (!SEMVER.test(version)) throw new Error(`skills/${id}: metadata.version must be exact x.y.z`);
  if (fm["metadata.author"] !== "Vakyartha") throw new Error(`skills/${id}: metadata.author must be Vakyartha`);
  if (fm["metadata.part-of"]) throw new Error(`skills/${id}: a skill that is part of an app ships inside that app`);
  const tools = (fm["allowed-tools"] ?? "").split(/\s+/).filter(Boolean).sort();
  const where = `skills/${id}`;
  return {
    kind: "skill", id, version, name: title(id), description: fm.description, category: group("skill", id, fm["metadata.category"] ?? ""), author: "Vakyartha",
    access: { network: "none", tools, hosts: [], database: false, schedule: false, files: files.length, credentials: [] },
    requires: requirements(fm["metadata.requires"], where), enhances: optional(fm["metadata.enhances"], where), skills: [], files,
  };
}

function app(id: string): Item {
  const files = walk(path.join(ROOT, "apps", id));
  checkFiles(`apps/${id}`, files);
  const raw = files.find(([n]) => n === "app.json")?.[1].toString("utf8");
  if (!raw) throw new Error(`apps/${id}: missing app.json`);
  const m = JSON.parse(raw);
  if (m.id !== id) throw new Error(`apps/${id}: app.json id must be ${id}`);
  if (!SEMVER.test(m.version ?? "")) throw new Error(`apps/${id}: version must be exact x.y.z`);
  if (m.author !== "Vakyartha") throw new Error(`apps/${id}: author must be Vakyartha`);
  if (m.runtime?.engine !== APP_ENGINE) throw new Error(`apps/${id}: runtime.engine must be ${APP_ENGINE}`);
  if (!m.name || !m.description) throw new Error(`apps/${id}: needs a name and description`);
  if (m.entitlements?.network?.allowedDomains?.length) throw new Error(`apps/${id}: direct network grants are not allowed; use governed tools`);
  for (const entry of [m.entrypoints?.backend, m.entrypoints?.surface].filter(Boolean)) if (!files.some(([n]) => n === entry)) throw new Error(`apps/${id}: entrypoint ${entry} is missing`);
  const tools: string[] = [...(m.entitlements?.mcpTools ?? [])].map(String).sort();
  // An app's requirements are exactly the owners of the tools it declares: <integration>__<tool> or app-<id>__<tool>.
  const owners = new Map<string, Ref>();
  for (const tool of tools) {
    const owner = tool.split("__")[0]!;
    const r: Ref = owner.startsWith("app-") ? { kind: "app", id: owner.slice(4) } : { kind: "integration", id: owner };
    owners.set(refText(r), r);
  }
  const skills: PartSkill[] = (m.exports?.skills ?? []).map((s: { name: string; description: string; path?: string }) => {
    const where = `apps/${id}/${s.path}`;
    if (s.path !== `skills/${s.name}/SKILL.md`) throw new Error(`apps/${id}: skill ${s.name} must be at skills/${s.name}/SKILL.md`);
    const text = files.find(([n]) => n === s.path)?.[1].toString("utf8");
    if (!text) throw new Error(`${where}: missing`);
    const dir = s.path.slice(0, -"SKILL.md".length);
    procedure(text, where, (f) => files.some(([n]) => n === dir + f));
    const fm = frontmatter(text);
    if (fm.name !== s.name) throw new Error(`${where}: frontmatter name must be ${s.name}`);
    if (fm["metadata.part-of"] !== `app:${id}`) throw new Error(`${where}: metadata.part-of must be app:${id}`);
    if (fm["metadata.author"] !== "Vakyartha") throw new Error(`${where}: metadata.author must be Vakyartha`);
    return { name: s.name, description: s.description, path: s.path, requires: requirements(fm["metadata.requires"], where) };
  });
  if (m.brand !== undefined && !/^#[0-9a-f]{6}$/i.test(String(m.brand))) throw new Error(`apps/${id}: brand must be a #rrggbb colour`);
  const declared = skills.map(s => `skills/${s.name}/`);
  for (const [name] of files) if (name.startsWith("skills/") && !declared.some(d => name.startsWith(d))) throw new Error(`apps/${id}/${name}: not part of a declared skill`);
  return {
    kind: "app", id, version: m.version, name: m.name, description: m.description, category: group("app", id, m.category ?? ""), author: "Vakyartha",
    access: { network: m.entitlements?.network?.mode === "brokered" ? "governed tools" : "none", tools, hosts: [], database: !!m.entitlements?.storage?.duckdb, schedule: (m.triggers ?? []).some((t: { kind: string }) => t.kind === "cron"), files: files.length, credentials: [] },
    requires: [...owners.values()].map(r => [r]), enhances: [], skills, files,
  };
}

const PUBLIC_HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function integration(id: string): Item {
  const files = walk(path.join(ROOT, "integrations", id));
  checkFiles(`integrations/${id}`, files);
  if (files.length !== 1 || files[0]![0] !== "integration.json") throw new Error(`integrations/${id}: holds exactly integration.json`);
  const d = JSON.parse(files[0]![1].toString("utf8"));
  const where = `integrations/${id}`;
  if (d.schema !== SCHEMA || d.id !== id) throw new Error(`${where}: schema must be ${SCHEMA} and id ${id}`);
  if (!SEMVER.test(d.version ?? "")) throw new Error(`${where}: version must be exact x.y.z`);
  for (const k of ["name", "publisher", "summary", "description", "homepage", "icon"]) if (typeof d[k] !== "string" || !d[k]) throw new Error(`${where}: needs ${k}`);
  // Projection's trust words; "built-in" belongs to integrations that are part of Vakyartha.
  if (!["official", "vendor", "custom"].includes(d.trust)) throw new Error(`${where}: trust must be official, vendor or custom`);
  if (!Array.isArray(d.access) || !d.access.length) throw new Error(`${where}: needs plain-language access lines`);
  if (!/^https:\/\//.test(d.homepage)) throw new Error(`${where}: homepage must be https`);
  const s = d.source ?? {};
  if (s.kind === "npm") {
    if (typeof s.package !== "string" || !SEMVER.test(s.version ?? "") || typeof s.bin !== "string") throw new Error(`${where}: an npm source names an exact package version and bin`);
  } else if (s.kind === "http") {
    if (s.url !== undefined && !/^https:\/\/[^/?#@:]+(?:\/[^?#]*)?$/.test(s.url)) throw new Error(`${where}: url must be https without credentials, query or fragment`);
    if (s.url === undefined && !(s.urlFrom?.config && s.urlFrom.hostSuffixes?.length && s.urlFrom.paths?.length)) throw new Error(`${where}: an http source needs url or urlFrom with hostSuffixes and paths`);
  } else throw new Error(`${where}: source kind must be npm or http`);
  const hosts: string[] = (d.egress?.hosts ?? []).map((h: { host: string }) => h.host);
  for (const h of hosts) if (!PUBLIC_HOST.test(h)) throw new Error(`${where}: ${h} is not a public host name`);
  if (s.kind === "http" && s.url && !hosts.includes(new URL(s.url).hostname)) throw new Error(`${where}: egress must list ${new URL(s.url).hostname}`);
  const credentials: string[] = (d.config ?? []).filter((c: { kind: string }) => c.kind === "secret").map((c: { label: string }) => c.label);
  return {
    kind: "integration", id, version: d.version, name: d.name, description: d.description, category: group("integration", id, d.category ?? ""), author: d.publisher,
    access: { network: "hosts", tools: d.tools?.only ?? [], hosts, database: false, schedule: false, files: 1, credentials },
    requires: [], enhances: [], skills: [], files,
  };
}

const title = (id: string) => id.split("-").map(w => w[0]!.toUpperCase() + w.slice(1)).join(" ");
const dirs = (kind: string) => readdirSync(path.join(ROOT, kind), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();

/** Every item in a stable order, each checked on its own. Relationships are checked by checkCatalog. */
export function readItems(): Item[] {
  for (const d of [...dirs("skills"), ...dirs("apps"), ...dirs("integrations")]) if (!NAME.test(d) || d.length > 64) throw new Error(`${d}: names use lowercase letters, digits and single hyphens`);
  return [...dirs("apps").map(app), ...dirs("skills").map(skill), ...dirs("integrations").map(integration)];
}

/** The relationship rules in DEPENDENCIES.md. Throws on the first rule broken. */
export function checkCatalog(m: Manifest, items: Item[]): void {
  if (m.schema !== SCHEMA || m.name !== "vakyartha-capabilities") throw new Error("capabilities.json: wrong schema or name");
  for (const v of [m.version, m.requires.vakyartha.min, m.requires.vakyartha.below]) if (!SEMVER.test(v)) throw new Error(`capabilities.json: ${v} is not exact x.y.z`);
  const counts = { apps: items.filter(i => i.kind === "app").length, skills: items.filter(i => i.kind === "skill").length, integrations: items.filter(i => i.kind === "integration").length };
  if (JSON.stringify(m.provides) !== JSON.stringify(counts)) throw new Error(`capabilities.json: provides must be ${JSON.stringify(counts)}; run node scripts/version.ts ${m.version}`);
  const core = m.requires.vakyartha.provides;
  // One namespace per kind: catalog items, skills inside apps and Vakyartha's own core items never share a name.
  const names = new Map<string, string>();
  const claim = (key: string, owner: string) => { if (names.has(key)) throw new Error(`${key} is used by both ${names.get(key)} and ${owner}`); names.set(key, owner); };
  for (const s of core.skills) claim(`skill:${s}`, "Vakyartha");
  for (const s of core.integrations) claim(`integration:${s}`, "Vakyartha");
  for (const i of items) {
    claim(refText(i), `${KIND_DIRS[i.kind]}/${i.id}`);
    for (const s of i.skills) claim(`skill:${s.name}`, `apps/${i.id}`);
  }
  const exists = (r: Ref) => names.has(refText(r));
  const edges = new Map<string, string[]>();
  for (const i of items) {
    const all = [...i.requires.flat(), ...i.enhances, ...i.skills.flatMap(s => s.requires.flat())];
    for (const r of all) if (!exists(r)) throw new Error(`${KIND_DIRS[i.kind]}/${i.id}: requires ${refText(r)}, which neither this catalog nor Vakyartha provides`);
    if (i.kind === "skill" && i.requires.flat().some(r => r.kind === "app")) throw new Error(`skills/${i.id}: needs an app, so it must ship inside that app`);
    edges.set(refText(i), i.requires.flat().map(refText));
  }
  // Requirements form no cycle, so adding and removing always has an order.
  const state = new Map<string, number>();
  const visit = (n: string, trail: string[]) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) throw new Error(`Requirements form a cycle: ${[...trail, n].join(" → ")}`);
    state.set(n, 1);
    for (const next of edges.get(n) ?? []) visit(next, [...trail, n]);
    state.set(n, 2);
  };
  for (const n of edges.keys()) visit(n, []);
}

/** Who needs each item: the reverse of every requires and enhances. */
export function usedBy(items: Item[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const i of items) for (const r of [...i.requires.flat(), ...i.enhances, ...i.skills.flatMap(s => s.requires.flat())]) {
    const list = out.get(refText(r)) ?? [];
    if (!list.includes(refText(i))) list.push(refText(i));
    out.set(refText(r), list);
  }
  for (const list of out.values()) list.sort();
  return out;
}
