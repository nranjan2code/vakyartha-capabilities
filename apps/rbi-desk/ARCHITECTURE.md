# RBI Desk architecture

## Files and owners

- `app.json`: five surfaces, six read-only query exports, `rbi_updates`, the app reader skill, the opt-in 30-minute refresh and header radio declaration.
- `rates.ts`: labelled home-panel parser; exact strings, nullable numbers, source-specific dates and refusal of an incomplete required panel.
- `data.ts`: official URL validation, bounded page envelopes, the labelled reserves table and units, directory links/issue/amendment dates, and bounded notice details.
- `feed.ts`: the same bounded syndication parser used by News Desk, packaged locally because app packages are self-contained. Change both copies together.
- `server.ts`: state normalization, refresh/actions, read-only queries, five pure view projections, and a briefing (text, for `get_rbi_briefing`) and `programme` (Listen and Watch) derived from the same records.
- `surface.json`: generated empty views; `node scripts/app-surfaces.ts` keeps it synchronized.

`context.state` is the sole persistence owner: rates and retrieval time; observed daily history; reserve snapshots keyed by week ending; directory records and retrieval time; notice records keyed by official link; filters/drafts; source health and receipts. Views, tool results and speech are derived projections, not separate stores.

## Flow

Header refresh or scheduled refresh → at most nine `web__fetch_page` reads → validate source identity, labels, units and dates → replace successful source data, retain failed source data with health → derive Rates / Reserves / Updates / Rulebook / Sources → registry validates and atomically commits state and surfaces.

A field edit saves the filter/query; its adjacent action uses the same handler. Paging is local Projection behaviour and never deletes records or reads a source. Chat and cross-app calls run `handleQuery` in a disposable read-only sandbox; state/database changes are discarded and revision is unchanged. Listen and Watch play `/spoken/programme` through the host (shaped by the shared broadcast rules), using the selected voice and the existing native transport.

## Boundaries

Only the declared Web pages tool is reachable. No raw sockets, browser automation, external credentials, new dependency, private framework import or alternate connector exists. Official release URLs come from feed records, not guessed identifiers. Tool data remains untrusted. Only supported Projection components and props render the views; Markdown titles are escaped, and links remain official HTTPS URLs. There is no custom chart, expression evaluator or narration persistence.

The latest home-panel read and a weekly publication have different freshness. A reserves read reports both dates and warns on old coverage or source failure. A title in the directory establishes neither the contents nor legal applicability of a direction. The app's successful source/runtime checks and the primary model's original outcome checks remain separate gates.

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
