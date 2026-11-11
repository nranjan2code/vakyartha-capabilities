# RBI Desk 2

The Reserve Bank of India's published rates, weekly foreign exchange reserves, notices and Master Directions. Every value retains its source date and units. App actions run ordinary code; they do not ask a model to calculate or refresh.

## Setup and controls

Open the header **Access** shield, finish **Web pages** setup inside the panel and review this app’s tools and official source hosts. Review background access separately. Open Apps → RBI Desk and use **Refresh in the header**. The neighbouring radio button plays the briefing as a programme (greeting, the rates over the theme, changes, reserves, the latest notices, sign-off), and **Watch** shows it with figure tiles; its arrow chooses this app's voice. The default uses Settings → Voice. Listening continues across screens until stopped. Other actions stay beside their filter or results; there are no duplicate Refresh or Listen buttons in the views.

| View | Contents |
| --- | --- |
| Rates | Six headline rates, tracking coverage, and the full labelled panel. A history chart appears only after two stored days. |
| Reserves | Total, FCA, gold, SDRs and IMF reserve position, in US$ million and INR crore (grouped, weekly changes signed), with RBI's weekly changes and week-ending date. A trend appears after two stored weeks. |
| Updates | Feed, topic and search controls; paged linked notices. All notices excludes procurement tenders; select Tenders explicitly to see them. |
| Rulebook | Search official direction titles and categories, including KYC. Newest first by amendment or issue date, twelve per page; every record remains in canonical state. Links open the official rule, not a model interpretation. |
| Sources | Health, last successful reads and bounded receipts. Failed reads retain the last good data and report the failure. |

## Data and schedule

One refresh makes at most nine governed reads: home-page rates; five feeds (Press releases, Notifications, Bulletin, Annual report, Tenders); the newest saved weekly-statistics press release; the Master Directions directory; and the newest saved gold-bond notice. Release links are discovered from the official feed and checked as official RBI URLs; IDs are never guessed. The bounded notice detail supplies the actual gold-bond redemption amount.

Policy rates and ratios have no effective date on the home page: they are labelled **read on**, not asserted as a policy-decision date. Exchange rates, call money and index levels retain their published date. T-bill yields are the last auction's cut-off; that panel gives no auction date. Reserves keep both publication and week-ending dates. Directory issue dates and title-stated amendment dates stay distinct.

The 30-minute schedule is off until Keep running is enabled in Background operation and runs while the host and computer are awake. Manual refresh works with scheduling off. A disabled schedule does not invalidate a previous manual read. Failed reads never manufacture freshness. History retains 730 observed days and 104 observed reserve weeks; it is not a historical data service. Notices retain 300 items, with only ten recent items per source feed on each read. Source receipts retain 30 reads.

The Speeches and Publications RSS feeds embed full documents and exceed the tool-reply bound. They are not included. Directory search returns titles and links, not full regulatory documents or legal advice. No key, new package, raw network access or paid model is required.

## Tools and skills

Read-only MCP tools: `app-rbi-desk__get_rbi_rates` (optional `rate`), `get_rate_history` (`rate`, optional `since`), `get_forex_reserves` (optional stored `weeks`), `get_rbi_updates` (feed/tag/query/since/limit), `find_master_direction` (`query`) and `get_rbi_briefing`. Queries use committed state, never refresh a source, and cannot advance the app revision. The app publishes `rbi_updates` for other apps.

The app's `rbi-desk-reader` loads Vakyartha's canonical `rbi` procedure, which owns dispatch, date/source rules, fixed rate explanations and canvas presentation. `presentation` provides the same supported components available to any app author. No app-specific renderer is used.

Verification commands: `node --test test/rbi-desk.test.ts`, `node scripts/rbi-desk-check.ts --live`, `node scripts/reference-apps-check.ts --live`, and `node scripts/rbi-outcome.ts --run-local`. Current results and unresolved model outcomes are recorded in `docs/evaluation/EVALUATION.md`; successful app refreshes do not certify every generated chat answer.

## Hosted operation

The shared host supplies Background operation in this app and Operation Center; package views must not duplicate it or own timers. Start & keep running persists the choice and runs the declared startup-refresh handler now and whenever Vakyartha launches. Refresh remains a manual action; automatic timing uses the declared cron interval, a chosen host timer, or Manual only. Stopping background operation leaves manual actions and saved data available. Startup also runs in Manual only mode.

The host owns scheduling, serialized commits, bounded recovery and run receipts. A failed computation with no external calls receives up to three delayed retries; uncertain external effects block replay for exact-run review. Tools require this app’s explicit mode/tool/destination access; integration Off remains a ceiling, and execution needs an awake computer and running Vakyartha. Reviewed package updates stop background operation for renewed review. Playback observes saved programmes and never starts another refresh loop.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.

The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
