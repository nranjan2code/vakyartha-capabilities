// Every rule, every item: node scripts/check.ts [--tag capabilities-vX.Y.Z]
// With --tag it also proves the tag names exactly the version in capabilities.json.
import { checkCatalog, readItems, readManifest } from "./catalog.ts";

const items = readItems(), manifest = readManifest();
checkCatalog(manifest, items);
const at = process.argv.indexOf("--tag");
if (at > 0 && process.argv[at + 1] !== `capabilities-v${manifest.version}`) throw new Error(`Tag ${process.argv[at + 1]} does not match capabilities.json version ${manifest.version}`);
if (process.version.split(".")[0] !== "v26") throw new Error(`Node ${process.version}: use the version in .node-version`);
console.log(`ok: ${items.length} items, catalog ${manifest.version} for Vakyartha ${manifest.requires.vakyartha.min} to below ${manifest.requires.vakyartha.below}`);
