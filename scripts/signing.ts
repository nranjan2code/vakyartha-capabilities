// Ed25519 signatures over the exact bytes of index.json. Node's built-in crypto
// signs and verifies; the public key is 32 raw bytes, base64, in keys/catalog.pub.
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./catalog.ts";

export const PUBLIC_KEY_FILE = path.join(ROOT, "keys", "catalog.pub");
export const KEYCHAIN = { service: "vakyartha-capabilities-signing", account: "catalog" };
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export const signatureFile = (version: string) => path.join(ROOT, "signatures", `capabilities-${version}.sig`);
export const publicKeyFromRaw = (raw: Buffer): KeyObject => createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
export const privateKeyFromSeed = (seed: Buffer): KeyObject => createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
export const rawPublicKey = (key: KeyObject): Buffer => key.export({ format: "der", type: "spki" }).subarray(SPKI_PREFIX.length);
export const seedOf = (key: KeyObject): Buffer => key.export({ format: "der", type: "pkcs8" }).subarray(PKCS8_PREFIX.length);

export function readPublicKey(): Buffer {
  if (!existsSync(PUBLIC_KEY_FILE)) throw new Error("keys/catalog.pub is missing: the owner creates it once with node scripts/keygen.ts");
  const raw = Buffer.from(readFileSync(PUBLIC_KEY_FILE, "utf8").trim(), "base64");
  if (raw.length !== 32) throw new Error("keys/catalog.pub must hold a 32-byte Ed25519 public key in base64");
  return raw;
}
export const signIndex = (index: Buffer, seed: Buffer): string => sign(null, index, privateKeyFromSeed(seed)).toString("base64");
export function verifyIndex(index: Buffer, signature: string, publicKey: Buffer): boolean {
  const sig = Buffer.from(signature.trim(), "base64");
  return sig.length === 64 && verify(null, index, publicKeyFromRaw(publicKey), sig);
}
