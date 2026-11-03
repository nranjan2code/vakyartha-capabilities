# Working on Voice Desk

Read Building a Vakyartha app (Vakyartha's app-building guide, in the Vakyartha product documentation) first; this app is its worked example. Then README.md, SKILLS.md and ARCHITECTURE.md here.

## Invariants

1. `context.state.notes` is the only data owner. Every run starts with `normalize()`, which accepts untrusted or older state and keeps only well-formed notes.
2. `view(state)` derives both surfaces (`desk`, `actions`) and their spoken text from the notes. Records go in surface data and render through repeaters (`children: {each, template}`); nodes are templates, and a region is emitted only when it applies (the editor only with an open note, the checklist only with items, the confirmation only while asked).
3. Fields autosave: `/note/title`, `/note/body`, `/note/tags`, `/note/actions/<i>/done`, `/open/<i>/done`, `/capture`, `/newAction`. Anything else throws.
4. Voice is the host's. Buttons declare `voice.dictate` `{into: <input node id>}` and `voice.read` `{text: "/spoken/..."}`; this code never records, transcribes or speaks.
5. No network, tools or model calls. Text is stored as inert strings.

## Change method

Change `server.ts`, then regenerate `surface.json` as `view({})` (the test fails otherwise), bump `version` in app.json, update these four documents, and run `node --test test/reference-apps.test.ts test/app-registry.test.ts` (the second runs it in the real sandbox).

## Shared Access and package review

This package declares no outbound integration tools and keeps local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
