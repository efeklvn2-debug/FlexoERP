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

## Payment/Deposit Flow (Refactored 6 Jul 2026)

### Payment vs Deposit — Separate Entry Points
- **Payment modal** (triggered by "Pay" button on order row/modal/invoice): Title "Record Payment — {orderNumber}", customer + order pre-filled, amount defaults to balance due. No Transaction Type dropdown, no Payment For dropdown, no Customer selector. Excess → deposit automatically (backend handles it).
- **Deposit modal** (triggered by "+ Deposit" in Payments tab): Title "Record Deposit", customer selector + amount + method, no order association.
- `paymentModalMode` state (`'payment' | 'deposit'`) controls which variant of the single modal renders.
- `paymentForm` no longer has `transactionType` or `paymentCategory`. Type is determined by context in `handleRecordPayment`.
- Overpayment toast: green success banner shows "₦X overpaid — applied as advance deposit" when `res.data.overpayment > 0`.
- Backend `recordPayment()` return changed from single payment object to `{ payment, overpayment }`.
- `paymentCategory` field remains in Prisma schema (nullable, historical) but is no longer sent from frontend.

### Cores Returned Removed (Obliterated)
- `Invoice.coresReturned` column dropped from schema. Migration: `20260706171259_remove_cores_returned`.
- Removed from `createInvoice` input, `repository.ts`, frontend API types.
- Core buyback is the sole path for handling cores (separate Core Buyback modal + `core/service.ts`).

### Dead Code Removed
- `statusTransitionService.ts` deleted entirely — never imported or called anywhere.
- `CORE_CREDIT_APPLIED` removed from `TransactionType` union (TS types). Prisma enum kept for historical DB records.
- `CORE_CREDIT_APPLIED: 'CCA'` removed from reference prefix map.

### Revenue Accounts
- **4000**: Roll/Sales Revenue
- **4100**: Packing Bag Revenue
- Revenue split is computed automatically in `recordPickup` from actual pickup data (roll weight × unit price, bag quantity × bag price). GL: Dr 1200 AR, Cr 4000 (rolls excl. VAT), Cr 4100 (bags excl. VAT), Cr 2100 (VAT).

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

## Parent Roll Consumption Order (7 Jul 2026)

### Logic
- `ProductionJob.parentRollIds` array order defines the consumption sequence
- `createJob()` stores `input.rollIds` directly (user's ▲▼ order from UI), NOT `parentRolls.map(r => r.id)` (which was DB-order)
- `completeJob()` does NOT re-sort by date — preserves `parentRollIds` array order
- Frontend: ▲▼ buttons in Start Production modal reorder `rollIds` before sending to API

### Combo Roll Rules
- Combo printed roll = weight comes from multiple parent rolls (FIFO across parent rolls in `parentRollIds` order)
- **rollConsumption** (`Json?` on ProductionJob) = user-reported exact contribution for the FIRST printed roll only
  - Value: `{ parentRollId: kg }` (e.g., `{ rollA_id: 10 }` means "10kg came from roll A")
  - Only applies to the FIRST printed roll (subsequent rolls use standard FIFO)
  - The reported amount contributes to that specific parent roll first; any remaining weight of the first printed roll comes from subsequent parents via FIFO
  - This lets users report what actually happened in production (e.g., a partially-consumed roll was already on the machine)
- `printedRollMapping` JSON = source of truth: `{ printedRollId: { parentRollId: weight } }`
- Single-parent printed rolls get `Roll.parentRollId` set (direct traceability)
- Combo printed rolls have `Roll.parentRollId = null` (use `printedRollMapping` instead)

### mapping format resolution order (getPrintedRolls)
1. If entry is object → modern format, parse `{ parentId: weight }` pairs
2. If entry is string → legacy format, use string as parent roll ID
3. If entry exists (`!= null`) AND `isCombination` → throw 500 (corrupt data)
4. Otherwise → no mapping, list all parent rolls with 0 contribution (graceful fallback)

### Key bugfixes
- `createJob` line 161: changed `parentRolls.map(r => r.id)` → `input.rollIds` (preserves user order)
- Legacy combo fallback (even distribution) removed — replaced with throw for truly unrecognized formats
- `isCombination` check moved after string-format check to handle legacy data
- `entry != null` guard on throw — only throw when entry actually exists, not when mapping is missing

## Expected Delivery Date (10 Jul 2026)
- `SalesOrder.expectedDeliveryDate` = customer-facing promise date (when does the customer want it)
- Displayed in **Production table** as "Due Date" column + View Job modal (not in Sales Orders table — only in Order Details modal)
- Backend already includes `salesOrder` relation in `getJobs()` response — no backend changes needed
- Frontend: `ProductionJob.salesOrder` typing added to interface, "Due Date" column + sortable in production table
- **Future: Dashboard card** — highlight overdue/soon-due jobs based on this date for production scheduling visibility

## DashboardPage (14 Jul 2026) — Main Operations Dashboard

### Data sources (5 parallel calls)
- `financeApi.getDashboard(month)` → only used for `dashboard.cashPosition.moneyInToday/Out` (Cash card)
- `salesOrderApi.getOrders()` → orders for Pending Pickups, Items Sold, New Orders, Recent Orders panel
- `productionApi.getJobs()` → Active Jobs count, period output (kg), Production Waste
- `inventoryApi.getMaterials()` → Low Stock alerts, Materials count  
- `salesOrderApi.getCustomers()` → Active Customers count

### KPI cards (4-column grid, un-gated)
1. **Pending Pickups** — count of `READY` orders, total kg to pick up. Clickable → `/sales-orders`
2. **Items Sold ({period})** — rolls kg (invoices `quantityDelivered`) + Packs (invoices `packingBagsQuantity` + uninvoiced orders). Uses `issuedAt` as business date. Clickable → `/sales-orders`
3. **New Orders ({period})** — count of orders `createdAt` in period, with pending/approved breakdown. Clickable → `/sales-orders`
4. **Low Stock Items** — materials where `totalStock < minStock`. Critical = ≤0 or ≤50% min. Clickable → `/inventory`

### Mini stat cards (6-column grid)
- Active Customers → `/customers`
- Active Jobs → `/production`
- Materials in Stock → `/inventory`
- Pending Orders → `/sales-orders`
- {Period} Output (kg) — from production jobs in date range → `/production`
- Net Profit — gated (ADMIN/MANAGER only) → `/finance`

### Period selector (dropdown, 7 options)
- Default: **Today**
- All 7: Today, Yesterday, This Week, Last Week, This Month, Last Month, Last 3 Months
- `periodDateRange(p)` computes `{ from, to }` date strings for filtering
- Jobs/invoices/orders filtered client-side by date range
- Finance data (cash) uses `periodToMonth(p)` → month string for API (only Last Month differs)

### Role gating
- Uses `localStorage.getItem('user')` (NOT `useAuthStore` — zustand persist has hydration delays)
- Only Net Profit mini-card is gated (ADMIN/MANAGER only)
- Revenue removed from dashboard entirely (was not updating due to monthly backend granularity)

### Recent Orders panel
- Latest 5 orders sorted by `createdAt` desc
- Shows: order number, customer name, **expected delivery date** (overdue in red if past due + not completed/picked up), amount, status badge

### Inventory Alerts panel
- Materials below `minStock`, colored Critical (≤50% of min or ≤0) / Low (<100%), shows up to 8

## FinancePage — Post Journal Entry (14 Jul 2026)
- "**+ Post Journal Entry**" button added to Journal tab header (blue, right-aligned)
- Modal: description + date + reference (auto) + dynamic multi-line table with account picker, debit/credit, memo
- Validates: debits = credits, at least 2 lines, no negative amounts
- Submits via `financeApi.postJournalEntry` with `sourceModule: 'ADJUSTMENT'`
- Journal loader also fetches accounts for the dropdown

## FinancePage — Add Account (14 Jul 2026)
- "**+ Add Account**" button added to Chart of Accounts tab header
- Modal: code + name + type dropdown + description
- Calls `financeApi.createAccount()`, refreshes list on success
- Backend endpoint `POST /api/finance/accounts` already existed
