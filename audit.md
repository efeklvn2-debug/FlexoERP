# End-to-End App Audit Guide

Use this guide to audit **every** feature of FlexoPrint ERP. For each audit run, query the relevant database records and verify against expected values. Record any discrepancy.

---

## 1. Chart of Accounts

```sql
-- Verify all accounts exist
SELECT code, name, type FROM "Account" ORDER BY code;
```

**Expected accounts (45+):**

| Code | Name | Type |
|------|------|------|
| 1000 | Cash | ASSET |
| 1100 | Accounts Receivable | ASSET |
| 1200 | Accounts Receivable - Credit Sales | ASSET |
| 1300 | Raw Material Inventory | ASSET |
| 1310 | Finished Goods Inventory | ASSET |
| 1330 | Deferred Cost of Goods Sold | ASSET |
| 1400 | Other Current Assets | ASSET |
| 1500 | Packing Material Inventory | ASSET |
| 1510 | Packing Bag Inventory | ASSET |
| 1515 | Core Deposit Inventory | ASSET |
| 1600 | Prepaid Expenses | ASSET |
| 1700 | Fixed Assets | ASSET |
| 2000 | Accounts Payable (AP) | LIABILITY |
| 2100 | Sales Tax / VAT Payable | LIABILITY |
| 2200 | Customer Deposits | LIABILITY |
| 2300 | Accrued Liabilities | LIABILITY |
| 2400 | Core Deposit Liability | LIABILITY |
| 3000 | Owner's Equity | EQUITY |
| 3100 | Retained Earnings | EQUITY |
| 3200 | Drawings | EQUITY |
| 4000 | Sales Revenue - Rolls | REVENUE |
| 4100 | Sales Revenue - Packing Bags | REVENUE |
| 4200 | Other Income | REVENUE |
| 4300 | Core Buyback Income | REVENUE |
| 4400 | Interest Income | REVENUE |
| 5000 | Cost of Goods Sold | COGS |
| 5100 | Direct Labor | COGS |
| 5200 | Production Costs | COGS |
| 6000 | Salaries & Wages | EXPENSE |
| 6100 | Rent & Utilities | EXPENSE |
| 6200 | Office Supplies | EXPENSE |
| 6300 | Transportation | EXPENSE |
| 6400 | Maintenance & Repairs | EXPENSE |
| 6500 | Marketing & Advertising | EXPENSE |
| 6600 | Insurance | EXPENSE |
| 6700 | Professional Fees | EXPENSE |
| 6800 | Bank Charges | EXPENSE |
| 6900 | Depreciation | EXPENSE |
| 7000 | Miscellaneous | EXPENSE |
| 8000 | Income Tax Expense | EXPENSE |

**Check:** No duplicates, no orphan children, `isActive` defaults true.

---

## 2. Settings

### 2.1 Consumption Rates
```
GET /api/settings/consumption-rates
```

**Check:**
- `coreWeight` — kg per plastic core (default 0.7)
- `inkConsumptionRate` — kg ink per kg printed (default 0.7)
- `ipaConsumptionRate` — L IPA per kg printed (default 0.1)
- `butanolConsumptionRate` — L Butanol per kg printed (default 0.1)
- `coreDepositValue` — ₦ per core (default 150)

### 2.2 Overhead Rate
```
GET /api/settings/overhead-rate
```
Single number (₦/kg). Can be zero.

### 2.3 VAT
```
GET /api/settings
```
`vatRate` default 7.5%. `businessTin`, `businessAddress` optional.

### 2.4 Ink Colors
```
GET /api/settings/ink-colors?includeInactive=true
```
Every `InkColor` must have:
- `name` unique — e.g. "RoyalBlue"
- `mapping` unique — e.g. "RoyalBlue-Ink" (matches a material `subCategory`)
- Auto-creates a corresponding `INK_SOLVENTS` material if one doesn't exist

### 2.5 Materials & Prices
```
GET /api/pricing/materials-prices?includeInactive=true
```
Each material has: `code`, `name`, `category`, `subCategory`, `unitOfMeasure`, `costPrice`, `pricePerKg` / `pricePerPack`, `isActive`.

**Check:** `unitOfMeasure` must be `kg` for inks, `liter` for IPA/Butanol, `kg` for plain rolls, `pcs` for packaging.

---

## 3. Customers

```
GET /api/customers?includeInactive=true
GET /api/customers/:id
```

**Check each customer:**
- `name`, `code` (unique), `email`, `phone`
- `colors[]` — references InkColor names
- `paymentType` — CASH or CREDIT
- `creditLimit`, `depositPercentDefault`, `paymentTermsDays`
- `notifyEmail`, `notifyWhatsApp`
- Balance queries at `GET /api/customers/balances`

---

## 4. Sales Orders (MTO)

Lifecycle: **PENDING → APPROVED → IN_PRODUCTION → READY → PICKED_UP → COMPLETED**

### 4.1 Create Order
```
POST /api/sales-orders
```
Input: `customerId`, `specsJson` (width, color, material), `quantityOrdered`, `unitPrice`, `deliveryMethod`.
Auto-calculates: `totalAmount`, `depositRequired` (based on customer's `depositPercentDefault`).

**Check:** Order number format `SO-YYYY-NNN`.

### 4.2 Payments / Deposits
```
POST /api/sales-orders/:id/payments
```
**Check:** Updates `depositPaid`, `totalPaid`, `paymentStatus`. Posts journal entry: Dr 1000/Cr 2200.

### 4.3 Start Production
```
POST /api/sales-orders/:id/start-production
```
Creates `ProductionJob` with status `PENDING`. Updates SO status to `IN_PRODUCTION`.

### 4.4 Complete Job → Deferred COGS
```
POST /api/production/jobs/:jobId/complete
```
**This is the most critical audit point.** Verify:

#### a) Parent Roll Deduction
- Parent roll `remainingWeight` decreases by weight used
- If consumed: status → `CONSUMED`
- If combo roll: `isCombination = true`

#### b) Ink/Solvent Stock Deduction
```
SELECT materialId, quantity, type, reference FROM "StockMovement"
WHERE reference LIKE '%PRD-YYYY-NNN%';
```

Formula per material:
- **Ink per color:** `inkNeeded = totalPrintedWeight × inkConsumptionRate / mappedColorCount`
- **IPA:** `ipaNeeded = totalPrintedWeight × ipaConsumptionRate`
- **Butanol:** `butanolNeeded = totalPrintedWeight × butanolConsumptionRate`
- Stock validation blocks if `available < needed`

#### c) Cost Snapshot (saved on `ProductionJob`)
| Field | Formula |
|-------|---------|
| `materialCost` | `totalPrintedWeight × parentMaterial.costPrice` |
| `consumablesCost` | `inkCost + ipaCost + butanolCost` |
| `inkCost` | `totalPrintedWeight × inkConsumptionRate × avgInkCostPrice` |
| `avgInkCostPrice` | Average `costPrice` of ink materials **mapped to this customer's colors** (excludes IPA/Butanol, excludes archived inks) |
| `ipaCost` | `totalPrintedWeight × ipaConsumptionRate × ipaMaterial.costPrice` |
| `butanolCost` | `totalPrintedWeight × butanolConsumptionRate × butanolMaterial.costPrice` |
| `overheadCost` | `totalPrintedWeight × overheadRatePerKg` |

#### d) Journal Entries (Production)
**JE-1: Materials & Consumables → Deferred COGS**
```
Dr 1330 (Deferred COGS)     = materialCost + consumablesCost
Cr 1300 (Raw Mat Inventory)  = materialCost + consumablesCost
```

**JE-2: Waste (if any)**
```
Dr 5200 (Production Costs)      = wasteCost
Cr 1300 (Raw Mat Inventory)     = wasteCost
```

**JE-3: Overhead Allocation**
```
Dr 1330 (Deferred COGS)     = overheadCost
Cr 5200 (Production Costs)  = overheadCost
```

**Audit:** Verify the journal lines are balanced. Verify each account code is correct.

#### e) Sales Order Update
SO status → `READY`, `quantityProduced` set, `totalAmount` recalculated.

### 4.5 Pickup / Delivery → COGS Recognition
```
POST /api/sales-orders/:orderId/pickup
```

**Check:**
- SO status → `PICKED_UP` (if fully picked)
- Printed roll status → `PICKED_UP`
- COGS journal entry:
  ```
  Dr 5000 (COGS)               = prorated cost
  Cr 1330 (Deferred COGS)      = prorated cost
  ```
- Packing bag COGS (if applicable):
  ```
  Dr 5000 (COGS)                    = bag cost
  Cr 1510 (Packing Bag Inventory)   = bag cost
  ```
- Revenue entry:
  ```
  Dr 1100 (Accounts Receivable)     = invoice total
  Cr 4000 (Sales Revenue - Rolls)   = roll revenue
  Cr 4100 (Sales Revenue - Bags)    = bag revenue
  ```
- If invoiced late: check `depositApplied`, `previousPayments`, `balanceDue`
- `amountPaid` on invoice = `depositApplied + previousPayments`

### 4.6 Invoice
```
POST /api/sales-orders/:orderId/invoice
```
Creates invoice with VAT breakdown. Status: DRAFT → ISSUED.

### 4.7 Credit Adjustment
```
POST /api/sales-orders/:orderId/credit-adjustment
```
Admin/Manager only. Adjusts deposit balance, posts journal entry via Other Income (4200).

---

## 5. Procurement (Purchase Orders)

Lifecycle: **PENDING → RECEIVED / PARTIALLY_RECEIVED**

### 5.1 Create PO
```
POST /api/procurement/purchase-orders
```
Lines: `materialId`, `quantity`, `totalWeight`, `unitPrice`.
Auto-creates `POLineItem` records. PO number format `PO-YYYY-NNN`.

### 5.2 Receive PO
```
POST /api/procurement/purchase-orders/:poId/receive
```
**For PLAIN_ROLLS:** Creates `Roll` records with `rollNumber`, deducts from PO line `receivedQty`.
**For INK_SOLVENTS:** Adds stock via `inventoryService.addStock()`.
**For PACKAGING:** Adds stock similarly.

Journal entry:
```
Dr 1300 (Raw Mat Inventory) = total received value
Cr 2000 (Accounts Payable)  = total received value
```

### 5.3 Supplier Invoice
```
POST /api/procurement/purchase-orders/:poId/supplier-invoice
```
Creates `SupplierInvoice`. Updates material `costPrice` from PO line `unitPrice`.

### 5.4 Pay Supplier Invoice
```
POST /api/procurement/supplier-invoices/:id/pay
```
Journal entry:
```
Dr 2000 (Accounts Payable) = amount paid
Cr 1000 (Cash)             = amount paid
```

---

## 6. Inventory

### 6.1 Materials
```
GET /api/inventory/materials
GET /api/inventory/materials/:id
```

### 6.2 Stock Levels
```
GET /api/inventory/materials
```
Each material has `totalStock` and `locations[].quantity`.

### 6.3 Stock Movements
```
GET /api/inventory/stock-movements
```
Filter by `materialId`, `type`, date range.

### 6.4 Adjust Stock
```
POST /api/inventory/stock/adjust
```
Journal entry:
```
Dr/Cr 1300 (Raw Mat Inventory) = adjustment amount
Cr/Dr (offset account)         = adjustment amount
```

### 6.5 Initialize Stock (Opening Balances)
```
POST /api/inventory/initialize-stock
```
Journal entry:
```
Dr 1300 (Raw Mat Inventory) = material.costPrice × quantity
Cr 3000 (Owner's Equity)   = same amount
```

### 6.6 Core Tracking
```
GET /api/inventory/cores
POST /api/inventory/cores/adjust
```

### 6.7 Printed Rolls
```
GET /api/printed-rolls?status=IN_STOCK
POST /api/printed-rolls/archive
```
Archive: sets `archivedAt` on old picked-up rolls. Shows in UI only when "Show archived" toggled.

---

## 7. Production

### 7.1 Create Production Job
```
POST /api/production/jobs
```
Links to `SalesOrder`. Creates `PrintedRoll` records.

### 7.2 Complete Job
See **Section 4.4** above — the critical end-to-end flow.

### 7.3 Roll Disposal / Return / Replacement
```
POST /api/production/rolls/:rollId/dispose
POST /api/production/rolls/:rollId/return
POST /api/production/rolls/:rollId/customer-return
POST /api/production/rolls/:rollId/receive-replacement
```

**Check:** Each operation validates `costPrice` exists on material, updates inventory, posts journal entries.

---

## 8. Finance

### 8.1 Journal Entries
```
GET /api/finance/journal-entries?page=1&limit=50
```
Filters: `startDate`, `endDate`, `accountId`, `sourceModule`.

### 8.2 Journal Entry Detail
```
GET /api/finance/journal-entries/:id
```
Returns lines with account details. Must balance.

### 8.3 Trial Balance
```
GET /api/finance/trial-balance
```
**Formula:** `balance = openingBalance + totalDebits − totalCredits`.
Verify all accounts appear and balance.

### 8.4 Income Statement (P&L)
```
GET /api/finance/income-statement?startDate=...&endDate=...
```
Revenue accounts (4000-4999) minus Cost accounts (5000-5999) minus Expense accounts (6000-7999).

### 8.5 Balance Sheet
```
GET /api/finance/balance-sheet
```
Assets = Liabilities + Equity.

### 8.6 Opening Balances
```
POST /api/finance/opening-balances
```
Sets `Account.openingBalance` for each account, posts OBE (Opening Balance Equity) journal entry.

### 8.7 Manual COGS Recognition
```
POST /api/finance/cogs/recognize/:orderId
```
Fallback for pre-fix jobs. Re-computes `totalDeferredCost` from settings + materials if snapshot absent.

### 8.8 Reverse Journal Entry
```
POST /api/finance/journal-entries/:id/reverse
```
Creates mirror entry (debits ↔ credits).

---

## 9. Pricing

### 9.1 Prices
```
GET /api/pricing/materials-prices?includeInactive=true
```
Returns materials with `pricePerKg` (for PLAIN_ROLLS), `pricePerPack` (for PACKAGING), and `costPrice`.

### 9.2 Update Price
```
PUT /api/pricing/materials-prices/:id
```
Can update `pricePerKg`, `pricePerPack`, `costPrice`.

---

## 10. Core Buyback

```
POST /api/transactions/core-buyback
```
Journal entry:
```
Dr 4300 (Core Buyback Income / Expense) = totalValue
Cr 1000 (Cash)                          = paidAmount(if random seller)
```
Or if customer: Dr customer deposit account.

---

## 11. Suppliers

```
GET /api/suppliers
POST /api/suppliers
```

---

## 12. Authentication & Users

```
POST /api/auth/login
POST /api/auth/register
GET  /api/auth/me
POST /api/auth/refresh
POST /api/auth/logout
```

Roles: `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`.

---

## 13. Quick-Audit Script

Run this to verify an entire sales order end-to-end:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function auditOrder(orderNumber) {
  const so = await db.salesOrder.findUnique({
    where: { orderNumber },
    include: {
      customer: true,
      productionJob: { include: { printedRolls: true } },
      payments: true,
      invoices: true
    }
  });
  if (!so) { console.log('NOT FOUND'); return; }

  console.log('=== SALES ORDER ===');
  console.log('Status:', so.status, '| Payment:', so.paymentStatus);
  console.log('Qty Ordered:', Number(so.quantityOrdered), '| Produced:', Number(so.quantityProduced));
  console.log('Unit Price:', Number(so.unitPrice), '| Total:', Number(so.totalAmount));
  console.log('Deposit Paid:', Number(so.depositPaid), '| Total Paid:', Number(so.totalPaid));

  const job = so.productionJob;
  if (job) {
    console.log('\n=== PRODUCTION JOB ===');
    console.log('Job#:', job.jobNumber, '| Status:', job.status);
    console.log('Material Cost:', Number(job.materialCost));
    console.log('Consumables Cost:', Number(job.consumablesCost));
    console.log('Overhead Cost:', Number(job.overheadCost));
    console.log('Total Deferred:', Number(job.materialCost) + Number(job.consumablesCost) + Number(job.overheadCost));

    const totalWeight = job.printedRolls.reduce((s, pr) => s + Number(pr.weightUsed), 0);
    console.log('Printed Weight:', totalWeight, 'kg');

    // Verify materialCost
    if (job.parentRollIds?.length > 0) {
      const parent = (await db.roll.findMany({
        where: { id: { in: job.parentRollIds } },
        include: { material: true }
      }))[0];
      const costPerKg = Number(parent?.material?.costPrice || 0);
      console.log('Verification: materialCost =', totalWeight, '×', costPerKg, '=', totalWeight * costPerKg, '(actual:', Number(job.materialCost) + ')');
    }
  }

  // Journal entries
  const entries = await db.journalEntry.findMany({
    where: { OR: [
      { reference: orderNumber },
      { reference: job?.jobNumber }
    ].filter(Boolean) },
    include: { lines: { include: { account: true } } },
    orderBy: { postedAt: 'asc' }
  });
  console.log('\n=== JOURNAL ENTRIES ===');
  for (const e of entries) {
    let totalDr = 0, totalCr = 0;
    e.lines.forEach(l => { totalDr += Number(l.debit); totalCr += Number(l.credit); });
    const balanced = Math.abs(totalDr - totalCr) < 0.01;
    console.log(e.entryNumber, '|', e.description, '| Balanced:', balanced ? 'YES' : 'NO');
    e.lines.forEach(l => console.log('  ', (l.account?.code || '?'), (l.account?.name || '?'), 'Dr:', Number(l.debit), 'Cr:', Number(l.credit)));
  }

  await db.\$disconnect();
}
auditOrder('SO-2026-0125').catch(e => { console.error(e); db.\$disconnect(); });
" | node --input-type=module
```

---

## 14. Validation Checklist (per audit)

| # | Check | Pass/Fail |
|---|-------|-----------|
| 1 | Sales Order status matches expected state machine | |
| 2 | Payment amounts reconcile (deposit + payments = totalPaid) | |
| 3 | Production cost snapshot formula matches expected | |
| 4 | Journal entries balance (debits = credits per entry) | |
| 5 | Account codes posted match chart of accounts | |
| 6 | Stock movements match production deductions | |
| 7 | COGS recognized on pickup equals prorated deferred cost | |
| 8 | Inventory asset account (1300) credited matches deduction value | |
| 9 | Deferred COGS (1330) accumulates correctly across jobs | |
| 10 | Revenue accounts (4000/4100) credited on invoice/pickup | |
| 11 | VAT (2100) calculated at correct rate (7.5%) | |
| 12 | Customer deposit liability (2200) debited when deposit applied | |
