import { condition, convert, fmt, label, localNow, measure, number, stale, unit, type Dataset, type Kind, type Units } from './data.ts';
import { normalize, selected, type Location, type State } from './server.ts';

interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
export interface Update { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] }
export const TITLES: Record<string, string> = { today: 'Today', forecast: 'Forecast & planning', air: 'Air quality', places: 'Places', explore: 'Explore', sources: 'Sources & preferences' };
const SOURCE = 'Source: [Open-Meteo](https://open-meteo.com/) · Air quality: [CAMS via Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) · Place search: GeoNames.';
const v = (d: Dataset | undefined, field: string, i?: number, daily = false) => i === undefined ? d?.current[field] : (daily ? d?.daily : d?.hourly)?.[field]?.[i];
const humanDate = (date: string) => new Date(date.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const when = (d: Dataset | undefined) => d ? `Retrieved ${d.at.replace('T', ' ').replace('.000Z', ' UTC')}` : 'No successful read yet';
const sourceTime = (d: Dataset | undefined) => d?.current.time ? `${d.current.time} · ${d.timezone}` : 'Current estimate time unavailable';
const timeLabel = (t: string) => `${t.slice(5, 10)} ${t.slice(11, 16)}`;
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export function dailyRows(p: Location | undefined, units: Units) {
  const d = p?.readings.forecast;
  return (d?.daily.time ?? []).map((t, i) => ({ date: String(t), day: humanDate(String(t)), condition: condition(v(d, 'weather_code', i, true)), low: convert(v(d, 'temperature_2m_min', i, true), 'temperature', units), high: convert(v(d, 'temperature_2m_max', i, true), 'temperature', units), rain: convert(v(d, 'precipitation_sum', i, true), 'rain', units), chance: number(v(d, 'precipitation_probability_max', i, true)), wind: convert(v(d, 'wind_speed_10m_max', i, true), 'wind', units), uv: number(v(d, 'uv_index_max', i, true)), sunrise: v(d, 'sunrise', i, true) ?? 'Unavailable', sunset: v(d, 'sunset', i, true) ?? 'Unavailable' }));
}
export function hourlyRows(p: Location | undefined, s: State, now: string) {
  const d = p?.readings.conditions, cutoff = p ? localNow(d?.timezone ?? p.timezone, now).slice(0, 13) + ':00' : '';
  return (d?.hourly.time ?? []).flatMap((t, i) => typeof t !== 'string' || t < cutoff ? [] : [{ time: t, label: timeLabel(t), temperature: convert(v(d, 'temperature_2m', i), 'temperature', s.units), feels: convert(v(d, 'apparent_temperature', i), 'temperature', s.units), chance: number(v(d, 'precipitation_probability', i)), rain: convert(v(d, 'precipitation', i), 'rain', s.units), wind: convert(v(d, 'wind_speed_10m', i), 'wind', s.units), windMetric: number(v(d, 'wind_speed_10m', i)), daylight: v(d, 'is_day', i) === 1, condition: condition(v(d, 'weather_code', i)) }]);
}
export function windows(p: Location | undefined, s: State, now: string) {
  if (!p || stale(p.readings.conditions, now) || p.errors.conditions) return [];
  const out: { start: string; end: string; hours: number; chance: number; wind: number }[] = [];
  let current: typeof out[number] | undefined;
  for (const h of hourlyRows(p, s, now)) {
    // Wind thresholds stay in km/h even when display units change. Missing
    // probability, wind or daylight cannot qualify an hour as a match.
    const ok = h.daylight && h.chance !== null && h.windMetric !== null && h.chance <= s.maxRain && h.windMetric <= s.maxWind;
    const contiguous = current && Date.parse(h.time + 'Z') - Date.parse(current.end + 'Z') === 3600_000;
    if (ok && contiguous) { current!.end = h.time; current!.hours++; current!.chance = Math.max(current!.chance, h.chance!); current!.wind = Math.max(current!.wind, h.windMetric!); }
    else { if (current && current.hours >= 2) out.push(current); current = ok ? { start: h.time, end: h.time, hours: 1, chance: h.chance!, wind: h.windMetric! } : undefined; }
  }
  if (current && current.hours >= 2) out.push(current);
  return out;
}
function freshness(p: Location | undefined, now: string) {
  if (!p) return 'Save a place, then use Refresh in the header to read its weather.';
  const d = p.readings.conditions;
  return `${stale(d, now) ? 'Saved conditions need a refresh. ' : 'Recent source read. '}${sourceTime(d)}. ${when(d)}. Modelled estimates, not a local weather-station observation.`;
}
function summary(p: Location | undefined, s: State, now: string) {
  if (!p) return 'Your weather starts with a place. Search by city or postal code in Places.';
  const d = p.readings.conditions, today = localNow(d?.timezone ?? p.timezone, now).slice(0, 10), day = dailyRows(p, s.units).find(r => r.date === today);
  return `${label(p)}. ${condition(v(d, 'weather_code'))}. Temperature ${measure(v(d, 'temperature_2m'), 'temperature', s.units)}; feels like ${measure(v(d, 'apparent_temperature'), 'temperature', s.units)}.${day ? ` For ${humanDate(day.date)}, ${fmt(day.low, unit('temperature', s.units))} to ${fmt(day.high, unit('temperature', s.units))}; precipitation chance ${fmt(day.chance, '%')}.` : ' No daily forecast for the current local date.'}`;
}
const speechMeasure = (n: unknown, kind: 'temperature' | 'wind', units: Units) => number(n) === null ? 'unavailable' : `${Math.round(convert(n, kind, units)!)} ${kind === 'temperature' ? units === 'metric' ? 'degrees Celsius' : 'degrees Fahrenheit' : units === 'metric' ? 'kilometres per hour' : 'miles per hour'}`;
export function programme(p: Location | undefined, s: State, now: string) {
  const d = p?.readings.conditions, days = dailyRows(p, s.units).filter(r => r.date >= localNow(p?.timezone ?? 'UTC', now).slice(0, 10)).slice(0, 3);
  const parts: Record<string, unknown>[] = [{ delivery: 'opening', cue: 'intro', kicker: 'Weather Desk', heading: p ? label(p) : 'Choose your place', source: 'Open-Meteo', text: p ? `Hello, and welcome to Weather Desk for ${label(p)}. ${d ? `The current estimate is for ${d.current.time}, in ${d.timezone.replace(/_/g, ' ')}. Data was retrieved at ${d.at}.` : 'There are no saved current conditions yet.'} ${stale(d, now) ? 'The saved conditions need a refresh.' : ''} ${p.errors.conditions ? 'The latest conditions read failed. Any figures are from the earlier saved read.' : ''}` : 'Hello, and welcome to Weather Desk. Save a place and refresh to hear a weather briefing.' }];
  if (d) parts.push({ delivery: 'headline', break: 'short', bed: true, kicker: 'Current estimate', heading: condition(v(d, 'weather_code')), source: 'Open-Meteo', at: d.at, text: `${condition(v(d, 'weather_code'))}. The temperature is ${speechMeasure(v(d, 'temperature_2m'), 'temperature', s.units)}. It feels like ${speechMeasure(v(d, 'apparent_temperature'), 'temperature', s.units)}. Wind is ${speechMeasure(v(d, 'wind_speed_10m'), 'wind', s.units)}.`, figures: [{ label: 'Temperature', value: measure(v(d, 'temperature_2m'), 'temperature', s.units) }, { label: 'Feels like', value: measure(v(d, 'apparent_temperature'), 'temperature', s.units) }, { label: 'Wind', value: measure(v(d, 'wind_speed_10m'), 'wind', s.units) }] });
  for (const [i, day] of days.entries()) parts.push({ delivery: 'story', ...(i === 0 ? { cue: 'sting' } : {}), break: 'story', kicker: 'Daily forecast', heading: `${humanDate(day.date)} · ${day.condition}`, source: 'Open-Meteo', at: p!.readings.forecast!.at,
    text: `For ${humanDate(day.date)}, the forecast is ${day.condition.toLowerCase()}. The low is ${day.low === null ? 'unavailable' : `${Math.round(day.low)} degrees ${s.units === 'metric' ? 'Celsius' : 'Fahrenheit'}`}, and the high is ${day.high === null ? 'unavailable' : `${Math.round(day.high)} degrees ${s.units === 'metric' ? 'Celsius' : 'Fahrenheit'}`}. Precipitation probability is ${day.chance === null ? 'unavailable' : `${Math.round(day.chance)} percent`}.${stale(p!.readings.forecast, now) || p!.errors.forecast ? ' This daily forecast needs a refresh.' : ''}`,
    figures: [{ label: 'Low', value: fmt(day.low, unit('temperature', s.units)) }, { label: 'High', value: fmt(day.high, unit('temperature', s.units)) }, { label: 'Rain chance', value: fmt(day.chance, '%') }] });
  const air = p?.readings.air;
  if (air) parts.push({ delivery: 'aside', break: 'section', kicker: 'Modelled air quality', heading: 'US and European AQI scales', source: 'CAMS via Open-Meteo', at: air.at, text: `Turning to air quality. The estimate is for ${air.current.time ?? 'an unavailable time'}, in ${air.timezone}. The United States air quality index is ${number(v(air, 'us_aqi')) ?? 'unavailable'}. The European index is ${number(v(air, 'european_aqi')) ?? 'unavailable'}. These are different scales.${stale(air, now) || p?.errors.air ? ' This air quality read needs a refresh.' : ''}`, figures: [{ label: 'US AQI', value: fmt(v(air, 'us_aqi')) }, { label: 'European AQI', value: fmt(v(air, 'european_aqi')) }] });
  parts.push({ delivery: 'closing', cue: 'outro', kicker: 'Source & limits', heading: 'Forecasts can change', source: 'Open-Meteo', text: 'These are modelled estimates from Open-Meteo. Forecasts can change, and this app does not carry official emergency warnings. Thanks for listening to Weather Desk.' });
  return { title: 'Weather Desk', badge: stale(d, now) ? 'Saved / needs refresh' : 'Modelled forecast', segments: parts };
}
function build(surface: string, data: Record<string, unknown>, content: (b: Builder) => string[], warning: string, source = SOURCE): Update {
  const nodes: Node[] = [];
  const b: Builder = {
    node(id, type, props = {}, children) { nodes.push({ id, type, props, ...(children ? { children } : {}) }); return id; },
    text(id, content, variant = 'body') { return this.node(id, 'text', { content, variant }); },
    button(id, label, action, payload = {}, style = 'secondary') { return this.node(id, 'button', { label, action, payload, style }); },
    table(id, title, path, fields, columns) { return this.node(id, 'section', { title }, [this.node(`${id}-table`, 'table', { columns, rows: { records: `{/${path}}`, fields }, searchable: true, sortable: true, pageSize: 8 })]); },
  };
  const children = content(b);
  if (warning) children.unshift(b.node('read-warning', 'alert', { title: 'Latest read needs attention', body: warning, tone: 'warning' }));
  children.push(b.text('source-caption', source, 'caption'));
  nodes.unshift({ id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children });
  return { surface, nodes, data: [{ op: 'replace', path: '/', value: data }] };
}
interface Builder {
  node(id: string, type: string, props?: Record<string, unknown>, children?: Node['children']): string;
  text(id: string, content: string, variant?: string): string;
  button(id: string, label: string, action: string, payload?: Record<string, unknown>, style?: string): string;
  table(id: string, title: string, path: string, fields: string[], columns: string[]): string;
}
const empty = (b: Builder, message: string) => [b.text('empty', message), b.button('choose-place', 'Choose a place', 'open_places')];
function chart(b: Builder, id: string, title: string, path: string, fields: string[], _names: string[], kind = 'line') {
  return b.node(id, 'chart', { kind, title, series: { records: `{/${path}}`, label: 'label', fields }, height: 'md', yScale: 'zero' });
}
export function view(input: unknown, now = new Date().toISOString()): Update[] {
  const s = normalize(input), p = selected(s), d = p?.readings.conditions, f = p?.readings.forecast, a = p?.readings.air;
  const warning = (kinds: Kind[]) => p ? kinds.flatMap(k => p.errors[k] ? [`${k}: ${p.errors[k]}`] : []).join(' ') : '';
  const hours = hourlyRows(p, s, now), days = dailyRows(p, s.units), matches = windows(p, s, now);
  const currentDay = days.find(day => day.date === localNow(p?.timezone ?? 'UTC', now).slice(0, 10));
  const tempUnit = unit('temperature', s.units), windUnit = unit('wind', s.units), rainUnit = unit('rain', s.units);
  const common = { place: p ? label(p) : 'No place selected', summary: summary(p, s, now), freshness: freshness(p, now), selected: s.selected, placeOptions: s.locations.map(p => ({ value: p.id, label: p.name })), spoken: { programme: programme(p, s, now) } };
  const stats = [
    { label: 'Temperature', value: measure(v(d, 'temperature_2m'), 'temperature', s.units) }, { label: 'Feels like', value: measure(v(d, 'apparent_temperature'), 'temperature', s.units) },
    { label: 'Humidity', value: fmt(v(d, 'relative_humidity_2m'), '%') }, { label: 'Wind', value: measure(v(d, 'wind_speed_10m'), 'wind', s.units) },
  ];
  const forecastCSV = [['place', 'timezone', 'date', `low_${tempUnit}`, `high_${tempUnit}`, `precipitation_${rainUnit}`, 'precipitation_probability_percent', `wind_max_${windUnit}`, 'uv_index_max', 'condition', 'retrieved_at_utc', 'source'], ...days.map(r => [p ? label(p) : '', f?.timezone, r.date, r.low, r.high, r.rain, r.chance, r.wind, r.uv, r.condition, f?.at, 'https://open-meteo.com/'])].map(row => row.map(csvCell).join(',')).join('\r\n');
  const today = build('today', { ...common, stats, hours: hours.slice(0, 24), details: currentDay ? [{ label: 'Low / high', value: `${fmt(currentDay.low, tempUnit)} / ${fmt(currentDay.high, tempUnit)}` }, { label: 'Rain chance', value: fmt(currentDay.chance, '%') }, { label: 'Daily precipitation', value: fmt(currentDay.rain, rainUnit, 2) }, { label: 'UV maximum', value: fmt(currentDay.uv, '', 1) }, { label: 'Sunrise', value: String(currentDay.sunrise).replace('T', ' ') }, { label: 'Sunset', value: String(currentDay.sunset).replace('T', ' ') }] : [],
    authorRequest: `Use Weather Desk's read-only get_weather tool for placeId ${p?.id ?? '(choose a place first)'}. Explain the saved forecast, its source times, missing values and practical weather considerations. Follow the weather skill. Do not invent warnings, current readings or air quality scales. Any fresh external read uses the normal integration permissions.` }, b => {
    if (!p) return empty(b, common.summary);
    const children = [b.node('place-heading', 'section', { title: common.place, description: common.freshness }, [b.text('summary', '{/summary}')])];
    if (!d) { children.push(b.text('await-refresh', 'This place is saved. Use Refresh in the header to read current conditions, its daily forecast and optional air quality.')); return children; }
    children.push(b.node('metrics', 'grid', { columns: 'auto', gap: 'sm' }, { each: '/stats', template: b.node('metric', 'stat', { label: '{label}', value: '{value}' }) }));
    if (currentDay) children.push(b.node('today-details', 'section', { title: `Local day · ${humanDate(currentDay.date)}`, description: `${when(f)}${stale(f, now) || p.errors.forecast ? ' · Needs refresh' : ''}` }, [b.node('day-figures', 'grid', { columns: 'auto', gap: 'sm' }, { each: '/details', template: b.node('day-figure', 'stat', { label: '{label}', value: '{value}' }) })]));
    if (hours.length && hours.slice(0, 24).every(h => h.temperature !== null && h.feels !== null)) children.push(chart(b, 'next-hours', `Next ${Math.min(24, hours.length)} available hours · ${tempUnit} · ${d.timezone}`, 'hours', ['temperature', 'feels'], ['Temperature', 'Feels like']));
    else children.push(b.text('chart-missing', 'Hourly temperature chart unavailable: some readings are missing. Exact values remain in Forecast & planning.'));
    children.push(b.node('today-actions', 'stack', { direction: 'horizontal', wrap: true, gap: 'sm' }, [b.button('ask-weather', 'Ask about this forecast', 'assistant.compose', { path: 'authorRequest' }), b.button('manage-places', 'Manage places', 'open_places')]));
    return children;
  }, warning(['conditions', 'forecast']));
  const forecast = build('forecast', { ...common, hours, days, maxRain: s.maxRain, maxWind: s.maxWind, matches: matches.map(w => ({ ...w, start: w.start.replace('T', ' '), end: `through ${w.end.slice(11)} (hour start)`, wind: measure(w.wind, 'wind', s.units) })), export: { csv: forecastCSV } }, b => {
    if (!p) return empty(b, 'Choose a saved place to plan around its forecast.');
    const tabs: string[] = [];
    const dayPanel = [b.text('forecast-meta', `${p.name} · ${f?.timezone ?? p.timezone}. ${when(f)}. ${stale(f, now) || p.errors.forecast ? 'Daily forecast needs refresh.' : ''} Each row is a local calendar day; later days are less certain.`)];
    if (days.length) { dayPanel.push(b.table('daily', 'Daily forecast · up to 16 days', 'days', ['day', 'condition', 'low', 'high', 'chance', 'rain', 'wind', 'uv'], ['Day', 'Conditions', `Low ${tempUnit}`, `High ${tempUnit}`, 'Rain %', `Precip. ${rainUnit}`, `Wind max ${windUnit}`, 'UV max']), b.button('export-forecast', 'Export daily forecast CSV', 'file.save', { name: 'weather-forecast', text: '/export/csv' })); }
    else dayPanel.push(b.text('daily-empty', 'No daily forecast yet. Use the header Refresh.'));
    tabs.push(b.node('daily-panel', 'section', { title: 'Daily' }, dayPanel));
    const hourPanel = [b.text('hourly-meta', `${when(d)}. ${stale(d, now) || p.errors.conditions ? 'Hourly forecast needs refresh. ' : ''}Up to 48 hours from the source read. Labels use ${d?.timezone ?? p.timezone}; gaps stay missing, and hours are not a continuous UTC axis.`)];
    if (hours.length) {
      if (hours.every(h => h.temperature !== null && h.feels !== null)) hourPanel.push(chart(b, 'hourly-temp', `Hourly temperature · ${tempUnit}`, 'hours', ['temperature', 'feels'], ['Temperature', 'Feels like']));
      else hourPanel.push(b.text('temp-chart-missing', 'Temperature chart unavailable because readings are missing; inspect the exact values below.'));
      if (hours.every(h => h.chance !== null)) hourPanel.push(chart(b, 'hourly-rain', 'Hourly precipitation probability · %', 'hours', ['chance'], ['Precipitation probability'], 'bar'));
      else hourPanel.push(b.text('rain-chart-missing', 'Rain chart unavailable because readings are missing; inspect the exact values below.'));
      hourPanel.push(b.table('hourly', 'Exact hourly values', 'hours', ['time', 'condition', 'temperature', 'feels', 'chance', 'rain', 'wind'], ['Local time', 'Conditions', `Temp ${tempUnit}`, `Feels ${tempUnit}`, 'Rain %', `Precip. ${rainUnit}`, `Wind ${windUnit}`]));
    } else hourPanel.push(b.text('hourly-empty', 'No future hourly records in the saved read. Refresh to update the window.'));
    tabs.push(b.node('hourly-panel', 'section', { title: 'Hourly' }, hourPanel));
    const plan = [b.text('planning-method', 'Find daylight runs of at least two consecutive hourly records matching both limits. These are forecast matches, not safety advice. Air quality, UV, gusts and official warnings are not assessed. Missing inputs never qualify; stale or failed conditions produce no matches.'), b.node('planning-controls', 'stack', { direction: 'horizontal', wrap: true, gap: 'sm', align: 'end' }, [b.node('rain-limit', 'input', { kind: 'number', label: 'Maximum rain probability (%)', bind: '/maxRain' }), b.node('wind-limit', 'input', { kind: 'number', label: 'Maximum wind (km/h)', bind: '/maxWind' }), b.button('apply-plan', 'Apply limits', 'apply')])];
    if (matches.length) plan.push(b.table('windows', 'Matching daylight hours', 'matches', ['start', 'end', 'hours', 'chance', 'wind'], ['From (local)', 'Last matching hour', 'Hours', 'Max rain %', `Max wind ${windUnit}`]));
    else plan.push(b.text('windows-empty', 'No matching two-hour daylight run in the available fresh records. Try different limits or refresh.'));
    tabs.push(b.node('planning-panel', 'section', { title: 'Planning' }, plan));
    return [b.node('forecast-tabs', 'tabs', {}, tabs)];
  }, warning(['conditions', 'forecast']));
  const airRows = (a?.hourly.time ?? []).map((t, i) => ({ time: t, label: timeLabel(String(t)), us: number(v(a, 'us_aqi', i)), eu: number(v(a, 'european_aqi', i)), pm25: number(v(a, 'pm2_5', i)), pm10: number(v(a, 'pm10', i)), no2: number(v(a, 'nitrogen_dioxide', i)), ozone: number(v(a, 'ozone', i)) }));
  const airStats = AIR_STATS.map(([name, field]) => ({ label: name, value: fmt(v(a, field), a?.currentUnits[field] === 'USAQI' || a?.currentUnits[field] === 'EAQI' ? '' : a?.currentUnits[field] ?? '') }));
  const air = build('air', { ...common, airStats, airRows }, b => {
    if (!p) return empty(b, 'Choose a place to inspect modelled air quality.');
    const children = [b.text('air-context', `${label(p)}. ${sourceTime(a)}. ${when(a)}. ${stale(a, now) || p.errors.air ? 'Air quality needs a refresh. ' : ''}US AQI and European AQI are different scales; neither is a local national AQI. These are model estimates, not readings from a nearby sensor.`)];
    if (!a) return [...children, b.text('air-empty', 'No air quality saved. Enable air-quality refresh in Sources & preferences, then use Refresh.')];
    children.push(b.node('air-stats', 'grid', { columns: 'auto', gap: 'sm' }, { each: '/airStats', template: b.node('air-stat', 'stat', { label: '{label}', value: '{value}' }) }));
    if (airRows.length && airRows.every(h => h.us !== null)) children.push(chart(b, 'air-chart', `US AQI · ${a.timezone} · available hourly estimates`, 'airRows', ['us'], ['US AQI']));
    else children.push(b.text('air-chart-missing', 'Air quality chart unavailable because readings are missing; inspect the exact values below.'));
    children.push(b.table('air-values', 'Hourly air quality · source units', 'airRows', ['time', 'us', 'eu', 'pm25', 'pm10', 'no2', 'ozone'], ['Local time', 'US AQI', 'European AQI', `PM2.5 ${a.hourlyUnits.pm2_5 ?? ''}`, `PM10 ${a.hourlyUnits.pm10 ?? ''}`, `NO₂ ${a.hourlyUnits.nitrogen_dioxide ?? ''}`, `Ozone ${a.hourlyUnits.ozone ?? ''}`]));
    return children;
  }, warning(['air']));
  const placesView = build('places', { ...common, search: s.search, candidates: s.candidates.map(p => ({ ...p, title: label(p), meta: `${p.latitude}, ${p.longitude} · ${p.timezone}` })), saved: s.locations.map(p => ({ id: p.id, title: label(p), meta: `${p.id === s.selected ? 'Selected · ' : ''}${sourceTime(p.readings.conditions)} · ${stale(p.readings.conditions, now) || p.errors.conditions ? 'Needs refresh' : 'Recent read'}`, value: measure(v(p.readings.conditions, 'temperature_2m'), 'temperature', s.units), body: condition(v(p.readings.conditions, 'weather_code')) })), removeId: s.removeId }, b => {
    const children = [b.node('search-place', 'section', { title: 'Your places', description: 'Keep up to five places. Search results are never selected automatically. Saving a place is local; Refresh reads all saved places (up to 15 governed calls).' }, [b.node('search-bar', 'stack', { direction: 'horizontal', wrap: true, gap: 'sm', align: 'end' }, [b.node('place-search', 'input', { label: 'City or postal code', bind: '/search', placeholder: 'Search for a place' }), b.button('search-button', 'Search places', 'search_places'), b.button('dictate-place', 'Dictate place', 'voice.dictate', { into: 'place-search' })])])];
    if (s.candidates.length) children.push(b.node('candidate-grid', 'grid', { columns: 'auto', pageSize: 4, searchable: true }, { each: '/candidates', template: b.node('candidate', 'card', { title: '{title}', subtitle: '{meta}' }, [b.button('save-place', 'Save this place', 'save_place', { id: '{id}' }, 'primary')]) }));
    else if (s.searched) children.push(b.text('search-empty', 'No matching places. Try the city name or a nearby city.'));
    if (s.locations.length) children.push(b.node('saved-grid', 'grid', { columns: 'auto', pageSize: 5 }, { each: '/saved', template: b.node('saved-place', 'card', { title: '{title}', subtitle: '{meta}', body: '{body}', badge: '{value}' }, [b.node('saved-actions', 'stack', { direction: 'horizontal', wrap: true, gap: 'sm' }, [b.button('open-place', 'Open weather', 'open_place', { id: '{id}' }), b.button('remove-request', 'Remove', 'ask_remove', { id: '{id}' }, 'link')])]) }));
    if (s.removeId) children.push(b.node('remove-review', 'section', { title: `Remove ${s.locations.find(p => p.id === s.removeId)?.name}?`, description: 'This removes this place and all its saved datasets. Past source receipts remain until they age out of the 40-entry ledger.' }, [b.node('remove-actions', 'stack', { direction: 'horizontal', gap: 'sm' }, [b.button('remove-confirm', 'Remove place', 'remove_place', { id: s.removeId }, 'danger'), b.button('remove-cancel', 'Keep place', 'cancel_remove')])]));
    return children;
  }, '');
  const extras = Object.fromEntries((['archive', 'marine', 'river'] as Kind[]).map(k => { const d = p?.readings[k], daily = k !== 'marine', fields = daily ? k === 'river' ? ['river_discharge'] : ['temperature_2m_min', 'temperature_2m_max', 'precipitation_sum'] : ['wave_height', 'wave_period', 'wave_direction', 'sea_surface_temperature']; return [k, (d?.[daily ? 'daily' : 'hourly'].time ?? []).map((t, i) => ({ time: t, ...Object.fromEntries(fields.map(field => [field, v(d, field, i, daily)])) }))]; }));
  const explore = build('explore', { ...common, ...extras, archiveStart: s.archiveStart, archiveEnd: s.archiveEnd }, b => {
    if (!p) return empty(b, 'Select a saved place before exploring other weather datasets.');
    const panels = (['archive', 'marine', 'river'] as const).map(k => {
      const d = p.readings[k], descriptions = { archive: 'Historical weather is reanalysis: estimates, not station observations. Choose 1–31 past local dates from 1940. Recent dates may not yet be available.', marine: 'Modelled waves at a sea grid point. Inland locations may have no data. This is not a navigation forecast.', river: 'Modelled daily river discharge at a nearby river grid cell. Discharge alone does not establish flooding, water depth or official warning status.' };
      const children = [b.text(`${k}-context`, `${label(p)}. ${descriptions[k]} ${when(d)}.${d ? ` Returned grid: ${d.latitude}, ${d.longitude}; timezone ${d.timezone}. ${stale(d, now) ? 'Saved read is more than two hours old.' : ''}` : ''}`)];
      if (k === 'archive') children.push(b.node('archive-controls', 'stack', { direction: 'horizontal', wrap: true, gap: 'sm', align: 'end' }, [b.node('archive-start', 'date', { label: 'From (local date)', bind: '/archiveStart' }), b.node('archive-end', 'date', { label: 'To (local date)', bind: '/archiveEnd' }), b.button('read-archive', 'Read historical weather', 'read_archive')]));
      else children.push(b.button(`read-${k}`, k === 'marine' ? 'Read marine conditions' : 'Read river discharge', `read_${k}`));
      if ((extras[k] as unknown[]).length) children.push(b.table(`${k}-records`, k === 'archive' ? 'Saved historical range · metric' : k === 'marine' ? '48 source hours · metric' : '7 source days', k, k === 'archive' ? ['time', 'temperature_2m_min', 'temperature_2m_max', 'precipitation_sum'] : k === 'marine' ? ['time', 'wave_height', 'wave_period', 'wave_direction', 'sea_surface_temperature'] : ['time', 'river_discharge'], k === 'archive' ? ['Local date', 'Low °C', 'High °C', 'Precip. mm'] : k === 'marine' ? ['Local hour', `Wave ${d?.hourlyUnits.wave_height ?? ''}`, `Period ${d?.hourlyUnits.wave_period ?? ''}`, `Direction ${d?.hourlyUnits.wave_direction ?? ''}`, `Sea temp ${d?.hourlyUnits.sea_surface_temperature ?? ''}`] : ['Local date', `Discharge ${d?.dailyUnits.river_discharge ?? ''}`]));
      else children.push(b.text(`${k}-empty`, 'No saved records. This explicit read is separate from the normal refresh schedule.'));
      return b.node(`${k}-panel`, 'section', { title: k === 'archive' ? 'History' : k === 'marine' ? 'Marine' : 'Rivers' }, children);
    });
    return [b.node('explore-tabs', 'tabs', {}, panels)];
  }, warning(['archive', 'marine', 'river']));
  const health = s.locations.flatMap(p => (['conditions', 'forecast', ...(s.includeAir ? ['air'] : [])] as Kind[]).map(k => ({ place: label(p), dataset: k, time: String(p.readings[k]?.current.time ?? p.readings[k]?.daily.time?.[0] ?? 'Unavailable'), timezone: p.readings[k]?.timezone ?? p.timezone, retrieved: p.readings[k]?.at ?? 'Never', status: p.errors[k] ? `Failed: ${p.errors[k]}` : stale(p.readings[k], now) ? 'Needs refresh' : 'Recent source read' })));
  const sources = build('sources', { ...common, units: s.units, includeAir: s.includeAir, health, receipts: s.receipts }, b => [
    b.node('preferences', 'section', { title: 'Preferences', description: 'Unit changes reproject saved weather without a source call. Planning wind limits and Explore datasets stay metric.' }, [b.node('preference-controls', 'stack', { direction: 'horizontal', wrap: true, gap: 'sm', align: 'end' }, [b.node('units', 'select', { label: 'Display units', bind: '/units', presentation: 'dropdown', options: [{ label: 'Metric · °C, km/h, mm', value: 'metric' }, { label: 'Imperial · °F, mph, in', value: 'imperial' }] }), b.node('include-air', 'checkbox', { label: 'Include air quality on refresh', bind: '/includeAir' }), b.button('save-preferences', 'Apply preferences', 'apply')])]),
    b.text('setup', 'In Integrations, install and enable Weather (Open-Meteo). Enable the exact tools you need. App reads require their existing Allow policy; Ask and Off are never bypassed. Core refresh uses weather_forecast and optional air_quality; place search uses geocoding. Explore uses weather_archive, marine_weather and flood_forecast only on explicit reads.'),
    b.text('lifecycle', 'Use Background operation in the header or Operation Center to opt into Keep running. Startup refresh and the hourly app schedule read the core datasets for saved places only while Vakyartha runs and the computer is awake. Manual Refresh is separate. The host owns timing, retries and recovery; playback never schedules source reads.'),
    b.text('limits', 'The connector uses free public weather access for non-commercial use, with service limits and no uptime guarantee. There is no account lookup or paid-key support. Reads older than two hours need refresh; a recent receipt does not make a model estimate a live observation. This app has no radar, push notifications or official emergency-warning feed.'),
    ...(health.length ? [b.table('health', 'Core dataset freshness', 'health', ['place', 'dataset', 'time', 'timezone', 'retrieved', 'status'], ['Place', 'Dataset', 'Source time / first day', 'Timezone', 'Retrieved UTC', 'Status'])] : []),
    ...(s.receipts.length ? [b.table('receipts', 'Last 40 source reads', 'receipts', ['place', 'kind', 'at', 'records', 'status'], ['Place', 'Dataset', 'Retrieved UTC', 'Records', 'Result'])] : [b.text('no-receipts', 'Source reads and failures will appear here. App run receipts are also available in the shared host controls.')]),
  ], '');
  return [today, forecast, air, placesView, explore, sources];
}
const AIR_STATS = [['US AQI', 'us_aqi'], ['European AQI', 'european_aqi'], ['PM2.5', 'pm2_5'], ['PM10', 'pm10']] as const;
export const surfaceFile = () => view({}).map(u => ({ id: u.surface, title: TITLES[u.surface], nodes: u.nodes, data: u.data[0]!.value }));
