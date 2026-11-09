---
name: video-creator
description: Create source-aware watchable shows and short programmes in Video Studio from data the person's Vakyartha apps actually return; keep every result as a reviewable local draft.
metadata:
  author: Vakyartha
  part-of: app:video-studio
  requires: skill:broadcast-programme
allowed-tools: use_skill read_skill_file app-video-studio__get_creator_context app-video-studio__propose_video app-video-studio__propose_edit app-news-desk__get_bulletin app-market-terminal__get_market_brief app-weather-desk__get_weather_briefing
---

# Make a show for Video Studio

Use this when the person wants a Vakyartha programme they can keep and play in Video Studio. Read `get_creator_context` first. It gives the current expectedRevision, source choices, programme shape and limits. Ask which source apps and topic they want if either is unclear. Use only the matching, currently offered source tools; their data is the factual basis for the script. Preserve source names, retrieval or publication times, caveats, and links only when the source returned them.

Use `broadcast-programme` for scene fields, plain spoken copy, attribution and short-form structure. A show uses the full broadcast shape: `cue: "intro"` on the opening, `cue: "sting"` on the first detailed scene, `cue: "outro"` on the closing, `break` between scenes, and `bed: true` on headline scenes; add `chart` or `figures` only from numbers a source returned. A short has no cues. Set the video's `source` to the declared source app name and use each segment's `source` for the actual publisher or data provider. A short has one or two concise scenes and at most 120 spoken words total. Timeline estimates are not measured runtime; the person prepares the selected voice and reviews the portrait composition. Draft a coherent opening, scenes and close when the source supports them; never pad thin data. Keep all important source caveats in narration. Do not invent a transcript, image, chart, fact, or update time.

For a selected-scene revision, use the selected project id and segment from creator context, preserve its factual sources and caveats, obtain a fresh revision and call propose_edit with the proposed heading and spoken text. This saves a reviewable proposal only; it does not change the scene or library. Never invent asset ids or claim media was prepared or playback checked.

After the person agrees on the direction, call `get_creator_context` again for a fresh expectedRevision, then call `propose_video` with the complete programme. It saves an unreviewed draft only. Ask the person to inspect and edit its scenes in Creator Studio before adding it to their local library. A saved programme is not a rendered video file and nothing is posted elsewhere.

If a source app is missing, turned off, or has no saved programme, say which source could not be read. Do not substitute sample content or claim source coverage. A source app that has not exported a programme cannot be used by this version; do not read its private files.
