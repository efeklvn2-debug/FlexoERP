/**
 * End-to-end test: Reports module through backend API directly
 *
 * Tests all 9 report endpoints with structural and integrity assertions.
 *
 * Run: npx tsx src/__tests__/reports.e2e.ts
 *
 * Prerequisites:
 * - Backend running at http://localhost:3000
 * - Database seeded with real data (no special test data needed)
 */

import axios from 'axios'
import type { AxiosInstance } from 'axios'

const API = axios.create({ baseURL: 'http://localhost:3000/api' })

const TODAY = new Date().toISOString().split('T')[0]
const FIRST_OF_MONTH = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
const THREE_MONTHS_AGO = new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split('T')[0]

let successCount = 0
let failCount = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    successCount++
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failCount++
  }
}


function body(resp: { data: any }): any {
  return resp.data?.data ?? resp.data
}

async function login(client: AxiosInstance): Promise<void> {
  const resp = await client.post('/auth/login', { username: 'admin@flexoprint.local', password: 'admin123' })
  const d = body(resp)
  client.defaults.headers.common['Authorization'] = `Bearer ${d.tokens.accessToken}`
  console.log(`  User: ${d.user?.username} (${d.user?.role})`)
}

async function testReports() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║     Reports Module E2E Test (API layer)     ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`Period: ${FIRST_OF_MONTH} → ${TODAY}`)
  console.log('')

  // Login
  console.log('--- Step 0: Login ---')
  await login(API)
  console.log('')

  // ──────────────────────────────────────────────
  // 1. Profit & Loss
  // ──────────────────────────────────────────────
  console.log('--- 1. Profit & Loss ---')
  const pnl = body(await API.get(`/reports/profit?from=${FIRST_OF_MONTH}&to=${TODAY}`))
  assert(pnl != null, 'Response not null')
  assert(typeof pnl.from === 'string', 'has from date')
  assert(typeof pnl.to === 'string', 'has to date')
  assert(typeof pnl.revenue === 'number', 'has revenue')
  assert(typeof pnl.costOfGoodsSold === 'number', 'has costOfGoodsSold')
  assert(typeof pnl.expenses === 'number', 'has expenses')
  assert(typeof pnl.netProfit === 'number', 'has netProfit')
  assert(pnl.breakdown != null, 'has breakdown')
  assert(typeof pnl.breakdown.salesRevenue === 'number', 'breakdown.salesRevenue is number')
  assert(typeof pnl.breakdown.packingRevenue === 'number', 'breakdown.packingRevenue is number')
  assert(typeof pnl.breakdown.otherIncome === 'number', 'breakdown.otherIncome is number')
  assert(pnl.breakdown.salesRevenue >= 0, 'salesRevenue is non-negative')
  assert(pnl.breakdown.packingRevenue >= 0, 'packingRevenue is non-negative')
  assert(pnl.breakdown.otherIncome >= 0, 'otherIncome is non-negative')
  const breakdownSum = pnl.breakdown.salesRevenue + pnl.breakdown.packingRevenue + pnl.breakdown.otherIncome
  assert(Math.abs(pnl.revenue - breakdownSum) < 1, 'revenue === sum(breakdown)', `revenue=${pnl.revenue}, sum=${breakdownSum}`)
  const expectedProfit = pnl.revenue - pnl.costOfGoodsSold - pnl.expenses
  assert(Math.abs(pnl.netProfit - expectedProfit) < 1, 'netProfit === revenue - COGS - expenses', `netProfit=${pnl.netProfit}, expected=${expectedProfit}`)
  assert(pnl.grossProfit != null, 'has grossProfit')
  assert(Math.abs(pnl.grossProfit - (pnl.revenue - pnl.costOfGoodsSold)) < 1, 'grossProfit === revenue - COGS', `grossProfit=${pnl.grossProfit}, expected=${pnl.revenue - pnl.costOfGoodsSold}`)
  console.log('')

  // ──────────────────────────────────────────────
  // 2. Trial Balance
  // ──────────────────────────────────────────────
  console.log('--- 2. Trial Balance ---')
  const tb = body(await API.get(`/finance/trial-balance?asOf=${TODAY}`))
  assert(tb != null, 'Response not null')
  assert(Array.isArray(tb.accounts), 'accounts is array')
  assert(tb.totals != null, 'has totals')
  assert(typeof tb.totals.totalDebit === 'number', 'totalDebit is number')
  assert(typeof tb.totals.totalCredit === 'number', 'totalCredit is number')
  const tbDiff = Math.abs(tb.totals.totalDebit - tb.totals.totalCredit)
  assert(tbDiff < 1, 'totalDebit ≈ totalCredit', tbDiff >= 1 ? `diff ₦${tbDiff.toLocaleString()}` : undefined)
  if (tb.accounts.length > 0) {
    const acc = tb.accounts[0]
    assert(typeof acc.accountCode === 'string', 'account has code')
    assert(typeof acc.accountName === 'string', 'account has name')
    assert(typeof acc.accountType === 'string', 'account has type')
    assert(typeof acc.balance === 'number', 'account has balance')
  }
  console.log(`  ${tb.accounts.length} accounts, Debits: ${tb.totals.totalDebit.toLocaleString()}, Credits: ${tb.totals.totalCredit.toLocaleString()}`)
  console.log('')

  // ──────────────────────────────────────────────
  // 3. AR Aging
  // ──────────────────────────────────────────────
  console.log('--- 3. AR Aging ---')
  const ar = body(await API.get(`/reports/aging/receivables?asOf=${TODAY}`))
  assert(ar != null, 'Response not null')
  assert(typeof ar.asOfDate === 'string', 'has asOfDate')
  assert(typeof ar.totalOutstanding === 'number', 'has totalOutstanding')
  assert(Array.isArray(ar.entries), 'entries is array')
  assert(Array.isArray(ar.buckets), 'buckets is array')
  assert(ar.buckets.length === 4, '4 aging buckets', `got ${ar.buckets.length}`)

  if (ar.buckets.length >= 4) {
    assert(ar.buckets[0].label === 'Current', 'bucket 0: Current', ar.buckets[0].label)
    assert(ar.buckets[1].label === '31-60 days', 'bucket 1: 31-60 days', ar.buckets[1].label)
    assert(ar.buckets[2].label === '61-90 days', 'bucket 2: 61-90 days', ar.buckets[2].label)
    assert(ar.buckets[3].label === '90+ days', 'bucket 3: 90+ days', ar.buckets[3].label)
  }

  const entriesTotal = ar.entries.reduce((s: number, e: any) => s + (e.total || 0), 0)
  assert(Math.abs(ar.totalOutstanding - entriesTotal) < 0.01, 'totalOutstanding === sum(entries.total)', `total=${ar.totalOutstanding}, sum=${entriesTotal}`)

  if (ar.entries.length > 0) {
    const e = ar.entries[0]
    assert(typeof e.id === 'string', 'entry has id')
    assert(typeof e.name === 'string', 'entry has name')
    assert(typeof e.current === 'number', 'entry has current')
    assert(typeof e.age31to60 === 'number', 'entry has age31to60')
    assert(typeof e.age61to90 === 'number', 'entry has age61to90')
    assert(typeof e.age90plus === 'number', 'entry has age90plus')
    assert(typeof e.total === 'number', 'entry has total')
    const bucketSum = e.current + e.age31to60 + e.age61to90 + e.age90plus
    assert(Math.abs(e.total - bucketSum) < 0.01, 'entry.total === sum(buckets)', `total=${e.total}, sum=${bucketSum}`)
  }
  console.log(`  ${ar.entries.length} customers, ₦${ar.totalOutstanding.toLocaleString()} outstanding`)
  console.log('')

  // ──────────────────────────────────────────────
  // 4. AP Aging
  // ──────────────────────────────────────────────
  console.log('--- 4. AP Aging ---')
  const ap = body(await API.get(`/reports/aging/payables?asOf=${TODAY}`))
  assert(ap != null, 'Response not null')
  assert(typeof ap.asOfDate === 'string', 'has asOfDate')
  assert(typeof ap.totalOutstanding === 'number', 'has totalOutstanding')
  assert(Array.isArray(ap.entries), 'entries is array')
  assert(Array.isArray(ap.buckets), 'buckets is array')
  assert(ap.buckets.length === 4, '4 aging buckets')

  if (ap.buckets.length >= 4) {
    assert(ap.buckets[0].label === 'Current', 'bucket 0: Current')
    assert(ap.buckets[1].label === '31-60 days', 'bucket 1: 31-60 days')
    assert(ap.buckets[2].label === '61-90 days', 'bucket 2: 61-90 days')
    assert(ap.buckets[3].label === '90+ days', 'bucket 3: 90+ days')
  }

  const apEntriesTotal = ap.entries.reduce((s: number, e: any) => s + (e.total || 0), 0)
  assert(Math.abs(ap.totalOutstanding - apEntriesTotal) < 0.01, 'totalOutstanding === sum(entries.total)', `total=${ap.totalOutstanding}, sum=${apEntriesTotal}`)
  console.log(`  ${ap.entries.length} suppliers, ₦${ap.totalOutstanding.toLocaleString()} outstanding`)
  console.log('')

  // ──────────────────────────────────────────────
  // 5. Sales by Customer
  // ──────────────────────────────────────────────
  console.log('--- 5. Sales by Customer ---')
  const sc = body(await API.get(`/reports/sales/by-customer?from=${FIRST_OF_MONTH}&to=${TODAY}`))
  assert(sc != null, 'Response not null')
  assert(typeof sc.from === 'string', 'has from')
  assert(typeof sc.to === 'string', 'has to')
  assert(typeof sc.totalRevenue === 'number', 'has totalRevenue')
  assert(typeof sc.totalVat === 'number', 'has totalVat')
  assert(typeof sc.totalAmount === 'number', 'has totalAmount')
  assert(typeof sc.totalInvoices === 'number', 'has totalInvoices')
  assert(Array.isArray(sc.customers), 'customers is array')

  const custRevenueSum = sc.customers.reduce((s: number, c: any) => s + (c.revenue || 0), 0)
  assert(Math.abs(sc.totalRevenue - custRevenueSum) < 1, 'totalRevenue === sum(customers[].revenue)', `total=${sc.totalRevenue}, sum=${custRevenueSum}`)

  const custVatSum = sc.customers.reduce((s: number, c: any) => s + (c.vatAmount || 0), 0)
  assert(Math.abs(sc.totalVat - custVatSum) < 1, 'totalVat === sum(customers[].vatAmount)', `total=${sc.totalVat}, sum=${custVatSum}`)

  const custInvCount = sc.customers.reduce((s: number, c: any) => s + (c.invoiceCount || 0), 0)
  assert(sc.totalInvoices === custInvCount, 'totalInvoices === sum(customers[].invoiceCount)', `total=${sc.totalInvoices}, sum=${custInvCount}`)

  if (sc.customers.length > 0) {
    const c = sc.customers[0]
    assert(typeof c.customerId === 'string', 'customer has customerId')
    assert(typeof c.customerName === 'string', 'customer has customerName')
    assert(typeof c.invoiceCount === 'number', 'customer has invoiceCount')
    assert(typeof c.quantityDelivered === 'number', 'customer has quantityDelivered')
    assert(typeof c.revenue === 'number', 'customer has revenue')
    assert(typeof c.vatAmount === 'number', 'customer has vatAmount')
    assert(typeof c.totalAmount === 'number', 'customer has totalAmount')
    assert(Math.abs(c.totalAmount - (c.revenue + c.vatAmount)) < 1, 'customer totalAmount ≈ revenue + vat', `total=${c.totalAmount}, rev+vat=${c.revenue + c.vatAmount}`)
  }
  console.log(`  ${sc.customers.length} customers, ${sc.totalInvoices} invoices, ₦${sc.totalRevenue.toLocaleString()} revenue`)
  console.log('')

  // ──────────────────────────────────────────────
  // 6. Sales by Product
  // ──────────────────────────────────────────────
  console.log('--- 6. Sales by Product ---')
  const sp = body(await API.get(`/reports/sales/by-product?from=${FIRST_OF_MONTH}&to=${TODAY}`))
  assert(sp != null, 'Response not null')
  assert(typeof sp.totalRevenue === 'number', 'has totalRevenue')
  assert(typeof sp.totalQuantity === 'number', 'has totalQuantity')
  assert(Array.isArray(sp.products), 'products is array')

  const prodRevenueSum = sp.products.reduce((s: number, p: any) => s + (p.revenue || 0), 0)
  assert(Math.abs(sp.totalRevenue - prodRevenueSum) < 1, 'totalRevenue === sum(products[].revenue)', `total=${sp.totalRevenue}, sum=${prodRevenueSum}`)

  if (sp.products.length > 0) {
    const p = sp.products[0]
    assert(typeof p.product === 'string', 'product has name')
    // At least one product should have a resolved name (not Unspecified)
    const resolvedCount = sp.products.filter((x: any) => x.product !== 'Unspecified').length
    if (resolvedCount > 0) {
      assert(true, `${resolvedCount}/${sp.products.length} products resolved (specsJson parsed correctly)`)
    } else {
      assert(false, 'at least one product resolved from specsJson.materialType', 'all returned Unspecified')
    }
    assert(typeof p.invoiceCount === 'number', 'product has invoiceCount')
    assert(typeof p.quantityDelivered === 'number', 'product has quantityDelivered')
    assert(typeof p.revenue === 'number', 'product has revenue')
    assert(typeof p.percentage === 'number', 'product has percentage')
    assert(p.percentage >= 0 && p.percentage <= 100, 'percentage in range [0, 100]', String(p.percentage))
  }
  console.log(`  ${sp.products.length} products, ₦${sp.totalRevenue.toLocaleString()} revenue, ${sp.totalQuantity.toLocaleString()} kg`)
  console.log('')

  // ──────────────────────────────────────────────
  // 7. Production Output (via production API)
  // ──────────────────────────────────────────────
  console.log('--- 7. Production Output (auxiliary data) ---')
  const jobs = body(await API.get('/production'))
  assert(jobs != null, 'Response not null')
  assert(Array.isArray(jobs), 'jobs is array')
  if (jobs.length > 0) {
    const j = jobs[0]
    assert(typeof j.id === 'string', 'job has id')
    assert(typeof j.status === 'string', 'job has status')
    assert(j.printedRolls != null, 'job has printedRolls')
  }
  console.log(`  ${jobs.length} jobs in system`)
  console.log('')

  // ──────────────────────────────────────────────
  // 8. Inventory Movements
  // ──────────────────────────────────────────────
  console.log('--- 8. Inventory Movements ---')
  const im = body(await API.get(`/reports/inventory/movements?from=${THREE_MONTHS_AGO}&to=${TODAY}`))
  assert(im != null, 'Response not null')
  assert(typeof im.from === 'string', 'has from')
  assert(typeof im.to === 'string', 'has to')
  assert(typeof im.totalIn === 'number', 'has totalIn')
  assert(typeof im.totalOut === 'number', 'has totalOut')
  assert(typeof im.netChange === 'number', 'has netChange')

  assert(Math.abs(im.netChange - (im.totalIn - im.totalOut)) < 0.01, 'netChange === totalIn - totalOut', `netChange=${im.netChange}, in-out=${im.totalIn - im.totalOut}`)
  assert(Array.isArray(im.byType), 'byType is array')
  assert(Array.isArray(im.byMaterial), 'byMaterial is array')

  if (im.byType.length > 0) {
    const t = im.byType[0]
    assert(typeof t.type === 'string', 'movement has type')
    assert(typeof t.totalQuantity === 'number', 'movement has totalQuantity')
    assert(typeof t.count === 'number', 'movement has count')
  }

  if (im.byMaterial.length > 0) {
    const m = im.byMaterial[0]
    assert(typeof m.materialName === 'string', 'material has name')
    assert(typeof m.category === 'string', 'material has category')
    assert(typeof m.inQuantity === 'number', 'material has inQuantity')
    assert(typeof m.outQuantity === 'number', 'material has outQuantity')
    assert(typeof m.netChange === 'number', 'material has netChange')
    assert(Math.abs(m.netChange - (m.inQuantity - m.outQuantity)) < 0.01, 'material netChange === inQuantity - outQuantity', `netChange=${m.netChange}, in-out=${m.inQuantity - m.outQuantity}`)
  }
  console.log(`  In: ${im.totalIn.toLocaleString()}, Out: ${im.totalOut.toLocaleString()}, Net: ${im.netChange.toLocaleString()}`)
  console.log(`  ${im.byType.length} movement types, ${im.byMaterial.length} materials`)
  console.log('')

  // ──────────────────────────────────────────────
  // 9. Inventory data (auxiliary)
  // ──────────────────────────────────────────────
  console.log('--- 9. Inventory data (auxiliary) ---')
  const materials = body(await API.get('/inventory/materials'))
  assert(materials != null, 'Response not null')
  assert(Array.isArray(materials), 'materials is array')
  if (materials.length > 0) {
    const m = materials[0]
    assert(typeof m.name === 'string', 'material has name')
    assert(typeof m.category === 'string', 'material has category')
    assert(typeof m.totalStock === 'number', 'material has totalStock')
    assert(typeof m.costPrice === 'number' || m.costPrice == null, 'material has costPrice or null')
  }
  console.log(`  ${materials.length} materials in system`)
  console.log('')

  // ──────────────────────────────────────────────
  // 10. PO Summary (auxiliary)
  // ──────────────────────────────────────────────
  console.log('--- 10. PO Summary (auxiliary) ---')
  const pos = body(await API.get('/procurement/purchase-orders'))
  assert(pos != null, 'Response not null')
  assert(Array.isArray(pos), 'POs is array')
  if (pos.length > 0) {
    const p = pos[0]
    assert(typeof p.id === 'string', 'PO has id')
    assert(typeof p.poNumber === 'string', 'PO has poNumber')
    assert(typeof p.status === 'string', 'PO has status')
  }
  console.log(`  ${pos.length} purchase orders in system`)
  console.log('')

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  const total = successCount + failCount
  console.log('══════════════════════════════════════════════')
  console.log(`  Results: ${successCount} passed, ${failCount} failed, ${total} total`)
  console.log('══════════════════════════════════════════════')

  if (failCount > 0) {
    process.exit(1)
  }
}

testReports().catch(err => {
  console.error('\nFATAL:', err.message)
  console.error(err.stack)
  process.exit(1)
})
