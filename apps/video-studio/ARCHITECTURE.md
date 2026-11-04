# Video Studio architecture

## Files

- `app.json` declares the two surfaces, shared voice programme, optional app tools, Creator Studio exports, and the creator skill.
- `server.ts` validates source programmes, owns records in `context.state`, imports the selected show, edits scenes, creates one-scene shorts, and derives the two surfaces.
- `surface.json` is the empty library and Creator Studio state generated from `surfaceFile()`.
- `skills/video-creator/SKILL.md` guides source-aware assistant proposals.

## Flow and ownership

The person selects a source and presses Import. One read-only in-process MCP call obtains the app's saved programme; the backend validates and bounds it, attaches source identity, local import time and the source checked time when supplied, then commits a local draft. No timer or app-to-app file access is used. The Creator Studio edits the same canonical scene records. The library contains only records the person adds to it.

The assistant skill reads `get_creator_context`, obtains source data through the selected apps' existing tools, and calls `propose_video` with an expected revision. The app validates and saves a draft. The host's receipt is required; the skill cannot auto-accept it. `renderApp` performs no source, provider, voice or network call.

The selected canonical programme is published at `/selected/programme` for both the editor and shared voice playback, avoiding a second copy in each surface snapshot. Library and draft grids contain metadata only. The Vakyartha host owns Watch, voice selection, speech synthesis and playback. Video Studio stores no audio/video file and makes no external upload. A short is a copied one-scene programme, so edits do not alter its source show.

## Limits and extension

This version consumes read-only programme exports from News Desk, Market Terminal, Weather Desk and Wish Radar. Each source tool is marked optional, so the catalog lists the source apps as enhancements, not requirements; a missing, turned-off or denied source fails its import with a clear message. It holds at most 100 records and 8 MB of content; a short has no more than two scenes or 120 spoken words. To add another app, that app must export its canonical programme through a reviewed tool, after which Video Studio can declare that exact tool and update its source map and docs. Do not broaden to private app state, arbitrary network or speculative transcript formats. Video Studio never renders, imports or exports video files; a programme played live by Watch is the only video form. A social feed or external account would need a separate explicit design.
