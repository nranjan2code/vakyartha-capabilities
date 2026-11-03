# Working on RBI Desk

Read Building a Vakyartha app (Vakyartha's app-building guide, in the Vakyartha product documentation), then README.md, SKILLS.md and ARCHITECTURE.md here. Follow the root repository rules.

## Invariants

1. `context.state` is the single writer: `rates`, `ratesAt`, `history`, `reserves`, `directions`, `directionsAt`, `items`, filters/query, health, receipts and status. Normalize untrusted state at every entry. Keep source facts separate from derived visual/spoken projections.
2. Keep published values and units exactly. Policy/ratio **read-on** dates, exchange/market **as-on** dates, reserve **week-ending** dates, and directory issue/amendment dates are different. T-bill auction dates are unknown on the panel. Changes come only from stored observations; never infer earlier policy decisions.
3. Refresh makes at most nine declared `web__fetch_page` calls, within the host's 16-call/30-second limits. Discover release links from official feeds and validate HTTPS RBI origin/path before following. Do not guess IDs, grant network access, enlarge reply bounds or add a connector.
4. Replace each source only after its full parser succeeds. Retain prior values on failure and expose source health; do not relabel old coverage as fresh. Retain 730 observed days, 104 reserve weeks, 300 notices and 30 receipts.
5. `view`, `briefing`, `programme` and `handleQuery` derive from the same records. Queries are read-only and never fetch or advance revision. Keep six tool schemas in app.json synchronized with handlers, including optional rate narrowing and search limits.
6. Only supported Projection components/props are allowed. Keep rates compact, exact figures in tables, charts for real history only, long collections paged, and actions beside their filter. Header Refresh/radio are the shared controls. No decorative hero, nested cards, hand-authored CSS layout, hidden duplicate values or app-specific chart renderer.
7. `feed.ts` is a packaged copy of News Desk's parser; fix both together. `data.ts` matches source labels/links, rejects a changed shape and validates units. Never loosen a parser merely to obtain a passing outcome.
8. The app reader loads the canonical external `rbi` skill rather than duplicating it. Update the skill, its rate explanations and package docs with relevant behaviour changes. Voice wording is factual and neutral, with attribution, dates, short paragraphs and freshness warnings; no independent narration store.

## Change and acceptance

Update code and manifest version, regenerate `surface.json`, and update all four package docs. Run `node --test test/rbi-desk.test.ts test/reference-apps.test.ts`, `node scripts/rbi-desk-check.ts --live`, and `node scripts/reference-apps-check.ts --live` in WebKit at wide/narrow widths. Check Rulebook paging/search without dropping canonical records. `node scripts/rbi-outcome.ts --run-local` retains the original eight checks plus directory/voice/reference-rate checks against independent sources. Freeze checks before inference and retain failed evidence; source tests or an installed build alone never certify model grounding. Record outcomes in root Handover, Evaluation and Implementation Status. A framework gap is fixed and pushed in Projection, never under `framework/` here.

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
