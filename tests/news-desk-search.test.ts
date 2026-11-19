import assert from "node:assert/strict";
import { test } from "node:test";
import type { Article } from "../apps/news-desk/feed.ts";
import { matches, muted, searchWords, terms } from "../apps/news-desk/rank.ts";
import { handleQuery } from "../apps/news-desk/server.ts";

const article = (title: string, excerpt = "", extra: Partial<Article> = {}): Article => ({ id: title, url: `https://example.com/${encodeURIComponent(title)}`, title, excerpt, source: "Example", category: "Technology", retrievedAt: "2026-11-19T08:00:00Z", publishedAt: "2026-11-19T07:00:00Z", ...extra } as Article);

// A search for "AI" once found nothing while the feeds held twenty AI stories: ranking's word filter dropped every
// word under three letters, and search reused it.
test("search keeps every word the person typed, however short", () => {
  assert.deepEqual(searchWords("AI"), ["ai"]);
  assert.deepEqual(terms("AI"), [], "ranking still leaves short words out");
  assert.ok(matches("AI", article("Anthropic raises $81bn as AI shares climb")));
  assert.ok(matches("EU", article("EU agrees new data rules")));
  assert.ok(!matches("AI", article("Rain said to ease by evening")), "a whole word, not a letter pair inside one");
  assert.ok(matches("AI chips", article("Nvidia sells more AI chips")), "every word must appear");
  assert.ok(!matches("AI chips", article("AI rules tighten")));
  assert.ok(matches("news about AI", article("AI agents arrive")), "stop words drop only when something else remains");
  assert.deepEqual(searchWords("the who"), ["the", "who"]);
  assert.deepEqual(searchWords("  ... "), []);
});

test("search works in other scripts", () => {
  assert.ok(matches("中国", article("中国经济增长放缓")), "found inside text written without spaces");
  assert.ok(matches("दिल्ली", article("दिल्ली में बारिश")), "script vowel signs stay part of the word");
  assert.ok(!matches("दिल्ली", article("मुंबई में बारिश")));
  assert.ok(matches("Ελλάδα", article("Η Ελλάδα ψηφίζει")));
});

test("a short muted word hides its reports", () => {
  assert.ok(muted(["AI"], article("AI chatbots everywhere")));
  assert.ok(!muted(["AI"], article("Markets rally")));
});

test("the query tool refuses a query with no words and says what period it covers", async () => {
  const state = { articles: [article("AI model released", "", { publishedAt: "2026-11-18T07:00:00Z" }), article("Markets rally")] };
  const found = await handleQuery("get_latest_articles", { query: "AI" }, { state } as never) as { count: number; covers: { from: string; to: string } };
  assert.equal(found.count, 1);
  assert.deepEqual(found.covers, { from: "2026-11-18T07:00:00Z", to: "2026-11-19T07:00:00Z" });
  await assert.rejects(handleQuery("get_latest_articles", { query: "?!" }, { state } as never), /at least one word/);
});
