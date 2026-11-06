// The catalog's local CI steps. The runner, receipts, hooks and secret scan are in
// ci-core.ts (shared with Vakyartha and Projection). Run `node scripts/ci.ts help`. Tiers:
//   quick    before every push (the pre-push hook runs it): secrets, public boundary, docs links, every rule, tests, site build
//   full     before merging to main and before signing: quick + npm publication ages
//   release  after signing, before tagging: full + the signature matches this exact build
//   mirror   what GitHub's runner checks (.github/workflows/check.yml); the repository is public,
//            so hosted minutes are free, but the same steps run here without GitHub
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main, type Step } from "./ci-core.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const script = (file: string, ...args: string[]) => [node, `scripts/${file}`, ...args];

const quick: Step[] = [
  { name: "secrets", cmd: script("ci.ts", "secrets") },
  { name: "public-boundary", cmd: script("public-boundary.ts") },
  { name: "docs", cmd: script("docs-check.ts") },
  { name: "check", cmd: script("check.ts") },
  { name: "tests", cmd: [node, "--test", "tests/"] },
  { name: "site", cmd: script("catalog-build.ts", "site") },
];
const full: Step[] = [...quick, { name: "check:online", cmd: script("check.ts", "--online") }];
// Main is ahead of its last release between releases, so only the release tier checks a signature.
const release: Step[] = [...full, { name: "verify", cmd: script("verify.ts") }];
const mirror: Step[] = [...quick, { name: "check:online", cmd: script("check.ts", "--online") }];

await main({ repo, tiers: { quick, full, release, mirror }, needs: {} });
