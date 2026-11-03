# AGENTS.md: Vakyartha Capabilities

The source of every app, skill and integration Vakyartha publishes. Vakyartha
pins one signed release of this repository as a submodule; items Vakyartha
needs to run (its core skills and integrations) live in Vakyartha, not here.

1. **One rule set.** `scripts/catalog.ts` holds every rule; the check, the build
   and the tests all use it. Change a rule there and in DEPENDENCIES.md together.
2. **Versions are set by a person.** `node scripts/version.ts` and
   `node scripts/sign.ts` refuse to run without a person at a terminal typing the
   version. Never edit a version by hand or from a script. Each item declares its
   own exact version; the catalog has its own release version.
3. **Signed or not published.** A release is the exact bytes of `index.json`,
   signed with the owner's key from the macOS Keychain. CI only verifies; it
   never holds the key. A signed release never changes: fix forward with a new
   version.
4. **Self-contained items.** No dependencies, no vendored code, no imports from
   outside an item's folder, UTF-8 text only, no keys or tokens. Integrations
   are data only: exact npm versions at least 14 days old, or https endpoints,
   with every host they may reach listed.
5. **Declared relationships.** Skills that need one app ship inside it. Every
   requirement is declared and must exist here or in Vakyartha's declared core.
6. **Pinned automation.** Workflows pin each action to a commit at least 14 days
   old and use the Node version in `.node-version`.
7. **Plain capability language.** Describe what an item does and what it can
   reach in plain words. Do not name competitors.
