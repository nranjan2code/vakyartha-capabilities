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

1. **scope**: Decide whether the user supplied any place to look up. Choose named when the request names a city, region or coordinates. Choose missing only when no place is available.
   - output: {"type":"object","properties":{"place":{"enum":["named","missing"]}},"required":["place"],"additionalProperties":false}
2. **place**: Ask for the place to look up.
   - kind: ask
   - needs: scope
   - when: {"step":"scope","pointer":"/place","oneOf":["missing"]}
3. **request**: Extract places, day count and mode. Tomorrow needs two days. Use forecast for relative days, window for exact dates/hours or recent past, archive for older dates, air for air quality, marine for waves, and other for specialist reads.
   - needs: place
   - output: {"type":"object","properties":{"places":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":8},"days":{"type":"integer","minimum":1,"maximum":16},"mode":{"enum":["forecast","window","archive","air","marine","other"]}},"required":["places","days","mode"],"additionalProperties":false}
4. **geocode**: Resolve each place. Retain the returned full coordinates, name, admin1 and country. The host supplies the place name. If results are ambiguous, ask which place before using its coordinates.
   - tool: open-meteo__geocoding
   - needs: request
   - each: request /places
   - max: 8
   - arguments: {"name":{"item":""},"count":{"value":3}}
   - effect: read
   - done: has /results/0/latitude
5. **forecast**: Read requested relative-day weather. Use daily temperature_2m_max and temperature_2m_min for daily ranges.
   - tool: open-meteo__weather_forecast
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["forecast"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"forecast_days":{"step":"request","pointer":"/days"},"timezone":{"value":"auto"}}
   - model-arguments: daily hourly current temperature_unit wind_speed_unit precipitation_unit
   - effect: read
   - done: has /latitude
6. **window**: Read the requested explicit dates/hours or recent past. Choose one time-range method.
   - tool: open-meteo__weather_forecast
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["window"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
   - done: has /latitude
7. **archive**: Read each place for the requested past dates using daily or hourly fields and local time. State that these are estimates.
   - tool: open-meteo__weather_archive
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["archive"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
8. **air**: Read requested air quality or pollen for each place. Check regional coverage and returned units.
   - tool: open-meteo__air_quality
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["air"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
9. **marine**: Read requested sea or wave conditions for each place using returned times and units.
   - tool: open-meteo__marine_weather
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["marine"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"},"timezone":{"value":"auto"}}
   - effect: read
10. **specialist**: Read each place with the specialist tool that answers the question; use only supported model and time-range parameters. Read references/other-questions.md for tool choice.
   - tool: open-meteo__ensemble_forecast open-meteo__seasonal_forecast open-meteo__climate_projection open-meteo__flood_forecast open-meteo__elevation
   - needs: request, geocode
   - each: geocode ""
   - max: 8
   - when: {"step":"request","pointer":"/mode","oneOf":["other"]}
   - arguments: {"latitude":{"item":"/results/0/latitude"},"longitude":{"item":"/results/0/longitude"}}
   - effect: read
11. **interpret**: Explain the requested weather implications from the retained Open-Meteo reads. Keep dates, local times, units and missing values distinct. Do not invent observations or infer paid access.
   - needs: forecast, window, archive, air, marine, specialist

## Rules for the numbers

- Quote values as returned, with the units from `*_units`, without rounding retained observations. Name the day or hour, in local time.
- `null` means no value for that time, never zero.
- `truncated: true`: ask for less and call again.
- `weather_code` in words only from `references/weather-codes.md`.
- Archive values are estimates; say "about".
- Inspect the error and schema. Retry once only for an identified parameter correction. Rate limits require waiting, and access errors require configuration. Never invent a paywall or values.
- Metric units unless the user asks or uses others (`temperature_unit: "fahrenheit"`, `wind_speed_unit: "mph"`, `precipitation_unit: "inch"`).
