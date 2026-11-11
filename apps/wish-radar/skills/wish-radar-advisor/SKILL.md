---
name: wish-radar-advisor
description: Remember wishes and review recorded INR price history, targets and merchant comparisons. Public merchant reads have explicit access and product-identity limits.
allowed-tools: app-wish-radar__get_wishlist app-wish-radar__get_price_history app-wish-radar__get_broadcast_script app-wish-radar__remember_wish app-wish-radar__record_price app-wish-radar__check_amazon_price app-wish-radar__remove_wish
metadata:
  author: Vakyartha
  part-of: app:wish-radar
---
# Wish Radar Advisor

## Steps

1. **action**: Choose write only when the current request explicitly asks for this app proposal or mutation; otherwise choose read. This decision grants no tool authority.
   - output: {"type":"object","properties":{"action":{"enum":["read","write"]}},"required":["action"],"additionalProperties":false}
2. **wishlist**: Read the canonical wishlist and current revision; resolve existing wish identity before creating or removing anything.
   - tool: app-wish-radar__get_wishlist
   - effect: read
3. **history**: Read requested price history or broadcast script for the actual wish; otherwise SKIP. Distinguish recorded observations from available current offers.
   - tool: app-wish-radar__get_price_history app-wish-radar__get_broadcast_script
   - needs: wishlist
   - optional: true
   - effect: read
   - rounds: 2
4. **resolve**: Resolve product identity, variant and the person's exact requested action. Discovery candidates and targets are not observed prices. Ask for material unresolved choices.
   - needs: wishlist, history
5. **revision**: Only before an explicitly requested wish mutation or merchant check, re-read the wishlist for the current revision. Otherwise SKIP.
   - tool: app-wish-radar__get_wishlist
   - needs: wishlist, resolve, action
   - when: {"step":"action","pointer":"/action","oneOf":["write"]}
   - optional: true
   - effect: read
6. **change**: Perform only the explicitly requested resolved wish action. Do not retry declined merchant reads or uncertain writes; never substitute product/variant/merchant. Otherwise SKIP.
   - tool: app-wish-radar__remember_wish app-wish-radar__record_price app-wish-radar__check_amazon_price app-wish-radar__remove_wish
   - needs: resolve, revision, action
   - when: {"step":"action","pointer":"/action","oneOf":["write"]}
   - optional: true
   - effect: write
   - arguments: {"expectedRevision":{"step":"revision","pointer":"/expectedRevision"}}
7. **interpret**: Explain recorded trends, age, identity and merchant-source limits from actual receipts. Unknown availability stays unknown; no receipt establishes permission to purchase.
   - needs: wishlist, history, change

## Domain guidance

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

## App operation

Read `references/app-operation.md` for details.
