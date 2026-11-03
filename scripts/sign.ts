// Owner only: sign the release in capabilities.json. Builds the catalog, reads the
// key from the macOS Keychain (the Keychain asks the owner), signs the exact bytes
// of index.json and writes signatures/capabilities-<version>.sig for commit.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "./catalog-build.ts";
import { readManifest } from "./catalog.ts";
import { confirmVersion } from "./human.ts";
import { KEYCHAIN, readPublicKey, signIndex, signatureFile, verifyIndex } from "./signing.ts";

const { version } = readManifest();
if (existsSync(signatureFile(version))) throw new Error(`capabilities ${version} is already signed. A signed release never changes; set a new version.`);
await confirmVersion("Sign Vakyartha capabilities", version);
const out = mkdtempSync(path.join(tmpdir(), "vak-sign-"));
build(out);
const index = readFileSync(path.join(out, "index.json"));
const seed = Buffer.from(execFileSync("security", ["find-generic-password", "-s", KEYCHAIN.service, "-a", KEYCHAIN.account, "-w"], { encoding: "utf8" }).trim(), "base64");
const signature = signIndex(index, seed);
seed.fill(0);
if (!verifyIndex(index, signature, readPublicKey())) throw new Error("The Keychain key does not match keys/catalog.pub; nothing was written.");
writeFileSync(signatureFile(version), `${signature}\n`);
console.log(`Signed capabilities ${version}. Commit signatures/capabilities-${version}.sig, then tag capabilities-v${version}.`);
