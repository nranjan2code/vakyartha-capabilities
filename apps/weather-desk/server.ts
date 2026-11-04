import { AIR, ARCHIVE, CURRENT, DAILY, HOURLY, MARINE, dataset, date, label, line, localNow, number, object, places, reason, savedDataset, stamp, type Dataset, type Kind, type Place, type Units } from './data.ts';
import { view, surfaceFile } from './views.ts';
export { view, surfaceFile };

export interface Location extends Place { readings: Partial<Record<Kind, Dataset>>; errors: Partial<Record<Kind, string>> }
export interface Receipt { place: string; kind: string; at: string; status: string; records: number }
export interface State {
  schema: 1; locations: Location[]; selected: string; search: string; candidates: Place[]; searched: boolean;
  units: Units; includeAir: boolean; maxRain: number; maxWind: number;
  archiveStart: string; archiveEnd: string; removeId: string; receipts: Receipt[];
}
export interface Context { state: Partial<State>; callTool(name: string, args: Record<string, unknown>): Promise<unknown>; now?: () => Date; appRevision?: number }
export const MAX_PLACES = 5;
export const TOOLS = { conditions: 'weather_forecast', forecast: 'weather_forecast', air: 'air_quality', archive: 'weather_archive', marine: 'marine_weather', river: 'flood_forecast' } as const;
const KINDS = Object.keys(TOOLS) as Kind[];
export function normalize(input: unknown): State {
  const s = object(input);
  const locations: Location[] = (Array.isArray(s.locations) ? s.locations : []).slice(0, MAX_PLACES).flatMap(v => {
    const r = object(v), p = places({ results: [r] })[0]; if (!p) return [];
    return [{ ...p, readings: Object.fromEntries(KINDS.flatMap(k => { const d = savedDataset(object(r.readings)[k], k); return d ? [[k, d]] : []; })), errors: Object.fromEntries(KINDS.flatMap(k => { const error = line(object(r.errors)[k], 260); return error ? [[k, error]] : []; })) }];
  }).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i);
  const candidates = places({ results: Array.isArray(s.candidates) ? s.candidates : [] });
  return { schema: 1, locations, selected: locations.some(p => p.id === s.selected) ? String(s.selected) : locations[0]?.id ?? '',
    search: line(s.search, 100), candidates, searched: s.searched === true, units: s.units === 'imperial' ? 'imperial' : 'metric', includeAir: s.includeAir !== false,
    maxRain: number(s.maxRain) !== null && Number(s.maxRain) >= 0 && Number(s.maxRain) <= 100 ? Number(s.maxRain) : 30,
    maxWind: number(s.maxWind) !== null && Number(s.maxWind) >= 0 && Number(s.maxWind) <= 150 ? Number(s.maxWind) : 25,
    archiveStart: date(s.archiveStart) ? s.archiveStart : '', archiveEnd: date(s.archiveEnd) ? s.archiveEnd : '',
    removeId: locations.some(p => p.id === s.removeId) ? String(s.removeId) : '',
    receipts: (Array.isArray(s.receipts) ? s.receipts : []).flatMap(v => { const r = object(v); return stamp(r.at) && typeof r.status === 'string' ? [{ place: line(r.place), kind: line(r.kind, 40), at: String(r.at), status: line(r.status, 300), records: Math.max(0, number(r.records) ?? 0) }] : []; }).slice(0, 40),
  };
}
const clock = (c: Context) => (c.now?.() ?? new Date()).toISOString();
export const selected = (s: State) => s.locations.find(p => p.id === s.selected);
function args(p: Place, kind: Kind, s: State, now: string): Record<string, unknown> {
  const base = { latitude: p.latitude, longitude: p.longitude, timezone: 'auto' };
  const metric = { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm' };
  if (kind === 'conditions') return { ...base, ...metric, current: CURRENT, hourly: HOURLY, forecast_hours: 48 };
  if (kind === 'forecast') return { ...base, ...metric, daily: DAILY, forecast_days: 16 };
  if (kind === 'air') return { ...base, current: AIR, hourly: AIR, forecast_days: 2 };
  if (kind === 'marine') return { ...base, hourly: MARINE, forecast_days: 2, length_unit: 'metric', temperature_unit: 'celsius' };
  if (kind === 'river') return { ...base, daily: ['river_discharge'], forecast_days: 7 };
  const today = localNow(p.timezone, now).slice(0, 10);
  if (!date(s.archiveStart) || !date(s.archiveEnd) || s.archiveStart < '1940-01-01' || s.archiveEnd >= today || s.archiveEnd < s.archiveStart || Date.parse(s.archiveEnd) - Date.parse(s.archiveStart) > 30 * 86400_000) throw Error('Choose a past date range from 1940, up to 31 days, ending before this place’s today. Recent reanalysis may be delayed.');
  return { ...base, temperature_unit: 'celsius', precipitation_unit: 'mm', daily: ARCHIVE, start_date: s.archiveStart, end_date: s.archiveEnd };
}
async function read(c: Context, s: State, p: Location, kind: Kind) {
  const request = args(p, kind, s, clock(c));
  try {
    const d = dataset(await c.callTool(`open-meteo__${TOOLS[kind]}`, request), kind, clock(c));
    // Forecast model grids need not match the geocoded point exactly. A remote
    // point, however, is not a forecast for this saved place.
    if (kind !== 'marine' && (Math.abs(d.latitude - p.latitude) > 2 || Math.min(Math.abs(d.longitude - p.longitude), 360 - Math.abs(d.longitude - p.longitude)) > 2)) throw Error('Weather source returned a grid point too far from the selected place.');
    p.readings[kind] = d; delete p.errors[kind];
    s.receipts.unshift({ place: label(p), kind, at: d.at, status: 'Validated source read', records: (d.hourly.time ?? d.daily.time ?? []).length });
  } catch (e) {
    p.errors[kind] = reason(e);
    s.receipts.unshift({ place: label(p), kind, at: clock(c), status: `Failed: ${reason(e)}`, records: 0 });
  }
  s.receipts = s.receipts.slice(0, 40);
}
async function refreshPlace(c: Context, s: State, p: Location) {
  for (const kind of ['conditions', 'forecast', ...(s.includeAir ? ['air'] : [])] as Kind[]) await read(c, s, p, kind);
}
// Startup and the host's refresh control share this bounded, idempotent read.
// Five saved places × three sequential reads stays below the 16-call budget.
export async function refresh(c: Context) {
  const s = normalize(c.state); c.state = s;
  const first = selected(s);
  for (const p of [...(first ? [first] : []), ...s.locations.filter(p => p !== first)]) await refreshPlace(c, s, p);
  return { updates: view(s, clock(c)) };
}
export async function handleAction(controlId: string, value: unknown, c: Context, action?: string) {
  const s = normalize(c.state); c.state = s;
  let focusSurface: string | undefined;
  const id = line(object(value).id, 100);
  if (!action) {
    if (controlId === '/search') { s.search = line(value, 100); s.candidates = []; s.searched = false; }
    else if (controlId === '/selected') { if (!s.locations.some(p => p.id === value)) throw Error('Choose a saved place.'); s.selected = String(value); s.removeId = ''; }
    else if (controlId === '/units') { if (value !== 'metric' && value !== 'imperial') throw Error('Choose metric or imperial units.'); s.units = value; }
    else if (controlId === '/includeAir') { if (typeof value !== 'boolean') throw Error('Air refresh must be on or off.'); s.includeAir = value; }
    else if (controlId === '/maxRain' || controlId === '/maxWind') { const n = number(value); const max = controlId === '/maxRain' ? 100 : 150; if (n === null || n < 0 || n > max) throw Error(`Enter a number from 0 to ${max}.`); if (controlId === '/maxRain') s.maxRain = n; else s.maxWind = n; }
    else if (controlId === '/archiveStart' || controlId === '/archiveEnd') { if (value !== '' && !date(value)) throw Error('Choose a valid date.'); if (controlId === '/archiveStart') s.archiveStart = String(value); else s.archiveEnd = String(value); }
    else throw Error(`Unknown Weather Desk field: ${controlId}`);
  } else if (action === 'search_places') {
    if (s.search.length < 2) throw Error('Type at least two characters of a city or postal code.');
    s.candidates = places(await c.callTool('open-meteo__geocoding', { name: s.search, count: 8 })); s.searched = true;
  } else if (action === 'save_place') {
    const p = s.candidates.find(p => p.id === id); if (!p) throw Error('Search again and choose one of the returned places.');
    if (!s.locations.some(x => x.id === p.id)) {
      if (s.locations.length >= MAX_PLACES) throw Error('Weather Desk keeps five places. Remove one before adding another.');
      s.locations.push({ ...p, readings: {}, errors: {} });
    }
    s.selected = p.id; s.candidates = []; s.searched = false; s.search = ''; focusSurface = 'today';
  } else if (action === 'open_place') {
    if (!s.locations.some(p => p.id === id)) throw Error('That place is no longer saved.'); s.selected = id; s.removeId = ''; focusSurface = 'today';
  } else if (action === 'ask_remove') {
    if (!s.locations.some(p => p.id === id)) throw Error('That place is no longer saved.'); s.removeId = id;
  } else if (action === 'cancel_remove') s.removeId = '';
  else if (action === 'remove_place') {
    if (!id || id !== s.removeId) throw Error('Review the place removal first.');
    s.locations = s.locations.filter(p => p.id !== id); s.selected = s.locations.some(p => p.id === s.selected) ? s.selected : s.locations[0]?.id ?? ''; s.removeId = '';
  } else if (action === 'refresh_selected') {
    const p = selected(s); if (!p) throw Error('Save a place first.'); await refreshPlace(c, s, p);
  } else if (action === 'read_archive' || action === 'read_marine' || action === 'read_river') {
    const p = selected(s); if (!p) throw Error('Save a place first.'); await read(c, s, p, action.slice(5) as Kind);
  } else if (action === 'refresh') return refresh(c);
  else if (action !== 'apply') throw Error(`Unknown Weather Desk action: ${action}`);
  return { updates: view(s, clock(c)), ...(focusSurface ? { focusSurface } : {}) };
}
export async function handleQuery(name: string, params: unknown, c: Context) {
  const s = normalize(c.state), q = object(params), id = q.placeId === undefined ? s.selected : line(q.placeId, 100), p = s.locations.find(p => p.id === id);
  if (name === 'list_places') return { places: s.locations.map(({ readings, errors, ...p }) => ({ ...p, retrievedAt: readings.conditions?.at ?? null, errors })), selected: s.selected, revision: c.appRevision ?? null };
  if (!p) return { error: 'Save or select a place in Weather Desk first.' };
  const update = view({ ...s, selected: p.id }, clock(c)).find(u => u.surface === 'today')!;
  if (name === 'get_weather') return { place: { id: p.id, name: label(p), latitude: p.latitude, longitude: p.longitude, timezone: p.timezone }, readings: p.readings, errors: p.errors, units: 'Source datasets retain metric units. Each dataset contains its returned units and retrieval time.', summary: update.data[0]!.value.summary, freshness: update.data[0]!.value.freshness, source: 'https://open-meteo.com/' };
  if (name === 'get_weather_briefing') return { programme: object(update.data[0]!.value.spoken).programme, source: 'https://open-meteo.com/' };
  throw Error(`Unknown Weather Desk query: ${name}`);
}

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) { return {updates:view(normalize(context.state),clock(context))}; }
