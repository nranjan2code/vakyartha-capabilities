// Set the catalog release version and refresh what it provides. A person types it;
// nothing else ever changes a version:
//   node scripts/version.ts 1.1.0
// Item versions live in each item (SKILL.md metadata.version, app.json version).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, readItems, readManifest, releaseItems } from "./catalog.ts";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { confirmVersion, typeItemVersion } from "./human.ts";

// Every item whose files changed since the last signed release needs its own new
// version, typed by the person: a signed release never changes.
const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function changedItems() {
  const last = git("tag", "--list", "capabilities-v*", "--sort=-v:refname").split("\n")[0];
  if (!last) return [];
  return readItems().flatMap((item) => {
    // Integrations follow Vakyartha's release; development-only items are never released.
    if (item.kind === "integration" || item.channel === "dev") return [];
    const dir = item.kind === "app" ? `apps/${item.id}` : `skills/${item.id}`;
    const file = item.kind === "app" ? `${dir}/app.json` : `${dir}/SKILL.md`;
    // A first release has no old path in the signed tag, and a just-created item
    // may still be untracked while the owner is reviewing it.
    if (!git("diff", "--name-only", last, "--", dir) && !git("status", "--porcelain", "--", dir)) return [];
    let previous: string;
    try {
      previous = git("show", `${last}:${file}`);
    } catch {
      return [{ item, file, last }];
    }
    const released = item.kind === "app"
      ? (JSON.parse(previous) as { version: string }).version
      : (/\n\s*version:\s*"?([\d.]+)"?/.exec(previous) ?? [])[1];
    return item.version === released ? [{ item, file, last }] : [];
  });
}
if (process.argv[2] === "--list") {
  for (const { item, last } of changedItems()) console.log(`${item.kind} ${item.id} ${item.version} (changed since ${last})`);
  process.exit(0);
}
const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error("usage: node scripts/version.ts <major.minor.patch>"); process.exit(2); }
await confirmVersion("Set Vakyartha capabilities to", version);
for (const { item, file } of changedItems()) {
  const [maj, min] = item.version.split(".").map(Number);
  const next = await typeItemVersion(`${item.kind} ${item.id}`, item.version, `${maj}.${min! + 1}.0`);
  const full = path.join(ROOT, file), text = readFileSync(full, "utf8");
  const updated = item.kind === "app"
    ? text.replace(/("version":\s*)"[^"]+"/, `$1"${next}"`)
    : text.replace(/(\n\s*version:\s*)"?[\d.]+"?/, `$1"${next}"`);
  if (updated === text) throw new Error(`${file}: could not find its version`);
  writeFileSync(full, updated);
  console.log(`${item.kind} ${item.id}: ${item.version} -> ${next}`);
}
const items = readItems(), manifest = readManifest();
manifest.version = version;
const shipped = releaseItems(items);
manifest.provides = { apps: shipped.filter(i => i.kind === "app").length, skills: shipped.filter(i => i.kind === "skill").length, integrations: shipped.filter(i => i.kind === "integration").length };
writeFileSync(path.join(ROOT, "capabilities.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`capabilities ${version}: ${JSON.stringify(manifest.provides)}`);
