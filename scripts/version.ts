// Set the catalog release version and refresh what it provides:
//   node scripts/version.ts 1.1.0
// Item versions live in each item (SKILL.md metadata.version, app.json version).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, readItems, readManifest } from "./catalog.ts";

const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error("usage: node scripts/version.ts <major.minor.patch>"); process.exit(2); }
const items = readItems(), manifest = readManifest();
manifest.version = version;
manifest.provides = { skills: items.filter(i => i.kind === "skill").length, apps: items.filter(i => i.kind === "app").length };
writeFileSync(path.join(ROOT, "capabilities.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`capabilities ${version}: ${JSON.stringify(manifest.provides)}`);
