---
name: write-article
description: Author, structure, and polish long-form articles, news analyses, investigative essays, whitepapers, guides, feature stories, or digital publications with rich Canvas layouts, media, and source citations.

compatibility: Works across text chat, long-form canvas surfaces, media attachments, and voice projection.
metadata:
  category: writing
  author: Vakyartha
  version: "1.0.0"
allowed-tools: read_skill_file use_skill vak_render vak_update vak_submit
---

# Long-Form Article & Publication Authoring

Comprehensive, domain-neutral methodology for drafting, structuring, and polishing publication-grade articles, essays, investigative reports, technical guides, whitepapers, and digital features on the Canvas.

## Overview & Skill Chaining

- **Purpose**: Use this skill when asked to write, draft, adapt, or structure an article, analysis, long-form essay, opinion piece, whitepaper, guide, newsletter post, or feature story.
- **Skill chaining**:
  - The required `surface-design` skill governs typography hierarchy, responsive container clamping (`maxWidth: "md"` or `"lg"`), card structure, and dual visual/spoken presentation.
  - Load `interactive-ui` via `use_skill` when the article includes interactive controls: section tabs (`tabs`), filterable comparison tables (`table`), or feedback buttons.
  - Load `research-brief` via `use_skill` when investigating complex topics, sourcing literature, or building an evidence matrix.
  - Load `daily-news` via `use_skill` when composing news-driven analyses, daily roundups, or timely event explainers.
  - Load `compare-options` via `use_skill` when authoring comparative reviews, product evaluations, or multi-option analyses.
  - Load `data-review` via `use_skill` when the article centers on empirical datasets or tabular statistics.
  - Load `explain-simply` via `use_skill` when translating dense technical, financial, or academic concepts for a general audience.
- **Reference files**:
  - Read `references/article-archetypes.md` via `read_skill_file` for structural patterns across journalism, essays, whitepapers, tutorials, and newsletters.
  - Read `references/article-surface-templates.json` via `read_skill_file` for validated Projection surface schemas across standard, split, and tabbed canvas layouts.

## Core Editorial Craft & Structural Disciplines

Every article must follow a deliberate architecture calibrated to its format:

1. **Headline & Subtitle (The Hook & Promise)**:
   - **Headline**: Informative, specific, and engaging without deceptive clickbait. Clearly signal the subject and primary insight.
   - **Deck / Subtitle**: 1–2 sentences summarizing the central premise, context, or consequence.
   - **Byline & Metadata**: Explicitly state publication date, estimated reading time (e.g. `6 min read`), topic tags, and author/source attribution.
2. **Executive Takeaways / Key Points**:
   - Provide an upfront "At a Glance" or "Key Takeaways" callout (`alert` with tone `info` or a compact summary card) containing 3–4 bulleted core insights. This enables executive scanning before deep reading.
3. **Structured Body & Section Pacing**:
   - Organize into logical sections (`section` containers or distinct markdown headings) with clear thematic focus.
   - Break up dense prose: keep paragraphs between 2–4 sentences.
   - Use pull-quotes (`text` with `variant: "quote"`) for poignant statements, central theses, or notable quotes.
   - Ground quantitative arguments in visible data anchors: stat highlights (`stat`), trend indicators, or clean comparative tables.
4. **Counterpoint, Nuance & Analytical Balance**:
   - Address counter-arguments, dissenting data points, limitations, or alternative interpretations.
   - Differentiate verified empirical facts from corporate announcements, analyst projections, and editorial opinions.
5. **Synthesis & Outlook**:
   - Conclude with a forward-looking synthesis, strategic takeaway, or actionable summary rather than merely restating previous sentences.

## More detail

Before laying out the article on the canvas or adding images and media, read `references/canvas-and-media.md` with read_skill_file.

## Sourcing, Fact Discipline & Ethics

1. **Temporal Context**: Explicitly date the article, the events described, and source retrieval times.
2. **Direct Attribution**: Attribute quotes, figures, and proprietary claims to named sources with accessible hyperlinks where available.
3. **No Fabricated Facts**: Never invent sources, statistics, dates, or quotations. If a data point is unverified or unavailable, state the limitation openly.
