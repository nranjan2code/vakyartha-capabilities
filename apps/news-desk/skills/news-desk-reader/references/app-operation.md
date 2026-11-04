# Running, access and refresh cost for News Desk

## Supporting App Skills
- `app-authoring` and its package template: the method this app follows.
- `app-maintainer`: changes to this package, keeping old state loading through `normalize()`.
- `app-debugger` with `debug-error`: a failed run. Start from the status chip, the refresh notice and Sources → Feed health.
- `interactive-ui` and `surface-design`: compact story previews, compact section/publication/publisher/order dropdowns in Sections, direct top-page section/topic choices, bounded collections and source coverage charts. Following provides compact topic chips with live story counts, an explicit Unfollow action per topic, and discovered topic chips computed across headlines, story clusters and publisher tags. Publisher excerpts and every report belong in Full coverage; preview density never changes the canonical records or source facts. Source/image settings save automatically.
- `app-maintainer` layout verification: `node scripts/news-desk-check.ts` covers seven views, all source/coverage sub-tabs and navigation/filter/bookmark/topic actions in wide and narrow WebKit. A retained publisher snapshot may be replayed for visual review; no new source read or model outcome is implied.

## Hosted operation

The shared host supplies Background operation in this app and Operation Center; package views must not duplicate it or own timers. Start & keep running persists the choice and runs the declared startup-refresh handler now and whenever Vakyartha launches. Refresh remains a manual action; automatic timing uses the declared cron interval, a chosen host timer, or Manual only. Stopping background operation leaves manual actions and saved data available. Startup also runs in Manual only mode.

The host owns scheduling, serialized commits, bounded recovery and run receipts. A failed computation with no external calls receives up to three delayed retries; uncertain external effects block replay for exact-run review. Tools require this app’s explicit mode/tool/destination access; integration Off remains a ceiling, and execution needs an awake computer and running Vakyartha. Reviewed package updates stop background operation for renewed review. Playback observes saved programmes and never starts another refresh loop.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.

## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
