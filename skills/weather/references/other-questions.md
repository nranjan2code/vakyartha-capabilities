# Other weather questions

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
