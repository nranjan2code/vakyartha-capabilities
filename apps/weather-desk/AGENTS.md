# Maintaining Weather Desk

Read this file, README.md, SKILLS.md, ARCHITECTURE.md, then the repository's app-building, skill-authoring and hosted-lifecycle contracts before changes.

- Canonical owner: `context.state`, schema 1; no filesystem/database writer, raw network, SDK, provider, vault or permission store. The existing app owner commits state, six independent surfaces and receipts together.
- Identity: explicit geocoded coordinate pair. Preserve returned timezone, source grid, null values, source-local timestamps, exact source units and independent dataset retrieval times/errors. Never infer a place from the computer or chat background.
- Only six manifest-listed governed tools are allowed. App declarations and skills grant no permission. At most five places and 15 sequential core reads; specialist reads are explicit and do not enter startup/cron work. Validate before replacing a source snapshot; failed source reads preserve it. Invalid/truncated replies cannot issue successful receipts.
- Presentation uses only public Projection components (`scene`, `icon`, `rangebar`, hero `stat`, scrolling `stack`); a needed visual capability goes into Projection, never into this package. Sky, symbol and phase are decoration derived from saved source fields; facts stay in text, tiles and tables.
- Views, CSV and programmes are pure projections. Do not maintain alternate speech records. Missing values must not become zero or qualify planning. Standard charts with incomplete numeric series are omitted with exact tables retained; do not repair a projector in app code.
- The header owns Refresh, place selection, Listen/Watch and voice selection. Background operation and host timing are shared with Operation Center. Startup is a real bounded idempotent core refresh; Keep running is explicit and persistent. No view, playback or package timer. Host recovery/uncertainty receipts remain authoritative.
- Queries (`list_places`, `get_weather`, `get_weather_briefing`) are immutable and perform no source calls. Keep schemas, exported reader frontmatter and handler names synchronized. Assistant opening is inert and uses the shared host studio. There are no mutating exports or unreviewed-content acceptance paths to add casually.
- Local fields/actions are enumerated in server.ts. Search results require explicit save; removal requires the reviewed place ID. Date ranges are past-local dates, max 31 days. Display preference changes never rewrite source values or issue source calls.

Before publishing updates: preserve fingerprints and saved places, revise all four docs and manifest version, regenerate only this package's `surface.json`, run source/value/missingness/action/receipt tests and the real sandbox journey, then inspect complete wide/narrow WebKit views, local paging, original links and Watch. Freeze source/value expectations before external evaluation; retain failures separately. Fixture passes do not certify live weather, native Downloads receipts, audio quality or model authoring. Use the reviewed draft/publication flow for installed user packages; source edits alone do not update an installed executable.

## Shared Access and package review

This package declares 6 integration tools. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Core refresh uses forecast and optional air; search, history, marine and river reads are separate explicit capabilities. Denied specialist access must not disable ordinary local edits or be treated as a forecast failure.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
