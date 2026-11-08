// Document Desk: a library of the person's documents, kept as Markdown and
// searchable by relevance, exact phrase or pattern. Files arrive two ways, both
// owned by the host: uploads (`documents.upload`) and folders shared read-only
// (`documents.folders`). The app database is the only data owner; the search
// index comes from Projection's engine (`context.search`) and is rebuilt from
// the database whenever the corpus revision moves.
import { convert } from "./convert.ts";
import { buildView, type Query, type Update } from "./views.ts";
import { KIND_GROUP, KIND_GROUPS, passes, deleteCategory, deleteDoc, ensureSchema, folderDocId, invalidate, library, outline, parts, ruleCategory, saveCategory, saveDoc, type Category, uploadDocId, type Database, type Doc, type Library, type SearchEngine } from "./library.ts";

export interface SyncState { at?: string; added?: number; updated?: number; removed?: number; failed?: number; waiting?: number; folders?: { path: string; name: string }[]; message?: string }
export interface State {
  rev?: number; query?: string; mode?: "smart" | "exact" | "regex"; kind?: string;
  openId?: string; part?: number; tab?: string; tabTick?: number; confirmDelete?: boolean; tags?: string;
  sync?: SyncState; notice?: string; excluded?: string[];
  /** Library filter: "all", "none" (uncategorised) or a category id. */
  category?: string;
  /** The open document's category choice, the bulk-filing target, and the category drafts. */
  docCategory?: string; bulkCategory?: string;
  newCategory?: CategoryDraft; editCategory?: string; editDraft?: CategoryDraft; confirmCategory?: string;
}
export interface CategoryDraft { name: string; words: string; folder: string; kind: string }
interface Staged { ref: unknown; name: string; kind: string; text?: string; bytes?: Uint8Array; pages?: string[]; pdfTitle?: string; size?: number; modified?: number; sha256?: string; error?: string }
interface Documents {
  list(): Promise<{ folders: { index: number; path: string; name: string }[]; files: { folder: number; path: string; size: number; modified: number; tooLarge?: boolean }[]; truncated: boolean; available: boolean }>;
  read(files: unknown[]): Promise<Staged[]>;
  forget(upload: string): Promise<unknown>;
}
export interface Context { state: State; database?: Database; documents?: Documents; search?: SearchEngine; now?: () => Date }

const MODES = new Set(["smart", "exact", "regex"]);
const KINDS = new Set(["all", ...KIND_GROUPS.map(([k]) => k)]);
const READ_BATCH = 8, MAX_READS = 13;

export function normalize(s: State): State {
  const line = (v: unknown, n: number) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);
  const rev = Number.isInteger(s.rev) && s.rev! >= 0 ? s.rev! : 0;
  return {
    rev, query: line(s.query, 300), mode: MODES.has(String(s.mode)) ? s.mode : "smart", kind: KINDS.has(String(s.kind)) ? s.kind : "all",
    openId: typeof s.openId === "string" ? s.openId.slice(0, 80) : undefined, part: Number.isInteger(s.part) && s.part! >= 0 ? s.part : 0,
    tab: typeof s.tab === "string" ? s.tab.slice(0, 40) : undefined, tabTick: Number.isInteger(s.tabTick) ? s.tabTick : 0,
    confirmDelete: s.confirmDelete === true, tags: line(s.tags, 300),
    sync: s.sync && typeof s.sync === "object" ? s.sync : {}, notice: line(s.notice, 400),
    excluded: Array.isArray(s.excluded) ? s.excluded.filter((x): x is string => typeof x === "string").slice(0, 5000) : [],
    category: line(s.category, 80) || "all", docCategory: line(s.docCategory, 80), bulkCategory: line(s.bulkCategory, 80),
    newCategory: draft(s.newCategory), editCategory: line(s.editCategory, 80) || undefined, editDraft: draft(s.editDraft), confirmCategory: line(s.confirmCategory, 80) || undefined,
  };
}

function draft(v: unknown): CategoryDraft {
  const d = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const t = (x: unknown, n: number) => (typeof x === "string" ? x : "").replace(/\s+/g, " ").slice(0, n);
  return { name: t(d.name, 60), words: t(d.words, 300), folder: t(d.folder, 200), kind: KINDS.has(String(d.kind)) ? String(d.kind) : "all" };
}
/** A draft as a saved category: a name, rule words, a subfolder and a kind (all optional but the name). */
function fromDraft(d: CategoryDraft, id: string, position: number): Category {
  const name = d.name.trim();
  if (!name) throw new Error("Give the category a name");
  return { id, name, words: [...new Set(d.words.toLowerCase().split(/[,;]+/).map(w => w.trim().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 20), folder: d.folder.trim().replace(/^\/+|\/+$/g, ""), kind: d.kind === "all" ? "" : d.kind, position };
}
const blankDraft = (): CategoryDraft => ({ name: "", words: "", folder: "", kind: "all" });

/** Files every document a person has not filed by hand by the categories' rules; returns how many moved. */
async function applyRules(db: Database, lib: Library): Promise<number> {
  let moved = 0;
  for (const d of lib.docs.values()) {
    if (d.categoryBy === "person") continue;
    const id = ruleCategory(d, lib.texts.get(d.id) ?? "", lib.categories);
    if (id === d.category) continue;
    await saveDoc(db, { ...d, category: id, categoryBy: id ? "rule" : "" }); moved++;
  }
  return moved;
}

const needs = (c: Context): { db: Database; engine: SearchEngine } => {
  if (!c.database) throw new Error("Document Desk needs its database");
  if (!c.search?.DocumentIndex) throw new Error("Search is unavailable in this Vakyartha version");
  return { db: c.database, engine: c.search };
};
export const tagsFrom = (v: unknown) => [...new Set(String(v ?? "").split(/[\s,]+/).map(t => t.replace(/^#+/, "").toLowerCase()).filter(t => /^[\p{L}\p{N}_-]{1,32}$/u.test(t)))].slice(0, 12);
const words = (md: string) => md.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
const bump = (s: State) => { s.rev = (s.rev ?? 0) + 1; invalidate(); };
const focus = (s: State, tab: string) => { s.tab = tab; s.tabTick = (s.tabTick ?? 0) + 1; };

/** One staged file to a document record and its Markdown. */
function toDoc(base: Omit<Doc, "title" | "status" | "note" | "words" | "pages" | "tags" | "added" | "updated" | "category" | "categoryBy">, file: Staged, prior: Doc | undefined, now: string, categories: readonly Category[] = []): { doc: Doc; markdown?: string } {
  const doc = finishDoc(base, file, prior, now);
  // A category the person chose stays; otherwise the categories' rules file it.
  if (prior?.categoryBy === "person") return { ...doc, doc: { ...doc.doc, category: prior.category, categoryBy: "person" } };
  const category = ruleCategory(doc.doc, doc.markdown ?? "", categories);
  return { ...doc, doc: { ...doc.doc, category, categoryBy: category ? "rule" : "" } };
}
function finishDoc(base: Omit<Doc, "title" | "status" | "note" | "words" | "pages" | "tags" | "added" | "updated" | "category" | "categoryBy">, file: Staged, prior: Doc | undefined, now: string): { doc: Doc; markdown?: string } {
  const common = { ...base, tags: prior?.tags ?? [], added: prior?.added ?? now, updated: now, category: "", categoryBy: "" as const };
  if (file.error) return { doc: { ...common, title: prior?.title || base.name.replace(/\.[^.]+$/, ""), status: "failed", note: file.error, words: 0, pages: 0 }, markdown: "" };
  try {
    const out = convert({ name: file.name, kind: file.kind, text: file.text, bytes: file.bytes, pages: file.pages, pdfTitle: file.pdfTitle });
    const n = words(out.markdown);
    return { doc: { ...common, title: out.title, status: n ? "indexed" : "empty", note: out.note ?? (n ? "" : "No readable text was found."), words: n, pages: out.pages ?? 0 }, markdown: out.markdown };
  } catch (error) {
    return { doc: { ...common, title: prior?.title || base.name.replace(/\.[^.]+$/, ""), status: "failed", note: (error as Error).message, words: 0, pages: 0 }, markdown: "" };
  }
}

/** Uploads the host stored for this app: read, convert, keep. Duplicates of a kept file are skipped. */
async function addUploads(c: Context, s: State, value: unknown, lib: Library, now: string): Promise<string> {
  const { db } = needs(c);
  const v = (value ?? {}) as { uploads?: { upload?: unknown; name?: unknown }[]; skipped?: unknown[] };
  const uploads = (Array.isArray(v.uploads) ? v.uploads : []).filter(u => typeof u?.upload === "string").slice(0, READ_BATCH * MAX_READS);
  if (!uploads.length) throw new Error("Choose at least one document to add");
  if (!c.documents) throw new Error("Uploads need a newer Vakyartha");
  const known = new Map([...lib.docs.values()].map(d => [d.sha256, d]));
  let added = 0, dupes = 0, failed = 0, lastId = "";
  for (let i = 0; i < uploads.length; i += READ_BATCH) {
    for (const file of await c.documents.read(uploads.slice(i, i + READ_BATCH).map(u => ({ upload: u.upload })))) {
      const upload = (file.ref as { upload: string }).upload;
      const same = file.sha256 ? known.get(file.sha256) : undefined;
      if (same) { dupes++; await c.documents.forget(upload); continue; }
      const { doc, markdown } = toDoc({ id: uploadDocId(upload), kind: file.kind, source: "upload", folder: "", path: "", upload, name: file.name, size: file.size ?? 0, modified: file.modified ?? Date.parse(now), sha256: file.sha256 ?? "" }, file, undefined, now, lib.categories);
      await saveDoc(db, doc, markdown);
      if (doc.status === "failed") failed++; else added++;
      if (file.sha256) known.set(file.sha256, doc);
      lastId = doc.id;
    }
  }
  const skipped = (Array.isArray(v.skipped) ? v.skipped : []).length;
  if (lastId) { s.openId = lastId; s.part = 0; }
  bump(s);
  return [added && `Added ${added} document${added === 1 ? "" : "s"}`, dupes && `${dupes} already in the library`, failed && `${failed} could not be read`, skipped && `${skipped} not uploaded`].filter(Boolean).join(". ") + ".";
}

/**
 * Brings the library in step with the shared folders: new and changed files are
 * read and converted, files that left (or whose folder stopped being shared) are
 * removed. Reads stop at the tool budget or the deadline; the rest wait for the
 * next run, and the summary says how many.
 */
export async function sync(c: Context, s: State, deadline: number, now: string): Promise<void> {
  const { db, engine } = needs(c);
  if (!c.documents) throw new Error("Shared folders need a newer Vakyartha");
  const listing = await c.documents.list();
  if (!listing.available) { s.sync = { ...s.sync, at: now, message: "Shared folders need the desktop app." }; return; }
  const lib = await library(db, s.rev!, engine);
  const byPath = new Map(listing.folders.map(f => [f.index, f]));
  const excluded = new Set(s.excluded);
  const seen = new Set<string>(), todo: { id: string; folder: { index: number; path: string; name: string }; file: (typeof listing.files)[number]; prior?: Doc }[] = [];
  let failed = 0, changed = false;
  for (const file of listing.files) {
    const folder = byPath.get(file.folder);
    if (!folder) continue;
    const id = folderDocId(folder.path, file.path);
    if (excluded.has(id)) continue;
    seen.add(id);
    const prior = lib.docs.get(id);
    if (prior && prior.size === file.size && prior.modified === file.modified) continue;
    if (file.tooLarge) {
      if (prior?.note !== "Larger than 20 MB") { await saveDoc(db, { id, title: file.path.split("/").pop()!.replace(/\.[^.]+$/, ""), kind: file.path.split(".").pop()!.toLowerCase(), source: "folder", folder: folder.path, path: file.path, upload: "", name: file.path.split("/").pop()!, size: file.size, modified: file.modified, sha256: "", added: now, updated: now, status: "failed", note: "Larger than 20 MB", words: 0, pages: 0, tags: [], category: "", categoryBy: "" }, ""); changed = true; }
      failed++; continue;
    }
    todo.push({ id, folder, file, prior });
  }
  let removed = 0;
  for (const d of lib.docs.values()) if (d.source === "folder" && !seen.has(d.id)) { await deleteDoc(db, d.id); removed++; changed = true; }
  let added = 0, updated = 0, reads = 0, done = 0;
  while (done < todo.length && reads < MAX_READS && Date.now() < deadline) {
    const batch = todo.slice(done, done + READ_BATCH);
    const staged = await c.documents.read(batch.map(t => ({ folder: t.folder.index, path: t.file.path })));
    reads++; done += batch.length;
    for (const [i, file] of staged.entries()) {
      const t = batch[i]!;
      if (t.prior && file.sha256 && t.prior.sha256 === file.sha256 && t.prior.status !== "failed") {
        // Touched but unchanged: keep the text, remember the new time.
        await saveDoc(db, { ...t.prior, modified: file.modified ?? t.file.modified, size: file.size ?? t.file.size }); changed = true; continue;
      }
      const { doc, markdown } = toDoc({ id: t.id, kind: file.kind, source: "folder", folder: t.folder.path, path: t.file.path, upload: "", name: file.name, size: file.size ?? t.file.size, modified: file.modified ?? t.file.modified, sha256: file.sha256 ?? "" }, file, t.prior, now, lib.categories);
      await saveDoc(db, doc, markdown); changed = true;
      if (doc.status === "failed") failed++; else if (t.prior) updated++; else added++;
    }
  }
  const waiting = todo.length - done;
  s.sync = { at: now, added, updated, removed, failed, waiting, folders: listing.folders.map(f => ({ path: f.path, name: f.name })), message: listing.truncated ? "The shared folders hold more than 5,000 files; only the first 5,000 are kept." : "" };
  if (changed) bump(s);
}

const syncSummary = (y: SyncState) => {
  const parts = [y.added && `${y.added} added`, y.updated && `${y.updated} updated`, y.removed && `${y.removed} removed`, y.failed && `${y.failed} could not be read`, y.waiting && `${y.waiting} waiting for the next run`].filter(Boolean);
  return y.message || (parts.length ? `Folders checked: ${parts.join(", ")}.` : "Folders checked: everything is up to date.");
};

export async function handleAction(controlId: string, value: unknown, context: Context, action?: string): Promise<{ updates: Update[]; focusSurface?: string }> {
  const s = (context.state = normalize(context.state));
  const now = (context.now?.() ?? new Date()).toISOString();
  const { db, engine } = needs(context);
  await ensureSchema(db);
  const payload = (value && typeof value === "object" ? value : {}) as { id?: unknown; part?: unknown; line?: unknown };
  const id = typeof payload.id === "string" ? payload.id : undefined;
  let focusSurface: string | undefined;
  s.notice = "";
  if (!action) {
    if (controlId === "/query") s.query = String(value ?? "").slice(0, 300);
    else if (controlId === "/mode") { s.mode = MODES.has(String(value)) ? value as State["mode"] : "smart"; if (s.query) focus(s, "results"); }
    else if (controlId === "/kind") s.kind = KINDS.has(String(value)) ? String(value) : "all";
    else if (controlId === "/doc/tags") s.tags = String(value ?? "").slice(0, 300);
    else if (controlId === "/category") s.category = String(value ?? "all").slice(0, 80) || "all";
    else if (controlId === "/doc/category") s.docCategory = String(value ?? "").slice(0, 80);
    else if (controlId === "/bulkCategory") s.bulkCategory = String(value ?? "").slice(0, 80);
    else if (controlId.startsWith("/newCategory/")) s.newCategory = draft({ ...s.newCategory, [controlId.slice(13)]: value });
    else if (controlId.startsWith("/editDraft/")) s.editDraft = draft({ ...s.editDraft, [controlId.slice(11)]: value });
    else return { updates: [] };
  } else if (action === "search") {
    if (s.query) focus(s, "results");
  } else if (action === "clear_search") {
    s.query = ""; focus(s, "documents");
  } else if (action === "open") {
    const lib = await library(db, s.rev!, engine);
    if (!id || !lib.docs.has(id)) throw new Error("This document is no longer in the library");
    s.openId = id; s.confirmDelete = false; s.tags = lib.docs.get(id)!.tags.join(", "); s.docCategory = lib.docs.get(id)!.category;
    s.part = Number.isInteger(payload.part) ? payload.part as number : Number.isInteger(payload.line) ? partOfLine(lib, id, payload.line as number) : 0;
    focusSurface = "library";
  } else if (action === "part") {
    s.part = Math.max(0, Number(payload.part) || 0);
  } else if (action === "add_uploads") {
    s.notice = await addUploads(context, s, value, await library(db, s.rev!, engine), now);
    focus(s, "documents");
  } else if (action === "sync") {
    await sync(context, s, Date.now() + 22_000, now);
    s.notice = syncSummary(s.sync!);
  } else if (action === "save_tags") {
    const lib = await library(db, s.rev!, engine);
    const doc = s.openId ? lib.docs.get(s.openId) : undefined;
    if (!doc) throw new Error("Open a document first");
    const category = lib.categories.some(c => c.id === s.docCategory) ? s.docCategory! : "";
    // Choosing a category, or choosing none, is the person's; rules never move it afterwards.
    const changed = category !== doc.category;
    await saveDoc(db, { ...doc, tags: tagsFrom(s.tags), ...(changed ? { category, categoryBy: "person" as const } : {}), updated: now }); bump(s);
    s.notice = changed ? `Filed in ${lib.categories.find(c => c.id === category)?.name ?? "no category"}. Tags saved.` : "Tags saved.";
  } else if (action === "add_category") {
    const lib = await library(db, s.rev!, engine);
    if (lib.categories.length >= 200) throw new Error("A library keeps up to 200 categories");
    const c = fromDraft(s.newCategory!, `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, lib.categories.length);
    if (lib.categories.some(x => x.name.toLowerCase() === c.name.toLowerCase())) throw new Error(`There is already a category called ${c.name}`);
    await saveCategory(db, c); bump(s);
    const moved = await applyRules(db, await library(db, s.rev!, engine)); if (moved) bump(s);
    s.newCategory = blankDraft();
    s.notice = `Category ${c.name} added.${moved ? ` Its rule filed ${moved} document${moved === 1 ? "" : "s"}.` : ""}`;
  } else if (action === "edit_category") {
    const c = (await library(db, s.rev!, engine)).categories.find(x => x.id === id);
    if (!c) throw new Error("This category no longer exists");
    s.editCategory = c.id; s.confirmCategory = undefined;
    s.editDraft = { name: c.name, words: c.words.join(", "), folder: c.folder, kind: c.kind || "all" };
  } else if (action === "cancel_category") {
    s.editCategory = undefined; s.confirmCategory = undefined;
  } else if (action === "save_category") {
    const lib = await library(db, s.rev!, engine);
    const old = lib.categories.find(x => x.id === s.editCategory);
    if (!old) throw new Error("This category no longer exists");
    const c = fromDraft(s.editDraft!, old.id, old.position);
    if (lib.categories.some(x => x.id !== c.id && x.name.toLowerCase() === c.name.toLowerCase())) throw new Error(`There is already a category called ${c.name}`);
    await saveCategory(db, c); bump(s);
    const moved = await applyRules(db, await library(db, s.rev!, engine)); if (moved) bump(s);
    s.editCategory = undefined;
    s.notice = `Category ${c.name} saved.${moved ? ` ${moved} document${moved === 1 ? "" : "s"} refiled by its rules.` : ""}`;
  } else if (action === "move_category") {
    const lib = await library(db, s.rev!, engine);
    const order = [...lib.categories], i = order.findIndex(x => x.id === id), j = i + (Number((value as { by?: unknown })?.by) < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= order.length) return { updates: await render(context, s) };
    [order[i], order[j]] = [order[j]!, order[i]!];
    for (const [n, c] of order.entries()) if (c.position !== n) await saveCategory(db, { ...c, position: n });
    bump(s);
    // Rules are tried in order, so the new order can refile documents.
    if (await applyRules(db, await library(db, s.rev!, engine))) bump(s);
  } else if (action === "ask_delete_category") {
    s.confirmCategory = id; s.editCategory = undefined;
  } else if (action === "delete_category") {
    const lib = await library(db, s.rev!, engine);
    const c = lib.categories.find(x => x.id === s.confirmCategory);
    if (!c) throw new Error("This category no longer exists");
    await deleteCategory(db, c.id); bump(s);
    if (await applyRules(db, await library(db, s.rev!, engine))) bump(s);
    if (s.category === c.id) s.category = "all";
    s.confirmCategory = undefined;
    s.notice = `Category ${c.name} deleted. Its documents are kept, filed by the remaining rules or uncategorised.`;
  } else if (action === "apply_rules") {
    const moved = await applyRules(db, await library(db, s.rev!, engine)); if (moved) bump(s);
    s.notice = moved ? `${moved} document${moved === 1 ? "" : "s"} filed by the rules. Documents you filed yourself stay where you put them.` : "Every document already matches the rules.";
  } else if (action === "show_category") {
    s.category = id ?? "all"; s.query = ""; focus(s, "documents"); focusSurface = "library";
  } else if (action === "file_results") {
    const lib = await library(db, s.rev!, engine);
    const target = lib.categories.find(c => c.id === s.bulkCategory);
    if (!target) throw new Error("Choose a category for these results");
    const ids = resultIds(s, lib, engine);
    for (const docId of ids) { const d = lib.docs.get(docId)!; if (d.category !== target.id || d.categoryBy !== "person") await saveDoc(db, { ...d, category: target.id, categoryBy: "person" }); }
    bump(s);
    s.notice = `Filed ${ids.length} document${ids.length === 1 ? "" : "s"} in ${target.name}.`;
  } else if (action === "retry") {
    const lib = await library(db, s.rev!, engine);
    const doc = id ? lib.docs.get(id) : undefined;
    if (!doc) throw new Error("This document is no longer in the library");
    if (doc.source === "folder") { await saveDoc(db, { ...doc, modified: 0 }); bump(s); await sync(context, s, Date.now() + 22_000, now); s.notice = syncSummary(s.sync!); }
    else { await deleteDoc(db, doc.id); bump(s); s.notice = await addUploads(context, s, { uploads: [{ upload: doc.upload }] }, await library(db, s.rev!, engine), now); }
  } else if (action === "ask_delete") {
    s.confirmDelete = Boolean(s.openId);
  } else if (action === "cancel_delete") {
    s.confirmDelete = false;
  } else if (action === "delete") {
    const lib = await library(db, s.rev!, engine);
    const doc = s.openId ? lib.docs.get(s.openId) : undefined;
    if (!doc) throw new Error("Open a document first");
    await deleteDoc(db, doc.id);
    // A shared file stays where it is; it is left out of the library until it is included again.
    if (doc.source === "folder") s.excluded = [...new Set([...s.excluded!, doc.id])];
    else await context.documents?.forget(doc.upload);
    bump(s); s.openId = undefined; s.confirmDelete = false;
    s.notice = doc.source === "folder" ? `${doc.title} is left out of the library. The file itself is unchanged.` : `${doc.title} was deleted.`;
  } else if (action === "include_all") {
    s.excluded = []; await sync(context, s, Date.now() + 22_000, now); s.notice = syncSummary(s.sync!);
  } else {
    throw new Error(`Unknown Document Desk action: ${action}`);
  }
  return { updates: await render(context, s), ...(focusSurface ? { focusSurface } : {}) };
}

function partOfLine(lib: Library, id: string, line: number): number {
  return Math.max(0, parts(lib.texts.get(id) ?? "").findIndex(p => line >= p.start && line <= p.end));
}

/** Folder sync on the schedule (Background operation). */
export async function syncFolders(context: Context): Promise<{ updates: Update[] }> {
  const s = (context.state = normalize(context.state));
  await sync(context, s, Date.now() + 90_000, (context.now?.() ?? new Date()).toISOString());
  return { updates: await render(context, s) };
}

/** The documents the current search shows, as the Results tab lists them. */
function resultIds(s: State, lib: Library, engine: SearchEngine): string[] {
  if (!s.query) return [];
  const include = (id: string) => inFilter(s, lib.docs.get(id));
  if (s.mode === "smart") return lib.index.search(s.query, { limit: 40, include }).map(h => h.id);
  return [...new Set(engine.grep([...lib.texts].filter(([id]) => include(id)).map(([id, text]) => ({ id, text })), s.query, { regex: s.mode === "regex", limit: 60 }).matches.map(m => m.documentId))];
}
/** Whether a document passes the Library's kind and category filters. */
const inFilter = (s: State, d: Doc | undefined): boolean => passes(d, s.kind, s.category);

async function render(context: Context, s: State): Promise<Update[]> {
  const { db, engine } = needs(context);
  const lib = await library(db, s.rev!, engine);
  return buildView(s, lib, engine, syncSummary);
}

/** Rebuild saved views during a reviewed package update; reads only the app's own database. */
export async function renderApp(context: Context) {
  const s = normalize(context.state);
  if (!context.database || !context.search?.DocumentIndex) return { updates: buildView(s, undefined, undefined, syncSummary) };
  return { updates: await render(context, s) };
}

// ---------- Exported read-only tools ----------

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

const GROUP = KIND_GROUP;

/** The heading path in force at a line. */
function sectionAt(markdown: string, line: number): string {
  const path: string[] = [];
  for (const h of outline(markdown)) { if (h.line > line) break; path.length = Math.min(path.length, h.level - 1); path[h.level - 1] = h.text; }
  return path.filter(Boolean).join(" › ");
}

export async function handleQuery(tool: string, params: Record<string, unknown>, context: Context): Promise<unknown> {
  const s = normalize(context.state);
  const { db, engine } = needs(context);
  const lib = await library(db, s.rev!, engine);
  const where = (d: Doc) => d.source === "folder" ? `${d.folder.split("/").pop()}/${d.path}` : "uploaded";
  const catName = (id: string) => lib.categories.find(c => c.id === id)?.name;
  const meta = (d: Doc) => ({ kind: GROUP[d.kind] ?? d.kind, ...(d.category && catName(d.category) ? { category: catName(d.category) } : {}), ...(d.pages ? { pages: d.pages } : {}), updated: d.updated.slice(0, 10) });
  /** A category named by the model: its name, any case; "none" means uncategorised. */
  const categoryParam = (v: unknown): string => {
    if (typeof v !== "string" || !v.trim()) return "all";
    if (v.trim().toLowerCase() === "none") return "none";
    const c = lib.categories.find(x => x.name.toLowerCase() === v.trim().toLowerCase());
    if (!c) throw new Error(`No category is called ${v}; categories: ${lib.categories.map(x => x.name).join(", ") || "none yet"}`);
    return c.id;
  };
  const docOf = (id: unknown) => {
    const doc = typeof id === "string" ? lib.docs.get(id) : undefined;
    if (!doc) throw new Error("No document has that id; use search_documents or list_documents for ids");
    return doc;
  };
  if (tool === "search_documents") {
    const query = String(params.query ?? "").trim().slice(0, 300);
    if (!query) throw new Error("Give a search query");
    const limit = Math.max(1, Math.min(20, Number(params.limit) || 5));
    const mode = MODES.has(String(params.mode)) ? params.mode as Query["mode"] : "smart";
    const only = params.document !== undefined ? docOf(params.document).id : undefined;
    const kind = typeof params.kind === "string" ? params.kind : undefined;
    const tags = Array.isArray(params.tags) ? params.tags.filter((t): t is string => typeof t === "string").map(t => t.toLowerCase()) : [];
    const category = categoryParam(params.category);
    const include = (id: string) => { const d = lib.docs.get(id); return passes(d, kind ?? "all", category) && (!only || id === only) && tags.every(t => d!.tags.includes(t)); };
    if (mode === "smart") {
      return { query, results: lib.index.search(query, { limit, passagesPerDocument: 2, include }).map(h => {
        const d = lib.docs.get(h.id)!;
        return { id: h.id, title: h.title, source: where(d), ...meta(d), coverage: Math.round(h.coverage * 100) / 100, passages: h.passages.map(p => ({ section: p.headings.join(" › "), line: p.line, text: p.snippet })) };
      }) };
    }
    const g = engine.grep([...lib.texts].filter(([id]) => include(id)).map(([id, text]) => ({ id, text })), query, { regex: mode === "regex", limit: limit * 4, context: 1 });
    return { query, total: g.total, truncated: g.truncated, matches: g.matches.map(m => ({ id: m.documentId, title: lib.docs.get(m.documentId)?.title ?? "", section: sectionAt(lib.texts.get(m.documentId) ?? "", m.line), line: m.line, text: clip([...m.before, m.text, ...m.after].join("\n"), 600) })) };
  }
  if (tool === "get_document_outline") {
    const doc = docOf(params.id), text = lib.texts.get(doc.id) ?? "";
    const heads = outline(text);
    const named = (ids: string[] | undefined) => (ids ?? []).filter(id => lib.docs.has(id)).map(id => ({ id, title: lib.docs.get(id)!.title }));
    return { id: doc.id, title: doc.title, source: where(doc), ...meta(doc), words: doc.words, lines: text.split("\n").length, status: doc.status, ...(doc.note ? { note: doc.note } : {}), tags: doc.tags,
      headings: heads.slice(0, 300).map(h => ({ level: h.level, text: h.text, line: h.line })), ...(heads.length > 300 ? { moreHeadings: heads.length - 300 } : {}),
      linksTo: named(lib.links.get(doc.id)), linkedFrom: named(lib.backlinks.get(doc.id)) };
  }
  if (tool === "read_document") {
    const doc = docOf(params.id), text = lib.texts.get(doc.id) ?? "";
    const lines = text.split("\n"), heads = outline(text);
    let start = 0;
    if (typeof params.section === "string" && params.section.trim()) {
      const want = params.section.trim().toLowerCase();
      const h = heads.find(x => x.text.toLowerCase() === want) ?? heads.find(x => x.text.toLowerCase().includes(want));
      if (!h) throw new Error(`No heading matches "${params.section}"; get_document_outline lists them`);
      start = h.line - 1;
    } else if (Number.isInteger(params.page)) {
      const h = heads.find(x => x.text === `Page ${params.page}`);
      if (!h) throw new Error(doc.kind === "pdf" ? `This PDF has no text on page ${params.page}` : "Pages apply to PDF documents; use section or line");
      start = h.line - 1;
    } else if (Number.isInteger(params.line)) start = Math.max(0, (params.line as number) - 1);
    else if (Number.isInteger(params.offsetLine)) start = Math.max(0, (params.offsetLine as number) - 1);
    let end = start, size = 0;
    while (end < lines.length && size < 12_000) size += lines[end++]!.length + 1;
    return { id: doc.id, title: doc.title, source: where(doc), ...meta(doc), status: doc.status, ...(doc.note ? { note: doc.note } : {}), section: sectionAt(text, start + 1), lines: lines.length, fromLine: start + 1, toLine: end, more: end < lines.length, text: lines.slice(start, end).join("\n") };
  }
  if (tool === "list_documents") {
    const tag = typeof params.tag === "string" ? params.tag.toLowerCase() : "";
    const kind = typeof params.kind === "string" ? params.kind : "";
    const title = typeof params.title === "string" ? params.title.toLowerCase().trim() : "";
    const offset = Math.max(0, Number(params.offset) || 0), limit = Math.max(1, Math.min(100, Number(params.limit) || 30));
    const order = params.sort === "oldest" ? (a: Doc, b: Doc) => a.updated.localeCompare(b.updated) : params.sort === "title" ? (a: Doc, b: Doc) => a.title.localeCompare(b.title) : (a: Doc, b: Doc) => b.updated.localeCompare(a.updated);
    const category = categoryParam(params.category);
    const all = [...lib.docs.values()].filter(d => passes(d, kind || "all", category) && (!tag || d.tags.includes(tag)) && (!title || d.title.toLowerCase().includes(title))).sort(order);
    return { total: all.length, offset, categories: lib.categories.map(c => ({ name: c.name, documents: [...lib.docs.values()].filter(d => d.category === c.id).length })), documents: all.slice(offset, offset + limit).map(d => ({ id: d.id, title: d.title, source: where(d), ...meta(d), status: d.status, words: d.words, tags: d.tags })) };
  }
  throw new Error(`Unknown Document Desk tool: ${tool}`);
}

/** The shipped surface.json: every view of a new, empty library. */
const TITLES: Record<string, string> = { library: "Library", categories: "Categories", sources: "Sources" };
export const surfaceFile = () => buildView(normalize({}), undefined, undefined, syncSummary).map(u => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));
