# Changelog

## Unreleased

- Project Activity Desk 1.0.1: the starting repository is this public catalog, so a public app never names a private repository.
- Public boundary check: CI fails on any link to a private repository or local path.
- Clinic Desk, News Desk, Personal Finance Workbench, Weather Desk and Wish Radar: buttons that only open another view use the host's `view.open`, so they no longer run the app; RBI Desk drops an unused view action. Needs a Vakyartha host with `view.open`. Versions unchanged (set by a person at release).

## 1.0.0 (2026-11-03)

First release on this repository as the single source of Vakyartha's
published capabilities: 11 apps, 29 skills and 17 integrations, each at 1.0.0,
for Vakyartha 1.0.0 up to (not including) 2.0.0. Signing, dependency checks and
the marketplace page are part of the release process from this version on.
