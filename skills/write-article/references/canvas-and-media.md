# Canvas layout, dual projection and media

## Media, Imagery & Visual Embeddings

When visual or multimedia context enhances the article:

1. **Hero Visuals**: Place a high-quality hero image or media banner directly beneath the headline and byline using an `image` node (`props: { src, alt }`) or `media` node (`props: { kind: "image", uri, description, caption }`).
2. **Inline Figures & Visual Breakouts**:
   - Embed charts (`chart`), architecture diagrams, or focused figures between narrative sections to illustrate specific claims.
   - Always supply descriptive `alt` text and an explicit caption or credit.
3. **Galleries & Photo Essays**:
   - Use `gallery` nodes (`props: { images: [{ src, alt }] }`) for multi-image comparisons, photo journalism, or visual step-by-step examples.
4. **Audio & Narration Players**:
   - When accompanying the article with spoken narration, podcast excerpts, or interviews, integrate a `media` node (`props: { kind: "audio", uri, description }`).
5. **Security & Media Bounds**:
   - Media references must use secure public URLs (`https://`) or verified local media asset paths (`/media/...`). Never expose credentials, local file system paths, or unverified download scripts.

## Canvas Layout Architecture & Dual Projection

Articles must never be dumped as monolithic plain text into the chat scroll. Apply Vakyartha's placement and projection rules:

1. **Canvas Placement**:
   - Long reads (exceeding 1,500 characters) belong on the Canvas.
   - Author the complete article as a Projection surface using `vak_render`.
   - In the chat thread, provide only a concise companion card: headline, reading time, thesis statement, 2–3 sentence executive summary, and key takeaways.
2. **Responsive Measure Clamping**:
   - Prose must never stretch 100% across wide desktop monitors.
   - Always clamp the outer article stack or reading column to `maxWidth: "lg"` (960px) or `maxWidth: "md"` (720px) to preserve comfortable typographic measure (60–80 characters per line).
3. **Canvas Surface Composition Archetypes**:
   - **Standard Editorial Stack**: Outer `stack` (`maxWidth: "lg"`) containing Headline (`headline`), Deck (`lead`), Metadata bar, Hero image/media, Takeaways `alert`, sequential `section` nodes with body prose and pull-quotes, and a Sources footer.
   - **Split Analytical Layout**: A `split` container (`ratio: [2, 1]`) with the main article prose in the 2/3 primary column, and the 1/3 sidebar containing key statistics (`stat`), author notes, glossary, and reference links.
   - **Tabbed Multi-Chapter Layout**: A `tabs` container for comprehensive whitepapers, investigative series, or technical guides (e.g., `Overview`, `Deep Dive`, `Data & Sources`, `Conclusions`).
4. **Dual Projection (Voice & Spoken Audio)**:
   - Voice audio projects the headline, deck, and executive takeaways as an executive audio briefing.
   - Audio projections omit raw URLs, markdown footnote numbers, and tabular data rows, ensuring natural speech synthesis.
