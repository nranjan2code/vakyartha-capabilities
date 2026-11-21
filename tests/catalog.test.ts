import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  const manifest = readManifest();
  const versions = readItems().map(({ id, version }) => ({ id, version }));
  // A fresh clone after a version reset has no signatures folder: git keeps no empty folder.
  const signed = () => existsSync("signatures") ? readdirSync("signatures").sort() : [];
  const signatures = signed();
  for (const args of [["scripts/version.ts", "9.9.9"], ["scripts/sign.ts", "9.9.9"], ["scripts/version.ts", "--reset", "9.9.9"]]) {
    const r = spawnSync(process.execPath, args, { input: "9.9.9\n", encoding: "utf8", env: { ...process.env, CI: "" } });
    assert.notEqual(r.status, 0, args.join(" "));
    assert.match(r.stderr, /interactive terminal|already signed|not signed|Release tags still exist/, args.join(" "));
  }
  assert.deepEqual(readManifest(), manifest);
  assert.deepEqual(readItems().map(({ id, version }) => ({ id, version })), versions);
  assert.deepEqual(signed(), signatures);
});

test("development-only items stay out of releases, and release items never use them", async () => {
  const { releaseItems } = await import("../scripts/catalog.ts");
  const items = readItems();
  assert.ok(items.every(i => i.channel === "release" || i.channel === "dev"));
  const base = items.find(i => i.kind === "skill")!;
  const dev = { ...base, id: "dev-only-probe", channel: "dev" as const, requires: [], enhances: [] };
  const user = { ...base, id: "release-user-probe", requires: [[{ kind: "skill" as const, id: "dev-only-probe" }]], enhances: [] };
  assert.deepEqual(releaseItems([dev, base]).map(i => i.id), [base.id], "a release carries no development-only item");
  const manifest = readManifest();
  const counted = { ...manifest, provides: { ...manifest.provides, skills: manifest.provides.skills + 1 } };
  assert.throws(() => checkCatalog(counted, [...items, dev, user]), /cannot use skill:dev-only-probe, which is for development builds only/);
  // A development-only item may use release items, and is not counted in what a release provides.
  checkCatalog(manifest, [...items, { ...dev, requires: [[{ kind: "skill", id: base.id }]] }]);
});

test("every tool says what job it does, in ids the vocabulary lists", async () => {
  const { stepCapabilities } = await import("../scripts/catalog.ts");
  const manifest = readManifest(), items = readItems();
  const ids = new Set(manifest.vocabulary.map(c => c.id));
  for (const i of items.filter(i => i.kind === "app")) {
    const app = JSON.parse(i.files.find(([n]) => n === "app.json")![1].toString("utf8"));
    for (const t of app.exports?.tools ?? []) assert.ok(t.capabilities?.length, `${i.id}: ${t.name} has no capability`);
  }
  for (const i of items) for (const id of i.uses) assert.ok(ids.has(id), `${i.id}: ${id}`);
  // A search step finds every ready search provider, not one provider's tool by name.
  const research = items.find(i => i.id === "research-brief")!;
  assert.deepEqual(stepCapabilities(research.files.find(([n]) => n === "SKILL.md")![1].toString("utf8")), ["web.search", "web.read"]);
  assert.ok(!research.files.find(([n]) => n === "SKILL.md")![1].toString("utf8").includes("brave-search__"), "no provider named for a job any provider can do");
  // A broken id, a duplicate or a missing export capability is refused.
  assert.throws(() => checkCatalog({ ...manifest, vocabulary: [...manifest.vocabulary, manifest.vocabulary[0]!] }, items), /listed twice/);
  assert.throws(() => checkCatalog({ ...manifest, vocabulary: manifest.vocabulary.filter(c => c.id !== "web.search") }, items), /web\.search is not in the capability vocabulary/);
  assert.throws(() => checkCatalog({ ...manifest, vocabulary: [] }, items), /needs a vocabulary/);
});

test("a requirement or enhancement can name a capability", async () => {
  const items = readItems();
  const research = items.find(i => i.id === "research-brief")!;
  assert.deepEqual(research.enhances, [{ kind: "capability", id: "web.search" }]);
  checkCatalog(readManifest(), items);
});

test("an item's coverage, when it gives one, is one sentence in any script; nothing requires it of any job", async () => {
  const { coverage } = await import("../scripts/catalog.ts");
  for (const ok of ["Listings of one exchange only.", "Solo los datos que la aplicación guardó.", "この取引所の銘柄だけを扱います。"]) assert.doesNotThrow(() => coverage("item", ok), ok);
  for (const bad of ["", "Too short", "Two lines.\nOf text.", "x".repeat(205) + ".", 7]) assert.throws(() => coverage("item", bad), /one sentence/, String(bad));
  assert.doesNotThrow(() => coverage("item", undefined), "coverage is optional");
  // Every coverage the catalog ships passes the same check readItems applies.
  for (const i of readItems().filter(i => i.kind === "integration" || i.kind === "app")) {
    const doc = JSON.parse(i.files.find(([n]) => n === (i.kind === "app" ? "app.json" : "integration.json"))![1].toString("utf8")) as { coverage?: unknown };
    assert.doesNotThrow(() => coverage(i.id, doc.coverage), i.id);
  }
});
