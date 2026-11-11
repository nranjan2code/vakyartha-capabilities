---
name: finance-dashboard
description: Build a business income, expense, cash-flow or budget-versus-actual dashboard from supplied financial records; use budget-helper for personal budgeting.

compatibility: Works with general ledger exports, financial spreadsheets, and canvas projection.
metadata:

  category: reports
  author: Vakyartha
  version: "1.0.0"
allowed-tools: use_skill
---

# Financial Performance & Variance Dashboards

## Steps

1. **basis**: Identify periods, currency, accounting basis, entity and supplied ledgers or statements. Distinguish cash flow, balances and profit.
2. **reconcile**: Reconcile the supplied figures and calculate justified variance with explicit sign and denominator. Never mix incompatible periods or currencies.
   - needs: basis
3. **interpret**: Check arithmetic and explain the financial changes and evidence limits. Do not claim compliance, export or external changes without receipts.
   - needs: reconcile

## Domain guidance


Rigorous financial analysis methodology for constructing income statements, expense breakdowns, cash-flow overviews and budget-versus-actual variance dashboards.

## Overview & Chaining

- **Purpose**: Use this skill when asked to analyze business financial statements, monitor operational budgets, evaluate department spending, or prepare executive financial reviews.
- **Skill chaining**:
  - For personal budgeting, household savings or vacation spending, use `budget-helper` instead.

## Accounting Invariants & Basis Discipline

1. **Accounting basis**: Clarify whether financial records are prepared on a **Cash basis** (recognized upon receipt/disbursement) or an **Accrual basis** (recognized when earned/incurred).
2. **Distinct financial concepts**:
   - **Cash balance**: Liquid funds on hand; not equivalent to profit.
   - **Net income**: Operating revenue minus operating expenses, taxes, depreciation and interest.
   - **Gross profit vs Operating profit**: Maintain clear gross margin definitions (`Revenue - COGS`).
   - **Internal transfers**: Inter-account or inter-entity transfers are not operational revenue or expense.
3. **Multi-currency isolation**:
   - Never sum amounts across differing currencies (e.g. USD, EUR, GBP) without an explicit, dated foreign exchange rate.
   - Maintain separate currency columns or explicit conversion tables.
4. **Missing amounts**: Missing line items must be labeled as `Missing` or `Unknown`, never silently coerced to `0.00`.

## Budget vs Actual Variance Analysis

- **Dollar variance**: Calculate as `Actual - Budget`.
- **Percentage variance**: Calculate as `((Actual - Budget) / Budget) × 100`.
- **Directional interpretation**:
  - For **Revenue**: Positive variance is favorable; negative is unfavorable.
  - For **Expenses**: Negative variance is favorable (under budget); positive is unfavorable (over budget).
  - Clearly label variance as `Favorable` or `Unfavorable` alongside numeric deltas.

## Compliance & Export Boundaries

- **Review tool status**: State clearly that the dashboard is an operational review aid, not a certified audit, filed tax return or formal bank reconciliation.
- **Export receipts**: Generating a financial canvas does not export data to external accounting software (QuickBooks, NetSuite, Xero) without authorized integration tools and receipts.
