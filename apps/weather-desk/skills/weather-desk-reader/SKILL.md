---
name: weather-desk-reader
description: Read Weather Desk's saved places, weather datasets and briefing with source times and missingness
metadata:
  requires: "skill:weather"
  author: Vakyartha
  part-of: app:weather-desk
allowed-tools: app-weather-desk__list_places app-weather-desk__get_weather app-weather-desk__get_weather_briefing
---

# Weather Desk reader

## Steps

1. **places**: Resolve the requested saved place and its stable placeId from Weather Desk. A saved query does not fetch new weather.
   - tool: app-weather-desk__list_places
   - effect: read
2. **read**: Read saved weather or its briefing with the returned stable placeId. Preserve each dataset's source-local date, UTC retrieval, units, missingness and errors.
   - tool: app-weather-desk__get_weather app-weather-desk__get_weather_briefing
   - needs: places
   - effect: read
   - rounds: 2
3. **interpret**: Explain only the saved evidence and its retrieval age. Keep AQI scales distinct and do not infer official warnings, navigation safety or new source freshness.
   - needs: places, read

## Domain guidance

Load the canonical Vakyartha `weather` skill as the domain procedure. When the request concerns this app's saved weather, call `app-weather-desk__list_places` if an identity is needed, then `get_weather` or `get_weather_briefing` with the explicit stable placeId. Queries read saved data only and cannot establish a new source read. Distinguish source-local estimate/forecast dates, UTC retrieval, returned units, missing values, dataset errors and retrieval age. Never equate US/European AQI with a national local scale. Do not infer flooding, navigation safety or official warnings from these datasets. A fresh request through the Weather integration follows the canonical procedure, offered schemas and normal permissions.

`app-authoring` constructs complete reviewed packages; `app-maintainer` keeps schema/controls/docs in step; `app-debugger` with `debug-error` diagnoses source/admission/projection/commit failures; `app-operator` and `app-admin` inspect shared Background operation, timing, permissions and recovery receipts. Keep running is explicit and persistent, startup and the hourly trigger refresh only core weather/optional air, and the host owns retries and uncertainty review. `broadcast-programme` shapes Listen/Watch from the same records; `weather` owns source interpretation and supported API use.

Skill names/descriptions are selected first; supporting references load through `read_skill_file` only when needed. Skills grant no authority or automatic execution guarantee. App clicks run code without an LLM. The assistant button opens the normal host studio without sending, and explicit Send retains provider/cost context and approvals. No mutation proposal or publication tool is exported. Keep this file and the manifest/handlers synchronized whenever tools, views, lifecycle or supported interpretation changes.

## Shared Access and package review

This package declares 6 integration tools. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Core refresh uses forecast and optional air; search, history, marine and river reads are separate explicit capabilities. Denied specialist access must not disable ordinary local edits or be treated as a forecast failure.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.

## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
