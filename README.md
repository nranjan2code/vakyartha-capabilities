# Vakyartha Capabilities

The apps, skills and integrations Vakyartha publishes, released on their own
version line and signed by the owner. Browse them at
<https://nranjan2code.github.io/vakyartha-capabilities/>; add them from inside
Vakyartha, where each one arrives as a draft you review.

| Folder | Holds |
|---|---|
| `apps/<id>/` | One app package: `app.json`, its code and surfaces, and the skills it ships in `skills/<name>/SKILL.md` |
| `skills/<id>/` | One standalone skill: `SKILL.md` and its reference files |
| `integrations/<id>/` | One integration: `integration.json`, fully declarative |
| `capabilities.json` | Release version, the Vakyartha versions it supports, and what it expects Vakyartha to provide |
| `keys/catalog.pub` | The public key every release is verified with |
| `signatures/` | One signature per release |

Read [DEPENDENCIES.md](DEPENDENCIES.md) for how items relate and what
Vakyartha does when they are added, changed or removed, [AGENTS.md](AGENTS.md)
for the rules, and [RELEASING.md](RELEASING.md) to publish.

```bash
node scripts/check.ts --online   # every rule, every item
node --test tests/
node scripts/catalog-build.ts site
```
