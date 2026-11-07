# Changelog

## Unreleased

- NSE Strategy Lab (development channel) declares `storage.databaseMiB: 256`, so it needs a Vakyartha with ADR-084. It keeps volume again, holds one row per symbol and date with NSE's latest reading winning, takes up to 50 stocks, and shows storage against the declared limit. A database saved by the earlier package is replaced and its sessions read again.

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
