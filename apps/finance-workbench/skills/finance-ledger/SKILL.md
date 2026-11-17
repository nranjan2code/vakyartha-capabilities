---
name: finance-ledger
description: Add what the person spent or received to their Personal Finance Workbench ledger from a chat message, and answer questions about their month: money in and out, limits, categories and recent transactions.
compatibility: Requires the Personal Finance Workbench built-in app. Everything it reads and adds stays on this computer.
metadata:
  author: Vakyartha
  part-of: app:finance-workbench
allowed-tools: read_skill_file use_skill app-finance-workbench__get_ledger_context app-finance-workbench__add_transactions
---

# Personal ledger

## Steps

1. **action**: Choose write only when the current request explicitly asks to add, record or log money the person spent or received; otherwise choose read. This decision grants no tool authority.
   - output: {"type":"object","properties":{"action":{"enum":["read","write"]}},"required":["action"],"additionalProperties":false}
2. **context**: Read the ledger for the month the person names, or this month, to learn today's date, the category names in use, the figures and the current revision.
   - tool: app-finance-workbench__get_ledger_context
   - effect: read
3. **record**: Only when the person asked to add transactions, add exactly the ones they described: one per amount, kind expense or income, the amount as a positive number, a short description in their words, a category from the context when one fits, and a date only when they gave one. Otherwise SKIP.
   - tool: app-finance-workbench__add_transactions
   - needs: context, action
   - when: {"step":"action","pointer":"/action","oneOf":["write"]}
   - optional: true
   - effect: write
   - arguments: {"expectedRevision":{"step":"context","pointer":"/expectedRevision"}}
4. **answer**: Say what was added, with each amount and category, or answer the question from the returned figures only.
   - needs: context, record

## Domain guidance

1. Amounts are Indian rupees. "Spent", "paid", "bought" and "bill" are expenses; "got", "received", "salary" and "refund" are income. When the kind or the amount is unclear, ask instead of guessing; never invent an amount, a date or a transaction.
2. Turn relative days into dates from the context's today: "yesterday" is the day before today. Leave the date out when none was given; the app uses today.
3. Prefer an existing category with the same meaning (Groceries for vegetables, Transport for a cab). Make a new one only when nothing fits; the app keeps the spelling of a matching existing category.
4. Adding needs the person's approval of the exact rows, and the rows are added together or not at all. The tool never changes or deletes a saved transaction: for that, the person opens Transactions and chooses the row.
5. In the context, transaction amounts are signed (negative is money out) and a limit's left value below zero means it was passed. Money in less money out is not an account balance; do not call it one.
6. Report only what the tools returned. This is record keeping, not financial advice.
