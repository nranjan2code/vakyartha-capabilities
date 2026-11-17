# Working on Personal Finance Workbench

Read Building a Vakyartha app (Vakyartha's app-building guide, in the Vakyartha product documentation) first; this app follows its method. Then README.md, SKILLS.md and ARCHITECTURE.md here.

## Invariants

1. DuckDB `ledger(id VARCHAR PRIMARY KEY, date VARCHAR, description VARCHAR, category VARCHAR, paise BIGINT)` is the only transaction owner. `context.state` owns `month`, `budget` (the limit on all spending, a decimal string), `budgets` (category to paise), `recurring[]`, the drafts `draft`, `edit`, `limit` and `rec`, the open records `editId` and `recId`, `importText`, `lastImport {at, count}`, the two confirmations, `seq` and the last `notice`. `normalize()` accepts untrusted and earlier state.
2. Each action that needs ledger values reads once with `load(month, calendarMonth)`, and `view(state, ledger, now)` derives all six surfaces from that read: totals, limits, charts, tables and lists use the same rows. A text draft edit returns only its own view's data over the retained view, without SQL. Regions are emitted only when they apply; an empty month and an empty ledger say what to do.
3. Money is integer paise end to end. `paise()` parses signed decimal strings exactly; `typedPaise()` parses a typed positive amount; `decimal()` writes paise back. Charts receive rupees from SQL as `paise / 100`.
4. Every write is explicit: Add, Save changes, Delete (after a confirmation), Set limit, Add to ledger, Import. Entered transactions get `entry-<n>` IDs; a recurring item posts as `rec-<item>-<YYYY-MM>`, so it cannot be added twice in a month. Imports are validated as a batch (`records()`), checked for existing IDs, and inserted in one transaction. No external tool, network or credential.
5. Recurring items are due only in the person's calendar month, never in an earlier selected month. Nothing posts without a press: the package has no timer or trigger.
6. The assistant reaches the ledger only through the declared exports: `handleQuery('get_ledger_context')` reads (the host discards any change), and `add_transactions` is the one mutating export. It requires `expectedRevision` (checked and removed by the host), defaults to Ask, validates every row before writing, inserts in one transaction and never updates or deletes. The `finance-ledger` skill and the `assistantWorkflow` behind **Add by chat** describe only these two tools; keep them, the manifest schemas and README in step.
7. `surface.json` is `surfaceFile()`: the empty app on a fixed clock with the entry date left blank, so it does not change from day to day.

## Change method

Change `model.ts`, `server.ts` or `views.ts`; regenerate `surface.json` from `surfaceFile()` (Vakyartha's `node scripts/app-surfaces.ts` writes it); leave `version` alone (the owner types the new version at the next release; `node scripts/version.ts --list` shows the app); update these four documents; run `node --test tests/finance-workbench.test.ts` here and, in Vakyartha, `node --test test/finance-workbench.test.ts test/reference-apps.test.ts test/app-registry.test.ts`, which also lint every view and run the exports through the real registry. A schema change needs a migration in `load()` because updates keep the saved database.

## Shared Access and package review

This package declares no outbound integration tools and keeps bounded DuckDB plus local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
