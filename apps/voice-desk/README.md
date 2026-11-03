# Voice Desk & Note Taker

Speak or type notes, keep their action items as a checklist, and hear any note or your open items read back. Everything stays on this computer.

## Use it

- **Notes view.** The capture box at the top takes speech or typing, or both. Press **Dictate** (or ⌘D with the box focused), speak, then **Save note**. The note opens below for editing; the box clears for the next one.
- **Edit.** Title, text and tags save as you type. **Dictate more** appends speech to the open note. **Read aloud** reads the note and its open action items.
- **Action items.** Add them under the note; tick them off or remove them. **Delete note** asks once before removing a note.
- **Action items view.** Every open item across notes, ticked off in place, with a link back to its note and **Read aloud** for the whole list.
- **Find.** The note list filters as you type in its search box.

Dictation and reading aloud use Settings → Voice: free on this Mac with a local model, or a hosted provider you chose. Voice must be on.

## Data

Notes (title, text, tags, action items, created and updated times) live in this app's private state. Nothing is sent anywhere by the app; it has no network or tools. Up to 500 notes of 20,000 characters each. Older note shapes from version 1 load automatically.

## Not included

No automatic summaries or cleanup of the text (the chat's `voice-notes` skill does that on request), no owners or due dates on items, no export yet.

## Shared Access and package review

This package declares no outbound integration tools and keeps local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
