# Releasing Vakyartha Capabilities

Every step marked **owner** is done by a person at the owner's Mac. Nothing in
CI signs, tags or changes a version.

1. Merge the reviewed changes to `main`; `node scripts/ci.ts full` passes on the owner's machine (the Check workflow mirrors it; a release never waits on hosted minutes).
2. **Owner:** `node scripts/version.ts --list` shows every app and skill changed
   since the last signed tag whose version did not change. Then
   `node scripts/version.ts X.Y.Z`: type the catalog version again, then type a new
   version for each listed item (a suggestion is shown, never applied). This
   also refreshes the counts in `capabilities.json`. Widen `requires` only after
   Vakyartha has been tested against the release.

   A newly added app or skill uses `0.0.0` only as a draft sentinel. It appears in
   `--list` even though the previous signed tag has no matching path; the owner
   must type its first released version in this step.
3. `node scripts/ci.ts full` again on the versioned tree.
4. **Owner:** `node scripts/sign.ts`, type the version again, and approve the
   Keychain prompt. It writes `signatures/capabilities-X.Y.Z.sig`.
5. Commit the version and signature, push `main`.
6. **Owner:** `git tag -a capabilities-vX.Y.Z -m "Vakyartha Capabilities X.Y.Z"`
   and push the tag. The Release workflow rebuilds, verifies the signature,
   creates the GitHub release with every archive, and deploys the website.
   If GitHub is unavailable, `node scripts/catalog-build.ts site` builds the same
   site locally; publish it when GitHub is back. Nothing about the release
   depends on hosted CI.
7. In Vakyartha, move the `capabilities/` submodule to the tag, run its tests,
   and record the release in Vakyartha's CHANGELOG.

The first time only, the owner creates the key with `node scripts/keygen.ts`
and commits `keys/catalog.pub`.

The first time a tag deploys the site, the `github-pages` environment must allow
`capabilities-v*` tags (Settings → Environments, or the `gh api` command in
Vakyartha's admin skill); otherwise the deploy is rejected.
