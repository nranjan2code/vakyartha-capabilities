# Other weather questions and layout choice

## Other questions

| The user asks about | Call |
|---|---|
| A past date, 1940 to yesterday | `open-meteo__weather_archive` with `start_date`, `end_date` (YYYY-MM-DD), `daily`, `"timezone": "auto"` |
| The last few weeks | `open-meteo__weather_forecast` with `past_days` (up to 92) |
| Hours of a day | `open-meteo__weather_forecast` with `hourly` |
| How sure the forecast is | `open-meteo__ensemble_forecast` with an explicit supported `models` value from its schema, e.g. `icon_seamless_eps`; not `best_match` |
| Weeks to months ahead | `open-meteo__seasonal_forecast` (an outlook, not a forecast) |
| Air quality, pollen | `open-meteo__air_quality` with `current` or `hourly`; check regional coverage |
| UV | `open-meteo__weather_forecast` with `daily: ["uv_index_max"]` |
| Waves, sea temperature | `open-meteo__marine_weather` |
| River flooding | `open-meteo__flood_forecast` |
| Climate decades ahead | `open-meteo__climate_projection` (1950 to 2050) |
| Height of a place | `open-meteo__elevation` |

Model-specific forecast tools only when the user names a weather model.

## Layout choice

| The question | Layout | Shows |
|---|---|---|
| One place; now, today, tonight or tomorrow; one past date; current air quality | Glance card | In the chat |
| Three or more days, hours, a date range, an outlook | Forecast report | Canvas |
| Two or more places | Comparison | Canvas |
| Several candidate places | Which place? | In the chat |

- Glance card: stats with the numbers themselves. No table, no chart, no records.
- Reports and comparisons: put the tool's `daily` (or `hourly`) object into surface data **exactly as returned**, and map the table, chart and stats to it with the returned field names. Do not rewrite it into rows.
- Every surface ends with the caption "Source: Open-Meteo (open-meteo.com)".
- Text only when the user asks for text. For a trip or day plan, give only the weather that matters to it.
