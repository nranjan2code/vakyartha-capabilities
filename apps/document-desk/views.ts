// The two views, derived from the library and the saved choices on every run:
// Library (search, the collection and the open document) and Sources (shared
// folders, sync health and files that need attention).
import { outline, parts, type Doc, type Highlight, type Library, type SearchEngine } from "./library.ts";
import type { State, SyncState } from "./server.ts";

export interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
export interface Update { surface: string; nodes: Node[]; data: { op: "replace"; path: "/"; value: Record<string, unknown> }[] }
export interface Query { text: string; mode: "smart" | "exact" | "regex" }

const MAX_LISTED = 1000;
const KIND_GROUP: Record<string, string> = { pdf: "pdf", docx: "word", md: "markdown", markdown: "markdown", html: "web", htm: "web", csv: "sheet", tsv: "sheet", txt: "text", text: "text", json: "text" };
const KIND_LABEL: Record<string, string> = { pdf: "PDF", docx: "Word", md: "Markdown", markdown: "Markdown", html: "Web page", htm: "Web page", csv: "Spreadsheet", tsv: "Spreadsheet", txt: "Text", text: "Text", json: "JSON" };
const KIND_OPTIONS = [["all", "All kinds"], ["pdf", "PDF"], ["word", "Word"], ["markdown", "Markdown"], ["web", "Web pages"], ["sheet", "Spreadsheets"], ["text", "Text"]].map(([value, label]) => ({ value, label }));
const MODE_OPTIONS = [{ value: "smart", label: "Best match" }, { value: "exact", label: "Exact text" }, { value: "regex", label: "Pattern" }];

const plural = (n: number, w: string) => `${n.toLocaleString("en")} ${w}${n === 1 ? "" : "s"}`;
const size = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;
const day = (iso: string) => iso ? iso.slice(0, 10) : "";
const replace = (value: Record<string, unknown>) => [{ op: "replace" as const, path: "/" as const, value }];
const where = (d: Doc) => d.source === "folder" ? `${d.folder.split("/").pop()}/${d.path}` : "Uploaded";
/** Escapes Markdown so a snippet renders as written, then bolds the matched ranges. */
export function marked(text: string, ranges: readonly Highlight[]): string {
  const esc = (s: string) => s.replace(/([\\`*_[\]#<>|~])/g, "\\$1");
  let out = "", at = 0;
  for (const r of ranges) { if (r.start < at) continue; out += esc(text.slice(at, r.start)) + `**${esc(text.slice(r.start, r.end))}**`; at = r.end; }
  return out + esc(text.slice(at));
}
const tone = (d: Doc) => d.status === "failed" ? "danger" : d.status === "empty" ? "warning" : "neutral";
const badge = (d: Doc) => d.status === "failed" ? "Not read" : d.status === "empty" ? "No text" : KIND_LABEL[d.kind] ?? d.kind.toUpperCase();

function tabbed(id: string, active: string, panels: [string, string, string[]][]): Node[] {
  return [{ id, type: "tabs", props: { active }, children: panels.map(([pid]) => pid) }, ...panels.map(([pid, title, children]) => ({ id: pid, type: "section", props: { title }, children }))];
}

export function buildView(s: State, lib: Library | undefined, engine: SearchEngine | undefined, syncSummary: (y: SyncState) => string): Update[] {
  return [librarySurface(s, lib, engine), sourcesSurface(s, lib, syncSummary)];
}

function results(s: State, lib: Library, engine: SearchEngine, include: (id: string) => boolean): { items: Record<string, unknown>[]; summary: string; error?: string } {
  const q = s.query!;
  try {
    if (s.mode === "smart") {
      const hits = lib.index.search(q, { limit: 40, passagesPerDocument: 2, include });
      return {
        summary: hits.length ? `${plural(hits.length, "document")} match, best first.` : "Nothing matches. Try fewer or different words, or Exact text.",
        items: hits.map(h => {
          const d = lib.docs.get(h.id)!, p = h.passages[0]!;
          const backs = lib.backlinks.get(h.id)?.length ?? 0;
          return {
            id: h.id, line: p.line, title: h.title, snippet: marked(p.snippet, p.highlights),
            where: [p.headings.slice(-2).join(" › ") || "Start", where(d)].join(" · "),
            why: [`Matches ${Math.round(h.coverage * 100)}% of your words`, h.passages.length > 1 ? `${h.passages.length} sections` : "", backs ? `linked from ${plural(backs, "document")}` : ""].filter(Boolean).join(" · "),
          };
        }),
      };
    }
    const docs = [...lib.texts].filter(([id]) => include(id)).map(([id, text]) => ({ id, text }));
    const g = engine.grep(docs, q, { regex: s.mode === "regex", context: 0, limit: 60 });
    return {
      summary: g.total ? `${plural(g.total, "line")} match${g.truncated ? `, the first ${g.matches.length} shown` : ""}.` : "No line contains that text.",
      items: g.matches.map((m, i) => {
        const d = lib.docs.get(m.documentId)!;
        const from = Math.max(0, (m.ranges[0]?.start ?? 0) - 80), text = m.text.slice(from, from + 280);
        return { id: d.id, key: `${d.id}-${i}`, line: m.line, title: d.title, where: `Line ${m.line} · ${where(d)}`, why: "", snippet: (from ? "… " : "") + marked(text, m.ranges.map(r => ({ start: r.start - from, end: r.end - from })).filter(r => r.start >= 0 && r.end <= text.length)) };
      }),
    };
  } catch (error) { return { items: [], summary: "", error: (error as Error).message }; }
}

function librarySurface(s: State, lib: Library | undefined, engine: SearchEngine | undefined): Update {
  const docs = lib ? [...lib.docs.values()] : [];
  const include = (id: string) => s.kind === "all" || KIND_GROUP[lib!.docs.get(id)?.kind ?? ""] === s.kind;
  const listed = docs.filter(d => include(d.id)).sort((a, b) => b.updated.localeCompare(a.updated));
  const attention = docs.filter(d => d.status !== "indexed");
  const searched = Boolean(s.query && lib && engine);
  const found = searched ? results(s, lib!, engine!, include) : undefined;
  const open = s.openId ? lib?.docs.get(s.openId) : undefined;
  const totalWords = docs.reduce((n, d) => n + d.words, 0);

  const panels: [string, string, string[]][] = [];
  if (searched) panels.push(["results", `Results (${found!.items.length})`, found!.error ? ["results-error"] : found!.items.length ? ["results-caption", "results-list"] : ["results-caption"]]);
  panels.push(["documents", `Documents (${listed.length.toLocaleString("en")})`, listed.length ? ["documents-list", ...(listed.length > MAX_LISTED ? ["documents-more"] : [])] : ["documents-empty"]]);
  if (attention.length) panels.push(["attention", `Needs attention (${attention.length})`, ["attention-list"]]);
  const active = panels.some(p => p[0] === s.tab) ? `${s.tab}#${s.tabTick}` : `${panels[0]![0]}#${s.tabTick}`;

  const nodes: Node[] = [
    { id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: ["summary", "toolbar", ...(s.notice ? ["notice"] : []), docs.length ? "work" : "welcome"] },
    { id: "summary", type: "text", props: { content: "{/summary}", variant: "caption" } },
    { id: "toolbar", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm", align: "end" }, children: ["query", "mode", "kind", "go", ...(s.query ? ["clear"] : []), "add", "share"] },
    { id: "query", type: "input", props: { label: "Search", bind: "/query", placeholder: "Words, \"an exact phrase\", or -word to leave out" } },
    { id: "mode", type: "select", props: { label: "Match", bind: "/mode", options: MODE_OPTIONS, presentation: "dropdown", maxWidth: "sm" } },
    { id: "kind", type: "select", props: { label: "Kind", bind: "/kind", options: KIND_OPTIONS, presentation: "dropdown", maxWidth: "sm" } },
    { id: "go", type: "button", props: { label: "Search", action: "search", style: "primary" } },
    ...(s.query ? [{ id: "clear", type: "button", props: { label: "Clear", action: "clear_search", style: "link" } }] : []),
    { id: "add", type: "button", props: { label: "Add documents", action: "documents.upload", payload: { then: "add_uploads" }, style: "secondary" } },
    { id: "share", type: "button", props: { label: "Share a folder", action: "documents.folders", payload: { then: "sync" }, style: "secondary" } },
    ...(s.notice ? [{ id: "notice", type: "alert", props: { body: "{/notice}", tone: "info" } }] : []),
  ];
  if (!docs.length) {
    nodes.push({ id: "welcome", type: "section", props: { title: "Start your library", description: "Add PDF, Word, Markdown, web page, spreadsheet or text files, or share a folder and the library keeps itself in step with it. Everything becomes searchable text; the files stay yours and are never changed." }, children: ["welcome-bar"] },
      { id: "welcome-bar", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["welcome-add", "welcome-share"] },
      { id: "welcome-add", type: "button", props: { label: "Add documents", action: "documents.upload", payload: { then: "add_uploads" }, style: "primary" } },
      { id: "welcome-share", type: "button", props: { label: "Share a folder", action: "documents.folders", payload: { then: "sync" }, style: "secondary" } });
  } else {
    nodes.push({ id: "work", type: "split", props: { ratio: "1:2", gap: "lg" }, children: ["browse", open ? "reader" : "reader-empty"] },
      { id: "browse", type: "stack", props: { gap: "sm" }, children: ["browse-tabs"] },
      ...tabbed("browse-tabs", active, panels),
      { id: "documents-list", type: "grid", props: { columns: 1, gap: "sm", searchable: true, pageSize: 12 }, children: { each: "/documents", template: "doc-card" } },
      { id: "doc-card", type: "card", props: { title: "{title}", subtitle: "{meta}", badge: "{badge}", tone: "{tone}", layout: "row", titleLines: 2, action: "open", payload: { id: "{id}" } } },
      ...(listed.length > MAX_LISTED ? [{ id: "documents-more", type: "text", props: { content: `The ${MAX_LISTED.toLocaleString("en")} most recent are listed. Search finds every document.`, variant: "caption" } }] : []),
      ...(listed.length ? [] : [{ id: "documents-empty", type: "text", props: { content: "No documents of this kind.", variant: "caption" } }]),
      ...(attention.length ? [
        { id: "attention-list", type: "grid", props: { columns: 1, gap: "sm", pageSize: 10 }, children: { each: "/attention", template: "attention-card" } },
        { id: "attention-card", type: "card", props: { title: "{title}", subtitle: "{note}", badge: "{badge}", tone: "{tone}", layout: "row", action: "open", payload: { id: "{id}" } }, children: ["attention-retry"] },
        { id: "attention-retry", type: "button", props: { label: "Try again", action: "retry", payload: { id: "{id}" }, style: "secondary" } },
      ] : []),
      ...(searched ? found!.error ? [{ id: "results-error", type: "alert", props: { title: "This pattern cannot be searched", body: found!.error, tone: "warning" } }] : [
        { id: "results-caption", type: "text", props: { content: "{/resultsSummary}", variant: "caption" } },
        ...(found!.items.length ? [
          { id: "results-list", type: "grid", props: { columns: 1, gap: "sm", pageSize: 10 }, children: { each: "/results", template: "hit" } },
          { id: "hit", type: "card", props: { title: "{title}", subtitle: "{where}", action: "open", payload: { id: "{id}", line: "{line}" }, titleLines: 2 }, children: ["hit-snippet", "hit-why"] },
          { id: "hit-snippet", type: "text", props: { content: "{snippet}" } },
          { id: "hit-why", type: "text", props: { content: "{why}", variant: "caption" } },
        ] : []),
      ] : []),
      ...(open ? [] : [{ id: "reader-empty", type: "text", props: { content: "Choose a document to read it here.", variant: "caption" } }]));
    if (open) nodes.push(...readerNodes(s, lib!, open));
  }
  const data: Record<string, unknown> = {
    summary: docs.length ? [plural(docs.length, "document"), `${plural(totalWords, "word")} searchable`, s.sync?.at ? `folders checked ${day(s.sync.at)}` : ""].filter(Boolean).join(" · ") : "Your documents, kept as searchable text.",
    query: s.query ?? "", mode: s.mode, kind: s.kind, notice: s.notice ?? "",
    documents: listed.slice(0, MAX_LISTED).map(d => ({ id: d.id, title: d.title, badge: badge(d), tone: d.id === s.openId ? "info" : tone(d), meta: [where(d), d.pages ? plural(d.pages, "page") : plural(d.words, "word"), day(d.updated)].join(" · ") })),
    attention: attention.map(d => ({ id: d.id, title: d.title, note: d.note || "Not read", badge: badge(d), tone: tone(d) })),
    ...(searched ? { results: found!.items, resultsSummary: found!.summary } : {}),
    ...(open ? readerData(s, lib!, open) : {}),
    route: { keywords: lib ? routeWords(docs, lib) : "" },
  };
  return { surface: "library", nodes, data: replace(data) };
}

/**
 * What the library is about, for the assistant's routing (exports.routeKeywords): titles,
 * top headings and tags, most recent documents first, bounded. Ranked locally, never sent to a model.
 */
export function routeWords(docs: readonly Doc[], lib: Library): string {
  const out: string[] = [];
  let size = 0;
  for (const d of [...docs].filter(d => d.status === "indexed").sort((a, b) => b.updated.localeCompare(a.updated))) {
    const heads = outline(lib.texts.get(d.id) ?? "").filter(h => h.level <= 2 && !/^Page \d+$/.test(h.text)).slice(0, 12).map(h => h.text);
    const part = [d.title, ...heads, ...d.tags].join(" ");
    if (size + part.length > 6000) break;
    out.push(part); size += part.length + 1;
  }
  return out.join(" ");
}

function readerNodes(s: State, lib: Library, d: Doc): Node[] {
  const text = lib.texts.get(d.id) ?? "";
  const ps = parts(text), heads = outline(text), related = (lib.links.get(d.id)?.length ?? 0) + (lib.backlinks.get(d.id)?.length ?? 0);
  const part = Math.min(s.part ?? 0, ps.length - 1);
  const panels: [string, string, string[]][] = [
    ["read", "Read", d.status === "failed" ? ["read-failed"] : ["read-text", ...(ps.length > 1 ? ["pager"] : [])]],
    ...(heads.length ? [["outline", `Outline (${heads.length})`, ["outline-list"]] as [string, string, string[]]] : []),
    ...(related ? [["links", `Links (${related})`, ["links-list"]] as [string, string, string[]]] : []),
    ["details", "Details", ["details-table", "tags-bar", s.confirmDelete ? "confirm" : "ask-delete"]],
  ];
  return [
    { id: "reader", type: "section", props: { title: "{/doc/title}", description: "{/doc/meta}" }, children: ["reader-bar", "reader-tabs"] },
    { id: "reader-bar", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm", align: "center" }, children: ["listen", ...(ps.length > 1 ? ["part-caption"] : [])] },
    { id: "listen", type: "button", props: { label: "Read aloud", action: "voice.read", payload: { text: "/spoken/part" }, style: "secondary" } },
    ...(ps.length > 1 ? [{ id: "part-caption", type: "text", props: { content: "{/doc/partLabel}", variant: "caption" } }] : []),
    ...tabbed("reader-tabs", "read", panels),
    ...(d.status === "failed" ? [{ id: "read-failed", type: "alert", props: { title: "This document could not be read", body: "{/doc/note}", tone: "warning" } }]
      : [{ id: "read-text", type: "text", props: { content: "{/doc/text}" } }]),
    ...(ps.length > 1 ? [
      { id: "pager", type: "stack", props: { direction: "horizontal", gap: "sm", align: "center" }, children: [...(part > 0 ? ["prev"] : []), ...(part < ps.length - 1 ? ["next"] : [])] },
      ...(part > 0 ? [{ id: "prev", type: "button", props: { label: "Previous part", action: "part", payload: { part: part - 1 }, style: "secondary" } }] : []),
      ...(part < ps.length - 1 ? [{ id: "next", type: "button", props: { label: "Next part", action: "part", payload: { part: part + 1 }, style: "secondary" } }] : []),
    ] : []),
    ...(heads.length ? [
      { id: "outline-list", type: "grid", props: { columns: 1, gap: "sm", searchable: heads.length > 12, pageSize: 20 }, children: { each: "/doc/outline", template: "heading" } },
      { id: "heading", type: "button", props: { label: "{label}", action: "open", payload: { id: d.id, part: "{part}" }, style: "link" } },
    ] : []),
    ...(related ? [
      { id: "links-list", type: "grid", props: { columns: 1, gap: "sm", pageSize: 10 }, children: { each: "/doc/related", template: "related" } },
      { id: "related", type: "card", props: { title: "{title}", subtitle: "{relation}", layout: "row", action: "open", payload: { id: "{id}" } } },
    ] : []),
    { id: "details-table", type: "table", props: { columns: [{ key: "field", label: "Field" }, { key: "value", label: "Value" }], rows: "{/doc/details}" } },
    { id: "tags-bar", type: "stack", props: { direction: "horizontal", align: "end", gap: "sm" }, children: ["tags", "save-tags"] },
    { id: "tags", type: "input", props: { label: "Tags", bind: "/doc/tags", placeholder: "contracts, home" } },
    { id: "save-tags", type: "button", props: { label: "Save tags", action: "save_tags", style: "secondary" } },
    ...(s.confirmDelete ? [
      { id: "confirm", type: "card", props: { title: d.source === "folder" ? "Leave this file out of the library?" : "Delete this document?", body: d.source === "folder" ? "Its text leaves the library. The file in your folder is not touched." : "Its text and the kept original are removed for good.", tone: "danger" }, children: ["confirm-bar"] },
      { id: "confirm-bar", type: "stack", props: { direction: "horizontal", gap: "sm" }, children: ["delete-yes", "delete-no"] },
      { id: "delete-yes", type: "button", props: { label: d.source === "folder" ? "Leave out" : "Delete", action: "delete", style: "danger" } },
      { id: "delete-no", type: "button", props: { label: "Keep it", action: "cancel_delete", style: "secondary" } },
    ] : [{ id: "ask-delete", type: "button", props: { label: d.source === "folder" ? "Leave out of library" : "Delete document", action: "ask_delete", style: "link" } }]),
  ];
}

function readerData(s: State, lib: Library, d: Doc): Record<string, unknown> {
  const text = lib.texts.get(d.id) ?? "";
  const ps = parts(text), part = Math.min(s.part ?? 0, ps.length - 1);
  const partOf = (line: number) => Math.max(0, ps.findIndex(p => line >= p.start && line <= p.end));
  const related = [...(lib.links.get(d.id) ?? []).map(id => [id, "Linked from this document"] as const), ...(lib.backlinks.get(d.id) ?? []).map(id => [id, "Links to this document"] as const)];
  const spoken = text ? (lib.index && ps[part] ? stripForSpeech(ps[part]!.text) : "") : "";
  return {
    doc: {
      title: d.title, note: d.note || "",
      meta: [badge(d), where(d), d.pages ? plural(d.pages, "page") : "", plural(d.words, "word"), `updated ${day(d.updated)}`].filter(Boolean).join(" · "),
      text: ps[part]?.text || "This document has no readable text.",
      partLabel: `Part ${part + 1} of ${ps.length}`,
      outline: outline(text).map(h => ({ label: `${"  ".repeat(Math.max(0, h.level - 1))}${h.text}`, part: partOf(h.line) })),
      related: related.filter(([id]) => lib.docs.has(id)).map(([id, relation]) => ({ id, title: lib.docs.get(id)!.title, relation })),
      tags: s.tags ?? d.tags.join(", "),
      details: [
        ["Source", d.source === "folder" ? `Shared folder ${d.folder}` : "Uploaded"], ...(d.path ? [["File", d.path]] : [["File", d.name]]),
        ["Kind", KIND_LABEL[d.kind] ?? d.kind], ["Size", size(d.size)], ["Added", day(d.added)], ["Updated", day(d.updated)],
        ["Status", d.status === "indexed" ? "Searchable" : d.status === "empty" ? "No readable text" : "Not read"], ...(d.note ? [["Note", d.note]] : []), ["Fingerprint", d.sha256.slice(0, 16)],
      ].map(([field, value]) => ({ field, value })),
    },
    spoken: { part: spoken || "This part has no readable text." },
  };
}

const stripForSpeech = (md: string) => md.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/[*_`>|]/g, "").replace(/\n{2,}/g, "\n\n").trim().slice(0, 8000);

function sourcesSurface(s: State, lib: Library | undefined, syncSummary: (y: SyncState) => string): Update {
  const docs = lib ? [...lib.docs.values()] : [];
  const folders = s.sync?.folders ?? [];
  const rows = folders.map(f => {
    const own = docs.filter(d => d.source === "folder" && d.folder === f.path);
    return { name: f.name, path: f.path, documents: own.length, words: own.reduce((n, d) => n + d.words, 0).toLocaleString("en"), problems: own.filter(d => d.status !== "indexed").length };
  });
  const uploads = docs.filter(d => d.source === "upload");
  const nodes: Node[] = [
    { id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: ["caption", "bar", "stats", folders.length ? "folders" : "no-folders", ...(s.excluded!.length ? ["excluded"] : [])] },
    { id: "caption", type: "text", props: { content: "{/caption}", variant: "caption" } },
    { id: "bar", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["share", "rescan", "add"] },
    { id: "share", type: "button", props: { label: "Share a folder", action: "documents.folders", payload: { then: "sync" }, style: "primary" } },
    { id: "rescan", type: "button", props: { label: "Check folders now", action: "sync", style: "secondary" } },
    { id: "add", type: "button", props: { label: "Add documents", action: "documents.upload", payload: { then: "add_uploads" }, style: "secondary" } },
    { id: "stats", type: "stack", props: { direction: "horizontal", wrap: true, gap: "md" }, children: ["stat-docs", "stat-folders", "stat-uploads", "stat-attention"] },
    { id: "stat-docs", type: "stat", props: { label: "Documents", value: "{/stats/docs}" } },
    { id: "stat-folders", type: "stat", props: { label: "Shared folders", value: "{/stats/folders}" } },
    { id: "stat-uploads", type: "stat", props: { label: "Uploaded", value: "{/stats/uploads}" } },
    { id: "stat-attention", type: "stat", props: { label: "Need attention", value: "{/stats/attention}" } },
    ...(folders.length ? [{ id: "folders", type: "table", props: { columns: [{ key: "name", label: "Folder" }, { key: "documents", label: "Documents" }, { key: "words", label: "Words" }, { key: "problems", label: "Not read" }, { key: "path", label: "Location" }], rows: "{/folders}", sortable: true } }]
      : [{ id: "no-folders", type: "text", props: { content: "No folders are shared yet. A shared folder is read, never changed: new and edited files are picked up when the folders are checked, and files you remove leave the library.", variant: "caption" } }]),
    ...(s.excluded!.length ? [
      { id: "excluded", type: "stack", props: { direction: "horizontal", gap: "sm", align: "center", wrap: true }, children: ["excluded-text", "include-all"] },
      { id: "excluded-text", type: "text", props: { content: `${plural(s.excluded!.length, "shared file")} left out of the library.`, variant: "caption" } },
      { id: "include-all", type: "button", props: { label: "Include them again", action: "include_all", style: "link" } },
    ] : []),
  ];
  const data = {
    caption: s.sync?.at ? `${syncSummary(s.sync)} Last checked ${s.sync.at.slice(0, 16).replace("T", " ")}.` : "Share a folder to keep the library in step with it. With Background operation on, folders are checked every 10 minutes.",
    stats: { docs: docs.length.toLocaleString("en"), folders: String(folders.length), uploads: uploads.length.toLocaleString("en"), attention: String(docs.filter(d => d.status !== "indexed").length) },
    folders: rows,
  };
  return { surface: "sources", nodes, data: replace(data) };
}
