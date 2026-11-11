# NSE Market Terminal: skills

## Ships with this app

These skills are installed, updated and removed with the app. While the app is installed they can be turned off in Skills but not uninstalled.

- `nse-market-analyst` (`skills/nse-market-analyst/SKILL.md`): Analyze Indian market indices, price movements, and market breadth from NSE Market Terminal. Needs skill:interactive-ui.
- `nse-market-report` (`skills/nse-market-report/SKILL.md`): Show the Indian market now as one page from the saved snapshot. A stepped skill: one read, then a page built from the returned records, with a control that reads the market again.

## Vakyartha skills that apply

- `app-operator`: opening the app and using its controls, receipts and background operation.
- `app-maintainer`: changing the package, its surfaces and these documents; bumping its version and running the tests.
- `app-debugger`: finding why an action, refresh or view does not behave as expected.
- `app-admin`: reviewing Access, tool and destination rules, and Background operation.
- `interactive-ui` and `surface-design`: preserve the shared date range, unadjusted basis and exact retained session records when presenting the linked charts.

## Requires

- app:news-desk
- integration:nse-cmmkt
- integration:nse
