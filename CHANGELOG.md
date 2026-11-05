# Changelog

## Unreleased

- Add Task Planner, a local personal task app with quick capture, due-date calendar views, explicit repeat-after-completion, charts, and an optional task-planning skill. No model calls or external services are required.
- Describe task tracking, day planning and meeting-action integrations generically, without naming external services.

## 1.1.0 (2026-11-04)

- Release tests verify that noninteractive commands leave the current manifest, item versions and signatures unchanged at any catalog version.
- Release tooling: `version.ts` asks the person to type a new version for every app and skill changed since the last signed tag; `--list` shows them.
- Learning Desk: the learning-author skill is a 5,594-character ordered procedure; app operation, access and refresh cost move to `references/app-operation.md`, course browsing, progress and lesson media to `references/course-browsing.md`.
- Project Activity Desk 1.0.1: the starting repository is this public catalog, so a public app never names a private repository.
- Public boundary check: CI fails on any link to a private repository or local path.
- Clinic Desk, News Desk, Personal Finance Workbench, Weather Desk and Wish Radar: buttons that only open another view use the host's `view.open`, so they no longer run the app; RBI Desk drops an unused view action. Needs a Vakyartha host with `view.open`.
- Every app declares a brand colour (`brand`, `#rrggbb`) and a distinct icon; the catalog check rejects any other brand format. Needs a Vakyartha host that reads `brand`; older hosts ignore it.
- Learning Desk: the Create and Curate views are now New course and Review drafts.
- Wish Radar: labels, buttons and view names use sentence case (Price history, Import and settings, Show as table). Values its assistant tools return are unchanged.
- Empty states act instead of explaining: NSE Market Terminal offers Read market data and Build a watchlist, News Desk Read my feeds, RBI Desk Read RBI now. The access reminder in these apps is one short line, since the host's access notice already explains.

## 1.0.0 (2026-11-03)

First release on this repository as the single source of Vakyartha's
published capabilities: 11 apps, 29 skills and 17 integrations, each at 1.0.0,
for Vakyartha 1.0.0 up to (not including) 2.0.0. Signing, dependency checks and
the marketplace page are part of the release process from this version on.
