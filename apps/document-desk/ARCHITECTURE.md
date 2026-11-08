# Architecture: Document Desk

## Files

| File | Role |
| --- | --- |
| `app.json` | Manifest: DuckDB (512 MB), `entitlements.documents` (uploads and shared folders), a 10-minute folder check, four read-only exported tools, routing words for `search_documents` and the reader skill |
| `server.ts` | State normalization, actions, folder sync, uploads, exported queries |
| `library.ts` | Database schema (documents with their category, categories with rules) and paged reads, category rules and filters, the derived search library (index, links, backlinks), reader parts and outline |
| `convert.ts` | Markdown from HTML, DOCX, XLSX and PPTX (ZIP and Office XML), OpenDocument text, sheets and slides, EPUB (package spine), RTF, email (MIME, encoded words, quoted-printable and base64), CSV/TSV, JSON and PDF page text |
| `views.ts` | Library, Categories and Sources views from state and the library |
| `skills/document-desk-reader/SKILL.md` | How the assistant searches, reads and cites |

## Data flow

1. **Upload.** The host's `documents.upload` keeps each chosen file for this app and runs `add_uploads` with handles. The app reads them through `context.documents.read` (eight per call), converts, skips duplicates by SHA-256 and saves.
2. **Shared folders.** Rust holds the person's read-only grant. `sync` lists every file (`context.documents.list`), compares size and modification time with saved records, reads new and changed files in batches of eight within the tool budget and a deadline, keeps unchanged content when only the time moved, and removes records whose file or folder is gone. The cron trigger `syncFolders` runs the same with a longer deadline.
3. **Categories.** A document has one category, chosen by the person (`category_by = person`, never moved by rules) or by the first category whose rule fits (kind, shared subfolder, any rule word in the title, file name or top headings). Rules run on import and whenever categories change; deleting a category clears it from its documents and lets the rules refile them.
4. **Index.** `library()` loads records (400 per read) and Markdown (three chunks per read), resolves `[[wiki]]` and relative links to ids by title, file name or path, and builds Projection's `DocumentIndex` with those links. It is cached in module memory per `rev`.
5. **Search.** Best match uses `DocumentIndex.search` (BM25F over title, headings, tags and body passages, phrases, exclusions, PageRank prior); Exact text and Pattern use `grep`. Snippet ranges become bold Markdown after escaping.
6. **Routing.** The Library view keeps `/route/keywords` (titles, top headings and tags, newest first, about 6,000 characters). The host ranks them for `search_documents` and the reader skill when choosing tools for a chat message; they are never sent to a model.
7. **Read.** A document is shown in parts of about 6,000 characters cut at headings; a result opens the part holding its line.

## Boundaries

No network, no integrations, no model. The app cannot reach files beyond what the person uploads or shares, and cannot write to shared folders. PDF text needs macOS.
