# Weather layouts

Four layouts from the standard components. The offered tool schema decides the exact call shape; these show the nodes and the data. Values come only from tool results.

## 1. Glance card (in the chat)

One place and a short window. Write the numbers into the stats; no records, table or chart.

Example for "Will it rain in Pune tomorrow?" after a `daily` read (index 1 = tomorrow):

```json
{"surface": "weather-pune", "title": "Pune tomorrow", "nodes": [
  {"id": "root", "type": "card", "props": {"title": "Pune, Maharashtra, India", "subtitle": "Tomorrow, Mon 2 Nov"}, "children": [
    {"id": "answer", "type": "text", "props": {"content": "Rain likely in Pune tomorrow: 59% chance, about 3 mm, with rain showers."}},
    {"id": "stats", "type": "grid", "props": {"minItemWidth": "sm"}, "children": [
      {"id": "chance", "type": "stat", "props": {"label": "Rain chance (%)", "value": 59}},
      {"id": "rain", "type": "stat", "props": {"label": "Rain (mm)", "value": 3.1}},
      {"id": "high", "type": "stat", "props": {"label": "High (°C)", "value": 29}},
      {"id": "low", "type": "stat", "props": {"label": "Low (°C)", "value": 21}}]},
    {"id": "source", "type": "text", "props": {"variant": "caption", "content": "Source: Open-Meteo (open-meteo.com), read 1 Nov 2026."}}]}]}
```

- Now: Temperature, Feels like, Humidity, Wind from `current`.
- Air quality: European or US AQI, PM2.5, UV index.
- Add an `alert` with `tone: "warning"` only for a returned hazard: weather code 95, 96 or 99 (thunderstorm), 65 or 82 (heavy rain), or air quality Poor or worse. Name the hazard and the time.

Air-quality words: European AQI 0–20 Good, 20–40 Fair, 40–60 Moderate, 60–80 Poor, 80–100 Very poor, over 100 Extremely poor. US AQI 0–50 Good, 51–100 Moderate, 101–150 Unhealthy for sensitive groups, 151–200 Unhealthy, 201–300 Very unhealthy, over 300 Hazardous.

## 2. Forecast report (canvas)

Three or more days, hours, a date range or an outlook. Copy the tool's `daily` object into data unchanged and map to it:

```json
{"surface": "weather-bengaluru-week", "title": "Bengaluru: next 7 days",
 "data": {"daily": {"time": ["2026-11-01", "2026-11-02"], "temperature_2m_max": [27.1, 26.4], "temperature_2m_min": [19.2, 18.9], "precipitation_sum": [0.4, 6.2], "precipitation_probability_max": [20, 75]}},
 "nodes": [
  {"id": "root", "type": "section", "props": {"title": "Bengaluru, Karnataka, India: next 7 days", "description": "Mild; rain likely Monday."}, "children": [
    {"id": "stats", "type": "grid", "children": [
      {"id": "warmest", "type": "stat", "props": {"label": "Warmest (°C)", "value": {"records": "{/daily}", "field": "temperature_2m_max", "aggregate": "max"}}},
      {"id": "coolest", "type": "stat", "props": {"label": "Coolest (°C)", "value": {"records": "{/daily}", "field": "temperature_2m_min", "aggregate": "min"}}},
      {"id": "total", "type": "stat", "props": {"label": "Total rain (mm)", "value": {"records": "{/daily}", "field": "precipitation_sum", "aggregate": "sum"}}}]},
    {"id": "temps", "type": "chart", "props": {"kind": "line", "xScale": "time", "title": "Daily high and low (°C)", "series": {"records": "{/daily}", "label": "time", "fields": ["temperature_2m_max", "temperature_2m_min"]}}},
    {"id": "days", "type": "table", "props": {"columns": ["Day", "High (°C)", "Low (°C)", "Rain chance (%)", "Rain (mm)"], "rows": {"records": "{/daily}", "fields": ["time", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "precipitation_sum"]}}},
    {"id": "source", "type": "text", "props": {"variant": "caption", "content": "Source: Open-Meteo (open-meteo.com), read 1 Nov 2026. Times are local."}}]}]}
```

The example shows two days; copy every day the tool returned. Leave `daily_units` out of the data (it is not a column); put units in labels.

- Hours: copy `hourly` the same way; line chart with `"label": "time"` and no `xScale`.
- Rain chart (`kind: "bar"`, field `precipitation_sum`) only when some day has rain.
- Archive ranges: "about" in the description. Seasonal and climate: an outlook or scenario, not a forecast.

## 3. Comparison (canvas)

Two or more places. One read per place, then one record per place for the asked day, typed from the returned values:

```json
{"data": {"places": [
  {"place": "Mumbai, Maharashtra, India", "high": 33, "low": 26, "rainChance": 10, "rain": 0},
  {"place": "Delhi, India", "high": 29, "low": 16, "rainChance": 0, "rain": 0}]}}
```

- `section` titled "Weather on <day>: <places>", with a one-sentence finding as its description.
- `table` mapped to `{/places}` (place, high, low, rainChance, rain) and a `chart` `kind: "bar"`, `orientation: "horizontal"`, `"label": "place"`, `"fields": ["high"]`.
- For several days: `tabs`, one `section` per place, each with a table mapped to that place's copied `daily` (data `{"daily_mumbai": ..., "daily_delhi": ...}`).
- The source caption last.

## 4. Which place? (in the chat)

```json
{"nodes": [{"id": "root", "type": "form", "props": {"submit": "choose"}, "children": [
  {"id": "choice", "type": "select", "props": {"label": "Which Springfield?", "bind": "/choice", "options": ["Springfield, Illinois, United States", "Springfield, Missouri, United States"]}},
  {"id": "go", "type": "button", "props": {"label": "Show weather"}}]}], "data": {"choice": ""}}
```

On submit, continue with the chosen place.

## Check before sending

- Stats, chart and table read the same data; the description agrees with them.
- Every number has its unit and its local day or hour.
- The glance card has no table, chart or map.
