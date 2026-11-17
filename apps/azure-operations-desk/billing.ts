import { field, guid } from "./data.ts";

const scale = 10n ** 20n;
export type ChargeGroup = { tenant: string; count: number; subtotal: string; tax: string; total: string };
export type Invoice = { id: string; currency: string; importedAt: string; recorded: string; total: string; groups: ChargeGroup[] };

function money(value: string): bigint {
  const m = /^(-?)(\d{1,16})(?:\.(\d{1,20}))?$/.exec(value.trim().replace(/^'/, ""));
  if (!m) throw Error("Use decimal billing amounts with up to 20 places.");
  return (m[1] ? -1n : 1n) * (BigInt(m[2]!) * scale + BigInt((m[3] ?? "").padEnd(20, "0")));
}
function decimal(value: bigint): string {
  const magnitude = value < 0 ? -value : value;
  const fraction = (magnitude % scale).toString().padStart(20, "0").replace(/0+$/, "");
  return `${value < 0 ? "-" : ""}${magnitude / scale}${fraction ? "." + fraction : ""}`;
}

function rowsFromCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { row.push(cell); cell = ""; closed = false; };
  const pushRow = () => {
    pushCell();
    if (row.some(c => c.trim())) rows.push(row);
    if (rows.length > 3001) throw Error("The invoice file exceeds 3,000 lines.");
    row = [];
  };
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += c; i++; }
      else { quoted = false; closed = true; }
    } else if (c === ",") pushCell();
    else if (c === "\r" || c === "\n") { if (c === "\r" && text[i + 1] === "\n") i++; pushRow(); }
    else if (closed) throw Error("Unexpected text after a quoted CSV field.");
    else if (c === '"') {
      if (cell) throw Error("Unexpected quote in a CSV field.");
      quoted = true;
    } else cell += c;
  }
  if (quoted) throw Error("An invoice CSV field has an unfinished quote.");
  if (row.length || cell || closed) pushRow();
  return rows;
}

export function invoiceFromCsv(text: unknown, expected: unknown, now: number): Invoice {
  if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > 512 * 1024) throw Error("Paste an invoice reconciliation CSV up to 512 KiB.");
  const [header, ...rows] = rowsFromCsv(text);
  if (!header || !rows.length) throw Error("The invoice reconciliation CSV has no lines.");
  const required = ["InvoiceNumber", "CustomerId", "Currency", "Subtotal", "TaxTotal", "Total"] as const;
  const keys = header.map(h => h.trim().toLowerCase());
  const indexes = required.map(name => {
    const key = name.toLowerCase();
    if (keys.filter(k => k === key).length !== 1) throw Error(`The CSV needs exactly one ${name} column.`);
    return keys.indexOf(key);
  });
  let id = "", currency = "", grand = 0n;
  const totals = new Map<string, { count: number; subtotal: bigint; tax: bigint; total: bigint }>();
  for (const row of rows) {
    if (row.length !== keys.length) throw Error("An invoice row has a different number of columns.");
    const [rawId, customer, rawCurrency, preTax, tax, total] = indexes.map(n => row[n]!.trim()) as [string, string, string, string, string, string];
    const invoiceId = field(rawId, 100, "invoice number", true);
    const code = rawCurrency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || (currency && code !== currency) || (id && invoiceId !== id)) {
      throw Error("Use a file with exactly one invoice and billing currency.");
    }
    id = invoiceId; currency = code;
    const tenant = guid(customer, "billing customer ID");
    const g = totals.get(tenant) ?? { count: 0, subtotal: 0n, tax: 0n, total: 0n };
    g.count++;
    g.subtotal += money(preTax);
    g.tax += money(tax);
    const amount = money(total);
    g.total += amount; grand += amount;
    totals.set(tenant, g);
  }
  if (totals.size > 256) throw Error("The invoice exceeds 256 customer groups.");
  return {
    id, currency, importedAt: new Date(now).toISOString(),
    recorded: decimal(money(field(expected, 40, "invoiced charges total", true))), total: decimal(grand),
    groups: [...totals].map(([tenant, g]) => ({ tenant, count: g.count, subtotal: decimal(g.subtotal), tax: decimal(g.tax), total: decimal(g.total) })),
  };
}

export function variance(invoice: Invoice): string {
  return decimal(money(invoice.total) - money(invoice.recorded));
}

export function readInvoices(value: unknown): Invoice[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) throw Error("Invalid retained invoice list.");
  return value.map(item => {
    const source = item as Invoice;
    const currency = field(source.currency, 3, "billing currency", true);
    if (!/^[A-Z]{3}$/.test(currency) || !Array.isArray(source.groups) || source.groups.length > 256) throw Error("Invalid retained invoice.");
    const groups = source.groups.map(g => {
      if (!Number.isSafeInteger(g.count) || g.count < 1 || g.count > 3000) throw Error("Invalid retained charge count.");
      return { tenant: guid(g.tenant, "billing customer ID"), count: g.count, subtotal: decimal(money(g.subtotal)), tax: decimal(money(g.tax)), total: decimal(money(g.total)) };
    });
    if (new Set(groups.map(g => g.tenant)).size !== groups.length || groups.reduce((sum, g) => sum + money(g.total), 0n) !== money(source.total)) {
      throw Error("Retained invoice totals do not agree.");
    }
    return { id: field(source.id, 100, "invoice number", true), currency, importedAt: new Date(source.importedAt).toISOString(),
      recorded: decimal(money(source.recorded)), total: decimal(money(source.total)), groups };
  });
}
