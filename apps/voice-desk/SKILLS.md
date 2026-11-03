# Skills for Voice Desk

Skills guide procedures; they grant no tool or execution authority, and the app runs without a model.

- `app-authoring` and its package template: the method this app follows; use it when building a similar app.
- `app-maintainer`: changes to this package, keeping state compatible through `normalize()`.
- `app-debugger` with `debug-error`: a failed action. Start from the status chip's message and the run receipt.
- `interactive-ui` and `surface-design`: bindings, repeaters and layout density for the two surfaces.
- `voice-notes` (in chat): turning a spoken brain dump into a structured note. It works in chat; it does not operate this app.

When a capability is added or removed, update this list with what the skill actually does here.

## Shared Access and package review

This package declares no outbound integration tools and keeps local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
