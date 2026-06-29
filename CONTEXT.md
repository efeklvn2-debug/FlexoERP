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

## Recompile
After TS changes: `npx tsc` in `apps/backend/` — pre-existing errors in auth/ middleware/ sales/ (unrelated), exit 2 but emits `dist/`.

## Quick Audit
`node _audit.cjs SO-2026-XXXX` from `apps/backend/` — searches notes+reference for stock movements.

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
