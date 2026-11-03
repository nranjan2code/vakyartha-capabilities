# AGENTS.md: vakyartha-capabilities

This repository is the published catalog of Vakyartha skills, apps and the MCP catalog. Product rules live in the Vakyartha repository's AGENTS.md; these are the rules for this repo.

1. **Source of truth.** Authoring happens in `capabilities/` of the Vakyartha `marketplace` branch (and `main` once merged). This repo is what is published: keep `capabilities/` identical to it and never diverge by editing here only.
2. **Versions.** `capabilities/capabilities.json` is its own version line. Bump it when the published content changes; its `requires` range names the Vakyartha versions it supports. Pins are exact.
3. **No third-party code, no secrets.** Add no dependencies or vendored code. Scan every diff for keys before pushing.
4. **Review by access.** A contribution is accepted only after its requested tools, destinations and files are reviewed. Apps keep the declared entitlements; skills carry no scripts that run by themselves.
5. **Build is deterministic.** `node scripts/catalog-build.ts site` must produce identical output twice. The publish workflow only runs that build and deploys `site/`.
6. **Nothing installs silently.** The desktop app verifies each archive hash and files items as unreviewed drafts. Do not add flows that bypass that.
