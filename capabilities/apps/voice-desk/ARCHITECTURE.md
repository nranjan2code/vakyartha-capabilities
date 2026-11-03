# Voice Desk architecture

## Files

- `app.json`: manifest; no network, tools, storage database or schedules.
- `server.ts`: `normalize`, `handleAction`, and `view` with `deskSurface`, `editorNodes`, `actionsSurface`.
- `surface.json`: `view({})`, the empty state shown before the first action.

## Flow

```text
type or dictate (host voice.dictate) → field edit, batched by the host → handleAction(bindPath, value)
button → handleAction(action, payload) → normalize(state) → change notes → view(state)
view → updates for desk and actions (nodes + whole data) → registry validates and commits atomically → surfaces
voice.read button → payload pointer resolved by Projection → host reads the text aloud
```

## Data

State: `notes[]` (`id`, `title`, `body`, `tags[]`, `actions[]` of `{id, text, done}`, `created`, `updated`), `openId`, `seq`, `capture`, `newAction`, `confirmDelete`. Surface data is derived: `/notes` records for the list, `/note` for the editor, `/open` for open items, `/spoken/*` for read-aloud text. Visual and spoken views come from the same notes.

## Boundaries

Each action runs in a fresh sandbox (30 s); state is saved only on success, and errors show in the app header's status chip. Voice input and output stay with the host's voice settings and providers. Limits: 500 notes, 20,000 characters per note, 300 per line field, 12 tags.

## Shared Access and package review

This package declares no outbound integration tools and keeps local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
