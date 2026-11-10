# Running, access and refresh cost for NSE Market Terminal

## Supporting App Skills
- `app-authoring` and its package template: the method this app follows.
- `app-maintainer`: changes to this package, keeping old state loading through `normalize()`.
- `app-debugger` with `debug-error`: a failed run. Start from the header status chip and the Sources ledger.
- `interactive-ui` and `surface-design`: bindings, record-bound charts and tables.

The user can save/switch/delete lists in Watchlist and export the canonical Portfolio CSV with its explicit Export CSV button. Query tools cannot mutate lists, export files or start speech. The host header owns refresh and radio/voice controls.

Portfolio coverage is explicit: when nothing is priced, report value and gains as unavailable. Numeric share edits are validated on Add; the placeholder supplies no shares. Instrument and Index exploration expose compact controls and focused analysis subviews. Watch labels each part’s saved source basis and timing; a fresh retrieval does not make old observations live.

## Hosted operation

The shared host supplies Background operation in this app and Operation Center; package views must not duplicate it or own timers. Start & keep running persists the choice and runs the declared startup-refresh handler now and whenever Vakyartha launches. Refresh remains a manual action; automatic timing uses the declared cron interval, a chosen host timer, or Manual only. Stopping background operation leaves manual actions and saved data available. Startup also runs in Manual only mode.

The host owns scheduling, serialized commits, bounded recovery and run receipts. A failed computation with no external calls receives up to three delayed retries; uncertain external effects block replay for exact-run review. Tools require this app’s explicit mode/tool/destination access; integration Off remains a ceiling, and execution needs an awake computer and running Vakyartha. Reviewed package updates stop background operation for renewed review. Playback observes saved programmes and never starts another refresh loop.

## Shared Access and package review

This package declares 19 integration tools. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Ordinary market refresh is separate from optional research and the News Desk query. A local cross-app read has its own app tool grant; it is not an external exchange connection.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.

Use the existing field controls for portfolio, watchlist and alert drafts. These edits save the draft and update its view without querying price history.

## Interaction and refresh cost

Each source is read only when it can have changed: live values through the session and once after the close, end-of-day values once after each evening's publication, the index list weekly. The Refresh button always reads live values; the startup and scheduled refresh read only what is due. The Sources ledger shows how long each read took.

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
