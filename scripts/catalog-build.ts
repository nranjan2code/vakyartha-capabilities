// Builds a catalog release: one archive per item, index.json and the marketplace
// website. Same input, same bytes: the build is deterministic and is the only way
// release assets are produced (see RELEASING.md).
//   node scripts/catalog-build.ts [out-dir]
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APP_GROUPS, INTEGRATION_GROUPS, ROOT, SCHEMA, SKILL_GROUPS, checkCatalog, readItems, readManifest, refText, releaseItems, usedBy, type Item } from "./catalog.ts";
import { site } from "./site.ts";

export interface IndexItem extends Omit<Item, "files" | "channel"> { usedBy: string[]; file: string; sha256: string; bytes: number }
export interface Index { schema: number; name: string; version: string; groups: Record<string, Record<string, string>>; requires: { vakyartha: { min: string; below: string; provides: { skills: string[]; integrations: string[] } } }; items: IndexItem[] }

export function build(out: string): Index {
  const manifest = readManifest(), all = readItems();
  checkCatalog(manifest, all);
  // A signed release carries release items only; development-only items stay in the repository.
  const items = releaseItems(all);
  const users = usedBy(items);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, "archives"), { recursive: true });
  const listed: IndexItem[] = items.map(({ files, channel: _channel, ...item }) => {
    const data = Buffer.from(JSON.stringify({ schema: SCHEMA, kind: item.kind, id: item.id, version: item.version, files: Object.fromEntries(files.map(([n, d]) => [n, d.toString("base64")])) }));
    const sha256 = createHash("sha256").update(data).digest("hex");
    // The name carries the content hash, so a published file name can never point at different bytes.
    const file = `archives/${item.kind}-${item.id}-${item.version}-${sha256.slice(0, 12)}.vkcap.json`;
    writeFileSync(path.join(out, file), data);
    return { ...item, usedBy: users.get(refText(item)) ?? [], file, sha256, bytes: data.length };
  });
  // Group names travel with the release, so Vakyartha never keeps its own copy of the catalog vocabulary.
  const index: Index = { schema: SCHEMA, name: manifest.name, version: manifest.version, groups: { app: APP_GROUPS, skill: SKILL_GROUPS, integration: INTEGRATION_GROUPS }, requires: manifest.requires, items: listed };
  writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(path.join(out, "index.html"), site(index));
  writeFileSync(path.join(out, "SHA256SUMS.txt"), listed.map(i => `${i.sha256}  ${i.file}`).join("\n") + "\n");
  return index;
}

if (import.meta.main) {
  const out = path.resolve(process.argv[2] ?? path.join(ROOT, "site"));
  const index = build(out);
  console.log(`catalog ${index.version}: ${index.items.length} archives → ${path.relative(ROOT, out) || out}`);
}
