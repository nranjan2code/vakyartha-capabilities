// The RBI home page "Current Rates" panel, as text from the governed `web__fetch_page`
// tool: each label on its own line, then ":" and the published value. Values are matched
// by label, never by position, and kept exactly as published beside a parsed number.
export interface Rate { key: string; label: string; group: string; value: string; number: number | null; unit: '%' | '₹' | 'index'; asOf: string | null }
export interface Panel { rates: Rate[]; retrievedAt: string }

// [key, published label, group, required]: a missing required label means the layout
// changed, so the whole panel is refused instead of returning a partial set.
const LABELS: [string, string, string, boolean][] = [
  ['repo', 'Policy Repo Rate', 'Policy rates', true],
  ['sdf', 'Standing Deposit Facility Rate', 'Policy rates', true],
  ['msf', 'Marginal Standing Facility Rate', 'Policy rates', true],
  ['bank', 'Bank Rate', 'Policy rates', true],
  ['reverse-repo', 'Fixed Reverse Repo Rate', 'Policy rates', false],
  ['crr', 'CRR', 'Reserve ratios', true],
  ['slr', 'SLR', 'Reserve ratios', true],
  ['usd', 'INR / 1 USD', 'Exchange rates', true],
  ['gbp', 'INR / 1 GBP', 'Exchange rates', false],
  ['eur', 'INR / 1 EUR', 'Exchange rates', false],
  ['jpy', 'INR / 100 JPY', 'Exchange rates', false],
  ['aed', 'INR / 1 AED', 'Exchange rates', false],
  ['base', 'Base Rate', 'Lending and deposit rates', false],
  ['mclr', 'MCLR (Overnight)', 'Lending and deposit rates', false],
  ['savings', 'Savings Deposit Rate', 'Lending and deposit rates', false],
  ['term-deposit', 'Term Deposit Rate > 1 Year', 'Lending and deposit rates', false],
  ['call', 'Call Rates', 'Money market', false],
  ['tbill-91', '91 day T-bills', 'Money market', false],
  ['tbill-182', '182 day T-bills', 'Money market', false],
  ['tbill-364', '364 day T-bills', 'Money market', false],
  ['sensex', 'S&P BSE Sensex', 'Capital market', false],
  ['nifty', 'Nifty 50', 'Capital market', false],
];
export const RATE_KEYS = LABELS.map(([k]) => k);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "October 30, 2026" → "2026-10-30"; anything else is not a date. */
export function day(text: string): string | null {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  const month = m ? MONTHS.indexOf(m[1]!.toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}` : null;
}

/** The text the governed fetch returned for the home page; throws when it is not that page. */
export function parsePanel(result: string, retrievedAt: string): Panel {
  const m = /^URL: (https:\/\/(?:www\.)?rbi\.org\.in\/[^\n]*)\n(?:Title: [^\n]*\n)?\n([\s\S]*)$/.exec(result);
  if (!m) throw new Error('Expected the RBI home page text');
  const all = m[2]!.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = all.indexOf('Policy Repo Rate');
  if (start < 0) throw new Error('The RBI Current Rates panel was not found; the page layout may have changed');
  const lines = all.slice(start, start + 140);
  // The panel's own dates: exchange rates "(As at 1.00pm of October 30, 2026)",
  // markets "* as on October 29, 2026". Policy rates and ratios carry none: they are current.
  const fxDate = day(lines.find((l) => /^\(As at .* of /.test(l)) ?? '');
  const marketDate = day(lines.find((l) => /as on /i.test(l)) ?? '');
  const rates: Rate[] = [], missing: string[] = [];
  for (const [key, label, group, required] of LABELS) {
    const i = lines.indexOf(label);
    let raw = i < 0 ? '' : lines[i + 1] === ':' ? lines[i + 2] ?? '' : (lines[i + 1] ?? '').replace(/^:\s*/, '');
    raw = raw.replace(/\s*[*#]+$/, '').trim();
    if (!raw || !/\d/.test(raw)) { if (required) missing.push(label); continue; }
    const unit = raw.includes('%') ? '%' : group === 'Exchange rates' ? '₹' : 'index';
    const single = /^\d+(?:\.\d+)?%?$/.test(raw) ? Number(raw.replace('%', '')) : null;
    // T-bill stars refer to the last auction, whose date is not published here.
    const asOf = group === 'Exchange rates' ? fxDate : key === 'call' || group === 'Capital market' ? marketDate : null;
    rates.push({ key, label, group, value: raw, number: single, unit, asOf });
  }
  if (missing.length) throw new Error(`The RBI Current Rates panel is missing ${missing.join(', ')}; nothing was updated`);
  return { rates, retrievedAt };
}
