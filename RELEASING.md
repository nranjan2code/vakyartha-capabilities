# Releasing Vakyartha Capabilities

Every step marked **owner** is done by a person at the owner's Mac. Nothing in
CI signs, tags or changes a version.

1. Merge the reviewed changes to `main`; the Check workflow must pass.
2. **Owner:** `node scripts/version.ts X.Y.Z` and type the version again. This
   also refreshes the counts in `capabilities.json`. Widen `requires` only after
   Vakyartha has been tested against the release.
3. `node scripts/check.ts --online && node --test tests/`
4. **Owner:** `node scripts/sign.ts`, type the version again, and approve the
   Keychain prompt. It writes `signatures/capabilities-X.Y.Z.sig`.
5. Commit the version and signature, push `main`.
6. **Owner:** `git tag -a capabilities-vX.Y.Z -m "Vakyartha Capabilities X.Y.Z"`
   and push the tag. The Release workflow rebuilds, verifies the signature,
   creates the GitHub release with every archive, and deploys the website.
7. In Vakyartha, move the `capabilities/` submodule to the tag, run its tests,
   and record the release in Vakyartha's CHANGELOG.

The first time only, the owner creates the key with `node scripts/keygen.ts`
and commits `keys/catalog.pub`.
