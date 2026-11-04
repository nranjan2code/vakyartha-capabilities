# Wish Radar Architecture

Wish Radar is an executable app using the shared sandbox, Projection surfaces and existing governed Web pages integration.

## Owners and files

- `app.json`: brokered `web__fetch_page`, DuckDB entitlement, 09:00 cron refresh, header Listen/Watch and revision-checked mutation exports. No startup handler.
- `server.ts`: validated normalized state, exact paise arithmetic, ledger queries, merchant preferences, fetched-text validation, Amazon text/link candidates, product-scoped price parsing, conservative labelled generic INR parsing, handlers and pure three-surface derivation.
- `programme.ts`: record-derived spoken programme, Watch and broadcast script. No separate narration persistence.
- `surface.json`: generated empty view; regenerate with `node scripts/app-surfaces.ts`.
- `SKILLS.md`: immutable query and Ask/revision mutation procedure through the shared host.

App state owns wish definitions, merchant preferences, candidates, drafts, notices and refresh cursor. DuckDB `price_observations` is the sole chronological observation owner. Columns remain `id`, `wish_id`, `recorded_at`, `store`, `price_paise`, nullable `in_stock`, `offer_notes`, `rating`, `rating_count`, `delivery_info`, `pincode`. Missing availability stays null through queries, cards, tables and CSV. PIN preference is not source confirmation.

## Reads and commits

An action checks its initial URL against enabled merchant preferences, then calls `web__fetch_page` through the existing host integration/approval path. App preferences grant no network authority and do not replace redirect/egress controls. The framework's Web pages tool sends an honest request (a Vakyartha product token, standard Accept, Accept-Language and compression it decodes) and reads one page per host at a time, spaced, across app and chat reads. No browser identity, cookie jar, browser execution, credentials, proxy, CAPTCHA handling or alternate fetch tool. Links are stored canonical (`canonicalProductUrl`).

The tool returns text and retained links, not HTML, images or JSON-LD. Amazon search parsing binds each explicit listing price to that product's direct link, requires query terms and filters accessories. Search and variant selection never mutate the ledger; selection uses retained candidates rather than caller-supplied prices/URLs. A separate product check scopes extraction below its repeated product title. Other merchants require a direct product link, exact repeated title and unique labelled INR price; unreadable/ambiguous pages fail closed. No cross-merchant search substitution.

Successful product checks insert an observation then derive all surfaces and programmes from state plus the ledger. Failed/empty/challenged reads preserve old records and show a notice. A homepage test establishes only homepage readability, never offer coverage. A 403, 429, 503 or CAPTCHA page is reported as the store declining the automated read, with next steps, and a refresh asks that merchant no more until the next one. Instalment, offer and list-price amounts never become the price; a cart-only price fails visibly.

## Lifecycle and bounds

Host-owned Background operation remains canonical. Refresh reuses the manual product-check handler across linked merchants, rotates at most four wishes, starts no further read after 12 seconds and reports failures/deferred items. No package timer or second writer. The 15-second fetch timeout and 30-second sandbox limit remain; host retries do not certify source correctness. Queries remain immutable; mutations require current integer expectedRevision and default Ask.

100 wishes, 5,000 observations, 50,000 import characters. The manifest's 256 MiB request is not an enforced whole-process memory quota. Source checks do not enforce the ledger cap beyond the existing handler behavior; broader limit verification stays open.

## Evidence boundary

See README for the dated six-retailer probe and remaining installed/source/variant/delivery/UI gates. `scripts/wish-radar-source-check.ts --live` retains raw tool text and per-source receipts in gitignored `.vak/evaluations/wish-radar/`. Homepage success is never labelled product-price verification. Backend fixtures exercise the real fetch adapter's text conversion, not invented raw-HTML tool results.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Merchant/store enablement is a domain preference, not a permission grant. New merchant hosts require explicit app destination review; source/value/identity checks remain independent of granted access.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
