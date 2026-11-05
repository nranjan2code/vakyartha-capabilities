# Weather Desk

A dedicated local weather workspace for up to five explicitly chosen places. Ordinary code refreshes and projects source records without a model request per action.

## Start here

Install and enable **Weather (Open-Meteo)** through Integrations. Search needs `geocoding`; the core refresh needs `weather_forecast` and, by default, `air_quality`. App calls require this app’s tool/mode/destination grant. Integration Ask can be satisfied by scoped consent; integration Off remains a ceiling. Explore additionally uses `weather_archive`, `marine_weather` and `flood_forecast` on explicit reads. These six tools are the entire declared tool entitlement. No API key is needed; this connector uses free public, non-commercial access with service limits, no account detection and no paid-key transport.

Open **Places**, type or dictate a city/postal code, choose the right result, and save it. Search does not select the first match. Saving is local and makes no weather request. Press the shared **Refresh** in the header to read all saved places. The compact header place selector changes every relevant view and briefing without fetching or starting playback.

| View | Implemented behavior |
| --- | --- |
| Today | A live sky for the place's current condition and time of day; a hero with the condition symbol, temperature, feels-like and high/low; a 24-hour scrolling strip; 10 days on one shared temperature scale; detail tiles (feels like, humidity, wind and direction, gusts, rain chance, precipitation, UV, sunrise, sunset, US AQI) and a 24-hour temperature plot when values are complete. An explicit assistant button opens the shared inert studio to discuss saved facts. |
| Forecast & planning | Up to 16 local days as aligned range rows, a 48-hour strip, a 48-hour temperature and precipitation-probability view, exact paged tables, explicit daily CSV export, and daylight runs matching the person's rain/wind limits. |
| Air quality | The US AQI with its US EPA category gauge, separate US and European AQI, modelled pollutants, exact hourly values and a US AQI chart when complete. These scales are never presented as a national local AQI or sensor reading. |
| Places | Bounded search, explicit save/open, five-place overview with each place on its own live sky and reviewed two-step removal. |
| Explore | Explicit past reanalysis (1940 onward, 1–31 days ending before local today), 48 marine source hours and seven river-discharge days. Latest successful range remains visible after a failed read. |
| Sources & preferences | Unit preference, optional air refresh, core freshness and the last 40 source-read receipts. |

Motion is gentle and stops with the system's reduced-motion setting. The sky and symbols are decoration from saved source fields; every value is also in text.

Listen and Watch use one programme derived from those same records: current estimate, up to three forecast days, air-quality attribution, source times and caveats. The host owns the voice picker, synthesis, playback, captions, Watch stage and stop controls. Real voice quality and microphone operation require a separate listening check. Dictating a place uses the host's normal voice settings. Opening the assistant never sends; explicit Send uses the existing skills/provider/tool approvals and FinOps pipeline. App code has no model capability.

## Facts, units and dates

`context.state` schema 1 is the sole data owner. Each place is identified by its geocoded latitude/longitude pair and retains the returned timezone. Conditions/hourly, daily, air, historical, marine and river datasets retain separate UTC retrieval times, returned local source times, grid coordinates, units and failures. Only the latest successful snapshot of each kind per place is retained. Refresh reads conditions plus 48 hours, then 16 daily forecasts, then optional two-day air quality: at most 15 sequential tool calls across five places, within the shared 16-call / 30-second invocation bounds. A timeout commits none of that invocation's changes; host receipts distinguish this from individual caught source failures.

Weather requests specify metric units. Main weather views and CSV convert temperature, wind and precipitation deterministically to metric/imperial display; raw source values stay metric. Explore retains labelled metric/source units, air retains source units, and planning wind thresholds always use km/h. Null remains missing, never zero. Standard charts require complete finite numeric series: a missing reading suppresses the affected chart with an explanation and leaves the full table available. Hourly chart categories are local source labels, not an asserted continuous UTC axis. Source-local calendar dates are never parsed in the computer's timezone.

Reads older than two hours are labelled as needing refresh. Freshness is a retrieval-age indicator, not proof of a live station observation or an unchanged model run. The visible source timestamps remain authoritative. Failed reads retain prior successful data, keep dataset-specific errors and suppress planning matches when conditions failed or became stale. Every receipt distinguishes success, zero records and failure; the last 40 remain, including after a place is removed.

Planning matches require at least two consecutive daylight hourly records with known precipitation probability and sustained wind below both inclusive limits (defaults 30% and 25 km/h). The label identifies hourly record starts, including the last matching hour. These matches do not assess gusts, air quality, UV, storm codes or emergency warnings, and do not establish safety. Later forecast days are less certain. River discharge does not establish flooding. Marine grid cells may differ from a city and can be unavailable inland. Historical estimates may be delayed. Source references: [forecast](https://open-meteo.com/en/docs), [air](https://open-meteo.com/en/docs/air-quality-api), [archive](https://open-meteo.com/en/docs/historical-weather-api), [marine](https://open-meteo.com/en/docs/marine-weather-api), [rivers](https://open-meteo.com/en/docs/flood-api).

CSV is generated from the same daily records, with place, timezone, local date, explicit units, missing fields, condition, retrieval UTC and source. **Export daily forecast CSV** delegates to the host's safe Downloads writer. A browser download request is not a certified native saved-file receipt.

## Background, queries and recovery

The shared Background operation control is inside the app and Operation Center. **Keep running** is explicit and persistent; its startup handler performs the real core refresh, idempotently replacing source snapshots. The declared app schedule is hourly. Host timing can select Manual only or a bounded interval independently of manual Refresh. Only core weather/optional air is automatic; Explore and geocoding never run on a timer. Vakyartha must be running and the computer awake. The host owns scheduling, bounded safe retries, exact-run uncertainty review and recovery. No package timer or background process exists. Updates stop background operation for renewed review.

Read-only local exports `app-weather-desk__list_places`, `app-weather-desk__get_weather` and `app-weather-desk__get_weather_briefing` read saved state only; the latter two accept optional `placeId`. They never fetch, synthesize, mutate or advance the app revision. The exported `weather-desk-reader` loads the canonical `weather` domain procedure. Internal MCP opens no ports. There are no mutating exports, content proposals or separate data stores.

On missing access, use the header Access shield; integration setup opens inside the app panel. Inspect source errors and host run receipts before retrying. Invalid/truncated source data is rejected; it never becomes a successful read. No guessed recovery request, hidden integration installation or model-generated source fact is used. Removing a place deletes all its snapshots after explicit local review. There is no app reset shortcut, stored history accumulation, radar, official warning feed, push notification, location tracking, paid weather support or computer-off execution.

## Verification

Run `node --test test/weather-desk.test.ts`, `npm run typecheck`, `npm run build`, `node scripts/weather-desk-check.ts` and `npm run docs:check`. The dedicated journey uses the real supervised sandbox and wide/narrow WebKit with synthetic source shapes; it forbids model/speech calls. Source snapshots are generated from `surfaceFile()` and tested exactly. Live connector/source-value checks and actual native export/audio receipts are separate from deterministic fixture/UI checks; see the repository handover for the current evidence and limits. A source package in this checkout does not update the installed desktop executable.

## Shared Access and package review

This package declares 6 integration tools. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Core refresh uses forecast and optional air; search, history, marine and river reads are separate explicit capabilities. Denied specialist access must not disable ordinary local edits or be treated as a forecast failure.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
