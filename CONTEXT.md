# FlexoPrint ERP — Session Context

## Project
- Backend: `apps/backend/` (Express + Prisma + TS)
- Frontend: `apps/frontend/` (React + TS)
- DB: PostgreSQL via Prisma

## Pricing
- `PriceList.pricePerPack` = selling price per pack (₦1,800)
- `Material.costPrice` = cost per bundle (₦13,000)
- `Material.packSize` = 10 packs/bundle
- Bundle price = `pricePerPack * packSize`

## Ink Costing (NO global inkCostPerKg)
- `inkCostPerKg` removed from ConsumptionRates/Settings. DB column unused.
- Ink costing = avg of `material.costPrice` across active ink materials mapped to customer colors (excludes IPA/Butanol, excludes archived inks).
- Single source for consumption rates: `settingsService.getConsumptionRates()`

## InkColor
- DB model `InkColor(name, mapping, isActive)` — managed in Settings → Ink Colors
- 5 CRUD endpoints at `/api/settings/ink-colors`
- Seed: RoyalBlue, VioletBlue, SkyBlue (3 default colors + their `INK_SOLVENTS` materials)
- Replaces hardcoded `inkColorMap` in production/service.ts
- Checkboxes on CustomersPage fetched from InkColor API

## Stock & Migration
- `Stock.quantity` & `StockMovement.quantity` = Float (migration applied)
- Ink/solvent consumption rates unified via `getConsumptionRates()`
- Pre-production stock validation: blocks job if any shortage, lists each

## Invoice PAID Stamp
- Modal overlay (SalesOrdersPage.tsx), thermal print (handlePrintInvoice), PDF (pdf-service.ts watermark + content badge)
- PDF: `watermark opacity: 0.2` (was 0.08 — invisible) + "✓ PAID" text block with paidAt date in content
- Shows when `invoice.status === 'PAID'`

## Payment → Invoice Bug (FIXED 27 Jun 2026)
### Root cause
`recordPayment()` invoice update had two bugs:
1. Status check used `amountPaid >= totalAmount`, ignoring `depositApplied`/`previousPayments`
2. First fix used `newAmountPaid + D + P - prevAmountPaid` — collapses to `revenuePortion + D + P`, discards prior payments

### Current fix (service.ts:1191-1208)
```js
newInvoiceBalanceDue = Math.max(0, oldBalanceDue - revenuePortion)
newInvoiceStatus = newInvoiceBalanceDue <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : oldStatus
```
Simple decrement of old balance — works for old invoices (D+P separate) and new (D+P included in amountPaid).

### Corrective script
`_fix_invoice.cjs` — fixed 18 stuck invoices incl. Freshyo (INV-2026-0093) and Y2K (INV-2026-0100).

## Accounting Integrity (Unique Value Proposition)

### Core Principle
Every financial transaction is double-entry. No revenue without matching receivable. No COGS without matching inventory reduction. Every invoice is backed by a verified physical delivery.

### Revenue Recognition Flow
1. **Order created** → No GL impact (commercial commitment only)
2. **Job completed** → Dr 1330 (Deferred COGS), Cr 1510/1520 (Inventory). Costs accrued at production, not delivery.
3. **Pickup recorded** → Dr 1200 (AR), Cr 4000 (Revenue) + Cr 2100 (VAT). Revenue recognized on physical transfer. Dr 5000 (COGS), Cr 1330 (Deferred COGS). Invoice created automatically for the picked-up quantity.
4. **Payment received** → Dr 1000 (Bank/Cash), Cr 1200 (AR). If deposit, Cr 2250 (Advance Customer Payments) instead.
5. **Advance deposit applied** → Dr 2250, Cr 1200. Posted inside `createInvoice` when auto-applying available deposits.

### Per-Pickup Invoicing (FIXED 30 Jun 2026)
Every pickup generates a separate invoice for the exact quantity picked up. No more "wait for full delivery" pattern.

**Fixed bugs discovered during audit:**
1. **`completeOrder` duplicate invoice** (service.ts:531-535): Called `createInvoice` unconditionally even when `recordPickup` already created one. Fixed with `existingInvoiceCount === 0` guard.
2. **`createInvoice` overwrites cumulative `quantityDelivered`** (service.ts:643-644): Unconditionally set order's `quantityDelivered` to the single-pickup amount, corrupting the cumulative total after multi-pickup workflows. Fixed with `Math.max(Number(order.quantityDelivered), quantityDelivered)`.

**Corrective script:** `_fix_quantity_delivered.cjs` — fixed SO-2026-0132 (DCC) where `quantityDelivered` was 1.5 instead of 4.5 after split pickups.

### Edge Cases Tested
| Scenario | Behaviour | Integrity |
|----------|-----------|-----------|
| Full delivery (12→12) | Invoice for 12kg via recordPickup | ✓ |
| Partial delivery + Complete (12→10) | Invoice from pickup; completeOrder skips invoice | ✓ |
| Split pickups (3+7=10) | Two invoices (3kg, 7kg); order.quantityDelivered = 10 | ✓ |
| CompleteOrder with no prior invoices | Fallback: creates invoice for delivered amount | ✓ |
| CompleteOrder with existing invoices | Guard skips duplicate invoice | ✓ |
| CompleteOrder on COMPLETED order | Error: "Only picked-up orders can be completed" | ✓ |
| Concurrent completeOrder | Idempotent — guard + order update are idempotent | ✓ |
| createInvoice overwrite guard | MAX preserves cumulative total | ✓ |

### Audit Scripts
- `node _audit.cjs SO-2026-XXXX` — searches notes+reference for stock movements
- `node _audit_complete_order.cjs` — checks PICKED_UP orders for: partial delivery, invoice count consistency, quantityDelivered integrity, duplicate invoices

## Customers
- Table: Customer | Rolls | Outstanding | Deposit | Orders | Last Activity | Colors | Action
- Detail page at `/customers/:customerId`
- `getAllCustomerBalances`: batch-queries availableRollsCount, lastTransactionDate, ordersCount, availableCredit
- Filter toggles: "Outstanding only", "Has Rolls"

## Misc
- Clear buttons: `text-red-700 bg-red-50 border-red-200 rounded-lg hover:bg-red-100`
- Period filters default to `''` (not "This Month")
- Opening balances: Account.openingBalance + OBE journal entry
- Inventory init: Dr 1300 / Cr 3000 via material.costPrice × quantity
- Dynamic subCategories endpoint: `GET /inventory/materials/sub-categories` (before `/:id`)
- Material code auto-fill from name + `codeManuallyEdited` flag
- PO labels: ink→"Quantity(kg)", IPA/Butanol→"Quantity(Liters)"
- Receive PO: dynamic content per material category
- SettingsPage: archive/restore per row, "Show archived" toggle, opacity-50
