// Set the catalog release version and refresh what it provides. A person types it;
// nothing else ever changes a version:
//   node scripts/version.ts 1.1.0
// Item versions live in each item (SKILL.md metadata.version, app.json version).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, readItems, readManifest } from "./catalog.ts";
import { confirmVersion } from "./human.ts";

const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error("usage: node scripts/version.ts <major.minor.patch>"); process.exit(2); }
await confirmVersion("Set Vakyartha capabilities to", version);
const items = readItems(), manifest = readManifest();
manifest.version = version;
manifest.provides = { apps: items.filter(i => i.kind === "app").length, skills: items.filter(i => i.kind === "skill").length, integrations: items.filter(i => i.kind === "integration").length };
writeFileSync(path.join(ROOT, "capabilities.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`capabilities ${version}: ${JSON.stringify(manifest.provides)}`);
