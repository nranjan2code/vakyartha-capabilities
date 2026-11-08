# Video Studio architecture

## Files

- `app.json` declares the two surfaces, shared voice programme, optional app tools, Creator Studio exports, and the creator skill.
- `server.ts` validates source programmes, owns records in `context.state`, imports the selected show, edits scenes, creates one-scene shorts, and derives the two surfaces.
- `surface.json` is the empty library and Creator Studio state generated from `surfaceFile()`.
- `skills/video-creator/SKILL.md` guides source-aware assistant proposals.

## Flow and ownership

The person selects a source and presses Import. One read-only in-process MCP call obtains the app's saved programme; the backend validates and bounds it, attaches source identity, local import time and the source checked time when supplied, then commits a local draft. No timer or app-to-app file access is used. The Creator Studio edits the same canonical scene records. The library contains only records the person adds to it.

The assistant skill reads `get_creator_context`, obtains source data through the selected apps' existing tools, and calls `propose_video` with an expected revision. The app validates and saves a draft. The host's receipt is required; the skill cannot auto-accept it. `renderApp` performs no source, provider, voice or network call.

The selected canonical programme is published at `/selected/programme` on Creator Studio for the editor, header playback and Watch from this scene. Each view carries only its own data, with programmes travelling as the queues that play them: Home holds `homeQueue` (the shows in the chosen source), `shelfQueue` (its shorts) and `libraryQueue` (for resuming); Shorts holds `shortsQueue`; You holds `libraryQueue` for history, `laterQueue` and the chosen playlist's `playlistQueue`. Card rows hold metadata, a cover (the first scene picture or a generated `data:image/svg+xml` title card), the estimated length and an index into their queue. A card is chosen as a whole: its `action` is `voice.watch` with the queue, the index and `progress: "watch_progress"` (shorts add `portrait: true`, resuming adds `from`). `state.channel` is the source chip (empty for All) and `state.later` the Watch later ids (100). The host reports where a programme got to; `watch_progress` keeps `state.progress` (resume part, finished) and `state.history` (newest first, 50). `state.playlists` holds ordered ids (20 lists, 50 each); references to removed videos fall away on normalize. The Vakyartha host owns Watch, voice selection, speech synthesis and playback. Video Studio stores no audio/video file and makes no external upload. A short is a copied one-scene programme, so edits do not alter its source show.

## Limits and extension

This version consumes read-only programme exports from News Desk, Market Terminal and Weather Desk. Each source tool is marked optional, so the catalog lists the source apps as enhancements, not requirements; a missing, turned-off or denied source fails its import with a clear message. It holds at most 100 records and 8 MB of content; a short has no more than two scenes or 120 spoken words. To add another app, that app must export its canonical programme through a reviewed tool, after which Video Studio can declare that exact tool and update its source map and docs. Do not broaden to private app state, arbitrary network or speculative transcript formats. Video Studio never renders, imports or exports video files; a programme played live by Watch is the only video form. A social feed or external account would need a separate explicit design.
