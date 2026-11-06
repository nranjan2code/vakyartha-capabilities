# Working on Project Activity Desk

Read Building a Vakyartha app (Vakyartha's app-building guide, in the Vakyartha product documentation) first; this app follows its method. Then README.md, SKILLS.md and ARCHITECTURE.md here.

## Invariants

1. `context.state` is the only owner: `repository`, `repoDraft`, `issues[]`, `pulls[]`, `commits[]`, `triage{issue URL → lane}`, `receipts[]`, `problem`, `checkedAt`. Every run starts with `normalize()`, which drops malformed records and lanes for issues no longer open.
2. `view(state)` is pure and derives all three surfaces (`triage`, `activity`, `sources`), including chart tallies, from the same records. Regions are emitted only when they have data; empty and failed states say what to do.
3. Source records are validated against the configured repository: positive issue numbers, open/closed state, `https://github.com/<repo>/issues|pull|commit/` URLs, full 40-character SHAs, real timestamps, bounded text.
4. Only `web__fetch_page` is called, for the three public API URLs. Triage is local; nothing writes to the repository.
5. `/repoDraft` saves as typed and is validated by Refresh; `/cards` (the board) accepts only known open issues and the three lanes.

## Change method

Change `server.ts`; run `node scripts/app-surfaces.ts`; leave `version` alone (the owner types the new version at the next release; `node scripts/version.ts --list` shows the app); update these four documents; run `node --test test/reference-apps.test.ts test/app-registry.test.ts`. With network and the sandbox helper, `node scripts/reference-apps-check.ts --live` checks live commits independently and keyboard triage in WebKit.

## Hosted operation

The shared Background control in this app and Operation Center owns Keep running, startup, refresh timing, recovery and receipts. Start & keep running invokes startup-refresh now and on Vakyartha launch, using the saved repository. Configure the repository and integration access first. Manual refresh remains available when background operation is stopped; Manual only timing still permits startup and app feeds. Do not duplicate host controls or timers in package views.

Startup and the default 15-minute refresh execute ordinary bounded refresh code with this app’s explicit background tool access. The host retains committed state and retries failed background computation without external calls at most three times; uncertain effects block replay for exact-run review. Updates preserve saved data and stop background operation for renewed review. Vakyartha and the computer must remain running and awake.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
