// Reads the capabilities tree and enforces the one set of rules every item follows.
// The checker, the builder and the tests all go through here, so a rule cannot
// hold in one place and not another.
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = 1;
/** Every app runs on the Node line Vakyartha ships. Nothing else is accepted. */
export const APP_ENGINE = "node26";
const SEMVER = /^\d+\.\d+\.\d+$/;
/** The fixed groups people browse by. A new group is a deliberate change here, never ad hoc. */
export const SKILL_GROUPS: Record<string, string> = {
  "build-apps": "Building apps", reports: "Dashboards and reports", writing: "Writing", code: "Code and terminal",
  decisions: "Decisions", "live-data": "Live data", everyday: "Everyday", health: "Health checks",
};
export const APP_GROUPS: Record<string, string> = { productivity: "Productivity", finance: "Finance", developer: "Developer", utilities: "Utilities" };
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_FILE = 1 << 20, MAX_FILES = 200, MAX_ITEM = 8 << 20;
const SECRET = /sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-ant-|[0-9]{8,10}:[A-Za-z0-9_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export interface Manifest {
  schema: number; name: string; version: string;
  requires: { vakyartha: { min: string; below: string } };
  provides: { skills: number; apps: number };
}
export type Kind = "skill" | "app";
/** What a person is told before adding an item. Derived from the item's own declarations only. */
export interface Access { network: "none" | "governed tools"; tools: string[]; database: boolean; schedule: boolean; files: number }
export interface Item {
  kind: Kind; id: string; version: string; name: string; description: string;
  category: string; author: string; access: Access; requires: string[];
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
    const [, key, raw] = top as unknown as [string, string, string];
    if (raw === "" ) { parent = key; continue; }
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

function skill(id: string): Item {
  const files = walk(path.join(ROOT, "skills", id));
  checkFiles(`skills/${id}`, files);
  const text = files.find(([n]) => n === "SKILL.md")?.[1].toString("utf8");
  if (!text) throw new Error(`skills/${id}: missing SKILL.md`);
  const fm = frontmatter(text);
  if (fm.name !== id) throw new Error(`skills/${id}: frontmatter name must be ${id}`);
  if (!fm.description || fm.description.length > 1024) throw new Error(`skills/${id}: needs a description up to 1024 characters`);
  const version = fm["metadata.version"] ?? "";
  if (!SEMVER.test(version)) throw new Error(`skills/${id}: metadata.version must be exact x.y.z`);
  if (fm["metadata.author"] !== "Vakyartha") throw new Error(`skills/${id}: metadata.author must be Vakyartha`);
  const category = fm["metadata.category"] ?? "";
  if (!Object.hasOwn(SKILL_GROUPS, category)) throw new Error(`skills/${id}: metadata.category must be one of ${Object.keys(SKILL_GROUPS).join(", ")}`);
  const tools = (fm["allowed-tools"] ?? "").split(/\s+/).filter(Boolean).sort();
  return {
    kind: "skill", id, version, name: title(id), description: fm.description, category, author: "Vakyartha",
    access: { network: "none", tools, database: false, schedule: false, files: files.length },
    requires: (fm.compatibility ?? "").match(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g)?.filter(n => n !== id) ?? [], files,
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
  if (!Object.hasOwn(APP_GROUPS, m.category ?? "")) throw new Error(`apps/${id}: category must be one of ${Object.keys(APP_GROUPS).join(", ")}`);
  if (m.entitlements?.network?.allowedDomains?.length) throw new Error(`apps/${id}: direct network grants are not allowed; use governed tools`);
  for (const entry of [m.entrypoints?.backend, m.entrypoints?.surface].filter(Boolean)) if (!files.some(([n]) => n === entry)) throw new Error(`apps/${id}: entrypoint ${entry} is missing`);
  const tools = [...(m.entitlements?.mcpTools ?? [])].map(String).sort();
  return {
    kind: "app", id, version: m.version, name: m.name, description: m.description, category: m.category, author: "Vakyartha",
    access: { network: m.entitlements?.network?.mode === "brokered" ? "governed tools" : "none", tools, database: !!m.entitlements?.storage?.duckdb, schedule: (m.triggers ?? []).some((t: { kind: string }) => t.kind === "cron"), files: files.length },
    requires: [], files,
  };
}

const title = (id: string) => id.split("-").map(w => w[0]!.toUpperCase() + w.slice(1)).join(" ");
const dirs = (kind: string) => readdirSync(path.join(ROOT, kind), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();

/** Every item in a stable order, each checked. Throws on the first rule broken. */
export function readItems(): Item[] {
  for (const d of [...dirs("skills"), ...dirs("apps")]) if (!NAME.test(d) || d.length > 64) throw new Error(`${d}: names use lowercase letters, digits and single hyphens`);
  const items = [...dirs("skills").map(skill), ...dirs("apps").map(app)];
  const ids = new Set<string>();
  // Ids are unique within a kind; an app and its companion skill may share one.
  for (const i of items) { const key = `${i.kind}:${i.id}`; if (ids.has(key)) throw new Error(`${i.id}: listed twice`); ids.add(key); }
  return items;
}

export function checkManifest(m: Manifest, items: Item[]): void {
  if (m.schema !== SCHEMA || m.name !== "vakyartha-capabilities") throw new Error("capabilities.json: wrong schema or name");
  for (const v of [m.version, m.requires.vakyartha.min, m.requires.vakyartha.below]) if (!SEMVER.test(v)) throw new Error(`capabilities.json: ${v} is not exact x.y.z`);
  const counts = { skills: items.filter(i => i.kind === "skill").length, apps: items.filter(i => i.kind === "app").length };
  if (JSON.stringify(m.provides) !== JSON.stringify(counts)) throw new Error(`capabilities.json: provides must be ${JSON.stringify(counts)}; run node scripts/version.ts ${m.version}`);
  if (Object.keys(m).sort().join() !== "name,provides,requires,schema,version") throw new Error("capabilities.json: unexpected fields");
}
