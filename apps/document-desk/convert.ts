// Every file kind Document Desk keeps becomes Markdown here, inside the app's
// sandbox, with node built-ins only. The host hands over raw bytes (DOCX), text
// (Markdown, plain text, HTML, CSV, JSON) or page text from the system PDF
// engine; nothing here reaches the network or the file system.
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
