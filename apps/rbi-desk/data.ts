// RBI text is source data. Match labelled sections, retain published units and
// values, and reject a changed layout before replacing the last good snapshot.
export interface ReserveRow { key: string; label: string; inrCrore: string; usdMillion: string; weekInrCrore: string; weekUsdMillion: string }
export interface Reserves { weekEnding: string; publishedAt: string; retrievedAt: string; url: string; rows: ReserveRow[] }
export interface Direction { title: string; url: string; category: string; issuedOn: string; amendedOn: string | null }
export const DIRECTIONS = 'https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function date(text: string): string | null {
  const m = /^\s*([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(text);
  const month = m ? MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) : -1;
  if (!m || month < 0) return null;
  const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}
export function official(url: unknown): url is string {
  try { const u = new URL(String(url)); return u.protocol === 'https:' && ['rbi.org.in', 'www.rbi.org.in'].includes(u.hostname) && !u.username && !u.password && !u.port; } catch { return false; }
}
export function pageText(text: string, expected: string): string {
  const m = /^URL: (\S+)\n(?:Title: [^\n]*\n)?\n([\s\S]*)$/.exec(text);
  if (!m || !official(m[1]) || m[1] !== expected || Buffer.byteLength(text) > 240_000) throw Error('Expected bounded text from the requested official RBI page');
  return m[2]!;
}
const LABELS = [['total', 'Total Reserves'], ['fca', 'Foreign Currency Assets'], ['gold', 'Gold'], ['sdr', 'SDRs'], ['imf', 'Reserve Position in the IMF']] as const;
export function parseReserves(text: string, url: string, retrievedAt: string): Reserves {
  const body = pageText(text, url), section = /2\. Foreign Exchange Reserves\*?\n([\s\S]*?)(?:\n\*|\n[34]\. )/.exec(body)?.[1];
  if (!section || !/^(?:₹ Cr\. US\$ Mn\. ){3}₹ Cr\. US\$ Mn\.$/m.test(section)) throw Error('RBI reserves table or its INR crore / US$ million units were not found');
  const weekEnding = date(/As on ([A-Za-z]+ \d{1,2}, \d{4})/.exec(section)?.[1] ?? '');
  const publishedAt = date(/Date\s*:\s*([^\n]+)/.exec(body)?.[1] ?? '');
  if (!weekEnding || !publishedAt) throw Error('RBI reserves dates were not found');
  const rows = LABELS.map(([key, label]) => {
    const line = section.split('\n').find((l) => new RegExp(`^1(?:\\.[1-4])? ${label} ?#? `).test(l));
    const values = line?.slice(line.indexOf(label) + label.length).replace(/^\s*#/, '').trim().split(/\s+/);
    if (!values || values.length !== 8 || values.some((v) => !/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(v)) || values.slice(0, 2).some((v) => Number(v.replaceAll(',', '')) <= 0)) throw Error(`RBI reserves row is unreadable: ${label}`);
    return { key, label, inrCrore: values[0]!, usdMillion: values[1]!, weekInrCrore: values[2]!, weekUsdMillion: values[3]! };
  });
  return { weekEnding, publishedAt, retrievedAt, url, rows };
}
export function parseDirections(text: string): Direction[] {
  const body = pageText(text, DIRECTIONS);
  const start = body.indexOf('The Reserve Bank of India has started issuing Master Directions');
  if (start < 0) throw Error('RBI Master Directions directory was not found');
  let category = '', issuedOn = '';
  const records = new Map<string, Direction>();
  for (const line of body.slice(start).split('\n')) {
    if (line.startsWith('Top (')) break;
    const d = date(line);
    if (d) { issuedOn = d; continue; }
    const link = /^(.+?)\s+\((https:\/\/(?:www\.)?rbi\.org\.in\/scripts\/BS_ViewMasDirections\.aspx\?[^\s)]+)\)/i.exec(line);
    if (link) {
      const title = link[1]!.trim(), url = link[2]!;
      if (!issuedOn || !category || !official(url)) throw Error('RBI direction is missing its date or category');
      const amendedOn = date(/updated (?:as on|up to)\s+([A-Za-z]+ \d{1,2}, \d{4})/i.exec(title)?.[1] ?? '');
      records.set(url, { title, url, category, issuedOn, amendedOn });
    } else if (!line.includes('http') && !/Master Directions|\d+ kb|^The |^Any |^Explanations /i.test(line) && line.length < 100) { category = line; issuedOn = ''; }
  }
  if (!records.size) throw Error('No dated official Master Directions links were found');
  return [...records.values()];
}
export function noticeText(text: string, url: string): string {
  const body = pageText(text, url), start = body.search(/(?:^|\n)Date\s*:/);
  if (start < 0) throw Error('RBI notice date was not found');
  return body.slice(start).split(/\n(?:Press Release:|Press Release :|Top \()/)[0]!.slice(0, 12_000).trim();
}
