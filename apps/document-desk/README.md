# Document Desk

Keep your documents in one searchable library. Add PDF, Word, Markdown, web page, spreadsheet and text files, or share a folder and the library stays in step with it. Find passages by meaning, exact phrase or pattern, and read them as clean text.

## Use it

- **Add documents.** Choose up to 20 files at a time (20 MB each). The original is kept for this app only; the library keeps its text as Markdown. A file already in the library is not added twice.
- **Share a folder.** Opens the app's Shared folders panel. The folder and its subfolders are read, never changed, moved or deleted; hidden files and links are skipped. When you close the panel the folders are checked. New and edited files are read, files you removed leave the library. With Background operation on, folders are checked every 10 minutes; **Check folders now** on Sources does it at once.
- **Search.** Type words and press **Search**. *Best match* ranks documents by relevance (rare words count most, titles and headings more than body text, documents your other documents link to a little more) and shows the best passage with your words in bold, its section and why it matched. Put "an exact phrase" in quotes; put -word to leave out documents that contain it. *Exact text* lists every line containing the text; *Pattern* takes a regular expression. **Kind** narrows any search and the list.
- **Read.** Choosing a result opens the document beside the list at that passage. Long documents are read in parts; **Outline** jumps to a heading, **Links** lists documents it links to and those linking to it, **Read aloud** reads the open part. **Details** shows where it came from, its tags and its status.
- **Needs attention.** Files that could not be read or have no text (such as scanned PDFs) are listed with the reason and **Try again**.
- **Leave out or delete.** A shared file can be left out of the library (the file is not touched; Sources includes them again). An uploaded document is deleted with its kept original.
- **Ask the assistant.** Ask about what your papers say, such as "how much notice do I give to end my lease". The library's titles and headings help the assistant find Document Desk without you naming it. With the `document-desk-reader` skill it searches (within one document, a kind or tags when that helps), opens the outline of long documents, reads the right section or PDF page, and answers with the document and section it used. It only reads.

## Data

Document records and their Markdown live in this app's database (up to 512 MB). Uploaded originals are kept by Vakyartha for this app. The search index is rebuilt from the database as needed. The app has no network access and no integration tools.

## Limits

- PDF text comes from the system's PDF engine and needs macOS. Scanned PDFs without a text layer have no searchable text; text recognition is not included.
- Word documents must be .docx. Up to 4 MB of text per document, 2,000 spreadsheet rows, 5,000 files across shared folders, 8 shared folders.
- A check reads up to about 100 changed files; more wait for the next check, and Sources says how many.
- The Documents list shows the 1,000 most recent documents; search covers all of them.
