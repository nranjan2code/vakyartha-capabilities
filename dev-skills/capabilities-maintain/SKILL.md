---
name: capabilities-maintain
description: Add or change an app, skill or integration in the Vakyartha catalog, keep its documents and relationships correct, check it, and publish a signed release that Vakyartha can pin. Owner steps (version, signing, tagging) need a person at a terminal.
---

# Maintaining the catalog

Rules: [AGENTS.md](../../AGENTS.md). Relationships: [DEPENDENCIES.md](../../DEPENDENCIES.md). Releasing: [RELEASING.md](../../RELEASING.md).

## 1. Change an item

| Item | Where | Must have |
| --- | --- | --- |
| App | `apps/<id>/` | `app.json` with an exact version and `runtime.engine: "node26"`, its code and surfaces, `README.md`, `AGENTS.md`, `SKILLS.md`, `ARCHITECTURE.md`; its own skills in `skills/<name>/SKILL.md` |
| Skill | `skills/<id>/SKILL.md` | `name` matching the folder, a `description` that says when to use it, reference files beside it |
| Integration | `integrations/<id>/integration.json` | data only: an exact npm version published at least 14 days ago or an https endpoint, every host it may reach |

- An item whose files change needs a new version before the next release. A signed release never changes; fix forward. The person types item versions in `node scripts/version.ts X.Y.Z` (`--list` shows which items need one).
- A new app or skill starts at the draft sentinel version `0.0.0`; `version.ts --list` includes it even before it exists in the last signed tag, and the owner types its first released version during the version command.
- Declare every relationship (part of an app, requires) and make sure each requirement exists here or in Vakyartha's declared core.
- Items are self-contained: no imports from outside the item, no vendored code, no keys or tokens, UTF-8 text only.
- Public boundary: no links to private repositories, no local paths, no submodules. Refer to Vakyartha's guides by name.
- Update the item's documents, the README counts and CHANGELOG (under "Unreleased") in the same change.

## 2. Check

```bash
node scripts/ci.ts quick     # secrets, public boundary, docs, every rule, tests, site build
node scripts/ci.ts full      # + npm publication ages and the signed release signature
```

`full` fails the signature step after any change to a released item until the next release is signed; that is expected between releases.

## 3. Release (owner)

Follow [RELEASING.md](../../RELEASING.md) exactly: version (typed twice), `full`, sign (typed, Keychain prompt), commit and push, tag `capabilities-vX.Y.Z` and push it. The Release workflow publishes the GitHub release and the site.

## 4. Deliver to Vakyartha

In Vakyartha: `cd capabilities && git fetch --tags && git checkout capabilities-vX.Y.Z && cd ..`, `node capabilities/scripts/verify.ts`, `node scripts/ci.ts full`, commit the pin. If the release widens or narrows the supported Vakyartha versions, Vakyartha's version-gate test must still pass.
