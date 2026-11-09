# Video Studio package rules

Read README.md, ARCHITECTURE.md and SKILLS.md, plus the app-authoring and broadcast-programme procedures, before changing this package.

- context.state.videos is the only project writer. Keep working programme, reviewed snapshot, proposal, parent and bounded edit history together. Shared Media owns asset bytes; keep references only.
- Programmes are the output, played inside Vakyartha. Video/audio/image files are composition inputs. Never render/export a finished video, record a camera/screen or post externally.
- Read only the three exact declared source app exports through their per-source import/append actions or creator skill. Calls are optional and explicit. Preserve attribution, dates and original values; no raw network, source files, direct model call, timer or background schedule.
- Validate untrusted inputs and every composition write. Saved words are bounded without rewriting. Keep unreadable records unchanged and retain two-step removal. Failed commands commit nothing.
- Working edits never silently replace the reviewed library snapshot. Library queues use accepted content; preview uses the working programme. Shorts keep a separate parent reference and source identity, independent content and intersecting media.
- Use public Projection workspace, stage, media-track, field and icon controls. Fit the viewport; keep timeline and preview visible and use focused narrow panes. Grid, snapping, positions and lengths share one time scale. No model work for routine editing, opening or refresh.
- Playback, voice preparation/caching, asset resolution and transport belong to the host. One clock pauses/seeks/stops the whole composition. No second player, asset store or narration store. Estimates remain estimates until measured.
- Proposals are unreviewed. Mutating exports require integer expectedRevision at the host boundary and never accept content automatically. Selected-scene acceptance leaves the reviewed library version alone.
- Keep the 100-project, 80-scene, 400-clip, four-hour and 8 MB bounds, twelve undo snapshots and eight checkpoints. Short acceptance validates 120 words after editing. Validate referenced scenes/assets and preserve linked timings on edits.
- Update all four package documents, creator skill and tests with behavior changes. Run package and catalog checks, then native WebKit journeys with real media and source exports. Owner steps for versions, signing and release stay human.
