---
name: weather
description: Use when the user asks about weather, a forecast, rain, temperature, wind, past weather on a date, air quality, pollen, UV, sea or wave conditions, river flooding, or the season or climate ahead for a place.

compatibility: Requires the Weather (Open-Meteo) integration, enabled in Integrations.
metadata:
  requires: "integration:open-meteo"
  category: live-data
  author: Vakyartha
  version: "1.2.0"

allowed-tools: read_skill_file use_skill open-meteo__geocoding open-meteo__weather_forecast open-meteo__weather_archive open-meteo__air_quality open-meteo__marine_weather open-meteo__ensemble_forecast open-meteo__seasonal_forecast open-meteo__climate_projection open-meteo__flood_forecast open-meteo__elevation
---

# Weather

Answers come only from the Weather integration (open-meteo.com). Never state weather from memory.

## Access

This connector uses the free public API and supports no paid key or subscription detection. See `references/api-access.md` for service limits and access differences.

## Steps

1. **request**: List each place the person names, now or earlier: written as they wrote it, lookup the same in Latin letters; empty if none. Mode, days: see Modes.
   - output: {"type":"object","properties":{"places":{"type":"array","maxItems":8,"items":{"type":"object","properties":{"written":{"type":"string"},"lookup":{"type":"string"}},"required":["written","lookup"]}},"days":{"type":"integer","minimum":2,"maximum":7},"mode":{"enum":["forecast","window","archive","air","marine","other"]}},"required":["places","days","mode"]}
   - done: grounded /places/*/written, copies /places lookup written
2. **geocode**: Resolve each place. Retain the returned full coordinates, name, admin1 and country. The host supplies the place name.
   - tool: open-meteo__geocoding
   - needs: request
   - each: request /places
   - max: 8
   - if-item-fails: drop
   - if-empty: ask
   - arguments: {"name":{"item":"/lookup"},"count":{"value":3}}
   - effect: read
   - valid-for: 86400
   - done: has /results/0/latitude
3. **forecast**: Read relative-day weather. Use daily temperature_2m_max and temperature_2m_min for ranges.
   - tool: open-meteo__weather_forecast
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["forecast"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"forecast_days":{"step":"request","pointer":"/days"},"timezone":{"value":"auto"}}
   - model-arguments: daily hourly current temperature_unit wind_speed_unit precipitation_unit
   - effect: read
   - done: has /latitude
4. **window**: Read the requested explicit dates/hours or recent past. Choose one time-range method.
   - tool: open-meteo__weather_forecast
   - needs: request, geocode
   - read: references/other-questions.md
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["window"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
   - done: has /latitude
5. **archive**: Read each place for the requested past dates using daily or hourly fields and local time. State that these are estimates.
   - tool: open-meteo__weather_archive
   - needs: request, geocode
   - read: references/other-questions.md
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
8. **specialist**: Read each place with the specialist tool that answers the question; use only supported model and time-range parameters.
   - tool: open-meteo__ensemble_forecast open-meteo__seasonal_forecast open-meteo__climate_projection open-meteo__flood_forecast open-meteo__elevation
   - needs: request, geocode
   - read: references/other-questions.md
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["other"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"}}
   - effect: read
9. **interpret**: Explain the requested weather from the retained Open-Meteo reads, naming each place as geocoding resolved it, with its region and country, and any listed place it did not find. Keep dates, local times, units and missing values distinct; invent nothing.
   - needs: request, geocode, forecast, window, archive, air, marine, specialist
   - read: references/weather-codes.md

## Modes

- forecast: relative days (today, tomorrow, this weekend). Days counts from today, so tomorrow is 2; a week is the most read.
- window: exact dates or hours, or the recent past.
- archive: dates before the recent past.
- air: air quality or pollen. marine: waves or sea. other: ensembles, seasons, climate, river flooding or elevation.

## Rules for the numbers

- Quote values as returned, with the units from `*_units`, without rounding retained observations. Name the day or hour, in local time.
- `null` means no value for that time, never zero.
- `truncated: true`: ask for less and call again.
- `weather_code` in words only from `references/weather-codes.md`.
- Archive values are estimates; say "about".
- Inspect the error and schema. Retry once only for an identified parameter correction. Rate limits require waiting, and access errors require configuration. Never invent a paywall or values.
- Metric units unless the user asks or uses others (`temperature_unit: "fahrenheit"`, `wind_speed_unit: "mph"`, `precipitation_unit: "inch"`).
