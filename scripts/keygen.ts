// One-time, owner only: create the catalog signing key. The private key goes
// into the macOS Keychain and never touches a file; the public key is written
// to keys/catalog.pub for review and commit.
import { generateKeyPairSync } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { confirmVersion } from "./human.ts";
import { KEYCHAIN, PUBLIC_KEY_FILE, rawPublicKey, seedOf } from "./signing.ts";

if (process.platform !== "darwin") throw new Error("The signing key lives in the macOS Keychain; run this on the owner's Mac.");
if (existsSync(PUBLIC_KEY_FILE)) throw new Error("keys/catalog.pub already exists. Rotating the key is a separate, reviewed change.");
await confirmVersion("Create the catalog signing key", "create");
const exists = spawnSync("security", ["find-generic-password", "-s", KEYCHAIN.service, "-a", KEYCHAIN.account], { stdio: "ignore" }).status === 0;
if (exists) throw new Error("A signing key is already in the Keychain. Remove it deliberately before creating another.");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
// security -i reads the command from stdin, so the key never appears in a process list.
execFileSync("security", ["-i"], { input: `add-generic-password -s ${KEYCHAIN.service} -a ${KEYCHAIN.account} -T "" -w ${seedOf(privateKey).toString("base64")}\n`, stdio: ["pipe", "ignore", "inherit"] });
writeFileSync(PUBLIC_KEY_FILE, `${rawPublicKey(publicKey).toString("base64")}\n`);
console.log("Signing key created in the Keychain. Review and commit keys/catalog.pub.");
