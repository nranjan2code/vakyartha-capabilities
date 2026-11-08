// The library's one data owner is the app database: document records and their
// Markdown, kept in 60,000-character chunks so every read stays under the
// host's per-query bound. The search index is derived from it in module memory
// and rebuilt whenever the corpus revision in state moves.
import { createHash } from "node:crypto";

export interface Database { run(sql: string, values?: unknown[]): Promise<void>; query(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]> }
export interface Doc {
  id: string; title: string; kind: string; source: "upload" | "folder"; folder: string; path: string; upload: string; name: string;
  size: number; modified: number; sha256: string; added: string; updated: string;
  status: "indexed" | "empty" | "failed"; note: string; words: number; pages: number; tags: string[];
}
/** What `context.search` provides: Projection's engine (`@vak/providers/search`). */
export interface SearchEngine {
  DocumentIndex: new (options?: { passageChars?: number; linkBoost?: number }) => DocumentIndexLike;
  grep: (documents: Iterable<{ id: string; text: string }>, pattern: string, options?: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean; context?: number; limit?: number }) => GrepResult;
  markdownLinks: (markdown: string) => string[];
  plainText: (markdown: string) => string;
}
export interface Highlight { start: number; end: number }
export interface DocumentHitLike { id: string; title: string; score: number; coverage: number; linkRank: number; passages: { id: string; headings: string[]; line: number; snippet: string; highlights: Highlight[]; score: number }[] }
export interface DocumentIndexLike { add(doc: { id: string; title: string; text: string; tags?: string[]; links?: string[] }): unknown; search(query: string, options?: { limit?: number; passagesPerDocument?: number; include?: (id: string) => boolean }): DocumentHitLike[]; linkRanks(): Map<string, number>; size: number }
export interface GrepResult { matches: { documentId: string; line: number; text: string; ranges: Highlight[]; before: string[]; after: string[] }[]; total: number; truncated: boolean }

export interface Library { rev: number; docs: Map<string, Doc>; texts: Map<string, string>; index: DocumentIndexLike; links: Map<string, string[]>; backlinks: Map<string, string[]> }

const CHUNK = 60_000;
const COLUMNS = "id, title, kind, source, folder, path, upload, name, size, modified, sha256, added, updated, status, note, words, pages, tags";

export async function ensureSchema(db: Database): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS documents (id VARCHAR PRIMARY KEY, title VARCHAR, kind VARCHAR, source VARCHAR, folder VARCHAR, path VARCHAR, upload VARCHAR, name VARCHAR, size BIGINT, modified BIGINT, sha256 VARCHAR, added VARCHAR, updated VARCHAR, status VARCHAR, note VARCHAR, words INTEGER, pages INTEGER, tags VARCHAR)`);
  await db.run("CREATE TABLE IF NOT EXISTS chunks (doc VARCHAR, seq INTEGER, text VARCHAR, PRIMARY KEY (doc, seq))");
}

export const folderDocId = (folder: string, path: string) => `f-${createHash("sha256").update(`${folder}\0${path}`).digest("hex").slice(0, 20)}`;
export const uploadDocId = (upload: string) => `u-${upload}`;

function rowToDoc(r: Record<string, unknown>): Doc {
  let tags: string[] = [];
  try { const t = JSON.parse(String(r.tags ?? "[]")); if (Array.isArray(t)) tags = t.filter((x): x is string => typeof x === "string"); } catch { /* an unreadable tag list is no tags */ }
  return {
    id: String(r.id), title: String(r.title ?? ""), kind: String(r.kind ?? ""), source: r.source === "folder" ? "folder" : "upload", folder: String(r.folder ?? ""), path: String(r.path ?? ""), upload: String(r.upload ?? ""), name: String(r.name ?? ""),
    size: Number(r.size ?? 0), modified: Number(r.modified ?? 0), sha256: String(r.sha256 ?? ""), added: String(r.added ?? ""), updated: String(r.updated ?? ""),
    status: r.status === "failed" ? "failed" : r.status === "empty" ? "empty" : "indexed", note: String(r.note ?? ""), words: Number(r.words ?? 0), pages: Number(r.pages ?? 0), tags,
  };
}

/** Every document record, paged by id so each read stays small. */
export async function loadDocs(db: Database): Promise<Map<string, Doc>> {
  const docs = new Map<string, Doc>();
  let after = "";
  for (;;) {
    const rows = await db.query(`SELECT ${COLUMNS} FROM documents WHERE id > ? ORDER BY id LIMIT 400`, [after]);
    for (const r of rows) docs.set(String(r.id), rowToDoc(r));
    if (rows.length < 400) return docs;
    after = String(rows.at(-1)!.id);
  }
}

/** Every document's Markdown, three chunks per read. */
export async function loadTexts(db: Database): Promise<Map<string, string>> {
  const parts = new Map<string, string[]>();
  let doc = "", seq = -1;
  for (;;) {
    const rows = await db.query("SELECT doc, seq, text FROM chunks WHERE doc > ? OR (doc = ? AND seq > ?) ORDER BY doc, seq LIMIT 3", [doc, doc, seq]);
    for (const r of rows) { const d = String(r.doc); (parts.get(d) ?? parts.set(d, []).get(d)!).push(String(r.text ?? "")); }
    if (rows.length < 3) break;
    doc = String(rows.at(-1)!.doc); seq = Number(rows.at(-1)!.seq);
  }
  return new Map([...parts].map(([d, p]) => [d, p.join("")]));
}

export async function saveDoc(db: Database, doc: Doc, markdown?: string): Promise<void> {
  await db.run("DELETE FROM documents WHERE id = ?", [doc.id]);
  await db.run(`INSERT INTO documents (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [doc.id, doc.title, doc.kind, doc.source, doc.folder, doc.path, doc.upload, doc.name, doc.size, doc.modified, doc.sha256, doc.added, doc.updated, doc.status, doc.note, doc.words, doc.pages, JSON.stringify(doc.tags)]);
  if (markdown === undefined) return;
  await db.run("DELETE FROM chunks WHERE doc = ?", [doc.id]);
  for (let i = 0, seq = 0; i < markdown.length; i += CHUNK, seq++) await db.run("INSERT INTO chunks VALUES (?,?,?)", [doc.id, seq, markdown.slice(i, i + CHUNK)]);
}

export async function deleteDoc(db: Database, id: string): Promise<void> {
  await db.run("DELETE FROM chunks WHERE doc = ?", [id]);
  await db.run("DELETE FROM documents WHERE id = ?", [id]);
}

/** Link targets resolved to ids by title, file name or relative path; unresolved targets are dropped. */
export function resolveLinks(docs: Map<string, Doc>, texts: Map<string, string>, engine: SearchEngine): Map<string, string[]> {
  const byKey = new Map<string, string>();
  const key = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]{1,8}$/, "").replace(/[_-]+/g, " ").trim();
  for (const d of docs.values()) for (const k of [d.title, d.name, d.path, d.path.split("/").pop() ?? ""]) if (k) byKey.set(key(k), d.id);
  const out = new Map<string, string[]>();
  for (const [id, text] of texts) {
    const targets = engine.markdownLinks(text).map(t => byKey.get(key(t.split("/").pop() ?? t)) ?? byKey.get(key(t))).filter((t): t is string => Boolean(t) && t !== id);
    out.set(id, [...new Set(targets)]);
  }
  return out;
}

export function buildLibrary(rev: number, docs: Map<string, Doc>, texts: Map<string, string>, engine: SearchEngine): Library {
  const links = resolveLinks(docs, texts, engine);
  const backlinks = new Map<string, string[]>();
  for (const [from, to] of links) for (const t of to) (backlinks.get(t) ?? backlinks.set(t, []).get(t)!).push(from);
  const index = new engine.DocumentIndex();
  for (const d of docs.values()) if (d.status !== "failed") index.add({ id: d.id, title: d.title, text: texts.get(d.id) ?? "", tags: d.tags, links: links.get(d.id) ?? [] });
  return { rev, docs, texts, index, links, backlinks };
}

let cache: Library | undefined;
/** The library at this revision: reused within an instance, rebuilt from the database when the revision moves. */
export async function library(db: Database, rev: number, engine: SearchEngine): Promise<Library> {
  if (cache?.rev === rev) return cache;
  await ensureSchema(db);
  const [docs, texts] = [await loadDocs(db), await loadTexts(db)];
  cache = buildLibrary(rev, docs, texts, engine);
  return cache;
}
/** A command that changes documents forgets the derived index first; it is rebuilt on the next read. */
export function invalidate(): void { cache = undefined; }

/** Reader parts of about `size` characters, cut at headings or blank lines outside code. */
export function parts(markdown: string, size = 6000): { start: number; end: number; text: string }[] {
  const lines = markdown.split("\n"), out: { start: number; end: number; text: string }[] = [];
  let fence = false, from = 0, chars = 0;
  lines.forEach((line, i) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    if (!fence && chars >= size && (/^\s{0,3}#{1,6}\s/.test(line) || (!line.trim() && chars >= size * 1.3))) {
      out.push({ start: from + 1, end: i, text: lines.slice(from, i).join("\n") }); from = i; chars = 0;
    }
    chars += line.length + 1;
  });
  if (from < lines.length) out.push({ start: from + 1, end: lines.length, text: lines.slice(from).join("\n") });
  return out.filter(p => p.text.trim()).length ? out.filter(p => p.text.trim()) : [{ start: 1, end: 1, text: "" }];
}

/** Headings outside code, with their line. */
export function outline(markdown: string): { level: number; text: string; line: number }[] {
  const out: { level: number; text: string; line: number }[] = [];
  let fence = false;
  markdown.split("\n").forEach((line, i) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) { fence = !fence; return; }
    const m = !fence && /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1]!.length, text: m[2]!.replace(/[*_`]/g, ""), line: i + 1 });
  });
  return out;
}
