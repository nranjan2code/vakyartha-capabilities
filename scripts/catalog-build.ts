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
