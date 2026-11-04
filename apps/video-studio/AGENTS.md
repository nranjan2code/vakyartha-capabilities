# Video Studio package rules

Read this file, README.md, SKILLS.md and ARCHITECTURE.md before changing the package, then read the app-authoring and broadcast-programme procedures.

- `context.state.videos` is the sole owner of imported shows and shorts. A saved item contains a bounded programme snapshot, its source label, local import time, source checked time when supplied, and draft/library status. Do not read another app's files or add a second media store.
- Only the four declared app programme tools may be called, and only by the explicit `import_source` action or the creator skill. Calls are read-only and optional. No schedule, raw network, model call, credential or external posting belongs here.
- `programme()` bounds and validates untrusted source data before saving. Keep original attribution and available source times. Missing fields stay missing. `renderApp` only rebuilds from retained state.
- The source app's programme is the visual and spoken source of truth. Scene edits update this same canonical record. Header Watch/Listen receives its programme from that record. Do not author a separate narration, audio or rendered-video store.
- A short is one selected scene copied into a new local draft, including the current unsaved narration edit when that scene is selected. It is limited to 120 spoken words and remains a programme for the existing Watch stage; do not describe it as MP4 or a 9:16 render.
- Keep at most 100 items and 8 MB of serialized programme content; check limits before every write and preserve the explicit two-step remove control.
- Assistant content is an unreviewed proposal. `propose_video` requires the expected app revision and never adds the item to the library. Only the person's explicit Add to library action changes its local status.
- Keep both surfaces concise, use bounded searchable grids for long collections and a responsive storyboard/inspector split in Creator Studio, preserve current selection while editing, and show an honest empty/source-error state. Keep programme content in one selected record path for both editing and Watch/Listen. Update this document, README.md, SKILLS.md, ARCHITECTURE.md and the package test with every behavior change.
- Run the package test and catalog checks. Before publication, rehearse each source in the sandbox, verify the Watch flow in native WebKit, then let the owner set versions and sign the catalog release.
