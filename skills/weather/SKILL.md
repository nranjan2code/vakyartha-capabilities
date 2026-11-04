---
name: weather
description: Use when the user asks about weather, a forecast, rain, temperature, wind, past weather on a date, air quality, pollen, UV, sea or wave conditions, river flooding, or the season or climate ahead for a place.

compatibility: Requires the Weather (Open-Meteo) integration, enabled in Integrations.
metadata:
  requires: "skill:interactive-ui integration:open-meteo"
  category: live-data
  author: Vakyartha
  version: "1.1.0"
  loads-with: "interactive-ui"
  requires-read: "true"
  requires-canvas: "true"
  unavailable-message: "Weather is not set up. Open Integrations, install and enable Weather (Open-Meteo), then ask again."
allowed-tools: read_skill_file use_skill vak_render vak_update vak_submit open-meteo__geocoding open-meteo__weather_forecast open-meteo__weather_archive open-meteo__air_quality open-meteo__marine_weather open-meteo__ensemble_forecast open-meteo__seasonal_forecast open-meteo__climate_projection open-meteo__flood_forecast open-meteo__elevation
---

# Weather

Answers come only from the Weather integration (open-meteo.com). Never state weather from memory.

## Access and plans

The current Weather connector uses the **free public API only**, with no key or account. Current conditions, forecasts, historical weather, air quality, marine, flood, ensemble, seasonal, climate and elevation tools are available for non-commercial use within service limits. A paid chat model does not purchase weather access.

There is **no weather subscription detection or paid-key support** in this connector. Never infer a weather plan from the model, a subscription mentioned in chat, or the presence of an API key. Use only tools currently offered by the integration; discovery cannot enable paid access. Commercial use requires a suitable weather plan and a connector that actually supports it; paying alone does not configure this connector. For service limits and paid plan differences, read `references/api-access.md` when needed.

## Steps, every time, in order

1. **Find the place.** Call `open-meteo__geocoding`, even for a well-known city:
   `{"name": "Pune", "count": 3}`
   Use the first result's `latitude`, `longitude`, `name`, `admin1` and `country`. If two results are different places people could mean, ask which one (`references/layouts.md`, "Which place?"). No place in the question or the conversation: ask for one.
2. **Read the weather** with those coordinates and `"timezone": "auto"`, so days are the place's own days:
   - Days: `{"latitude": 18.52, "longitude": 73.86, "timezone": "auto", "forecast_days": 2, "daily": ["temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "precipitation_sum", "weather_code"]}`
   - Now: `{"latitude": 18.52, "longitude": 73.86, "timezone": "auto", "forecast_days": 1, "current": ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "weather_code", "wind_speed_10m"]}`
   In `daily`, index 0 is today and index 1 is tomorrow. `forecast_days` is the number of days needed, at most 16.
   **Send only needed parameters.** Optional fields are omitted, not filled with empty strings, zeroes, empty arrays or invented dates. For now/today/tomorrow, omit `past_days`, `past_hours`, `forecast_hours`, `start_date`, `end_date`, `start_hour`, `end_hour`, `tilt`, `azimuth` and `models` unless the question specifically needs one. Choose a single time-range method: relative days, relative hours, explicit dates, or explicit hours. Never combine `past_days` with `start_date`/`end_date`.
3. **Publish the result.** Read `references/layouts.md` with `read_skill_file` (`skill: "weather"`, `path: "references/layouts.md"`). If surface tools are not loaded, call `discover_tools` with `query: "surfaces"`, then use the returned authoring tool on the next step. Publish the matching layout as a surface; the one-place glance card stays inline in chat. Include the place, returned values and units, the returned local observation time, and the source caption in that surface. Only then finish with one short sentence. `respond` alone does not publish a surface. If a text-only response is rejected for missing output, load the surface tools and publish; do not repeat the rejected response or reload an already loaded skill.

## More detail

For a question the steps do not cover, or to choose the layout, read `references/other-questions-and-layout.md` with read_skill_file.

## Rules for the numbers

- Quote values as returned, with the units from `*_units`, rounded to whole degrees and percent. Name the day or hour, in local time.
- `null` means no value for that time, never zero.
- `truncated: true`: ask for less and call again.
- `weather_code` in words only from `references/weather-codes.md`.
- Archive values are estimates; say "about".
- A parameter error is not a paywall. Read the error and schema; make at most one corrected call only if you can identify and remove the conflict. Never repeat an unchanged failed call or keep changing unrelated fields. If correction fails, say what failed and give no numbers. Rate limits mean wait; authentication/plan errors mean access must be configured, not invented. Tools missing: show the unavailable message exactly.
- Metric units unless the user asks or uses others (`temperature_unit: "fahrenheit"`, `wind_speed_unit: "mph"`, `precipitation_unit: "inch"`).
