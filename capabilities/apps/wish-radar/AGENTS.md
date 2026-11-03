# Working on Wish Radar

Read [Building a Vakyartha app](../../../docs/development/BUILDING-APPS.md) first; this app follows its method. Then README.md, SKILLS.md, and ARCHITECTURE.md here.

## Invariants

1. **Exact Paise Arithmetic:** Money is stored and computed in integer paise end-to-end. `paise()` parses INR strings into exact integer values; `formatInr()` formats for presentation. Floating-point arithmetic must never be used for prices or savings.
2. **DuckDB as Observation Owner:** DuckDB table `price_observations` is the sole owner of chronological price checks. `context.state` owns the active wishlist definitions (`Wish[]`), active form modes, and drafts. `normalize()` accepts untrusted and older state shapes.
3. **Pure View Derivation:** `view(state, ledgerData)` derives all three surfaces (`overview`, `history`, `import`) from that single state and database read. No surfaces are patched independently outside this pure derivation.
4. **Zero Paid Third-Party Dependencies:** Never introduce paid API keys, commercial scraping subscriptions, or external proxies. External network access is limited to brokered calls via `web__fetch_page` for public merchant text/link reads. No browser, cookie jar, proxy or alternate fetch path. Merchant preferences narrow host permissions; they grant no authority.
5. **No ambient authority:** File export uses the standard Vakyartha `{ action: "file.save", payload: { name: "...", text: "..." } }` contract through the host bridge into Downloads.
6. **Spoken & Video Broadcast Projection:** Spoken briefing and Watch programme for `voice.listen` (`/spoken/programme`, `live: 2`) are derived by `programme.ts` (`generateProgramme`) from the exact same records as the visual surfaces. Audio cues (`intro`, `sting`, `outro`), theme beds, figure tiles, dynamic charts, and crawling live ticker tape are generated deterministically.
7. **Broadcast & TTS Script Tool:** `get_broadcast_script` generates studio production scripts with presenter cues and natural Indian currency speech (`spokenRupees`).

## Change Method

When editing this app:
1. Update `server.ts` and test backend logic.
2. Run `node scripts/app-surfaces.ts` to regenerate `surface.json` from `surfaceFile()`.
3. Bump `version` in `app.json`.
4. Keep `README.md`, `AGENTS.md`, `SKILLS.md`, and `ARCHITECTURE.md` synchronized.
5. Run `node --test test/reference-apps.test.ts test/wish-radar.test.ts`.

## Acceptance status

Retain the README's open installed source-price, identity, all-store product coverage and full UI gates. Search and selection are candidate-only; a separate product check owns the observation. Availability remains null unless a source states it. Test through the actual fetch adapter text conversion, never raw-HTML mocks. Background refresh rotates at most four linked wishes and reports per-wish failures/deferred items. Synthetic fixtures do not establish live merchant correctness. The shared host owns Background operation in this app and Operation Center; do not implement package timers or recovery writers. The manifest currently declares periodic work without startup work.

## Exported query and mutation contract

Keep manifest schemas, handlers, tests and the reader skill synchronized. `get_wishlist`, `get_price_history`, and `get_broadcast_script` are immutable queries and supply current revision context; they cannot fetch, mutate the ledger or advance the app revision. `remember_wish`, `record_price`, `check_amazon_price` and `remove_wish` are declared mutations requiring integer expectedRevision, default Ask and the shared serialized writer. Package/skill declarations grant no approval. A commit receipt establishes a saved action, not independently verified source prices or consent to purchase.

## Merchant diagnosis

Use `node scripts/wish-radar-source-check.ts --live` only for explicitly authorized public reads. Preserve raw text and failed receipts in gitignored `.vak/`; do not certify homepage success as product support or relabel 503 as a proven rate limit. Parsing uses the current tool’s cleaned text and links. No HTML/JSON-LD/images are available from that contract. Keep exact product identity and source/value checks independent from tests or saved receipts.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Merchant/store enablement is a domain preference, not a permission grant. New merchant hosts require explicit app destination review; source/value/identity checks remain independent of granted access.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
