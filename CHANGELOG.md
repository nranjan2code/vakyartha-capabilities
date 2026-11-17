# Changelog

## Unreleased

- Weather lists the places the person wrote instead of judging whether one was named. The request step copies each place as written, with a lookup form in Latin letters, and the runtime checks that every place is the person's own words (`grounded`) and every lookup is that text or its transliteration (`copies`). A place the geocoder cannot find drops out (`if-item-fails: drop`); when no place is left, the plan asks which place (`if-empty: ask`) instead of reading weather for nothing. Forecasts are capped at seven days, and the answer names each place with its region and country.

- Personal Finance Workbench becomes a ledger for everyday use. Transactions are added, changed and deleted in the app (import stays, and Export CSV writes the same format); limits can be set for all spending and for each category; recurring items such as rent and salary are kept once and added to the month with one press, never twice; and a new Insights view compares the month with the one before, lists the largest expenses and where the money went, and shows the 12-month trend with spending stacked by category. Overview now leads with what is left of the monthly limit and the cumulative spending against it. The assistant can add transactions from a chat message: the app exports a read-only `get_ledger_context` and an `add_transactions` tool that adds the described rows all or none after the person approves them, and ships the `finance-ledger` skill and an **Add by chat** button. Views are compact: a one-line summary, one action bar and the working area. The ledger keeps up to 5,000 transactions; saved ledgers and state load unchanged.

- The development channel adds Azure Operations Desk for scoped captures, triage, service work, handovers and invoice reconciliation, plus Azure Infrastructure Workbench for estate evidence, landing zone reviews, and migration waves.

- Twenty-four instruction-only skills are removed. They brought no tools and no reference data, and the general assistant already answers their requests; those that were not text-only also ran a three-step plan before every answer: `budget-helper`, `code-review`, `commit-message`, `compare-options`, `dashboard`, `data-review`, `explain-simply`, `finance-dashboard`, `meal-plan`, `meeting-actions`, `operations-dashboard`, `periodic-report`, `plan-my-day`, `sales-dashboard`, `summarize`, `task-tracker`, `trip-planner`, `voice-notes`, `write-email`, and the development-channel `proofread`, `study-guide`, `translate` and `write-document`. `market-dashboard` is removed as a duplicate: it read the same four Market Terminal tools as the app's own `nse-market-analyst`, which now states its rule on returns over several sessions. The remaining skills and app documents no longer point at the removed ones. Nine standalone skills remain: `daily-news`, `debug-error`, `diagrams`, `nse-mcp`, `research-brief`, `shell-command`, `weather`, `write-article` and `write-code`.

- A step is given the reference it applies. In a stepped run a step is offered only its own tools and cannot open a file, so a reference named only in the surrounding text never reached it. Weather gives the parameter rules to the steps that read explicit dates, past dates and specialist data, and the weather-code words to the interpretation step, which now also receives the places as geocoding resolved them and names each one. RBI gives its interpretation step the fixed rate explanations, Clinic Desk its attendance-estimate wording, and Learning Desk gives lesson review to the authoring step and lesson media to the proposal step. Each step reads one file, so every supported Vakyartha reads these the same way.

- Weather's geocode step no longer tells the model to ask which place was meant: a tool step cannot ask. The first match is used and the answer names it, so a wrong match can be corrected.

- NSE's worked query patterns use the tools' own argument names, read the history a window return needs, and carry no invented prices or page layouts. The skill names all four of its references, and its repeated headings are gone.

## 1.0.6 (2026-11-16)

- Skills supply content and the host lays it out: pages follow Vakyartha's layout patterns (dashboard, report, article, explorer, comparison, tabs), chosen by purpose in any language. Write Article no longer ships sample pages with invented figures in one currency and names no canvas components; its media reference covers media and spoken output only. Diagram examples show shape only, and labels come from the request's subject and language. Periodic Report states periods in the user's own calendar, week start and time zone, and Finance Dashboard shows each amount in its own currency without naming any. Needs a Vakyartha with layout patterns (Projection 0a2e5b8 or later).

## 1.0.5 (2026-11-16)

- Agent Desk is retired and removed from the catalog, with its worker and planner skills. Its work-plan rewrite in this section is withdrawn with it.

- Research brief no longer stops when no source can be read: its sources step is skipped on failure, and the brief then says first that it rests on general knowledge, with no links or citations. The sources step reads only addresses the request, a search or a page has given, starts from an organisation's own pages when no search tool is set up, and reads a different address when one is not found.

- Weather keeps a place's coordinates for a day (`valid-for` on the geocode step), so a follow-up in the same chat does not look the place up again. Forecasts and other readings are always read. Needs a Vakyartha whose skill steps accept `valid-for`.

- Four development-channel skills for any language: translate, proofread, write-document and study-guide.

- All 29 catalog skills and 11 app skills declare bounded domain steps. Text-only workflows retain their Text output. Vakyartha provides presentation over retained evidence, including market results. Weather binds resolved coordinates and the requested forecast day count without retyping either.


- Market Terminal keeps one tool-use skill, `nse-market-analyst`, with checked reads and domain interpretation. Removed the separate report-rendering skill and superseded app change notes; presentation belongs to Vakyartha across all domains.

- Market Terminal reads each source only when it can have changed: live values through the session and once after the close, end-of-day values once after each evening's publication, the index list weekly. The scheduled and startup refresh make no reads while the market is closed and the closing values are saved; repeating an index study, comparison or ranking with a current result reads nothing; the Refresh button still reads live values. The Sources ledger shows how long each read took.
- Clinic Desk shows an explicit empty state for visit types when the selected period has no visits.
- Market Terminal links price, volume, returns and drawdown by saved session and adds date comparisons and corporate-action marks. Finance Workbench opens the outflows behind a spending category. Project Desk opens the issue records behind a label. These views need the shared chart inspection support in Vakyartha.

## 1.0.3 (2026-11-09)

- Document Desk 1.1.0 ships in releases (no longer development builds only).

- Document Desk: categories (one per document, with optional rules by words, shared subfolder or kind; the person's own filing always wins; bulk filing of search results; a Categories view; category filters in the Library and the assistant's tools). Reads Excel, PowerPoint, OpenDocument text, sheets and slides, EPUB, RTF and saved emails as well; needs a Vakyartha that accepts these extensions (ADR-090).
- Document Desk: questions about the library's content reach its search without naming the app (`exports.routeKeywords` from titles, headings and tags; needs a Vakyartha with ADR-091). New read-only `get_document_outline`; `search_documents` can stay inside one document, a kind or tags, returns kind, pages and date, and exact matches name their section; `read_document` starts at a section or a PDF page; `list_documents` filters by kind or title words and sorts. The reader skill uses them.
- Document Desk 1.0.0 (development channel): a searchable library of the person's documents. Uploads and read-only shared folders through the host's document sources, Markdown from PDF (system engine), DOCX, HTML, CSV, JSON and text, relevance search with passages, phrases and link rank, exact and pattern search, a reader with parts, outline and links, and read-only `search_documents`, `read_document` and `list_documents` with the `document-desk-reader` skill. Needs a Vakyartha with ADR-090.
- NSE Strategy Lab (development channel) declares `storage.databaseMiB: 256`, so it needs a Vakyartha with ADR-084. It keeps volume again, holds one row per symbol and date with NSE's latest reading winning, takes up to 50 stocks, and shows storage against the declared limit. A database saved by the earlier package is replaced and its sessions read again.
- Clinic Desk: Today's doctor and view filters keep an action in their own row (Ask assistant moves beside them). A clinic with a doctor but nothing actionable below, in week or month view, or on a day it could not book, projected a surface the host refused, which failed the app's update.

## 1.0.1 (unreleased)

- Video Studio 1.0.1: typechecks under strict TypeScript (its saved-source check accepts any stored value), and its 17 tests now run in CI.
- CI runs every test an app ships in `apps/<id>/test/`, and Vakyartha's ahead check typechecks and tests the catalog's apps before each release is signed.
- Release tooling handles a missing `signatures/` folder after a version reset.

## 1.0.0 (2026-11-06)

The first release of the Vakyartha catalog: 13 apps, 29 skills and 17 declarative integrations, each at 1.0.0, for Vakyartha 1.0.0 up to (not including) 2.0.0. Earlier catalog releases were withdrawn before they were relied on; this release restarts the version line.

Apps:

- **Agent Desk:** agent tasks with fixed criteria, alternative attempts, source references and personal review.
- **Clinic Desk:** front-desk scheduling where every view fits one screen: appointments, waiting list, reminders, week ahead, patients and doctors with the list beside the open record, and insights in tabs.
- **NSE Market Terminal:** the Indian equity market from delayed NSE data: indices, breadth, movers, watchlists, a portfolio with exact P&L, alerts and a live market show. Open shows research saved today without a read; reads run in parallel.
- **News Desk:** your own front page from a 55-feed catalogue, with visible ranking, full coverage per story, photo leads and a spoken bulletin; ranking caches headline words so a click takes about 30 ms.
- **Learning Desk:** personal courses, practice and notes; New course and Review drafts keep assistant proposals separate from your library.
- **RBI Desk:** Reserve Bank of India rates, forex reserves, notices and Master Directions, with source dates and a spoken briefing.
- **Personal Finance Workbench:** INR transactions from CSV or JSON, monthly totals, budgets and charts, with no bank login.
- **Project Activity Desk:** issues, pull requests and commits of a public repository, with local triage lanes.
- **Task Planner:** local tasks with quick capture that understands days, times, lengths, repeats and priorities, due-first lists, calendar views and charts.
- **Video Studio:** a personal library of watchable programmes from News Desk, Market Terminal, Weather Desk and Wish Radar, with Shorts, playlists, continue watching and history, and Creator Studio to edit drafts. A video is always a programme played by Watch; no video file is made.
- **Voice Desk & Note Taker:** spoken or typed notes with action items, read back on demand.
- **Weather Desk:** saved places with live skies, an hourly strip, forecasts, daylight planning, air quality and Listen/Watch.
- **Wish Radar:** a local wishlist with price observations and comparisons, honest messages when a read is declined, canonical product links and price parsing that rejects EMI amounts.

Across the catalog:

- Every app declares a brand colour and a distinct icon; buttons that only open another view use the host's `view.open`, so they run nothing.
- Skills keep short ordered procedures, with detail in `references/` read on demand.
- An app whose declared tools are all optional enhances the apps it reads instead of requiring them, so it installs on its own.
- Development-only items (`channel: dev`) stay on `main` for Vakyartha's development builds and are never in a release.
- Release tooling: versions and signatures are typed by the owner at a terminal; `version.ts --list` shows items changed since the last release; `full` CI passes between releases and the `release` tier checks the signature after signing; a public-boundary check refuses links to private repositories and local paths.
