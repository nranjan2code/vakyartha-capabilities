// Set the catalog release version and refresh what it provides. A person types it;
// nothing else ever changes a version:
//   node scripts/version.ts 1.1.0
//   node scripts/version.ts --reset 1.0.0   (once, before any release is public: every app and skill
//                                            and the catalog to one version, withdrawn signatures removed)
// Item versions live in each item (SKILL.md metadata.version, app.json version).
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
function writeManifest(version: string) {
  const items = readItems(), manifest = readManifest();
  manifest.version = version;
  const shipped = releaseItems(items);
  manifest.provides = { apps: shipped.filter(i => i.kind === "app").length, skills: shipped.filter(i => i.kind === "skill").length, integrations: shipped.filter(i => i.kind === "integration").length };
  writeFileSync(path.join(ROOT, "capabilities.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`capabilities ${version}: ${JSON.stringify(manifest.provides)}`);
}
function setItemVersion(file: string, kind: string, next: string) {
  const full = path.join(ROOT, file), text = readFileSync(full, "utf8");
  const updated = kind === "app"
    ? text.replace(/("version":\s*)"[^"]+"/, `$1"${next}"`)
    : text.replace(/(\n\s*version:\s*)"?[\d.]+"?/, `$1"${next}"`);
  if (updated === text && !text.includes(next)) throw new Error(`${file}: could not find its version`);
  writeFileSync(full, updated);
}

// A reset starts the release line again. It is refused while any release tag exists here or on
// origin: withdrawing a public release (deleting its tag and GitHub release) is the owner's act.
if (process.argv[2] === "--reset") {
  const version = process.argv[3] ?? "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error("usage: node scripts/version.ts --reset <major.minor.patch>"); process.exit(2); }
  const local = git("tag", "--list", "capabilities-v*");
  const remote = git("ls-remote", "--tags", "origin", "capabilities-v*");
  if (local || remote) throw new Error(`Release tags still exist (${[local, remote].filter(Boolean).join("; ").replace(/\s+/g, " ")}). Withdraw them first; nothing was changed.`);
  await confirmVersion("Reset every Vakyartha capabilities version (the catalog, each app and skill) to", version);
  for (const item of readItems()) {
    if (item.kind === "integration") continue; // its version is the exact package it pins
    const file = item.kind === "app" ? `apps/${item.id}/app.json` : `skills/${item.id}/SKILL.md`;
    setItemVersion(file, item.kind, version);
    if (item.version !== version) console.log(`${item.kind} ${item.id}: ${item.version} -> ${version}`);
  }
  for (const sig of existsSync(path.join(ROOT, "signatures")) ? readdirSync(path.join(ROOT, "signatures")) : []) if (sig.endsWith(".sig")) { rmSync(path.join(ROOT, "signatures", sig)); console.log(`removed signatures/${sig}`); }
  writeManifest(version);
  process.exit(0);
}
const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error("usage: node scripts/version.ts <major.minor.patch>"); process.exit(2); }
await confirmVersion("Set Vakyartha capabilities to", version);
for (const { item, file } of changedItems()) {
  const [maj, min] = item.version.split(".").map(Number);
  const next = await typeItemVersion(`${item.kind} ${item.id}`, item.version, `${maj}.${min! + 1}.0`);
  setItemVersion(file, item.kind, next);
  console.log(`${item.kind} ${item.id}: ${item.version} -> ${next}`);
}
writeManifest(version);
