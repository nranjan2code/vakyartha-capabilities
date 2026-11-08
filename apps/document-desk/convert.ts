// Every file kind Document Desk keeps becomes Markdown here, inside the app's
// sandbox, with node built-ins only. The host hands over raw bytes (DOCX, XLSX,
// PPTX, OpenDocument, EPUB, RTF, email), text (Markdown, plain text, HTML, CSV,
// JSON) or page text from the system PDF engine; nothing here reaches the network or the file system.
import { inflateRawSync } from "node:zlib";

export interface Converted { title: string; markdown: string; pages?: number; note?: string }
export interface Incoming { name: string; kind: string; text?: string; bytes?: Uint8Array; pages?: string[]; pdfTitle?: string }

/** The longest Markdown one document keeps; longer text is cut with a note. */
export const MAX_MARKDOWN = 4 * 1024 * 1024;

const stem = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
const firstHeading = (md: string) => /^\s{0,3}#\s+(.+?)\s*#*\s*$/m.exec(md)?.[1]?.trim();
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·" };
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const tidy = (md: string) => md.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export function convert(input: Incoming): Converted {
  const out = convertRaw(input);
  let markdown = tidy(out.markdown);
  let note = out.note;
  if (markdown.length > MAX_MARKDOWN) { markdown = markdown.slice(0, MAX_MARKDOWN); note = `Only the first ${MAX_MARKDOWN / 1024 / 1024} MB of text is kept.`; }
  return { ...out, markdown, note, title: (out.title || stem(input.name)).slice(0, 200) };
}

function convertRaw(input: Incoming): Converted {
  switch (input.kind) {
    case "md": case "markdown": { const md = stripFrontMatter(input.text ?? ""); return { title: md.title ?? firstHeading(md.body) ?? "", markdown: md.body }; }
    case "txt": case "text": return { title: "", markdown: input.text ?? "" };
    case "html": case "htm": return htmlToMarkdown(input.text ?? "");
    case "csv": case "tsv": return { title: "", markdown: delimitedToMarkdown(input.text ?? "", input.kind === "tsv" ? "\t" : sniffDelimiter(input.text ?? "")) };
    case "json": return { title: "", markdown: jsonToMarkdown(input.text ?? "") };
    case "docx": return docxToMarkdown(input.bytes ?? new Uint8Array());
    case "pdf": return pdfToMarkdown(input.pages ?? [], input.pdfTitle);
    case "xlsx": return xlsxToMarkdown(input.bytes ?? new Uint8Array());
    case "ods": return odsToMarkdown(input.bytes ?? new Uint8Array());
    case "odt": return odtToMarkdown(input.bytes ?? new Uint8Array());
    case "pptx": return pptxToMarkdown(input.bytes ?? new Uint8Array());
    case "odp": return odpToMarkdown(input.bytes ?? new Uint8Array());
    case "epub": return epubToMarkdown(input.bytes ?? new Uint8Array());
    case "rtf": return rtfToMarkdown(Buffer.from(input.bytes ?? new Uint8Array()).toString("latin1"));
    case "eml": return emlToMarkdown(Buffer.from(input.bytes ?? new Uint8Array()).toString("latin1"));
    default: throw new Error(`${input.name}: this kind of file is not kept`);
  }
}

function stripFrontMatter(text: string): { title?: string; body: string } {
  const m = /^---\n([\s\S]{0,4000}?)\n---\n?/.exec(text.replace(/\r\n?/g, "\n"));
  if (!m) return { body: text };
  const title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(m[1]!)?.[1];
  return { title, body: text.replace(/\r\n?/g, "\n").slice(m[0].length) };
}

// ---------- HTML ----------

export function htmlToMarkdown(html: string): Converted {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "");
  let s = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|head|title|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c: string) => `\n\n\`\`\`\n${decodeEntities(c.replace(/<[^>]+>/g, ""))}\n\`\`\`\n\n`);
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, t: string) => `\n\n${htmlTable(t)}\n\n`);
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, c: string) => `\n\n${"#".repeat(Number(n))} ${inline(c)}\n\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)(?=<li[\s>]|<\/[ou]l>)/gi, (_, c: string) => `\n- ${inline(c.replace(/<\/li>/gi, ""))}`);
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c: string) => `\n\n${inline(c).split("\n").map(l => `> ${l}`).join("\n")}\n\n`);
  s = s.replace(/<(p|div|section|article|header|footer|main|aside|nav|figure|figcaption|ul|ol|dl|dt|dd|tr)[^>]*>/gi, "\n\n").replace(/<\/(p|div|section|article|header|footer|main|aside|nav|figure|figcaption|ul|ol|dl|dt|dd|tr)>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<hr[^>]*>/gi, "\n\n---\n\n");
  const body = s.split(/\n/).map(l => (/^(#{1,6} |- |> |\| |```)/.test(l) ? l : inline(l))).join("\n");
  return { title, markdown: body };
}

function inline(html: string): string {
  return decodeEntities(html
    .replace(/<a\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, t: string) => { const text = t.replace(/<[^>]+>/g, "").trim(); return text ? (href && !/^javascript:/i.test(href) ? `[${text}](${href})` : text) : ""; })
    .replace(/<img\s[^>]*alt\s*=\s*["']([^"']*)["'][^>]*>/gi, "$1")
    .replace(/<(strong|b)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "**$3**").replace(/<(em|i)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "*$3*")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t ]+/g, " ").trim();
}

function htmlTable(t: string): string {
  const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1]!.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => inline(c[1]!).replace(/\|/g, "\\|").replace(/\n/g, " ")));
  return markdownTable(rows.filter(r => r.length));
}

function markdownTable(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map(r => r.length));
  const pad = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
  return [pad(rows[0]!), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(pad)].join("\n");
}

// ---------- CSV, TSV, JSON ----------

const MAX_ROWS = 2000;
function sniffDelimiter(text: string): string {
  const head = text.split(/\r?\n/, 5).join("\n");
  return [",", ";", "\t", "|"].map(d => [d, head.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
}
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"' && !cell) quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; if (rows.length > MAX_ROWS) break; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function delimitedToMarkdown(text: string, delimiter: string): string {
  const rows = parseDelimited(text.replace(/^﻿/, ""), delimiter);
  const table = markdownTable(rows.slice(0, MAX_ROWS + 1).map(r => r.map(c => c.trim().replace(/\|/g, "\\|").replace(/\s+/g, " "))));
  return rows.length > MAX_ROWS + 1 ? `${table}\n\nOnly the first ${MAX_ROWS} rows are kept.` : table;
}
function jsonToMarkdown(text: string): string {
  try { return `\`\`\`json\n${JSON.stringify(JSON.parse(text), null, 2)}\n\`\`\``; }
  catch { return `\`\`\`\n${text}\n\`\`\``; }
}

// ---------- PDF ----------

/** Page text from the system PDF engine: visual lines joined into paragraphs, hyphenation undone, one section per page. */
export function pdfToMarkdown(pages: string[], pdfTitle?: string): Converted {
  const body = pages.map((page, i) => {
    const lines = page.replace(/\r\n?/g, "\n").replace(/­/g, "").split("\n").map(l => l.replace(/\s+/g, " ").trim());
    const paras: string[] = [];
    let current = "";
    for (const line of lines) {
      if (!line) { if (current) paras.push(current); current = ""; continue; }
      if (!current) current = line;
      else if (/[a-z]-$/.test(current) && /^[a-z]/.test(line)) current = current.slice(0, -1) + line;
      else if (/[.:!?"”)]$/.test(current) && /^[A-Z0-9•\-–(]/.test(line) && line.length < 90 && current.length < 90) { paras.push(current); current = line; }
      else current += ` ${line}`;
    }
    if (current) paras.push(current);
    return paras.length ? `## Page ${i + 1}\n\n${paras.join("\n\n")}` : "";
  }).filter(Boolean).join("\n\n");
  const title = pdfTitle && !/\.pdf$/i.test(pdfTitle) && pdfTitle.trim().length > 2 ? pdfTitle.trim() : "";
  return { title, markdown: body, pages: pages.length, note: pages.length && !body ? "This PDF has no text layer (it may be scanned). Its text cannot be searched yet." : undefined };
}

// ---------- DOCX ----------

/** The named entries of a ZIP archive, read from its central directory. Stored and deflated entries only. */
export function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Map<string, Buffer> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("This file is not a valid DOCX document");
  const count = buf.readUInt16LE(end + 10), out = new Map<string, Buffer>();
  let p = buf.readUInt32LE(end + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), raw = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extra + comment;
    if (!wanted(name) || raw > 64 * 1024 * 1024 || local + 30 > buf.length) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 }));
  }
  return out;
}

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const xmlText = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ""));

export function docxToMarkdown(bytes: Uint8Array): Converted {
  const files = unzip(bytes, n => n === "word/document.xml" || n === "word/_rels/document.xml.rels" || n === "docProps/core.xml" || n === "word/styles.xml");
  const doc = files.get("word/document.xml")?.toString("utf8");
  if (!doc) throw new Error("This DOCX document has no body");
  const rels = new Map([...(files.get("word/_rels/document.xml.rels")?.toString("utf8") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  // Custom heading styles name their outline level in styles.xml.
  const levels = new Map<string, number>();
  for (const m of (files.get("word/styles.xml")?.toString("utf8") ?? "").matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const name = /<w:name w:val="([^"]+)"/.exec(m[2]!)?.[1] ?? "";
    const level = /<w:outlineLvl w:val="(\d)"/.exec(m[2]!)?.[1];
    const fromName = /^(heading|überschrift|titre|título)\s*(\d)$/i.exec(name)?.[2];
    if (level !== undefined) levels.set(m[1]!, Number(level) + 1);
    else if (fromName) levels.set(m[1]!, Number(fromName));
    else if (/^title$/i.test(name)) levels.set(m[1]!, 1);
  }
  const title = xmlText(/<dc:title>([\s\S]*?)<\/dc:title>/.exec(files.get("docProps/core.xml")?.toString("utf8") ?? "")?.[1] ?? "").trim();
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(doc)?.[1] ?? doc;
  const blocks: string[] = [];
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)) {
    const block = m[0];
    if (block.startsWith("<w:tbl>")) {
      const rows = [...block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(r => [...r[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(c => [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(p => runs(p[0], rels)).join(" ").replace(/\|/g, "\\|").trim()));
      blocks.push(markdownTable(rows));
      continue;
    }
    const text = runs(block, rels).trim();
    if (!text) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(block)?.[1] ?? "";
    const level = levels.get(style) ?? (/^(Heading|Title)(\d?)$/i.exec(style) ? Number(/\d/.exec(style)?.[0] ?? 1) : 0);
    if (level) blocks.push(`${"#".repeat(Math.min(6, level))} ${text.replace(/\*\*/g, "")}`);
    else if (/<w:numPr>/.test(block) || /^List/i.test(style)) blocks.push(`${"  ".repeat(Number(/<w:ilvl w:val="(\d)"/.exec(block)?.[1] ?? 0))}- ${text}`);
    else if (/^Quote|IntenseQuote$/i.test(style)) blocks.push(`> ${text}`);
    else blocks.push(text);
  }
  // List items stay together; everything else is a paragraph.
  const markdown = blocks.reduce((md, b, i) => md + (i === 0 ? "" : /^\s*- /.test(b) && /^\s*- /.test(blocks[i - 1]!) ? "\n" : "\n\n") + b, "");
  return { title, markdown };
}

function runs(paragraph: string, rels: Map<string, string>): string {
  let out = "";
  for (const m of paragraph.matchAll(/<w:hyperlink\b[^>]*>[\s\S]*?<\/w:hyperlink>|<w:r\b[\s\S]*?<\/w:r>/g)) {
    const part = m[0];
    if (part.startsWith("<w:hyperlink")) {
      const target = rels.get(attr(part, "r:id") ?? "");
      const text = [...part.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)].map(r => runText(r[0])).join("");
      out += target && /^https?:|^mailto:/.test(target) && text.trim() ? `[${text.trim()}](${target})` : text;
    } else out += runText(part, true);
  }
  return out.replace(/\*\*\s*\*\*/g, "").replace(/[ \t]+/g, " ");
}

function runText(run: string, styled = false): string {
  const text = [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)].map(t => t[1] !== undefined ? xmlText(t[1]) : t[2] === "tab" ? "\t" : "\n").join("");
  if (!styled || !text.trim()) return text;
  const bold = /<w:b\/>|<w:b w:val="(1|true)"\/>/.test(run), italic = /<w:i\/>|<w:i w:val="(1|true)"\/>/.test(run);
  const lead = /^\s*/.exec(text)![0], trail = /\s*$/.exec(text)![0], core = text.trim();
  return lead + (bold ? `**${italic ? `*${core}*` : core}**` : italic ? `*${core}*` : core) + trail;
}

// ---------- Spreadsheets: XLSX and ODS ----------

const MAX_SHEET_ROWS = 2000;
const colIndex = (ref: string) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? "A") n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const cellText = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function xlsxToMarkdown(bytes: Uint8Array): Converted {
  const files = unzip(bytes, n => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n) || n === "docProps/core.xml");
  const book = files.get("xl/workbook.xml")?.toString("utf8");
  if (!book) throw new Error("This file is not a valid XLSX workbook");
  const rels = new Map([...(files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  const shared = [...(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1]!)).join(""));
  let left = MAX_SHEET_ROWS;
  const sections = [...book.matchAll(/<sheet\b[^>]*\/>/g)].map(m => {
    const name = decodeEntities(attr(m[0], "name") ?? "Sheet"), target = rels.get(attr(m[0], "r:id") ?? "") ?? "";
    const xml = files.get(`xl/${target.replace(/^\/?xl\//, "")}`)?.toString("utf8") ?? "";
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (left-- <= 0) break;
      const row: string[] = [];
      for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = attr(c[1]!, "t"), v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? "")?.[1];
        const text = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? xmlText(/<is>([\s\S]*?)<\/is>/.exec(c[2] ?? "")?.[1] ?? "") : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : xmlText(v ?? "");
        row[colIndex(attr(c[1]!, "r") ?? "A")] = cellText(text);
      }
      if (row.some(x => x)) rows.push(Array.from(row, x => x ?? ""));
    }
    return rows.length ? `## ${name}\n\n${markdownTable(rows)}` : "";
  }).filter(Boolean);
  const title = xmlText(/<dc:title>([\s\S]*?)<\/dc:title>/.exec(files.get("docProps/core.xml")?.toString("utf8") ?? "")?.[1] ?? "").trim();
  return { title, markdown: sections.join("\n\n") + (left < 0 ? `\n\nOnly the first ${MAX_SHEET_ROWS} rows are kept.` : "") };
}

/** OpenDocument cell and paragraph text: spans, spaces, tabs and line breaks. */
function odfText(xml: string): string {
  return decodeEntities(xml
    .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n: string) => " ".repeat(Math.min(Number(n ?? 1), 40)))
    .replace(/<text:tab\s*\/>/g, "\t").replace(/<text:line-break\s*\/>/g, "\n")
    .replace(/<text:note\b[\s\S]*?<\/text:note>/g, "")
    .replace(/<text:a\b[^>]*xlink:href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/text:a>/g, (_, href: string, t: string) => `[${t.replace(/<[^>]+>/g, "")}](${href})`)
    .replace(/<[^>]+>/g, ""));
}
const odfMeta = (files: Map<string, Buffer>) => xmlText(/<dc:title>([\s\S]*?)<\/dc:title>/.exec(files.get("meta.xml")?.toString("utf8") ?? "")?.[1] ?? "").trim();
const odfFiles = (bytes: Uint8Array, what: string) => {
  const files = unzip(bytes, n => n === "content.xml" || n === "meta.xml");
  const content = files.get("content.xml")?.toString("utf8");
  if (!content) throw new Error(`This file is not a valid ${what}`);
  return { files, body: /<office:body>([\s\S]*)<\/office:body>/.exec(content)?.[1] ?? content };
};

function odfTable(xml: string, limit = MAX_SHEET_ROWS): string[][] {
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g)) {
    if (rows.length >= limit) break;
    const row: string[] = [];
    for (const c of r[2]!.matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
      const text = cellText([...(c[2] ?? "").matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)].map(p => odfText(p[1]!)).join(" ") || (attr(c[1]!, "office:value") ?? ""));
      // Repeated empty cells pad the sheet to its width; only repeats of real values are kept.
      const repeat = Math.min(Number(attr(c[1]!, "table:number-columns-repeated") ?? 1), text ? 50 : 1);
      for (let i = 0; i < repeat; i++) row.push(text);
    }
    while (row.length && !row.at(-1)) row.pop();
    if (row.length) rows.push(row);
  }
  return rows;
}

export function odsToMarkdown(bytes: Uint8Array): Converted {
  const { files, body } = odfFiles(bytes, "ODS spreadsheet");
  const sections = [...body.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)].map(t => {
    const rows = odfTable(t[2]!);
    return rows.length ? `## ${decodeEntities(attr(t[1]!, "table:name") ?? "Sheet")}\n\n${markdownTable(rows)}` : "";
  }).filter(Boolean);
  return { title: odfMeta(files), markdown: sections.join("\n\n") };
}

export function odtToMarkdown(bytes: Uint8Array): Converted {
  const { files, body } = odfFiles(bytes, "ODT document");
  const blocks: string[] = [];
  for (const m of body.matchAll(/<table:table\b[\s\S]*?<\/table:table>|<text:h\b([^>]*)>([\s\S]*?)<\/text:h>|<text:list-item\b[^>]*>([\s\S]*?)<\/text:list-item>|<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)) {
    if (m[0].startsWith("<table:table")) { const rows = odfTable(m[0]); if (rows.length) blocks.push(markdownTable(rows)); }
    else if (m[2] !== undefined) { const t = odfText(m[2]).trim(); if (t) blocks.push(`${"#".repeat(Math.min(6, Number(attr(m[1]!, "text:outline-level") ?? 1)))} ${t}`); }
    else if (m[3] !== undefined) { const t = [...m[3].matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)].map(p => odfText(p[1]!).trim()).filter(Boolean).join(" "); if (t) blocks.push(`- ${t}`); }
    else { const t = odfText(m[4] ?? "").trim(); if (t) blocks.push(t); }
  }
  return { title: odfMeta(files), markdown: blocks.reduce((md, b, i) => md + (i === 0 ? "" : b.startsWith("- ") && blocks[i - 1]!.startsWith("- ") ? "\n" : "\n\n") + b, "") };
}

// ---------- Presentations: PPTX and ODP ----------

export function pptxToMarkdown(bytes: Uint8Array): Converted {
  const files = unzip(bytes, n => n === "ppt/presentation.xml" || n === "ppt/_rels/presentation.xml.rels" || /^ppt\/slides\/slide\d+\.xml$/.test(n) || n === "docProps/core.xml");
  const pres = files.get("ppt/presentation.xml")?.toString("utf8");
  if (!pres) throw new Error("This file is not a valid PPTX presentation");
  const rels = new Map([...(files.get("ppt/_rels/presentation.xml.rels")?.toString("utf8") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  const slides = [...pres.matchAll(/<p:sldId\b[^>]*\/>/g)].map(m => rels.get(attr(m[0], "r:id") ?? "") ?? "").filter(Boolean);
  const sections = slides.map((target, i) => {
    const xml = files.get(`ppt/${target.replace(/^\/?ppt\//, "")}`)?.toString("utf8") ?? "";
    let title = "";
    const lines: string[] = [];
    for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
      const isTitle = /<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(sp[0]);
      const paras = [...sp[0].matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map(p => [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(t => xmlText(t[1]!)).join("").trim()).filter(Boolean);
      if (isTitle && !title) title = paras.join(" ");
      else lines.push(...paras.map(p => `- ${p}`));
    }
    for (const t of xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)) lines.push(markdownTable([...t[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)].map(r => [...r[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map(c => cellText([...c[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(x => xmlText(x[1]!)).join(" "))))));
    return `## Slide ${i + 1}${title ? `: ${title}` : ""}${lines.length ? `\n\n${lines.join("\n")}` : ""}`;
  });
  const title = xmlText(/<dc:title>([\s\S]*?)<\/dc:title>/.exec(files.get("docProps/core.xml")?.toString("utf8") ?? "")?.[1] ?? "").trim();
  return { title, markdown: sections.join("\n\n"), pages: slides.length };
}

export function odpToMarkdown(bytes: Uint8Array): Converted {
  const { files, body } = odfFiles(bytes, "ODP presentation");
  const pages = [...body.matchAll(/<draw:page\b([^>]*)>([\s\S]*?)<\/draw:page>/g)];
  const sections = pages.map((p, i) => {
    const frames = [...p[2]!.matchAll(/<draw:frame\b([^>]*)>([\s\S]*?)<\/draw:frame>/g)];
    let title = "";
    const lines: string[] = [];
    for (const f of frames) {
      if (/presentation:class="notes"/.test(f[1]!)) continue;
      const paras = [...f[2]!.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)].map(x => odfText(x[1]!).trim()).filter(Boolean);
      if (/presentation:class="title"/.test(f[1]!) && !title) title = paras.join(" ");
      else lines.push(...paras.map(x => `- ${x}`));
    }
    return `## Slide ${i + 1}${title ? `: ${title}` : ""}${lines.length ? `\n\n${lines.join("\n")}` : ""}`;
  });
  return { title: odfMeta(files), markdown: sections.join("\n\n"), pages: pages.length };
}

// ---------- EPUB ----------

export function epubToMarkdown(bytes: Uint8Array): Converted {
  const container = unzip(bytes, n => n === "META-INF/container.xml").get("META-INF/container.xml")?.toString("utf8");
  const opfPath = container && attr(/<rootfile\b[^>]*>/.exec(container)?.[0] ?? "", "full-path");
  if (!opfPath) throw new Error("This file is not a valid EPUB book");
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opf = unzip(bytes, n => n === opfPath).get(opfPath)?.toString("utf8") ?? "";
  const items = new Map([...opf.matchAll(/<item\b[^>]*>/g)].map(m => [attr(m[0], "id") ?? "", attr(m[0], "href") ?? ""]));
  const order = [...opf.matchAll(/<itemref\b[^>]*>/g)].map(m => items.get(attr(m[0], "idref") ?? "") ?? "").filter(h => /\.x?html?$/i.test(h)).map(h => base + decodeURIComponent(h));
  const wanted = new Set(order);
  const files = unzip(bytes, n => wanted.has(n));
  const chapters = order.map(p => { const html = files.get(p)?.toString("utf8") ?? ""; return htmlToMarkdown(/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html).markdown.trim(); }).filter(Boolean);
  return { title: xmlText(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf)?.[1] ?? "").trim(), markdown: tidy(chapters.join("\n\n")) };
}

// ---------- RTF ----------

const CP1252: Record<number, string> = { 0x80: "€", 0x82: "‚", 0x84: "„", 0x85: "…", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x99: "™" };
/** Plain text of an RTF document: destinations such as fonts, colours, pictures and metadata skipped; Unicode and code-page escapes decoded. */
export function rtfToMarkdown(rtf: string): Converted {
  if (!rtf.startsWith("{\\rtf")) throw new Error("This file is not a valid RTF document");
  const title = /\{\\title\s+([^}]*)\}/.exec(rtf)?.[1]?.trim() ?? "";
  const SKIP = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl", "footerr", "object", "listtable", "listoverridetable", "rsidtbl", "generator", "xmlnstbl", "themedata", "colorschememapping", "latentstyles", "datastore", "fldinst"]);
  let out = "", i = 0, skipDepth = -1, depth = 0, uc = 1, pendingSkip = 0;
  const stack: number[] = [];
  while (i < rtf.length) {
    const ch = rtf[i]!;
    if (ch === "{") { stack.push(uc); depth++; i++; if (rtf.startsWith("\\*", i) && skipDepth < 0) skipDepth = depth; continue; }
    if (ch === "}") { if (skipDepth === depth) skipDepth = -1; depth--; uc = stack.pop() ?? 1; i++; continue; }
    if (ch === "\\") {
      const next = rtf[i + 1] ?? "";
      if (next === "\\" || next === "{" || next === "}") { if (skipDepth < 0) out += next; i += 2; continue; }
      if (next === "'") { const code = parseInt(rtf.slice(i + 2, i + 4), 16); if (pendingSkip > 0) pendingSkip--; else if (skipDepth < 0) out += CP1252[code] ?? String.fromCharCode(code); i += 4; continue; }
      if (next === "~") { if (skipDepth < 0) out += " "; i += 2; continue; }
      if (next === "-" || next === "_") { i += 2; continue; }
      const m = /^\\([a-z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (!m) { i++; continue; }
      i += m[0].length;
      const word = m[1]!, arg = m[2] === undefined ? undefined : Number(m[2]);
      if (SKIP.has(word) && skipDepth < 0) { skipDepth = depth; continue; }
      if (skipDepth >= 0) continue;
      if (word === "par" || word === "line" || word === "sect" || word === "page") out += "\n";
      else if (word === "tab" || word === "cell") out += "\t";
      else if (word === "row") out += "\n";
      else if (word === "uc" && arg !== undefined) uc = arg;
      else if (word === "u" && arg !== undefined) { out += String.fromCharCode(arg < 0 ? arg + 65536 : arg); pendingSkip = uc; }
      else if (word === "emdash") out += "—"; else if (word === "endash") out += "–"; else if (word === "bullet") out += "•";
      else if (word === "lquote") out += "‘"; else if (word === "rquote") out += "’"; else if (word === "ldblquote") out += "“"; else if (word === "rdblquote") out += "”";
      continue;
    }
    if (ch === "\r" || ch === "\n") { i++; continue; }
    if (skipDepth < 0) { if (pendingSkip > 0) pendingSkip--; else out += ch; }
    i++;
  }
  return { title, markdown: tidy(out.split("\n").map(l => l.replace(/\t+$/, "").trimEnd()).join("\n\n")) };
}

// ---------- Email (.eml) ----------

function decodeWords(s: string): string {
  // Whitespace between two encoded words is dropped; whitespace before ordinary text is kept.
  return s.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=(?:\s+(?==\?))?/g, (_, cs: string, enc: string, text: string) => {
    const bytes = enc.toUpperCase() === "B" ? Buffer.from(text, "base64") : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
    try { return new TextDecoder(cs).decode(bytes); } catch { return bytes.toString("utf8"); }
  });
}
function parseMime(raw: string): { headers: Map<string, string>; body: string } {
  const split = raw.search(/\r?\n\r?\n/);
  const head = split < 0 ? raw : raw.slice(0, split), body = split < 0 ? "" : raw.slice(split).replace(/^\r?\n\r?\n/, "");
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) { const k = line.indexOf(":"); if (k > 0) { const name = line.slice(0, k).trim().toLowerCase(); if (!headers.has(name)) headers.set(name, line.slice(k + 1).trim()); } }
  return { headers, body };
}
function decodeBody(part: { headers: Map<string, string>; body: string }): string {
  const enc = (part.headers.get("content-transfer-encoding") ?? "").toLowerCase(), charset = /charset="?([^";\s]+)/i.exec(part.headers.get("content-type") ?? "")?.[1] ?? "utf-8";
  const bytes = enc === "base64" ? Buffer.from(part.body.replace(/\s+/g, ""), "base64")
    : enc === "quoted-printable" ? Buffer.from(part.body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1")
    : Buffer.from(part.body, "latin1");
  try { return new TextDecoder(charset).decode(bytes); } catch { return bytes.toString("utf8"); }
}
/** The readable text of a message: plain text preferred over HTML, nested parts followed, attachments named. */
function mimeText(part: { headers: Map<string, string>; body: string }, attachments: string[], depth = 0): { plain?: string; html?: string } {
  const type = (part.headers.get("content-type") ?? "text/plain").toLowerCase();
  const disposition = part.headers.get("content-disposition") ?? "";
  const filename = /filename\*?="?([^";]+)/i.exec(disposition)?.[1] ?? /name="?([^";]+)/i.exec(part.headers.get("content-type") ?? "")?.[1];
  if (/^attachment/i.test(disposition) || (filename && !type.startsWith("multipart/"))) { if (filename) attachments.push(decodeWords(filename)); return {}; }
  if (type.startsWith("multipart/") && depth < 6) {
    const boundary = /boundary="?([^";]+)"?/i.exec(part.headers.get("content-type") ?? "")?.[1];
    if (!boundary) return {};
    const out: { plain?: string; html?: string } = {};
    for (const chunk of part.body.split(`--${boundary}`).slice(1)) {
      if (chunk.startsWith("--")) break;
      const sub = mimeText(parseMime(chunk.replace(/^\r?\n/, "")), attachments, depth + 1);
      out.plain ??= sub.plain; out.html ??= sub.html;
    }
    return out;
  }
  if (type.startsWith("text/html")) return { html: decodeBody(part) };
  if (type.startsWith("text/")) return { plain: decodeBody(part) };
  return {};
}
export function emlToMarkdown(raw: string): Converted {
  const message = parseMime(raw.replace(/^﻿/, ""));
  if (!message.headers.has("from") && !message.headers.has("subject")) throw new Error("This file is not a valid email message");
  const attachments: string[] = [];
  const text = mimeText(message, attachments);
  const body = text.plain?.trim() || (text.html ? htmlToMarkdown(text.html).markdown : "");
  const h = (k: string) => decodeWords(message.headers.get(k) ?? "");
  const meta = [["From", h("from")], ["To", h("to")], ["Cc", h("cc")], ["Date", h("date")]].filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`);
  return { title: h("subject"), markdown: [...(meta.length ? [meta.join("\n")] : []), body, ...(attachments.length ? [`Attachments: ${attachments.join(", ")}`] : [])].filter(Boolean).join("\n\n") };
}
