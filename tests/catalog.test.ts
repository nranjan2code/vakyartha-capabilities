import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { build } from "../scripts/catalog-build.ts";
import { checkCatalog, readItems, readManifest } from "../scripts/catalog.ts";
import { rawPublicKey, seedOf, signIndex, verifyIndex } from "../scripts/signing.ts";

const temp = () => mkdtempSync(path.join(tmpdir(), "vak-cap-test-"));

test("every item passes every rule", () => {
  checkCatalog(readManifest(), readItems());
});

test("the build is byte-for-byte deterministic", () => {
  const a = temp(), b = temp();
  try {
    build(a); build(b);
    const files = (d: string) => readdirSync(d, { recursive: true }).map(String).sort();
    assert.deepEqual(files(a), files(b));
    for (const f of files(a).filter(f => f.includes("."))) assert.ok(readFileSync(path.join(a, f)).equals(readFileSync(path.join(b, f))), f);
  } finally { rmSync(a, { recursive: true }); rmSync(b, { recursive: true }); }
});

test("a signature covers the exact index bytes and nothing else", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const index = Buffer.from('{"schema":1}');
  const sig = signIndex(index, seedOf(privateKey));
  assert.ok(verifyIndex(index, sig, rawPublicKey(publicKey)));
  assert.ok(!verifyIndex(Buffer.from('{"schema":2}'), sig, rawPublicKey(publicKey)), "a changed index fails");
  const other = generateKeyPairSync("ed25519");
  assert.ok(!verifyIndex(index, sig, rawPublicKey(other.publicKey)), "another key fails");
});

test("versions and signatures are never set without a person at a terminal", () => {
  for (const script of ["scripts/version.ts", "scripts/sign.ts"]) {
    const r = spawnSync(process.execPath, [script, "9.9.9"], { input: "9.9.9\n", encoding: "utf8", env: { ...process.env, CI: "" } });
    assert.notEqual(r.status, 0, script);
    assert.match(r.stderr, /interactive terminal|already signed|not signed/, script);
  }
  assert.equal(readManifest().version, "1.0.0");
});
