import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { convert, docxToMarkdown, emlToMarkdown, epubToMarkdown, htmlToMarkdown, odpToMarkdown, odsToMarkdown, odtToMarkdown, parseDelimited, pdfToMarkdown, pptxToMarkdown, rtfToMarkdown, unzip, xlsxToMarkdown } from "../apps/document-desk/convert.ts";
import { outline, parts, passes, ruleCategory, type Category } from "../apps/document-desk/library.ts";
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

test("XLSX: sheets in order, shared strings, inline strings and column gaps", () => {
  const book = zip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Budget &amp; bills" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>Item</t></si><si><t>Cost</t></si><si><r><t>Re</t></r><r><t>nt</t></r></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>monthly</t></is></c><c r="C2"><v>42000</v></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData/></worksheet>`,
  });
  assert.equal(xlsxToMarkdown(book).markdown, "## Budget & bills\n\n| Item |  | Cost |\n| --- | --- | --- |\n| Rent | monthly | 42000 |");
});

test("PPTX: slides in presentation order with titles, bullets and tables", () => {
  const sp = (text: string, title = false) => `<p:sp>${title ? `<p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` : ""}<p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const deck = zip({
    "ppt/presentation.xml": `<p:presentation><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": `<p:sld>${sp("Results", true)}${sp("Revenue up 12%")}</p:sld>`,
    "ppt/slides/slide2.xml": `<p:sld>${sp("Plan", true)}${sp("Hire two engineers")}</p:sld>`,
  });
  const out = pptxToMarkdown(deck);
  assert.equal(out.markdown, "## Slide 1: Plan\n\n- Hire two engineers\n\n## Slide 2: Results\n\n- Revenue up 12%");
  assert.equal(out.pages, 2);
});

test("OpenDocument: text headings, lists and tables; spreadsheets; slides", () => {
  const odt = zip({ "meta.xml": "<office:meta><dc:title>Notes</dc:title></office:meta>", "content.xml": `<office:document-content><office:body><office:text><text:h text:outline-level="2">Plan</text:h><text:p>Go<text:s/>now <text:span>please</text:span></text:p><text:list><text:list-item><text:p>One</text:p></text:list-item><text:list-item><text:p>Two</text:p></text:list-item></text:list><table:table table:name="T"><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell table:number-columns-repeated="3"/></table:table-row></table:table></office:text></office:body></office:document-content>` });
  const t = odtToMarkdown(odt);
  assert.equal(t.title, "Notes");
  assert.equal(t.markdown, "## Plan\n\nGo now please\n\n- One\n- Two\n\n| A |\n| --- |");
  const ods = zip({ "content.xml": `<office:document-content><office:body><office:spreadsheet><table:table table:name="Rent"><table:table-row><table:table-cell office:value="900"><text:p>900</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>` });
  assert.equal(odsToMarkdown(ods).markdown, "## Rent\n\n| 900 |\n| --- |");
  const odp = zip({ "content.xml": `<office:document-content><office:body><office:presentation><draw:page draw:name="p1"><draw:frame presentation:class="title"><draw:text-box><text:p>Hello</text:p></draw:text-box></draw:frame><draw:frame presentation:class="outline"><draw:text-box><text:p>Point</text:p></draw:text-box></draw:frame><draw:frame presentation:class="notes"><draw:text-box><text:p>secret note</text:p></draw:text-box></draw:frame></draw:page></office:presentation></office:body></office:document-content>` });
  assert.equal(odpToMarkdown(odp).markdown, "## Slide 1: Hello\n\n- Point");
});

test("EPUB: chapters in spine order from the package file", () => {
  const book = zip({
    "META-INF/container.xml": `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
    "OEBPS/content.opf": `<package><metadata><dc:title>A Small Book</dc:title></metadata><manifest><item id="c2" href="ch%202.xhtml"/><item id="c1" href="ch1.xhtml"/><item id="css" href="s.css"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
    "OEBPS/ch1.xhtml": "<html><body><h1>One</h1><p>First.</p></body></html>",
    "OEBPS/ch 2.xhtml": "<html><body><h1>Two</h1><p>Second.</p></body></html>",
  });
  const out = epubToMarkdown(book);
  assert.equal(out.title, "A Small Book");
  assert.equal(out.markdown, "# One\n\nFirst.\n\n# Two\n\nSecond.");
});

test("RTF: text kept, fonts, colours and metadata skipped, escapes decoded", () => {
  const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0 Helvetica;}}{\colortbl;\red0\green0\blue0;}{\info{\title Lease}}{\*\generator x;}\f0 Rent is \'a3900\par Caf\'e9 \u8364? and \{braces\}\par}`;
  const out = rtfToMarkdown(rtf);
  assert.equal(out.title, "Lease");
  assert.equal(out.markdown, "Rent is £900\n\nCafé € and {braces}");
});

test("Email: headers, plain text over HTML, encoded words and attachments", () => {
  const eml = ["From: =?UTF-8?B?UmFqZWV2?= <r@example.org>", "To: me@example.org", "Subject: =?utf-8?Q?Deposit_refund?=", "Date: Sat, 7 Nov 2026 10:00:00 +0530", 'Content-Type: multipart/mixed; boundary="b1"', "", "--b1", 'Content-Type: multipart/alternative; boundary="b2"', "", "--b2", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable", "", "The refund of =E2=82=B91,26,000 is sent.=", "", "--b2", "Content-Type: text/html", "", "<p>ignored</p>", "--b2--", "--b1", 'Content-Disposition: attachment; filename="receipt.pdf"', "", "JVBER", "--b1--"].join("\r\n");
  const out = emlToMarkdown(eml);
  assert.equal(out.title, "Deposit refund");
  assert.equal(out.markdown, "- From: Rajeev <r@example.org>\n- To: me@example.org\n- Date: Sat, 7 Nov 2026 10:00:00 +0530\n\nThe refund of ₹1,26,000 is sent.\n\nAttachments: receipt.pdf");
  assert.throws(() => emlToMarkdown("hello"), /not a valid email/);
});

test("categories: rules file by kind, subfolder and words; the person's choice and filters", () => {
  const cats: Category[] = [
    { id: "home", name: "Home", words: ["lease", "rent"], folder: "", kind: "", position: 0 },
    { id: "health", name: "Health", words: [], folder: "Medical", kind: "", position: 1 },
    { id: "slides", name: "Talks", words: [], folder: "", kind: "slides", position: 2 },
    { id: "manual", name: "Misc", words: [], folder: "", kind: "", position: 3 },
  ];
  const doc = (title: string, path = "", kind = "md") => ({ title, name: `${title}.${kind}`, path, kind });
  assert.equal(ruleCategory(doc("Flat lease 2026"), "", cats), "home");
  assert.equal(ruleCategory(doc("Notes"), "## Rent and deposit\n", cats), "home", "top headings count");
  assert.equal(ruleCategory(doc("Leases explained"), "", cats), "", "whole words only");
  assert.equal(ruleCategory(doc("Blood test", "medical/2026/blood.pdf", "pdf"), "", cats), "health");
  assert.equal(ruleCategory(doc("Q3 review", "", "pptx"), "", cats), "slides");
  assert.equal(ruleCategory(doc("Random"), "", cats), "", "a category with no rule never files by itself");
  const d = { id: "x", kind: "pdf", category: "home" } as never;
  assert.equal(passes(d, "pdf", "home"), true);
  assert.equal(passes(d, "word", "all"), false);
  assert.equal(passes(d, "all", "none"), false);
});
