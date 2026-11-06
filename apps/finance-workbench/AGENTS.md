# Working on Personal Finance Workbench

Read Building a Vakyartha app (Vakyartha's app-building guide, in the Vakyartha product documentation) first; this app follows its method. Then README.md, SKILLS.md and ARCHITECTURE.md here.

## Invariants

1. DuckDB `ledger(id VARCHAR PRIMARY KEY, date VARCHAR, description VARCHAR, category VARCHAR, paise BIGINT)` is the only transaction owner. `context.state` holds `month`, `budget` (as typed), `importText`, `lastImport {at, count}` and `confirmClear`; `normalize()` accepts untrusted and version-1 state.
2. Operations that need ledger values read the selected month with `load()` and `view(state, ledger)` derives all three surfaces from that one read. Import-text drafts retain the committed import view without SQL: totals, charts and the table use the same rows. Regions are emitted only when they apply; empty months and an empty ledger say what to do.
3. Money is integer paise end to end; `paise()` parses decimal strings exactly. Charts receive rupees as `paise / 100` from SQL.
4. Imports are validated as a batch (`records()`), checked for existing IDs, and inserted in one transaction. No external tool, network or credential.
5. Fields save as they change (`/month`, `/budget`, `/importText`); an invalid budget is kept as typed and shown with a hint rather than failing the run.

## Change method

Change `server.ts`; run `node scripts/app-surfaces.ts`; leave `version` alone (the owner types the new version at the next release; `node scripts/version.ts --list` shows the app); update these four documents; run `node --test test/reference-apps.test.ts test/app-registry.test.ts`. A schema change needs a migration in `load()` because updates keep the saved database.

## Shared Access and package review

This package declares no outbound integration tools and keeps bounded DuckDB plus local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
