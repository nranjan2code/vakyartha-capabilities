# Wish Radar

Keep a personal wishlist, INR targets and a private local price history. Log prices from a browser or store quote, compare recorded observations, view trends and export CSV. Money uses integer paise. The Deal Advisor opens the shared assistant studio; opening it sends nothing.

## Merchant checks

All public reads use the existing governed `web__fetch_page` tool. Use the header Access shield to finish Web pages setup inside this app and review its own tools, merchant hosts and foreground/background rules. The package receives no browser cookies or account session, runs no browser and uses no proxy or paid price service. Reads identify themselves honestly as Vakyartha (never as a browser), with standard Accept, Accept-Language and compression headers; the framework reads one page per merchant at a time, spaced. A store may still decline automated reads: Amazon.in answers some with HTTP 503 or a CAPTCHA page. Wish Radar reports that as declined, never retries it in a loop or solves it, and points to Record price, a pasted deal in the deal advisor, Search on Amazon in your browser followed by Edit with the product link, or another merchant.

- **Amazon.in:** Without a product link, Find Online reads search listings as text and links. Matching candidates must contain the requested terms; accessories are excluded from device searches. Compare variants and select the exact product. Searching or selecting never inserts a price observation. Then Check price reads the linked product. Its repeated product heading scopes the price so navigation and protection-plan prices cannot supply it; instalment (EMI), offer, cashback and M.R.P. amounts are skipped, and a price shown only in the cart is reported, not guessed. Amazon links with tracking paths, ref= or query parameters, or the mobile or bare host are saved as `https://www.amazon.in/dp/ASIN`.
- **Flipkart, Nykaa, Croma, Tata CLiQ, Reliance Digital:** Direct product links are required. They never fall back to Amazon searches. The current text reader requires an exact repeated page/product heading and one explicit labelled INR price near it. Pages which omit those fields, require JavaScript, or present ambiguous prices fail visibly rather than producing an observation.
- **Brand and other stores:** Add their exact domain under Import and settings and provide a direct product link. They use the same conservative text contract; adding a store does not establish parser compatibility.

Merchant toggles are app preferences checked before initial reads, including connectivity tests. They narrow host access and grant no network permission. A homepage test reports only whether that page was readable; it never verifies product checks. Unchecked merchants start as Configured. HTTP 403, 429 and 503 and CAPTCHA pages are reported as the store declining the read, with the page's own title; a refresh stops reading a merchant once it declines. Empty, challenged and failed pages remain explicit failures, with the previous ledger preserved. Adding a wish preserves it even when discovery fails and shows the failure.

## Use it

1. Add a wish with its merchant, optional INR target and optional direct product link. Edit existing wishes from their card.
2. Use Amazon Find online to discover candidates; Compare variants → Track this model selects a link without recording a price. Check price reads that linked product separately.
3. For other merchants, paste a direct product link. If the page cannot be read reliably, Record price logs your own observation explicitly.
4. Overview shows every wish with its target, latest price and savings. View chronological records and merchant comparisons in Price history; export through the host's Downloads control.
5. Listen and Watch derive from the same recorded observations. Availability is unknown unless the source states stock status. A saved destination PIN is a preference, not proof of destination-specific pricing or delivery.
6. Import CSV/JSON under Import and settings. The assistant can read wishes/history and propose revision-checked app mutations through the existing approval pipeline.

## Background operation and limits

The shared host owns Background operation in this app and Operation Center. Keep running is explicit and persists across launches. The package declares a 09:00 cron refresh in the computer's timezone and no startup handler. Manual refresh is independent. Each refresh rotates through at most four linked wishes, starts no new read after 12 seconds, and retains per-wish failures and a deferred count. The existing fetch timeout, tool budget and 30-second sandbox limit still apply. Unlinked wishes are not searched unattended. Background work needs the awake running host and this app’s explicit background access rules.

Limits: 100 active wishes, 5,000 observations, 50,000 import characters. Wishes/drafts live in app state; observations belong to local DuckDB. Export uses the shared safe file-save action. No purchase action is provided.

## Verification and open outcomes

Version 1.0.6 repairs the text/HTML contract mismatch, candidate selection, merchant preferences, false initial stock/readiness claims, failure visibility, refresh rotation and ungrouped INR parsing. Fixture tests pass through the real public fetch adapter before the app parser; they do not certify all merchant pages.

The Nov 2 free probe through the current adapter fetched the reported Amazon search successfully. It contained accessories and different chip models, with no matching priced M3 laptop admitted by the strict parser. A separate returned laptop product price was independently checked against the retained source text. Flipkart returned substantial homepage text; Nykaa, Croma and Reliance Digital returned thin shells; Amazon and Tata CLiQ homepages were empty. These are individual observations, not sustained access or product-price coverage. Run `node scripts/wish-radar-source-check.ts --live` for fresh private receipts.

The original reported installed-app outcome remains open: no rebuilt desktop app was installed or restarted by this repair. All-store product/variant identity, delivery, geographic and long-running background coverage, full installed wide/narrow journeys and human listening remain unverified. A committed record or readable homepage is not a verified offer or purchase-price guarantee.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Merchant/store enablement is a domain preference, not a permission grant. New merchant hosts require explicit app destination review; source/value/identity checks remain independent of granted access.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.

The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
