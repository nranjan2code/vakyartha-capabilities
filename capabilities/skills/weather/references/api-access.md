# Weather API access

Verified against the service pricing and forecast documentation on 2 November 2026. Recheck the official sources before advising on a purchase or changed limits:

- [Service plans](https://open-meteo.com/en/pricing)
- [Forecast parameters](https://open-meteo.com/en/docs)

| Access | Capabilities and limits |
| --- | --- |
| Current connector | Free public endpoints only. No API key, account lookup or subscription detection. All seventeen reviewed tools use public endpoints; the current server tool list and user policies still determine what is offered. |
| Free public service | Non-commercial use; 600 calls/minute, 5,000/hour, 10,000/day and 300,000/month; no uptime guarantee. Forecast, air quality, elevation, flood, geocoding, marine, historical, ensemble, seasonal and climate APIs are listed as available. Coverage, variables, date ranges and freshness differ by endpoint. |
| Paid Standard service | Commercial use, reserved infrastructure and a monthly call allowance. Forecast, air quality, elevation, flood, geocoding and marine APIs. Does not include the historical, ensemble, seasonal or climate APIs. |
| Paid Professional or Enterprise service | Adds those additional datasets and higher monthly allowances. Must use the appropriate customer endpoint and key through a supporting connector. This connector cannot do that. |

Do not remove a free historical/ensemble/climate tool merely because it requires a higher plan on the paid service. Conversely, a paid model or a declared subscription does not enable a paid weather endpoint. Unknown account access remains unknown until a supporting integration verifies it. A key's presence alone cannot establish a plan, quota, licence or remaining credits.

HTTP 400 means invalid parameters; 429 means a rate limit; service/authentication errors must be reported as returned. The Noida failure sent both `past_days` and explicit start/end dates. A current-weather call needs only the returned coordinates, `timezone: "auto"`, `forecast_days: 1` and the requested `current` variables. Changing plan does not resolve that parameter conflict.
