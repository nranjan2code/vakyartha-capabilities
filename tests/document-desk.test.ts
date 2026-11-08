import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { convert, docxToMarkdown, htmlToMarkdown, parseDelimited, pdfToMarkdown, unzip } from "../apps/document-desk/convert.ts";
import { outline, parts } from "../apps/document-desk/library.ts";
import { marked } from "../apps/document-desk/views.ts";

/** A minimal ZIP with deflated entries, as Word writes them. */
function zip(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), data = deflateRawSync(raw), n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data); centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

test("DOCX: headings, bold, lists, links and tables become Markdown", () => {
  const p = (inner: string, style = "", list = false) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${list ? "<w:numPr><w:ilvl w:val=\"0\"/></w:numPr>" : ""}</w:pPr>${inner}</w:p>`;
  const r = (t: string, bold = false) => `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const body = [p(r("Lease &amp; terms"), "Heading1"), p(r("Rent is ") + r("due monthly", true) + r(".")), p(r("First"), "", true), p(r("Second"), "", true),
    p(`<w:hyperlink r:id="rId5">${r("the site")}</w:hyperlink>`),
    `<w:tbl><w:tr><w:tc>${p(r("Item"))}</w:tc><w:tc>${p(r("Cost"))}</w:tc></w:tr><w:tr><w:tc>${p(r("Rent"))}</w:tc><w:tc>${p(r("900"))}</w:tc></w:tr></w:tbl>`].join("");
  const docx = zip({
    "word/document.xml": `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`,
    "word/_rels/document.xml.rels": `<Relationships><Relationship Id="rId5" Type="hyperlink" Target="https://example.org/x"/></Relationships>`,
    "docProps/core.xml": "<cp:coreProperties><dc:title>My Lease</dc:title></cp:coreProperties>",
  });
  assert.equal(unzip(docx, () => true).size, 3);
  const out = docxToMarkdown(docx);
  assert.equal(out.title, "My Lease");
  assert.equal(out.markdown, "# Lease & terms\n\nRent is **due monthly**.\n\n- First\n- Second\n\n[the site](https://example.org/x)\n\n| Item | Cost |\n| --- | --- |\n| Rent | 900 |");
  assert.throws(() => docxToMarkdown(new Uint8Array([1, 2, 3])), /not a valid DOCX/);
});

test("HTML: structure kept, scripts and styles dropped, entities decoded", () => {
  const out = htmlToMarkdown(`<html><head><title>Notes &amp; plans</title><style>p{}</style></head><body><h2>Plan</h2><p>Go <b>now</b> &mdash; see <a href="/x">this</a>.</p><script>alert(1)</script><ul><li>One</li><li>Two</li></ul><table><tr><th>A</th></tr><tr><td>1</td></tr></table></body></html>`);
  assert.equal(out.title, "Notes & plans");
  const md = convert({ name: "p.html", kind: "html", text: `<title>T</title><h2>Plan</h2><p>Go <b>now</b> &mdash; see <a href="/x">this</a>.</p><script>x</script><ul><li>One</li><li>Two</li></ul>` }).markdown;
  assert.equal(md, "## Plan\n\nGo **now** — see [this](/x).\n\n- One\n- Two");
  assert.doesNotMatch(out.markdown, /alert|p\{\}/);
  assert.match(out.markdown, /\| A \|\n\| --- \|\n\| 1 \|/);
});

test("CSV: quoted cells, delimiter sniffing and a row bound", () => {
  assert.deepEqual(parseDelimited('a,"b, c","say ""hi"""\n1,2,3\n', ","), [["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  assert.equal(convert({ name: "x.csv", kind: "csv", text: "n;v\nrent;900\n" }).markdown, "| n | v |\n| --- | --- |\n| rent | 900 |");
});

test("PDF pages: paragraphs rejoined, hyphenation undone, a section per page, scanned PDFs explained", () => {
  const out = pdfToMarkdown(["Termination\nEither party may end this lease with sixty days no-\ntice in writing.\n\nPage footer", ""], "lease.pdf");
  assert.equal(out.title, "");
  assert.equal(out.markdown, "## Page 1\n\nTermination Either party may end this lease with sixty days notice in writing.\n\nPage footer");
  assert.match(pdfToMarkdown(["", ""]).note!, /no text layer/);
});

test("Markdown front matter titles; text keeps the file name", () => {
  assert.equal(convert({ name: "a.md", kind: "md", text: "---\ntitle: Real title\n---\n# Heading\nBody" }).title, "Real title");
  assert.equal(convert({ name: "a.md", kind: "md", text: "# Heading\nBody" }).title, "Heading");
  assert.equal(convert({ name: "my_notes-2026.txt", kind: "txt", text: "x" }).title, "my notes 2026");
  assert.throws(() => convert({ name: "x.exe", kind: "exe" }), /not kept/);
});

test("reader parts cut at headings and outline skips code", () => {
  const md = `# A\n${"word ".repeat(1300)}\n# B\n\`\`\`\n# not a heading\n\`\`\`\ntext`;
  const ps = parts(md);
  assert.equal(ps.length, 2);
  assert.equal(ps[1]!.start, 3);
  assert.deepEqual(outline(md).map(h => h.text), ["A", "B"]);
});

test("snippets escape Markdown and bold only the matched ranges", () => {
  assert.equal(marked("a *b* notice c", [{ start: 6, end: 12 }]), "a \\*b\\* **notice** c");
});
