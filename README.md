<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/lockup-reverse.svg">
    <img src="assets/brand/lockup-colour.svg" width="360" alt="Vakyartha">
  </picture>
</p>

<p align="center"><b>The apps, skills and integrations published for Vakyartha.</b></p>

<p align="center"><a href="https://nranjan2code.github.io/vakyartha-capabilities/"><b>Browse the catalog</b></a> · <a href="https://nranjan2code.github.io/vakyartha-releases/">Download Vakyartha</a> · <a href="https://vakyartha.com">vakyartha.com</a></p>

---

# Vakyartha Capabilities

The apps, skills and integrations published for [Vakyartha](https://vakyartha.com), released on their own version line and signed by the owner.

**Browse the catalog:** <https://nranjan2code.github.io/vakyartha-capabilities/> · **Download Vakyartha:** <https://nranjan2code.github.io/vakyartha-releases/>

Find something useful on the catalog page, then add it from inside Vakyartha. Nothing runs until you turn it on, and Vakyartha checks every item is exactly the one published here.

## What is here

| Folder | Holds |
| --- | --- |
| `apps/<id>/` | One app package: `app.json`, its code and surfaces, and the skills it ships in `skills/<name>/SKILL.md`. Each app has its own README, AGENTS, SKILLS and ARCHITECTURE documents |
| `skills/<id>/` | One standalone skill: `SKILL.md` and its reference files |
| `integrations/<id>/` | One integration: `integration.json`, fully declarative |
| `capabilities.json` | The release version, the Vakyartha versions it supports, and what it expects Vakyartha to provide |
| `keys/catalog.pub` | The public key every release is verified with |
| `signatures/` | One signature per release |

See the [catalog page](https://nranjan2code.github.io/vakyartha-capabilities/) for what is available now; `capabilities.json` names the Vakyartha versions this release works with.

## Verify a release

A release is the exact bytes of its `index.json`, which lists every archive with its SHA-256. The owner signs those bytes with Ed25519; the key never leaves the owner's Mac.

```bash
node scripts/verify.ts          # rebuilds the catalog and checks it against the signed release
```

## Work on the catalog

```bash
node scripts/ci.ts hooks        # once per clone: secret scan before commit, quick tier before push
node scripts/ci.ts quick        # secrets, public boundary, docs, every rule, tests, site build
node scripts/ci.ts full         # + npm publication ages and the signature of the signed release
```

Checks run on the owner's machine first; the GitHub workflow mirrors them. This repository is public, and a check refuses any link to a private repository or local path.

## Documents

| Document | For |
| --- | --- |
| [DEPENDENCIES.md](DEPENDENCIES.md) | How items relate, and what Vakyartha does when they are added, changed or removed |
| [AGENTS.md](AGENTS.md) | Rules for changing the catalog |
| [RELEASING.md](RELEASING.md) | Publishing a signed release |
| [dev-skills/](dev-skills/README.md) | Step-by-step maintainer skill |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |

Maintainer-developed; external contributions are not accepted. Copyright © 2026 Nisheeth Ranjan.
