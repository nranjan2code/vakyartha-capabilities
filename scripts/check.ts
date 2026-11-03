// Every rule, every item: node scripts/check.ts [--online] [--tag capabilities-vX.Y.Z]
// --tag proves the tag names exactly the version in capabilities.json.
// --online proves every npm package version was published at least 14 days ago.
import { checkCatalog, readItems, readManifest } from "./catalog.ts";

const items = readItems(), manifest = readManifest();
checkCatalog(manifest, items);
const at = process.argv.indexOf("--tag");
if (at > 0 && process.argv[at + 1] !== `capabilities-v${manifest.version}`) throw new Error(`Tag ${process.argv[at + 1]} does not match capabilities.json version ${manifest.version}`);
if (process.version.split(".")[0] !== "v26") throw new Error(`Node ${process.version}: use the version in .node-version`);
if (process.argv.includes("--online")) {
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  for (const i of items.filter(i => i.kind === "integration")) {
    const source = JSON.parse(i.files[0]![1].toString("utf8")).source;
    if (source.kind !== "npm") continue;
    const res = await fetch(`https://registry.npmjs.org/${source.package.replace("/", "%2F")}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${i.id}: npm registry answered ${res.status}`);
    const published = (await res.json() as { time?: Record<string, string> }).time?.[source.version];
    if (!published) throw new Error(`${i.id}: ${source.package}@${source.version} is not published`);
    if (Date.parse(published) > cutoff) throw new Error(`${i.id}: ${source.package}@${source.version} is younger than 14 days`);
  }
}
console.log(`ok: ${items.length} items, catalog ${manifest.version} for Vakyartha ${manifest.requires.vakyartha.min} to below ${manifest.requires.vakyartha.below}`);
