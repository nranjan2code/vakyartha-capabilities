// Proves the built release matches its committed signature. CI runs this before
// anything is published; Vakyartha runs the same check before bundling.
//   node scripts/verify.ts [out-dir]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "./catalog-build.ts";
import { readManifest } from "./catalog.ts";
import { readPublicKey, signatureFile, verifyIndex } from "./signing.ts";

const { version } = readManifest();
if (!existsSync(signatureFile(version))) throw new Error(`capabilities ${version} is not signed; the owner signs with node scripts/sign.ts`);
const out = path.resolve(process.argv[2] ?? mkdtempSync(path.join(tmpdir(), "vak-verify-")));
build(out);
const signature = readFileSync(signatureFile(version), "utf8");
if (!verifyIndex(readFileSync(path.join(out, "index.json")), signature, readPublicKey())) throw new Error(`The signature for capabilities ${version} does not match this build`);
writeFileSync(path.join(out, "index.json.sig"), signature);
console.log(`verified: capabilities ${version} → ${out}`);
