---
name: weather
description: Use when the user asks about weather, a forecast, rain, temperature, wind, past weather on a date, air quality, pollen, UV, sea or wave conditions, river flooding, or the season or climate ahead for a place.

compatibility: Requires the Weather (Open-Meteo) integration, enabled in Integrations.
metadata:
  requires: "integration:open-meteo"
  category: live-data
  author: Vakyartha
  version: "1.0.0"

allowed-tools: read_skill_file use_skill open-meteo__geocoding open-meteo__weather_forecast open-meteo__weather_archive open-meteo__air_quality open-meteo__marine_weather open-meteo__ensemble_forecast open-meteo__seasonal_forecast open-meteo__climate_projection open-meteo__flood_forecast open-meteo__elevation
---

# Weather

Answers come only from the Weather integration (open-meteo.com). Never state weather from memory.

## Access

This connector uses the free public API and supports no paid key or subscription detection. See `references/api-access.md` for service limits and access differences.

## Steps

1. **place**: If no place is named in the request or conversation, ask which place. Otherwise SKIP.
   - kind: ask
   - optional: true
2. **request**: Extract requested place names, forecast days and mode. Tomorrow needs at least two days; seven days means seven. Use forecast for current or future weather, archive for past dates, air for air quality, marine for waves, and other for specialist questions.
   - needs: place
   - output: {"type":"object","properties":{"places":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":8},"days":{"type":"integer","minimum":1,"maximum":16},"mode":{"enum":["forecast","archive","air","marine","other"]}},"required":["places","days","mode"],"additionalProperties":false}
3. **geocode**: Resolve each place. Retain the returned full coordinates, name, admin1 and country. The host supplies the place name. If results are ambiguous, ask which place before using its coordinates.
   - tool: open-meteo__geocoding
   - needs: request
   - each: request /places
   - max: 8
   - arguments: {"name":{"item":""},"count":{"value":3}}
   - effect: read
   - done: has /results/0/latitude
4. **forecast**: Read requested weather. For multi-day comparisons choose daily temperature_2m_max and temperature_2m_min, plus other requested variables. Omit unrelated optional parameters.
   - tool: open-meteo__weather_forecast
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["forecast"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"forecast_days":{"step":"request","pointer":"/days"},"timezone":{"value":"auto"}}
   - effect: read
   - done: has /latitude
5. **archive**: Read each place for the requested past dates using daily or hourly fields and local time. State that these are estimates.
   - tool: open-meteo__weather_archive
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["archive"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
6. **air**: Read requested air quality or pollen for each place. Check regional coverage and returned units.
   - tool: open-meteo__air_quality
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["air"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
7. **marine**: Read requested sea or wave conditions for each place using returned times and units.
   - tool: open-meteo__marine_weather
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["marine"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
8. **specialist**: Read each place with the specialist tool that answers the question; use only supported model and time-range parameters. Read references/other-questions.md for tool choice.
   - tool: open-meteo__ensemble_forecast open-meteo__seasonal_forecast open-meteo__climate_projection open-meteo__flood_forecast open-meteo__elevation
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["other"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"}}
   - effect: read
9. **interpret**: Explain the requested weather implications using the retained reads. Keep dates, local times, units and missing values distinct. Do not invent observations or infer paid access.
   - needs: forecast, archive, air, marine, specialist

## Tool parameters

Send only needed optional parameters. For now/today/tomorrow, omit past_days, past_hours, forecast_hours, start_date, end_date, start_hour, end_hour, tilt, azimuth and models unless specifically requested. Choose one time-range method: relative days, relative hours, explicit dates or explicit hours. Never combine past_days with start_date/end_date. Daily index zero is today; tomorrow is index one. Coordinates come from geocoding without rounding. If weather tools are unavailable, say: Weather is not set up. Open Integrations, install and enable Weather (Open-Meteo), then ask again.

Read `references/other-questions.md` for specialist tool choice, and `references/weather-codes.md` to interpret weather codes. Presentation is handled by Vakyartha over retained results.

## Rules for the numbers

- Quote values as returned, with the units from `*_units`, without rounding retained observations. Name the day or hour, in local time.
- `null` means no value for that time, never zero.
- `truncated: true`: ask for less and call again.
- `weather_code` in words only from `references/weather-codes.md`.
- Archive values are estimates; say "about".
- A parameter error is not a paywall. Read the error and schema; make at most one corrected call only if you can identify and remove the conflict. Never repeat an unchanged failed call or keep changing unrelated fields. If correction fails, say what failed and give no numbers. Rate limits mean wait; authentication/plan errors mean access must be configured, not invented. Tools missing: show the unavailable message exactly.
- Metric units unless the user asks or uses others (`temperature_unit: "fahrenheit"`, `wind_speed_unit: "mph"`, `precipitation_unit: "inch"`).
