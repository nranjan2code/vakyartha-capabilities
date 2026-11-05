# Changelog

## Unreleased

- Clinic Desk: every view fits one screen. Schedule keeps one action bar and counts, then tabs for Appointments (row cards with their actions beside them; choosing a row opens the patient), Needs attention, Waiting list, Reminders and Week ahead. Patients, Doctors and Setup put the list beside the open record, whose parts are tabs; Insights puts its charts in Summary, Trends, Patterns and By doctor tabs. Actions land on the right view and tab. Removes the repeated week chart, day-capacity bar and duplicate week and month controls. Needs a Vakyartha host whose Projection has card `layout` and tabs `active`; older hosts show stacked cards and the first tab.
- Clinic Desk tests cover tab routing to a doctor's calendar and the schedule's appointment list after opening a day.
- NSE Market Terminal: Open shows research saved today without any read; Analyse rereads the quote, the latest history month and news, and reuses the day's 52-week range, benchmark comparison, corporate actions and volume. Refresh, Analyse, movers, index study and new watchlist quotes read in parallel. Needs a Vakyartha host that keeps several app tool calls in flight; older hosts run them one at a time.
- News Desk: ranking and topic discovery cache headline words, so a click takes about 30 ms instead of seconds with a few hundred articles; feeds refresh four at a time; filter changes update only Sections.
- Task Planner: quick capture understands days, times, lengths, repeats and priorities typed with the task and previews them; lists sort by what is due; Tomorrow on late and due-today tasks; Complete, Move to tomorrow and Delete in task details; Clear completed with confirmation; tab counts and friendlier dates. Empty-state messages no longer show when a list has tasks.
- Development-only items: an app or skill marked `channel: dev` stays on `main` and in Vakyartha's development builds, and signed releases leave it out. A release item may not use one, and `provides` counts release items only.
- Add Task Planner, a local personal task app with quick capture, due-date calendar views, explicit repeat-after-completion, charts, and an optional task-planning skill. No model calls or external services are required.
- Describe task tracking, day planning and meeting-action integrations generically, without naming external services.
- Video Studio: Shorts (a vertical 9:16 feed of library shorts), Playlists, Continue watching and Recently watched; Watch on any card plays from there through the rest, and Creator Studio previews from the selected scene. Needs a Vakyartha host with the `voice.watch` button action.
- Catalog rule: an app owner whose every declared tool is marked optional in `toolPurposes` is listed as enhancing the app, not required by it. Video Studio now installs on its own; Market Terminal and Weather Desk list their optional sources the same way.
- Video Studio: a person's narration and titles are never rewritten on reload; edits save as they change, so switching scenes loses nothing; unreadable saved items are kept and reported; shorts keep source timing; Move to drafts; readable dates and estimated spoken length; library cards show a picture and a Watch choice for the header player. A video is always a programme played by Watch; no video file is ever created.
- Improve Creator Studio with a responsive storyboard and programme inspector, searchable paged collections, compact surface data, and source freshness labels; preserve unsaved scene edits when creating a short and enforce its 120-word limit.
- Add Video Studio 1.0.0: import watchable programmes from News Desk, Market Terminal, Weather Desk and Wish Radar; edit and review local show drafts, create one-scene shorts, and play through the shared Listen and Watch voice path.

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
