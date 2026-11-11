# News Desk

A daily news reader built from publisher feeds you choose. Articles from many publishers are grouped into stories, ranked by freshness, how widely each story is covered, the topics you follow and your source preferences, and shown with publisher images, full coverage of every report and links to the originals. Feeds are read through the governed Web pages integration; nothing is summarized, rewritten or invented, and actions make no model request.

## Connect

Open the header **Access** shield, finish **Web pages** setup in that panel and review this app’s foreground/tool/destination rules. Review background access separately before enabling Keep running. Then open **Apps → News Desk** and press **Refresh in the header**. Until a read succeeds, Top stories says exactly this, with a link to review the feeds.

## Views

| View | What it shows |
| --- | --- |
| **Top stories** | Status line, **Mark all seen** beside the status. The compact **News channel** selector sits immediately before the radio button in the app header and persists across all views. Refresh and listening use that same header. Direct section shortcuts with story counts; four photo leads, each publisher image filling its card behind the headline (a dark card when there is no image); searchable **More headlines** and **For you** card grids beside an **Across sections** rail. Each rail card has two publisher headlines and a section link; three sections per local page. At most three leads come from one publisher. |
| **Sections** | One compact row of Section (with live counts), Published, Publisher and Order dropdowns; the section’s four photo leads, then the complete matching collection in a searchable, paged grid. Filters save automatically; **Reset filters** restores all sections and defaults. |
| **Full coverage** | One story: a headline and publisher excerpt, small image beside publisher/report counts and earliest-saved/latest timestamps, a timeline of every report in publication order, searchable report cards with their own links, **More from / Fewer from** the lead publisher, related stories, and return links to Top stories or the section. Saved reports still open when their feed is disabled. |
| **Following** | Follow any topic (a name, company, place or subject); suggested topics from headlines, story clusters and publisher tags; compact topic choices with counts and a clear selected state; searchable stories for the selected topic and one Unfollow action. |
| **Saved** | Compact illustrated bookmarks, searchable, with **Full coverage** and **Remove**. Saved articles stay after they leave the feeds. |
| **Sources** | Counts (active feeds, articles kept, share with images, failing feeds), coverage charts by section, day and publisher; section toggles and feed cards (enable, prefer, remove); the image setting; feed health; add a feed or paste OPML; the source ledger. |

Top stories is one scannable page, without nested tabs. Full coverage has Every report, Timeline and Related sub-tabs; Sources has Feeds, Health, Coverage, Add feeds and Ledger. Large collections page locally without discarding records. Routine feed rotation appears as a quiet status line; actual read failures remain a warning with retained earlier articles. Empty views include a useful next action.

## Listen

The arrow beside the header radio chooses this app’s voice; Default uses Settings → Voice. The voice picker includes every available voice, with provider/model labels and local or billed cost context. The script stays factual and attributed; a voice never adds reporting.

Choose **News channel** immediately before the header radio button: *Top stories*, *For you* (built from the topics you follow, the stories you open and save, and the publishers you prefer), any section, or any followed topic. The header radio button plays that channel; the assistant can ask for any channel through `get_bulletin`.

The radio button at the top right of the app header plays a radio-style bulletin through your Voice settings: a greeting with the date and time, the top five headlines, then up to twelve leading stories (at most three per section, or the channel's own) each with a line of context from the publisher's own summary and who is reporting it, the topics you follow, and a round of every other section (up to three stories each, or more from the channel), then a sign-off. Every story is told once, so a busier day makes a longer bulletin (about six minutes on a typical day). Headlines are cleaned for speech (labels such as "Live:" or "Watch:", links, emoji and cut-off sentences are left out). **Listen to this story** on Full coverage reads one story: what happened, who reported it first and what each other publisher says. The connecting words are fixed phrasing; every fact comes from a publisher's headline or summary. Listening carries on while you use other screens or chats; the header radio changes to a stop square as soon as preparation starts. A small *now playing* control appears at the bottom right only when that header is not visible; returning to News Desk hides the duplicate control.

**Watch** (the button just before the radio) shows the same bulletin as a broadcast: the theme's intro fades into the greeting, the headlines go by one picture each, a short sting leads into the detailed stories, and the outro closes it. Each part shows the publisher's own image (the largest the feed offers, or another publisher's for the same story; a title card when there is none) with a slow move, a lower third with section, headline, publisher and age, a link to the original, captions and chapter marks to jump. It follows the selected channel, covers the app page, the whole window, or floats as picture-in-picture while you do other things. It is stitched live from the bulletin's parts; nothing is recorded or exported. Watching and listening are one playback: opening Watch while the radio plays continues the same bulletin on screen, closing Watch keeps the radio going, and each header button shows Stop only for what is playing. While a show plays (radio or Watch), News Desk refreshes every four minutes. A story counts as breaking only on the feeds' evidence: new to News Desk in the last 30 minutes, published in the last 90, and carried by two or more publishers or on a topic you follow. Breaking stories lead a new bulletin and are cut into a running one after the current story, with a sting and a red Breaking banner; stories already in the show that change are read in their newest version and marked Updated; every story the show does not read crawls along the bottom in the Latest ticker, new ones marked. Title, transition and end cards use the Vakyartha broadcast backdrop; the end card credits every publisher in the bulletin.

Preview cards show the original headline, publisher link, age, ranking reasons and Save/Details actions. Publisher images remain available on leads, subsequent headlines, Following, Saved, related stories and individual reports. Side thumbnails are 72 px square; headlines use two-line previews with their full text available in a tooltip and Full coverage. Two-column leads and three-column reading grids keep stories compact; missing images leave no reserved blank area. Full coverage retains the full stored excerpt, author when supplied, every publisher’s own headline and link, and publication times. Cards show the reasons they rank (for example *2 h ago · 4 sources · Following: RBI*). A **New** badge marks articles first seen after you last pressed **Mark all seen**.

## Ranking and grouping

- **Grouping**: headlines are reduced to significant words (case, accents, stop words and simple plurals folded; "$6.3bn" and "$6.3 billion" read alike). Two reports are the same story when they share most of those words within two days and carry no conflicting figures ("October 30" and "October 31" stay apart). An article joins a story only when it matches at least half of its reports, so loosely related headlines never chain together. Grouping is a heuristic; each report keeps its own link and time.
- **Score** = 3 × freshness (halving every 8 hours since the newest report) + 1.5 × log₂(1 + independent publishers) + 2 per followed topic matched (up to two) + source preference (+1 preferred, −1 shown less) + section interest (±1.5) + 0.2 with an image + 0.5 when unseen. Every weight, the half-life and the per-publisher limit are the reader's to change under **Preferences**; the reasons appear on the card and Full coverage shows the score broken into its parts.
- **Coverage** counts publishers by site, so several feeds from one outlet count once, and a headline nearly identical to one already counted from another site is syndicated wire copy that adds nothing.
- **Topics** match when every word of the topic appears in a headline, excerpt or publisher tag.
- Disabled feeds hide their stories; removing a feed drops its unsaved articles at once. Saved articles stay under Saved.

## Preferences

- **Interests**: each section can be More, Normal, Less or Off; muted words hide any story whose headline or publisher tags contain them, with a count of what each hid.
- **Ranking**: the score formula in words, each weight (0–5), freshness half-life (4, 8 or 24 hours), the most top stories from one publisher, a live preview of the leading stories and a reset to defaults.
- **Learning**: off by default. When on, For you adds weight to the sections and publishers of stories you open; the learned list can be removed item by item or forgotten entirely. Saved articles always count.
- **Keeping**: articles are kept for 1, 3, 7 or 14 days back from the latest report, at most 10–60 per feed so a busy feed cannot crowd out a quiet one, and saved articles always stay. Clear all articles keeps saved ones.

## Sources and limits

The curated catalogue has 55 checked feeds across World, National, Business, Technology, Science, Health, Sports, Entertainment, Opinion, Hindi and Official (government press releases) from Indian and international publishers; 14 are enabled at first, spread across sections so stories group across publishers. Any credential-free HTTPS RSS, Atom, JSON Feed (1.0/1.1) or news sitemap (the publisher's own links, headline, time, image and keywords; no summary) can be added, singly or by pasting OPML. Up to 60 feeds, 60 items per feed, responses up to 600 KB, 480 recent articles plus saved ones (560 in all), 80 saved and 20 followed topics. Each refresh reads up to 15 feeds, least recently read first, and stops starting new reads after 15 seconds so a run never reaches its time limit, so larger selections rotate (Sources states how many refreshes a full pass takes) through every feed over consecutive refreshes. Headlines up to 240 characters and excerpts up to 280; full articles are never copied.

Under **Sources → Feeds** every feed is a small toggle grouped by section with the publisher's site icon (loaded only while publisher images are shown): green when on and reading, blue when on but not read yet, red when failing or needing permission, plain when off; preference and removal are under **Manage**.

Publisher images are loaded by the app window directly from each publisher's image server; turn **Show images from publisher servers** off under Sources to load none. Tracking pixels are ignored.

Top stories never shows feed diagnostics; when a feed fails, a single link (for example "1 feed needs attention") opens Sources, where **Health** shows the latest refresh notice and each feed's status.

A 15-minute refresh is declared but off until you choose **Start & keep running** under **Background**; it runs only while the app and computer are awake.

## Data

Feeds, articles, follows, bookmarks, preferences, feed health and receipts live in app state and are saved only when a run succeeds. Earlier versions' state (feeds as a JSON string, the single category filter, the four-feed default) loads automatically.

## Cross-app MCP integration and skills

- **Tool** `app-news-desk__get_latest_articles`: read-only, ranked stories with their lead headline, link, publishers and reasons; optional `category`, `query` (a topic, matched like a follow) and `limit`. NSE Market Terminal uses it for an instrument's news.
- **Tool** `app-news-desk__get_bulletin`: the spoken bulletin text, the stories it covers and the same bulletin as a `programme` another app can publish at its own `voice.listen` path to play or watch; optional `category` or `query`.
- **Tool** `app-news-desk__get_story_coverage`: every report of the best-ranked story matching `query`, in publication order, with a spoken report.
- **Feed** `news_feed`: the stored articles, for apps with an `app-feed` trigger.
- **Skill** `news-desk-reader`: published to the skill catalog for the assistant.
- In-process only; no network listener. Governed by the policies in Settings → Integrations.

## Layout verification

`node scripts/news-desk-check.ts` checks all seven views, every coverage/source sub-tab, section filters, topic and bookmark actions, complete collection paging/search and image preferences in real WebKit at 1440, 1100, 620 and 375 px. It uses isolated synthetic state and the real sandbox, without model/feed requests. `--state <retained-news-source-state.json>` replays a publisher snapshot for visual review; it does not claim a new source refresh.

## Hosted operation

The shared host supplies Background operation in this app and Operation Center; package views must not duplicate it or own timers. Start & keep running persists the choice and runs the declared startup-refresh handler now and whenever Vakyartha launches. Refresh remains a manual action; automatic timing uses the declared cron interval, a chosen host timer, or Manual only. Stopping background operation leaves manual actions and saved data available. Startup also runs in Manual only mode.

The host owns scheduling, serialized commits, bounded recovery and run receipts. A failed computation with no external calls receives up to three delayed retries; uncertain external effects block replay for exact-run review. Tools require this app’s explicit mode/tool/destination access; integration Off remains a ceiling, and execution needs an awake computer and running Vakyartha. Reviewed package updates stop background operation for renewed review. Playback observes saved programmes and never starts another refresh loop.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.

The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
