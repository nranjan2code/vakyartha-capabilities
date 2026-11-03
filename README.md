# Vakyartha capabilities

Skills, apps and the MCP catalog for Vakyartha, on their own version line (`capabilities/capabilities.json`).

- `node scripts/catalog-build.ts site` builds one hash-pinned archive per capability plus `index.json`.
- Pushing to `main` publishes that output to GitHub Pages; Vakyartha reads `index.json` from there, after the user approves the host.
- Compatibility with a Vakyartha release is the `requires` range in the manifest.
- Contributions are pull requests; each is reviewed for the access it asks for before merging.

Source of truth during development is the `capabilities/` tree of the Vakyartha `marketplace` branch; this repository is what it publishes.
