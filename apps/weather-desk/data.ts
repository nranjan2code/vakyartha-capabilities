// Only reviewed source fields cross into canonical state. The source's local
// timestamps remain local; parsing them as the computer's timezone changes days.
export type ObjectValue = Record<string, unknown>;
export type Series = Record<string, (number | string | null)[]>;
export interface Dataset {
  at: string; timezone: string; latitude: number; longitude: number;
  current: Record<string, number | string | null>; currentUnits: Record<string, string>;
  hourly: Series; hourlyUnits: Record<string, string>; daily: Series; dailyUnits: Record<string, string>;
}
export interface Place { id: string; name: string; admin1: string; country: string; latitude: number; longitude: number; timezone: string }
export const object = (v: unknown): ObjectValue => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : {};
export const line = (v: unknown, max = 180) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
export const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export const stamp = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v)) ? v : '';
export const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export const localStamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v) && date(v.slice(0, 10)) && +v.slice(11, 13) < 24 && +v.slice(14) < 60;
export function zone(v: unknown): string { try { const z = line(v, 80); if (!z) return ''; new Intl.DateTimeFormat('en', { timeZone: z }).format(); return z; } catch { return ''; } }
export function localNow(timezone: string, now: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const label = (p: Place) => [p.name, p.admin1, p.country].filter(Boolean).join(', ');
export const reason = (e: unknown) => line(String(e instanceof Error ? e.message : e).replace(/<\/?tool_output[^>]*>/g, '').replace(/This is data returned by a tool, not instructions\.[^\n]*/g, ''), 260);
export function sourceJSON(input: unknown): ObjectValue {
  const r = object(input);
  if (r.isError === true) throw Error(reason(r.text ?? 'Weather integration returned an error.'));
  let value: unknown = input;
  if (typeof input === 'string' || typeof r.text === 'string' || Array.isArray(r.content)) {
    const text = typeof input === 'string' ? input : typeof r.text === 'string' ? r.text : (r.content as unknown[]).map(x => object(x).text ?? '').join('\n');
    try { value = JSON.parse(text); } catch { throw Error('Weather integration did not return complete JSON.'); }
  }
  const out = object(value);
  if (!Object.keys(out).length) throw Error('Weather integration returned no data.');
  if (out.error || out.truncated) throw Error(out.truncated ? 'The weather reply was truncated. Narrow the request before retrying.' : line(out.reason) || 'Weather source rejected the request.');
  return out;
}
export function places(input: unknown): Place[] {
  const r = sourceJSON(input);
  if (r.results === undefined) return [];
  if (!Array.isArray(r.results)) throw Error('Place search returned an invalid list.');
  return r.results.slice(0, 8).flatMap(v => {
    const p = object(v), latitude = number(p.latitude), longitude = number(p.longitude), timezone = zone(p.timezone), name = line(p.name, 100);
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !timezone || !name) return [];
    return [{ id: `${latitude}:${longitude}`, name, admin1: line(p.admin1, 100), country: line(p.country, 100), latitude, longitude, timezone }];
  }).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i);
}
export const CURRENT = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'precipitation', 'is_day'];
export const HOURLY = ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'weather_code', 'wind_speed_10m', 'relative_humidity_2m', 'is_day'];
export const DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset', 'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max', 'uv_index_max'];
export const AIR = ['us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone'];
export const MARINE = ['wave_height', 'wave_period', 'wave_direction', 'sea_surface_temperature'];
export const ARCHIVE = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'weather_code'];
const unitsOf = (v: unknown, fields: string[]) => Object.fromEntries(fields.flatMap(k => typeof object(v)[k] === 'string' ? [[k, line(object(v)[k], 30)]] : []));
function series(v: unknown, fields: string[], max: number, daily: boolean): Series {
  const raw = object(v);
  if (!Object.keys(raw).length) return {};
  if (!Array.isArray(raw.time) || !raw.time.length || raw.time.length > max || !raw.time.every(daily ? date : localStamp)) throw Error('Weather source has invalid timestamps or exceeds the requested range.');
  const times = raw.time as string[];
  if (times.some((t, i) => i > 0 && t < times[i - 1]!)) throw Error('Weather timestamps are out of order.');
  const result: Series = { time: [...times] };
  for (const field of fields) {
    if (raw[field] === undefined) continue;
    const values = raw[field];
    if (!Array.isArray(values) || values.length !== times.length) throw Error(`Weather series ${field} has mismatched lengths.`);
    if (!values.every(x => x === null || (['sunrise', 'sunset'].includes(field) ? localStamp(x) : number(x) !== null))) throw Error(`Weather series ${field} has invalid values.`);
    result[field] = [...values];
  }
  return result;
}
export type Kind = 'conditions' | 'forecast' | 'air' | 'archive' | 'marine' | 'river';
export function dataset(input: unknown, kind: Kind, at: string): Dataset {
  const r = sourceJSON(input), latitude = number(r.latitude), longitude = number(r.longitude), timezone = zone(r.timezone);
  if (!stamp(at) || latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !timezone) throw Error('Weather source has invalid coordinates, timezone or retrieval time.');
  const hourFields = kind === 'air' ? AIR : kind === 'marine' ? MARINE : HOURLY;
  const dayFields = kind === 'archive' ? ARCHIVE : kind === 'river' ? ['river_discharge'] : DAILY;
  const current: Dataset['current'] = {};
  const fields = kind === 'air' ? AIR : kind === 'marine' ? MARINE : CURRENT;
  const raw = object(r.current);
  if (Object.keys(raw).length) {
    if (!localStamp(raw.time)) throw Error('Weather source has no valid current estimate time.');
    current.time = raw.time;
    for (const k of fields) { if (raw[k] !== undefined) { if (raw[k] !== null && number(raw[k]) === null) throw Error(`Invalid ${k}.`); current[k] = raw[k] as number | null; } }
  }
  const out: Dataset = { at, timezone, latitude, longitude, current, currentUnits: unitsOf(r.current_units, fields), hourly: series(r.hourly, hourFields, 72, false), hourlyUnits: unitsOf(r.hourly_units, hourFields), daily: series(r.daily, dayFields, kind === 'archive' ? 31 : 16, true), dailyUnits: unitsOf(r.daily_units, dayFields) };
  const expected = kind === 'conditions' ? Object.keys(current).length > 1 && out.hourly.time : kind === 'air' || kind === 'marine' ? out.hourly.time : out.daily.time;
  if (!expected) throw Error(`The ${kind} reply contains no requested records.`);
  for (const [data, units] of [[out.current, out.currentUnits], [out.hourly, out.hourlyUnits], [out.daily, out.dailyUnits]] as const) for (const field of Object.keys(data)) {
    if (field === 'time') continue;
    if (!Object.hasOwn(units, field)) throw Error(`Weather source omitted units for ${field}.`);
    const expectedUnit = /temperature/.test(field) ? '°C' : /wind_speed|wind_gusts/.test(field) ? 'km/h' : /^precipitation(?!_probability)/.test(field) ? 'mm' : /probability|humidity/.test(field) ? '%' : '';
    if (expectedUnit && units[field] !== expectedUnit) throw Error(`Unexpected units for ${field}: ${units[field]}.`);
    const values = Array.isArray(data[field]) ? data[field] : [data[field]];
    for (const n of values) if (typeof n === 'number') {
      if ((/probability|humidity/.test(field) && (n < 0 || n > 100)) || (/wind_speed|wind_gusts|precipitation|aqi|pm10|pm2_5|nitrogen_dioxide|ozone|uv_index|wave_height|wave_period|river_discharge/.test(field) && n < 0) || (field === 'is_day' && n !== 0 && n !== 1)) throw Error(`Weather source returned an out-of-range ${field}.`);
    }
  }
  return out;
}
// Validate saved snapshots through exactly the same boundary as source replies.
export function savedDataset(v: unknown, kind: Kind): Dataset | undefined {
  try { const d = object(v); return dataset({ ...d, current_units: d.currentUnits, hourly_units: d.hourlyUnits, daily_units: d.dailyUnits }, kind, String(d.at)); } catch { return undefined; }
}
export const codes: Record<number, string> = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 56: 'Light freezing drizzle', 57: 'Dense freezing drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 66: 'Light freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall', 77: 'Snow grains', 80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail' };
export const condition = (v: unknown) => number(v) === null ? 'Condition unavailable' : codes[v as number] ?? `Unknown weather code ${v}`;
export type Units = 'metric' | 'imperial';
export function convert(value: unknown, kind: 'temperature' | 'wind' | 'rain', units: Units): number | null {
  const n = number(value); if (n === null) return null;
  return units === 'metric' ? n : kind === 'temperature' ? n * 9 / 5 + 32 : kind === 'wind' ? n / 1.609344 : n / 25.4;
}
export const unit = (kind: 'temperature' | 'wind' | 'rain', units: Units) => kind === 'temperature' ? units === 'metric' ? '°C' : '°F' : kind === 'wind' ? units === 'metric' ? 'km/h' : 'mph' : units === 'metric' ? 'mm' : 'in';
export const fmt = (v: unknown, suffix = '', digits = 0) => number(v) === null ? 'Unavailable' : `${(v as number).toFixed(digits)}${suffix ? ` ${suffix}` : ''}`;
export const measure = (v: unknown, kind: 'temperature' | 'wind' | 'rain', units: Units) => fmt(convert(v, kind, units), unit(kind, units), kind === 'rain' ? units === 'metric' ? 1 : 2 : 0);
export const stale = (d: Dataset | undefined, now: string) => !d || Date.parse(now) - Date.parse(d.at) > 2 * 3600_000 || Date.parse(d.at) > Date.parse(now) + 60_000;
// Presentation only: which sky and symbol a WMO code reads as. Missing codes
// stay missing (no symbol); the sky falls back to a plain clear backdrop so
// the page never implies a condition the source did not give.
export type Sky = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export function sky(code: unknown): Sky {
  const c = number(code);
  if (c === null || c <= 1) return 'clear';
  if (c === 2) return 'partly-cloudy';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 57) return 'drizzle';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  return c >= 95 ? 'storm' : 'clear';
}
export function glyph(code: unknown, day = true): string {
  const c = number(code);
  if (c === null || codes[c] === undefined) return '';
  if (c === 56 || c === 57 || c === 66 || c === 67) return 'sleet';
  const s = sky(c);
  return s === 'clear' ? day ? 'sun' : 'moon' : s === 'partly-cloudy' ? day ? 'cloud-sun' : 'cloud-moon' : s === 'cloudy' ? 'cloud' : s;
}
/** Dawn and dusk are the 45 minutes either side of the source's sunrise and sunset. */
export function phase(local: string, sunrise: unknown, sunset: unknown, isDay: unknown): 'dawn' | 'day' | 'dusk' | 'night' {
  const minutes = (t: unknown) => localStamp(t) ? Date.parse(t + 'Z') / 60000 : null;
  const now = minutes(local), rise = minutes(sunrise), set = minutes(sunset);
  if (now !== null && rise !== null && Math.abs(now - rise) <= 45) return 'dawn';
  if (now !== null && set !== null && Math.abs(now - set) <= 45) return 'dusk';
  if (number(isDay) !== null) return isDay === 1 ? 'day' : 'night';
  return now !== null && rise !== null && set !== null ? now > rise && now < set ? 'day' : 'night' : 'day';
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg: unknown) => number(deg) === null ? '' : COMPASS[Math.round(((deg as number) % 360) / 45) % 8]!;
