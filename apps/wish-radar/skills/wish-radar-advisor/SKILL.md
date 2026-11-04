---
name: wish-radar-advisor
description: Remember wishes and review recorded INR price history, targets and merchant comparisons. Public merchant reads have explicit access and product-identity limits.
allowed-tools: app-wish-radar__get_wishlist app-wish-radar__get_price_history app-wish-radar__get_broadcast_script app-wish-radar__remember_wish app-wish-radar__record_price app-wish-radar__check_amazon_price app-wish-radar__remove_wish
metadata:
  author: Vakyartha
  part-of: app:wish-radar
---
# Wish Radar Advisor

Use the app's canonical wishlist and observation ledger. Never invent source prices, stock, ratings, delivery, offers or facts about the person. A destination PIN preference does not establish destination-specific availability.

## Tools and approvals

`get_wishlist`, `get_price_history` and `get_broadcast_script` are immutable queries. They cannot fetch, write observations or advance app revision. `get_wishlist` supplies current expectedRevision; history accepts a wish ID/title and bounded limit. The script query supplies the record-derived production script/programme.

`remember_wish`, `record_price`, `check_amazon_price` and `remove_wish` are declared mutations. Read current expectedRevision first and pass that integer. They default to Ask and run through the existing serialized host owner; skill/package declarations grant no permission. A saved receipt acknowledges the app action, not independently verified source prices or permission to purchase.

## Procedure

1. Read the wishlist; identify an existing item before creating a duplicate. Ask the person for unresolved product/variant choices.
2. Remember a wish with a clear title, merchant, optional INR target and optional direct product link. Supported merchant labels include Amazon.in, Flipkart, Nykaa, Croma, Tata CLiQ, Reliance Digital, Brand Store and Other Store.
3. For a linked product, `check_amazon_price` uses the current Web pages fetch tool for that merchant. Without a link, only Amazon wishes support candidate discovery. Other merchants require a direct product link and never fall back to Amazon.
4. Search results are candidates, not price observations. Ask the person to compare variants and select the exact product in the app, then run a separate product check. Neither discovery nor selection writes a price observation. Do not promise photographs or structured metadata: the tool returns cleaned text and links.
5. If a page is empty, challenged, unavailable, requires JavaScript or lacks an unambiguous product price, retain the failure. A 403, 429 or 503 means the store declined the automated read. Do not automatically retry or substitute another model/variant/merchant. A readable homepage does not verify product checks. Merchant preferences only narrow host permissions.
6. Record a price explicitly supplied by the person with its merchant and known stock/offer details. Never turn a target or search guess into an observed price. Retain unknowns. INR and paise must not be confused.
7. Review recorded trends, age, merchant and source limits before giving buy/wait advice. Missing observations cannot support a price-drop claim; a stale recorded observation is not a current available offer.
8. Remove a wish only on the person's request using its current revision. There is no purchase tool.

The shared assistant.compose studio opens inertly; Send remains explicit and uses the existing provider/skills/MCP/approval pipeline. Listen, Watch and the broadcast script derive from those same records and use the host voice/player. Do not introduce a direct model call, alternate connector, browser/proxy, narration store or package timer.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Merchant/store enablement is a domain preference, not a permission grant. New merchant hosts require explicit app destination review; source/value/identity checks remain independent of granted access.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
