---
name: broadcast-programme
description: Turn an app's records into a programme the host plays as radio and as a watchable broadcast (Listen and Watch), and share it with other apps. Use when an app needs a spoken briefing, a bulletin, a narrated walkthrough or a video-like presentation of its data.

compatibility: Vakyartha executable apps (voice.listen); the host owns playback, music, pictures and voice.
metadata:
  category: build-apps
  author: Vakyartha
  version: "1.0.0"
  loads-with: "app-authoring"
---

# Broadcast programmes

A programme is the app's spoken script in parts. The host speaks each part with a presenter delivery, plays the theme's cues between parts, and in **Watch** shows each part's picture, kicker, heading and attribution while it is said. It is stitched live from the parts and starts instantly, like radio (the intro plays on the press while the first words load): there is no video file, no export and no second player. Listen and Watch are the same playback, so closing Watch keeps the programme going as radio.

## Declare it

1. In `app.json`: `"voice": { "listen": { "surface": "<surface id>", "path": "/spoken/<name>", "label": "Listen to …" } }`. Optional `selector: {bind, options, label}` puts a compact choice (a channel, a section) before the header buttons; the programme must follow that choice.
2. In the surface's data at that path, publish `{ title, segments: [...] }` instead of a string. The header then shows **Watch** before the radio. A plain string still works for listen-only apps.

## Segment fields (host contract: `shared/programme.ts`)

| Field | Meaning |
|---|---|
| `text` | What is said. Your records' own words with fixed connecting phrases; never invented claims. |
| `delivery` | `opening`, `headline`, `story`, `aside` or `closing`. Sets the presenter direction for voices that take one and the text shaping. |
| `cue` | `intro` (theme, fading as the first words begin), `sting` (a 5.5-second transition with a full-frame transition card in Watch, e.g. from the summary into the detailed parts; the card shows the part's `kicker`), `outro` (after the part, ending with the theme's own fade; Watch shows an end card with the programme title and credits built from every part's `source`, so fill `source` faithfully). |
| `breaking` | `true` only on your data's evidence (for example new, recent and carried by several sources). Such parts lead the programme; during a live show the host splices ones the show lacks in after the part on air with a sting and a Breaking banner. Say the evidence in `text`. |
| `chart` | `{kind: "line", title, points, labels: [first, last], base}` for a series in order (base, such as the previous close, is what its change is measured from), or `{kind: "bars", title, unit: "%", bars: [{label, value}]}` for values around zero. Only values your app read. |
| `figures` | Up to six tiles `{label, value, change?}`: value is your formatted text, change a percent that colours it. |
| `bed` | `true` to play the theme faintly under this part; use it on a run of quick summary parts (headlines), never under detailed reporting. |
| `break` | Pause before the part: `short` between quick items, `story` between items, `section` at a change of section. |
| `kicker` | Short label over the heading: a section, "Top story", the channel. |
| `heading` | The on-screen line for the part: the record's own title. |
| `image` | An `https` image from the source, the largest the source offers; omit when there is none (the stage shows a title card, never a placeholder). Respect the app's image preference. |
| `source`, `at`, `link` | Attribution, an ISO timestamp (shown as "2 hours ago") and an `https` link to the original. |

A programme may set `badge` (for example `Live` while a session is open, `Market close` after). Give every part a stable `link` (or a unique `heading`): live updates match parts by it. Add `ticker: [{text, kicker?, link?, at?, fresh?}]` for records the programme does not read; Watch crawls it along the bottom. The host drops anything that is not one of these values, keeps at most 80 parts, and strips markup, links, HTML, entities and emoji from every field: the picture is a broadcast, so it shows plain words only. Write plain text to begin with.

## Shape it like a broadcast

- **Open** with a greeting and what this is (`delivery: "opening"`, `cue: "intro"`).
- **Summary first**: the key items as quick `headline` parts with `break: "short"` and `bed: true`, one picture each.
- **`sting`** on the first detailed part, then each item as its own `story` part with context and attribution.
- **Asides** (followed topics, other sections) as `aside` parts; the first of a group gets `break: "section"`.
- **Close** with a sign-off (`delivery: "closing"`, `cue: "outro"`).
- One record per part, so the picture always matches the words. Keep parts to a few sentences.
- Let length follow the data: use each record once and include as many as the source honestly supports (News Desk reads every section, about six minutes on a typical day). Do not pad or repeat.

## Shape it for the screen

Watch lays every part out from its fields; the app chooses the fields, never positions or motion. Captions start **off** and stay off until the viewer turns them on (C or CC), muted or not, so the picture must make sense on its own: `heading` and `figures` say what the part is about without `text`.

| A part with | Shows as |
|---|---|
| `image` | The picture with a slow move, the lower third (kicker, heading, attribution) over its foot. |
| `figures`, no `chart` or `image` | A title card: kicker and heading centred just above the middle, the tiles centred under them. Portrait frames set four tiles two by two. |
| `chart` (with or without `figures`) | Tiles across the top, the chart under them, the lower third at the foot. |
| neither | A title card: kicker and heading centred on the programme's backdrop. Use it for openings, closings and short asides only. |

- **Heading:** the line a viewer reads in a second. Up to about 60 characters; it is clamped at three lines on a card and two beside a chart. Do not repeat the kicker in it.
- **Kicker:** one to three words (a section, "The headlines", "Breaking"). It must agree with the programme's `badge`. Outside a session, for example, say the day the data is from, not "Live".
- **Figures:** two to four tiles reads best; six is the limit, and narrow frames show fewer beside a chart. Labels up to about 18 characters, in words ("Nifty Bank", "Day high"), not raw codes. Values formatted alike within a part (same decimals and grouping) and in their units (`₹1,185.00`, `719,748`, `6.50%`). Use `change` only for a real percentage change, so the colour means up or down. Do not repeat the heading's figure as a tile unless it is the part's subject.
- **Charts:** one per part. A line needs three or more readings; bars stay at twelve or fewer, sorted by value, with readable labels (expand codes as in the heading). Title the chart with what it measures and its unit, not the part's heading again.
- **Opening and closing:** the opening heading names the data's day and time ("Friday 30 October · close" when the market is shut, the clock while live), and the closing heading carries the caveat or sign-off in a few words.
- **Transitions are the host's.** Between parts the graphics dip out briefly while the backdrop dissolves, then the next part builds in: tiles rise in turn, bars grow, a line wipes on. Live number updates redraw in place without animating. Pace the show with `break` and keep `sting` for the one move from summary to detail. More stings, or a `breaking` flag without evidence, make it feel overdone.

## Write for the ear

A voice says exactly what it is given. Text that reads well on a screen often sounds robotic: tickers spelled out, `NOV` read as "nov", `2026-10-30` read digit by digit, `12,34,567` read as three numbers, brackets and run-on sentences delivered without a breath. Write every `text` as a presenter would say it.

### What the host already fixes (English)

`src/voice/broadcast.ts` rewrites these on every part, so you may pass your records' own wording through:

- **Dates and times:** ISO dates (`2026-10-30` → "30th October 2026"), exchange dates (`30-Oct-2026`), day-month and month-day forms with ordinals ("2nd November", "November 12th"), short months on their own (`NOV`, `Dec.`), month-year (`Nov'26`), short weekdays before a date (`Mon, 2 Nov` → "Monday"), 24-hour times (`15:40` → "3:40 PM"), dotted times (`10.30 a.m.`), `IST` → "India time".
- **Money and numbers:** currency with its scale and the adjective form before a noun ("a 500 crore rupee package"), `lakh crore`, Indian digit groups (`12,34,567` → "12 lakh 34 thousand 567"), rates with "per", `bps`, `pts`, `km/h`, `3x`, trailing zeros in percentages (`6.50%` → "6.5 percent"), `#1`.
- **Finance shorthand:** quarters and halves with fiscal years (`Q2FY27`, `H1FY27`, `FY26`), `YoY`, `QoQ`, `MoM`.
- **Titles and honorifics before a name:** PM, CM, FM, Dr, Prof, Smt, Shri, Hon'ble, Lt, Gen and similar; `Delhi HC` → "Delhi High Court".
- **Letters that read as words:** `US`, `IT`, `UN`, `WHO` are spaced so each letter is said; other acronyms (RBI, AIADMK, NASA) keep their letters. Wholly shouted lines and headline labels (BREAKING, LIVE) are said in ordinary case.
- **Pauses:** brackets become a pause, an abbreviation in brackets after its name is dropped, circular and file references (`RBI/2026-27/123`) are not read, scare quotes are dropped, headline colons become a sentence break, long sentences break at their own semicolons, dashes and ", and".

Other languages pass through unchanged, so a non-English programme must be written for the ear by the app.

### What you still write

- **Names, not codes.** Say what a listener knows: the company ("Reliance Industries", not `RELIANCE`), the index ("the Nifty Bank"), the full name of a body the first time. Keep codes in `heading`, `figures` and the ticker, where they are read. If the source gives only codes, ship a name table derived from the source's own published list (Market Terminal: `names.json` from NSE's equity list, regenerated by `scripts/nse-names.ts`).
- **Greet and sign off.** Open with a time-aware greeting from the data's own clock ("Good morning", "Good afternoon", "Good evening"; before 5 AM is still evening) and what this is ("This is your RBI Desk briefing…"). When the app has no clock, a neutral "Hello, and welcome to …". Close with a sign-off that says what was covered and thanks the listener; put any caveat (delayed data, not advice) just before it.
- **Round as a presenter does.** Large sums in lakh or crore to two places, millions of dollars as billions; exact values stay on screen in `figures`. Prices and rates keep their published precision.
- **One idea per sentence**, at most about 25 words. Lead with the subject and the change ("Infosys rose 3.4 percent"), then the context. No lists of more than three items; say "and N more" instead.
- **Transitions between parts** from a small fixed set ("The headlines.", "Meanwhile,", "Turning to …", "Also from …"), varied, never generated claims.
- **Attribution said naturally** ("That's from …", "… reports.", "according to …").
- **Dates relative to the data, never invented.** Say the day the data comes from ("as of Friday's close"); never "today" for something older.
- **No lists, tables, URLs, bylines, labels such as "LIVE:" or "WATCH:", markdown or emoji in `text`.**
- **Derive it from the same records as the visual view** in `view(state)`; never a second store.

### Check it by ear

Run the rules over real copy before shipping a new phrase pattern: `broadcastScript(text, delivery)` on the app's saved records shows exactly what the voice will be given. Add a rule to `broadcast.ts` (with a test in `test/programme.test.ts`) only when it is general to any app's copy; an app-specific wording belongs in the app.

## Data shows

For live data (markets, operations, metrics), make the headline parts the key figures with a line chart of today's readings, then detail parts with bar charts, and a ticker of every value. Record readings yourself on each refresh (bounded, reset per day) rather than inventing a series; a chart appears once there are a few points. Keep words factual and say the data's delay; never predict or advise. Worked example: Market Terminal `show.ts`.

## Keep it live

Declare `voice.listen.live` (2–15 minutes) when your data changes during a show. The host runs your normal refresh that often while the programme plays, then merges your newer programme: breaking parts are spliced in, unplayed parts take new words (Updated), the ticker updates. Do not interrupt or reorder from the app; publish the current programme and let the host merge.

## Share it

Export it with a read-only `exports.tools` query (for example News Desk's `get_bulletin` returns `programme`). A consuming app declares that tool in `entitlements.mcpTools`, stores the result in its state on refresh, and publishes it at its own `voice.listen` path; it then plays and watches like its own. It stays data: a consumer never fetches or plays media itself.

## Check it

- Unit test: the programme has an `intro` first, an `outro` last, every part has a heading, and `parseProgramme` accepts it.
- Look at it: `node scripts/market-watch-check.ts` saves a picture of each part at 1440 and 720 wide. Read every picture for a cut-off heading, crowded tiles, a chart under the words or an empty half-frame before shipping a new part shape.
- WebKit journey (see `scripts/news-desk-check.ts`): Watch sits before the radio, the stage shows the first part, chapter marks match the parts, the frame stays inside the window at wide and narrow widths, no markup on screen, Escape closes. Stub `/api/speech` so checks never synthesize or bill.
