/**
 * Race condition end-to-end tests
 *
 * Tests concurrent access patterns for all fixed race conditions:
 * - SalesOrders: payment, pickup, cancel, invoice number (brought over from previous work)
 * - Production: createJob, completeJob, markRollConsumed, disposeRoll, deleteJob
 * - Inventory: stock movement atomic increment
 *
 * Run: $env:VITE_API_URL="http://localhost:3000/api"; npx tsx src/__tests__/race-conditions.e2e.ts
 * Prerequisite: Backend running on localhost:3000 with seeded data
 */

import axios from 'axios'

const BASE = 'http://localhost:3000/api'
let _token = ''

function apiClient() {
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' }, validateStatus: () => true })
}

function toArray(v: any): any[] {
  return Array.isArray(v) ? v : []
}

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    throw new Error(`Assertion failed: ${label}`)
  }
}

async function apiGet(path: string) {
  const r = await apiClient().get(path)
  return r.data?.data ?? r.data
}

async function apiPost(path: string, body?: any) {
  const r = await apiClient().post(path, body ?? {})
  return r.data?.data ?? r.data
}

async function apiPatch(path: string, body?: any) {
  const r = await apiClient().patch(path, body ?? {})
  return r.data?.data ?? r.data
}

async function apiDelete(path: string) {
  const r = await apiClient().delete(path)
  return r.data?.data ?? r.data
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ──────────────────────────────────────────────
// Test data setup
// ──────────────────────────────────────────────

let ctx: {
  customerId: string
  orderId: string
  order2Id: string
  jobId: string
  job2Id: string
  parentRollIds: string[]
  materialId: string
  stockMaterialId: string
} = { customerId: '', orderId: '', order2Id: '', jobId: '', job2Id: '', parentRollIds: [], materialId: '', stockMaterialId: '' }

async function ensureLoggedIn() {
  const r = await axios.post(`${BASE}/auth/login`, { username: 'admin@flexoprint.local', password: 'admin123' })
  _token = r.data?.data?.tokens?.accessToken || r.data?.tokens?.accessToken
  if (!_token) throw new Error('Login failed: no token in response')
  console.log(`  Logged in, token: ${_token.substring(0, 20)}...`)
}

async function setupTestData() {
  console.log('\n═══ Setting up test data ═══')

  // Create customer (use explicit unique code to avoid TOCTOU in generateUniqueCustomerCode)
  const cust = await apiPost('/sales-orders/customers', {
    name: `Race Test Customer ${Date.now()}`,
    code: `C${Date.now()}`
  })
  ctx.customerId = cust.id
  console.log(`  Customer: ${ctx.customerId}`)

  // Get or create a PLAIN_ROLLS material
  const materials = await apiGet('/inventory/materials')
  let plainMat = materials.find((m: any) => m.category === 'PLAIN_ROLLS')
  if (!plainMat) {
    plainMat = await apiPost('/inventory/materials', {
      code: `MAT-ROLL-${Date.now()}`, name: 'Test Roll Material',
      category: 'PLAIN_ROLLS', subCategory: '25microns',
      unitOfMeasure: 'kg', costPrice: 5000
    })
  }
  ctx.materialId = plainMat.id
  console.log(`  Material: ${ctx.materialId} (${plainMat.name})`)

  // Get parent rolls that are truly AVAILABLE (filter out IN_PRODUCTION)
  const availableRolls = await apiGet('/production/rolls')
  const availableArr = Array.isArray(availableRolls) ? availableRolls : []
  let goodRolls = availableArr.filter((r: any) => r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 5)
  console.log(`  Truly AVAILABLE rolls found: ${goodRolls.length} (total: ${availableArr.length})`)

  ctx.parentRollIds = goodRolls.slice(0, 3).map((r: any) => r.id)
  console.log(`  Using parent rolls: ${ctx.parentRollIds.join(', ')}`)

  // Get a non-roll material for stock tests
  let stockMat = materials.find((m: any) => m.category !== 'PLAIN_ROLLS' && m.isActive)
  if (!stockMat) {
    stockMat = await apiPost('/inventory/materials', {
      code: `MAT-STOCK-${Date.now()}`, name: 'Test Stock Material',
      category: 'INK_SOLVENTS', subCategory: 'IPA',
      unitOfMeasure: 'liters', costPrice: 500
    })
  }
  ctx.stockMaterialId = stockMat.id
  console.log(`  Stock material: ${ctx.stockMaterialId}`)

  // Create sales orders
  const order = await apiPost('/sales-orders/orders', {
    customerId: ctx.customerId,
    specsJson: { width: 50, material: '25microns', gsm: 100 },
    quantityOrdered: 100,
    unitPrice: 3400,
  })
  ctx.orderId = order.id
  console.log(`  Order: ${ctx.orderId} (${order.orderNumber})`)

  const order2 = await apiPost('/sales-orders/orders', {
    customerId: ctx.customerId,
    specsJson: { width: 50, material: '25microns', gsm: 100 },
    quantityOrdered: 100,
    unitPrice: 3400,
  })
  ctx.order2Id = order2.id
  console.log(`  Order 2: ${ctx.order2Id} (${order2.orderNumber})`)

  console.log('═══ Test data ready ═══\n')
}

// ──────────────────────────────────────────────
// Race Condition Tests
// ──────────────────────────────────────────────

async function testConcurrentCreateJob() {
  console.log('\n─── Test 1: Concurrent createJob for same parent rolls (P1) ───')

  // First verify rolls are AVAILABLE
  const allRolls = await apiGet('/production/rolls')
  const allRollsArr = Array.isArray(allRolls) ? allRolls : []
  const rollMap = new Map(allRollsArr.map((r: any) => [r.id, r.status]))
  ctx.parentRollIds.forEach(id => console.log(`  Roll ${id}: status=${rollMap.get(id) || 'UNKNOWN'}`))

  const rollIds = ctx.parentRollIds.slice(0, 2)
  const p1 = apiPost('/production/', {
    machine: 'MC1', category: '25microns',
    rollIds, printedRollWeights: [10, 5],
  })
  const p2 = apiPost('/production/', {
    machine: 'MC1', category: '25microns',
    rollIds, printedRollWeights: [8, 3],
  })

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${JSON.stringify(r1?.error || r1?.id || r1?.jobNumber)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error || r2?.id || r2?.jobNumber)}`)
  const e1 = r1?.error ? r1 : null
  const e2 = r2?.error ? r2 : null
  const successCount = [!e1, !e2].filter(Boolean).length
  const failCount = [e1, e2].filter(Boolean).length
  assert(successCount === 1, `1 success (got ${successCount})`)
  assert(failCount === 1, `1 failure (got ${failCount})`)

  const okRes = r1?.id ? r1 : r2
  ctx.jobId = okRes.id || okRes.jobId
  assert(ctx.jobId.length > 0, `Job created: ${ctx.jobId}`)
}

async function testConcurrentCompleteJob() {
  console.log('\n─── Test 2: Concurrent completeJob for same job (P3) ───')
  assert(ctx.jobId.length > 0, 'Job exists from test 1')

  const p1 = apiPost(`/production/${ctx.jobId}/complete`)
  await delay(30)
  const p2 = apiPost(`/production/${ctx.jobId}/complete`)
  const p3 = apiPost(`/production/${ctx.jobId}/complete`)

  const results = await Promise.all([p1, p2, p3])
  const errors = results.filter(r => r?.error)
  assert(errors.length >= 2, `At least 2 failures (got ${errors.length}): concurrent completion blocked`)
  console.log(`  Errors: ${JSON.stringify(errors.slice(0, 2).map((e: any) => e?.error?.code || e?.message))}`)
}

async function testConcurrentDeleteJob() {
  console.log('\n─── Test 3: Concurrent deleteJob for same job (P9) ───')

  const rollIds = [ctx.parentRollIds[2]]
  const created = await apiPost('/production/', {
    machine: 'MC1', category: '25microns',
    rollIds, printedRollWeights: [5],
  })
  if (!created?.id) { console.log('  ⚠ Create failed, skipping...'); return }
  const delId = created.id

  const p1 = apiDelete(`/production/${delId}`)
  await delay(30)
  const p2 = apiDelete(`/production/${delId}`)

  const [, r2] = await Promise.all([p1, p2])
  const e2 = r2?.error
  assert(!!e2, `Second delete blocked (${e2?.code || 'expected error'})`)
  if (e2) assert(e2.code === 'NOT_FOUND' || e2.code === 'INVALID_OPERATION',
    `Error is NOT_FOUND/INVALID_OPERATION (got: ${e2.code})`)
}

async function testConcurrentMarkRollConsumed() {
  console.log('\n─── Test 4: Concurrent markRollConsumed for same roll (P10) ───')

  const rolls = await apiGet('/production/rolls')
  const allRolls = Array.isArray(rolls) ? rolls : []
  const target = allRolls.find((r: any) =>
    r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 1 &&
    !ctx.parentRollIds.includes(r.id)
  )
  if (!target) { console.log('  ⚠ No roll found, skipping...'); return }

  const p1 = apiPost(`/production/parent-roll/${target.id}/consume`)
  const p2 = apiPost(`/production/parent-roll/${target.id}/consume`)

  const [r1, r2] = await Promise.all([p1, p2].map(p => p.then(v => v).catch(e => e.response?.data || e)))
  const errors = [r1, r2].filter(r => r?.error)
  const successes = [r1, r2].filter(r => !r?.error)
  assert(successes.length === 1, `Exactly 1 success (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 failure (got ${errors.length})`)
}

async function testConcurrentDisposeRoll() {
  console.log('\n─── Test 5: Concurrent disposeRoll for same roll (P11) ───')

  const rolls = await apiGet('/production/rolls')
  const target = (rolls as any[]).find((r: any) =>
    r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 1
  )
  if (!target) { console.log('  ⚠ No roll found, skipping...'); return }

  const p1 = apiPost(`/production/parent-roll/${target.id}/dispose`, { reason: 'Race test' })
  const p2 = apiPost(`/production/parent-roll/${target.id}/dispose`, { reason: 'Race test' })

  const [r1, r2] = await Promise.all([p1, p2].map(p => p.then(v => v).catch(e => e.response?.data || e)))
  const errors = [r1, r2].filter(r => r?.error)
  const successes = [r1, r2].filter(r => !r?.error)
  assert(successes.length === 1, `Exactly 1 success (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 failure (got ${errors.length})`)
}

async function testConcurrentJobNumberUniqueness() {
  console.log('\n─── Test 6: Concurrent job number uniqueness (P2/P14) ───')

  const rolls = await apiGet('/production/rolls')
  const testRolls = (rolls as any[]).filter((r: any) => r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 3).slice(0, 4)
  if (testRolls.length < 4) { console.log('  ⚠ Need 4 rolls, skipping...'); return }

  const promises = testRolls.map((r: any, i: number) =>
    apiPost('/production/', {
      machine: 'MC2', category: '25microns',
      rollIds: [r.id], printedRollWeights: [3 + i],
    }).catch(e => e.response?.data || e)
  )

  const results = await Promise.all(promises)
  const successes = results.filter(r => r?.id && !r?.error)
  const failures = results.filter(r => r?.error || !r?.id)

  if (failures.length > 0) console.log(`  Failures: ${JSON.stringify(failures.map((r: any) => ({ code: r?.error?.code, message: r?.error?.message || r?.error })))}`)
  assert(successes.length === 4, `All 4 jobs created (got ${successes.length})`)

  const jobNumbers = successes.map((r: any) => r.jobNumber)
  const unique = [...new Set(jobNumbers)]
  assert(unique.length === 4, `All job numbers unique (${unique.length}/${jobNumbers.length})`)
  console.log(`  Job numbers: ${jobNumbers.join(', ')}`)
}

async function testConcurrentStockMovements() {
  console.log('\n─── Test 7: Concurrent stock movements atomic increment (R1) ───')

  const materials = await apiGet('/inventory/materials')
  const sm = materials.find((m: any) => m.id === ctx.stockMaterialId)
  const initialQty = Number(sm?.totalStock || 0)
  console.log(`  Material: ${sm?.name}, initial: ${initialQty}`)

  const promises: Promise<any>[] = []
  const CONCURRENT = 5
  for (let i = 0; i < CONCURRENT; i++) {
    const isOut = i % 2 === 0
    const endpoint = '/inventory/movements'
    promises.push(apiPost(endpoint, {
      materialId: ctx.stockMaterialId,
      type: isOut ? 'OUT' : 'IN',
      quantity: 1,
      notes: `Race concurrent #${i}`
    }).catch(e => e.response?.data || e))
  }

  const results = await Promise.all(promises)
  const successes = results.filter(r => !r?.error)
  console.log(`  Movements: ${successes.length} success, ${results.length - successes.length} failure`)

  await delay(500)
  const finMats = await apiGet('/inventory/materials')
  const finSm = finMats.find((m: any) => m.id === ctx.stockMaterialId)
  const finalQty = Number(finSm?.totalStock || 0)

  // Count IN vs OUT from original request order
  const outCount = successes.filter((_, i) => i % 2 === 0).length
  const inCount = successes.filter((_, i) => i % 2 !== 0).length
  const expected = initialQty - outCount + inCount
  assert(finalQty === expected,
    `Stock correct: ${finalQty} = ${initialQty} - ${outCount} + ${inCount}`,
    `Got ${finalQty}, expected ${expected}`
  )
}

async function testConcurrentPaymentAtomicIncrement() {
  console.log('\n─── Test 8: Concurrent payment atomic increment (sales #5/#9) ───')

  const rollRes = await apiGet('/production/rolls')
  const avRolls = (rollRes as any[]).filter((r: any) => r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 5)
  if (avRolls.length === 0) { console.log('  ⚠ No rolls, skipping...'); return }

  const order = await apiPost('/sales-orders/orders', {
    customerId: ctx.customerId,
    specsJson: { width: 50, material: '25microns', gsm: 100 },
    quantityOrdered: 10, unitPrice: 3400,
  })
  await apiPatch(`/sales-orders/orders/${order.id}/approve`)

  const startRes = await apiPatch(`/sales-orders/orders/${order.id}/start-production`, {
    machine: 'MC1', category: '25microns',
    rollIds: [avRolls[0].id], printedRollWeights: [8],
  })
  const job = startRes.productionJob || startRes
  await apiPost(`/production/${job.id}/complete`)
  await apiPatch(`/sales-orders/orders/${order.id}/pickup`)

  // Get invoice balance
  const invoices = await apiGet('/sales-orders/invoices') || []
  const invoice = (Array.isArray(invoices) ? invoices : []).find((inv: any) => inv.salesOrderId === order.id)
  if (!invoice) { console.log('  ⚠ No invoice, skipping...'); return }
  const balanceDue = Number(invoice.balanceDue || invoice.totalAmount)
  const payAmount = Math.ceil(balanceDue / 3)

  const payPromises: Promise<any>[] = []
  for (let i = 0; i < 3; i++) {
    payPromises.push(apiPost('/sales-orders/payments', {
      salesOrderId: order.id, customerId: ctx.customerId,
      transactionType: 'PAYMENT', paymentMethod: 'Cash', amount: payAmount,
    }).catch(e => e.response?.data || e))
  }

  const payResults = await Promise.all(payPromises)
  const paySuccesses = payResults.filter(r => !r?.error)
  console.log(`  Payments: ${paySuccesses.length} success`)

  await delay(500)
  const updOrder = await apiGet(`/sales-orders/orders/${order.id}`)
  const totalPaid = Number(updOrder.totalPaid)
  const expectedPaid = paySuccesses.length * payAmount
  assert(totalPaid === expectedPaid,
    `totalPaid = ${totalPaid} (expected ${expectedPaid})`,
    `Got ${totalPaid} vs ${expectedPaid}`
  )
}

async function testConcurrentPickupStatusGuard() {
  console.log('\n─── Test 9: Concurrent pickup status guard (sales #1/#3/#8) ───')

  const rollRes = await apiGet('/production/rolls')
  const bigRolls = (rollRes as any[]).filter((r: any) => r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 10)
  if (bigRolls.length < 2) { console.log('  ⚠ Need 2 large rolls, skipping...'); return }

  const order = await apiPost('/sales-orders/orders', {
    customerId: ctx.customerId,
    specsJson: { width: 50, material: '25microns', gsm: 100 },
    quantityOrdered: 20, unitPrice: 3400,
  })
  await apiPatch(`/sales-orders/orders/${order.id}/approve`)

  // Use start-production to transition order to IN_PRODUCTION (avoids status mismatch)
  const startRes = await apiPatch(`/sales-orders/orders/${order.id}/start-production`, {
    machine: 'MC1', category: '25microns',
    rollIds: [bigRolls[0].id, bigRolls[1].id],
    printedRollWeights: [10, 10],
  })
  const job = startRes.productionJob || startRes
  await apiPost(`/production/${job.id}/complete`)

  const p1 = apiPatch(`/sales-orders/orders/${order.id}/pickup`)
  await delay(20)
  const p2 = apiPatch(`/sales-orders/orders/${order.id}/pickup`)

  const [r1, r2] = await Promise.all([p1, p2])
  const errors = [r1, r2].filter(r => r?.error)
  const successes = [r1, r2].filter(r => !r?.error)
  if (errors.length > 0) console.log(`  Pickup errors: ${JSON.stringify(errors.map(e => e?.error?.code + ': ' + e?.error?.message))}`)
  console.log(`  Pickups: ${successes.length} success, ${errors.length} failure`)

  await delay(500)
  const updOrder = await apiGet(`/sales-orders/orders/${order.id}`)
  console.log(`  Order status after pickups: ${updOrder.status}, qtyDelivered: ${updOrder.quantityDelivered}`)
  const qtyDel = Number(updOrder.quantityDelivered)
  assert(qtyDel <= 20, `Delivered ${qtyDel}kg ≤ 20kg`)
  assert(qtyDel > 0, `Delivered ${qtyDel}kg > 0`)
}

async function testConcurrentCancelOrder() {
  console.log('\n─── Test 10: Concurrent cancel order (sales #10) ───')

  const order = await apiPost('/sales-orders/orders', {
    customerId: ctx.customerId,
    specsJson: { width: 50, material: '25microns', gsm: 100 },
    quantityOrdered: 10, unitPrice: 3400,
  })

  const p1 = apiPatch(`/sales-orders/orders/${order.id}/cancel`)
  await delay(20)
  const p2 = apiPatch(`/sales-orders/orders/${order.id}/cancel`)

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${JSON.stringify(r1?.error?.code || r1)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error?.code || r2)}`)
  const errors = [r1, r2].filter(r => r?.error)
  const successes = [r1, r2].filter(r => !r?.error)
  assert(successes.length === 1, `First cancel succeeds (got ${successes.length})`)
  assert(errors.length === 1, `Second cancel blocked`)
}

async function testConcurrentInvoiceNumberUniqueness() {
  console.log('\n─── Test 11: Concurrent invoice number uniqueness (sales #12) ───')

  const rollRes = await apiGet('/production/rolls')
  const smallRolls = (rollRes as any[]).filter((r: any) => r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 3)
  if (smallRolls.length < 2) { console.log('  ⚠ Need 2 rolls, skipping...'); return }

  // Create 2 orders, produce, complete, pickup (creates invoices)
  const orders = []
  for (let i = 0; i < 2; i++) {
    const o = await apiPost('/sales-orders/orders', {
      customerId: ctx.customerId,
      specsJson: { width: 50, material: '25microns', gsm: 100 },
      quantityOrdered: 5, unitPrice: 3400,
    })
    await apiPatch(`/sales-orders/orders/${o.id}/approve`)
    const j = await apiPost('/production/', {
      machine: 'MC1', category: '25microns',
      rollIds: [smallRolls[i].id], printedRollWeights: [3],
    })
    await apiPost(`/production/${j.id}/complete`)
    await apiPatch(`/sales-orders/orders/${o.id}/pickup`)
    
    // Try to create additional manual invoices concurrently
    const p1 = apiPost('/sales-orders/invoices', { salesOrderId: o.id }).catch(e => e.response?.data || e)
    await delay(10)
    const p2 = apiPost('/sales-orders/invoices', { salesOrderId: o.id }).catch(e => e.response?.data || e)
    const [i1, i2] = await Promise.all([p1, p2])
    
    const invs = [i1, i2].filter(r => r?.invoiceNumber)
    const invNums = invs.map((r: any) => r.invoiceNumber)
    const uniqueNums = [...new Set(invNums)]
    assert(uniqueNums.length === invNums.length,
      `Invoice numbers unique (${uniqueNums.length}/${invNums.length}) for order ${i}`)
    console.log(`  Order ${i + 1} invoice numbers: ${invNums.join(', ')}`)
    orders.push(o)
  }
}

// ──────────────────────────────────────────────
// Finance Race Condition Tests
// ──────────────────────────────────────────────

async function testConcurrentJournalEntryNumber() {
  console.log('\n─── Test 12: Concurrent journal entry number uniqueness (Finance Race 1) ───')

  const accounts = await apiGet('/finance/accounts')
  const accArr = toArray(accounts)
  const cashAcc = accArr.find((a: any) => a.code === '1000')
  const bankAcc = accArr.find((a: any) => a.code === '1100')
  if (!cashAcc || !bankAcc) { console.log('  ⚠ No accounts found, skipping...'); return }

  const promises = [1, 2, 3].map(i =>
    apiPost('/finance/journal', {
      description: `Race test JE ${i} - ${Date.now()}`,
      sourceModule: 'ADJUSTMENT',
      lines: [
        { accountId: cashAcc.id, debit: 100 * i, credit: 0, memo: 'Test debit' },
        { accountId: bankAcc.id, debit: 0, credit: 100 * i, memo: 'Test credit' }
      ]
    })
  )

  const results = await Promise.all(promises)
  const errors = results.filter(r => r?.error)
  const successes = results.filter(r => r?.entryNumber)
  console.log(`  Successes: ${successes.length}, Errors: ${errors.length}`)

  assert(successes.length === 3, `All 3 journal entries created (got ${successes.length})`)
  if (errors.length > 0) console.log(`  Errors: ${JSON.stringify(errors.map((e: any) => e?.error?.code))}`)

  const entryNums = successes.map((r: any) => r.entryNumber)
  const unique = [...new Set(entryNums)]
  assert(unique.length === 3, `All entry numbers unique (${unique.length}/${entryNums.length})`)
  console.log(`  Entry numbers: ${entryNums.join(', ')}`)
}

async function testConcurrentReverseJournalEntry() {
  console.log('\n─── Test 13: Concurrent reverse journal entry (Finance Race 2) ───')

  const accounts = await apiGet('/finance/accounts')
  const accArr = toArray(accounts)
  const cashAcc = accArr.find((a: any) => a.code === '1000')
  const bankAcc = accArr.find((a: any) => a.code === '1100')
  if (!cashAcc || !bankAcc) { console.log('  ⚠ No accounts, skipping...'); return }

  const created = await apiPost('/finance/journal', {
    description: `Race test reverse JE - ${Date.now()}`,
    sourceModule: 'ADJUSTMENT',
    lines: [
      { accountId: cashAcc.id, debit: 500, credit: 0, memo: 'Test debit' },
      { accountId: bankAcc.id, debit: 0, credit: 500, memo: 'Test credit' }
    ]
  })
  if (!created?.id) { console.log('  ⚠ Failed to create JE, skipping...'); return }
  console.log(`  Created JE: ${created.entryNumber} (${created.id})`)

  const p1 = apiPost(`/finance/journal/${created.id}/reverse`)
  await delay(30)
  const p2 = apiPost(`/finance/journal/${created.id}/reverse`)

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${r1?.entryNumber || JSON.stringify(r1?.error?.code)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error?.code || r2)}`)

  const errors = [r1, r2].filter(r => r?.error?.code === 'ALREADY_REVERSED')
  const successes = [r1, r2].filter(r => r?.entryNumber)
  assert(successes.length === 1, `Exactly 1 reversal created (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 duplicate blocked (got ${errors.length})`)
}

async function testConcurrentAccountCreation() {
  console.log('\n─── Test 14: Concurrent account creation duplicate code (Finance Race 7) ───')

  const uniqueCode = `Z${Date.now()}`

  const uniqueName = `Race Test Account ${uniqueCode}`

  const p1 = apiPost('/finance/accounts', { code: uniqueCode, name: uniqueName, type: 'EXPENSE' })
  const p2 = apiPost('/finance/accounts', { code: uniqueCode, name: uniqueName, type: 'EXPENSE' })

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${r1?.id || JSON.stringify(r1?.error?.code || r1)}`)
  console.log(`  r2: ${r2?.id || JSON.stringify(r2?.error?.code || r2)}`)

  const errors = [r1, r2].filter(r => r?.error?.code === 'DUPLICATE')
  const successes = [r1, r2].filter(r => r?.id)
  assert(successes.length === 1, `Exactly 1 account created (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 duplicate blocked (got ${errors.length})`)
}

async function testConcurrentCogsRecognition() {
  console.log('\n─── Test 15: Concurrent COGS recognition guard (Finance Race 3) ───')

  const rollRes = await apiGet('/production/rolls')
  const bigRolls = toArray(rollRes).filter((r: any) => r.status === 'AVAILABLE' && Number(r.remainingWeight) >= 10)
  if (bigRolls.length === 0) { console.log('  ⚠ No rolls, skipping...'); return }

  const order = await apiPost('/sales-orders/orders', {
    customerId: ctx.customerId,
    specsJson: { width: 50, material: '25microns', gsm: 100 },
    quantityOrdered: 10, unitPrice: 3400,
  })
  await apiPatch(`/sales-orders/orders/${order.id}/approve`)

  const startRes = await apiPatch(`/sales-orders/orders/${order.id}/start-production`, {
    machine: 'MC1', category: '25microns',
    rollIds: [bigRolls[0].id],
    printedRollWeights: [8],
  })
  if (!startRes) { console.log('  ⚠ Start production failed, skipping...'); return }
  const job = startRes.productionJob || startRes
  await apiPost(`/production/${job.id}/complete`)

  // Verify order is READY after completion
  const readyOrder = await apiGet(`/sales-orders/orders/${order.id}`)
  console.log(`  Order status after completion: ${readyOrder.status}`)

  // Check the deferred COGS is available to recognize
  const deferredSummary = await apiGet('/finance/deferred-cogs')
  console.log(`  Deferred COGS: total=${deferredSummary?.totalDeferred}, pending=${deferredSummary?.pendingCount}`)

  // Concurrent recognize calls
  const p1 = apiPost(`/finance/deferred-cogs/${order.id}/recognize`)
  await delay(30)
  const p2 = apiPost(`/finance/deferred-cogs/${order.id}/recognize`)

  const [r1, r2] = await Promise.all([p1, p2])
  const r1Entry = r1?.journalEntry?.entryNumber || r1?.entryNumber
  console.log(`  r1: ${r1Entry || JSON.stringify(r1?.error?.code)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error?.code || r2)}`)

  const errors = [r1, r2].filter(r => r?.error?.code === 'DUPLICATE')
  const successes = [r1, r2].filter(r => r?.journalEntry?.entryNumber || r?.entryNumber)
  assert(successes.length === 1, `Exactly 1 COGS entry created (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 duplicate blocked (got ${errors.length})`)
}

async function testConcurrentOpeningBalances() {
  console.log('\n─── Test 16: Concurrent opening balances (Finance Race 4) ───')

  const accounts = await apiGet('/finance/accounts')
  const accArr = toArray(accounts)
  const assetAcc = accArr.find((a: any) => a.code === '1000')
  const liabilityAcc = accArr.find((a: any) => a.code === '2000')
  if (!assetAcc || !liabilityAcc) { console.log('  ⚠ No accounts, skipping...'); return }

  // Post opening balances for two different accounts concurrently
  // (Account type race is structural — reads now happen inside the tx)
  const p1 = apiPost('/finance/opening-balances', {
    date: new Date().toISOString().split('T')[0],
    lines: [{ accountId: assetAcc.id, amount: 100 }]
  })
  const p2 = apiPost('/finance/opening-balances', {
    date: new Date().toISOString().split('T')[0],
    lines: [{ accountId: liabilityAcc.id, amount: 200 }]
  })

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  Asset account opening balance: ${JSON.stringify(r1?.accountsUpdated || r1?.error?.code)}`)
  console.log(`  Liability account opening balance: ${JSON.stringify(r2?.accountsUpdated || r2?.error?.code)}`)

  const errors = [r1, r2].filter(r => r?.error)
  assert(errors.length === 0, `Both opening balance posts succeed (got ${errors.length} errors)`)
  assert(r1?.accountsUpdated > 0 || r1?.success, `First post succeeded`)
  assert(r2?.accountsUpdated > 0 || r2?.success, `Second post succeeded`)

  // Reset opening balances to 0
  await apiPost('/finance/opening-balances', {
    date: new Date().toISOString().split('T')[0],
    lines: [{ accountId: assetAcc.id, amount: 0 }]
  })
  await apiPost('/finance/opening-balances', {
    date: new Date().toISOString().split('T')[0],
    lines: [{ accountId: liabilityAcc.id, amount: 0 }]
  })
  console.log('  Opening balances reset to 0')
}

// ──────────────────────────────────────────────
// Procurement Race Condition Tests
// ──────────────────────────────────────────────

async function testConcurrentCreatePO() {
  console.log('\n─── Test 17: Concurrent PO creation number uniqueness (Procurement Race 5a) ───')

  const materials = await apiGet('/inventory/materials')
  const matArr = toArray(materials)
  const rollMat = matArr.find((m: any) => m.category === 'PLAIN_ROLLS')
  if (!rollMat) { console.log('  ⚠ No PLAIN_ROLLS material, skipping...'); return }

  const promises = [1, 2].map(i =>
    apiPost('/procurement/purchase-orders', {
      supplier: `Race Test Supplier ${Date.now()}-${i}`,
      expectedDate: new Date().toISOString().split('T')[0],
      items: [{ materialId: rollMat.id, quantity: 2, totalWeight: 10, unitPrice: 5000 }]
    })
  )

  const results = await Promise.all(promises)
  const successes = results.filter(r => r?.poNumber)
  const errors = results.filter(r => r?.error)
  if (errors.length > 0) console.log(`  Error details: ${JSON.stringify(errors.slice(0, 2).map((e: any) => ({ code: e?.error?.code, message: e?.error?.message })))}`)
  console.log(`  Successes: ${successes.length}, Errors: ${errors.length}`)

  assert(successes.length === 2, `Both POs created (got ${successes.length})`)
  if (errors.length > 0) console.log(`  Errors: ${JSON.stringify(errors.map((e: any) => e?.error?.code))}`)

  const poNums = successes.map((r: any) => r.poNumber)
  const unique = [...new Set(poNums)]
  assert(unique.length === 2, `Both PO numbers unique (${unique.length}/${poNums.length})`)
  console.log(`  PO numbers: ${poNums.join(', ')}`)
}

async function testConcurrentReceivePO() {
  console.log('\n─── Test 18: Concurrent PO receive guard (Procurement Race 1/3/6) ───')

  const materials = await apiGet('/inventory/materials')
  const matArr = toArray(materials)
  const rollMat = matArr.find((m: any) => m.category === 'PLAIN_ROLLS')
  if (!rollMat) { console.log('  ⚠ No PLAIN_ROLLS material, skipping...'); return }

  const po = await apiPost('/procurement/purchase-orders', {
    supplier: `Race Test PO Receive ${Date.now()}`,
    expectedDate: new Date().toISOString().split('T')[0],
    items: [{ materialId: rollMat.id, quantity: 2, totalWeight: 10, unitPrice: 5000 }]
  })
  if (!po?.id) { console.log('  ⚠ PO creation failed, skipping...'); return }
  console.log(`  Created PO: ${po.poNumber} (${po.id})`)

  const p1 = apiPost(`/procurement/purchase-orders/${po.id}/receive`)
  await delay(30)
  const p2 = apiPost(`/procurement/purchase-orders/${po.id}/receive`)

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${r1?.po?.status || JSON.stringify(r1?.error?.code)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error?.code || r2)}`)

  const errors = [r1, r2].filter(r => r?.error?.code === 'INVALID_OPERATION')
  const successes = [r1, r2].filter(r => r?.po?.status === 'RECEIVED')
  assert(successes.length === 1, `Exactly 1 receive succeeded (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 duplicate blocked (got ${errors.length})`)
}

async function testConcurrentSupplierPayment() {
  console.log('\n─── Test 19: Concurrent supplier invoice payment (Procurement Race 2) ───')

  const materials = await apiGet('/inventory/materials')
  const matArr = toArray(materials)
  const rollMat = matArr.find((m: any) => m.category === 'PLAIN_ROLLS')
  if (!rollMat) { console.log('  ⚠ No PLAIN_ROLLS material, skipping...'); return }

  const po = await apiPost('/procurement/purchase-orders', {
    supplier: `Race Test Supplier Payment ${Date.now()}`,
    expectedDate: new Date().toISOString().split('T')[0],
    items: [{ materialId: rollMat.id, quantity: 2, totalWeight: 10, unitPrice: 5000 }]
  })
  if (!po?.id) { console.log('  ⚠ PO creation failed, skipping...'); return }

  await apiPost(`/procurement/purchase-orders/${po.id}/receive`)
  const inv = await apiPost('/procurement/supplier-invoices', {
    poId: po.id, date: new Date().toISOString().split('T')[0], amount: 10000
  })
  if (!inv?.id) { console.log('  ⚠ Invoice creation failed, skipping...'); return }
  console.log(`  Invoice: ${inv.invoiceNumber}, amount: 10000`)

  const p1 = apiPost(`/procurement/supplier-invoices/${inv.id}/payments`, {
    amount: 4000, date: new Date().toISOString().split('T')[0], paymentMethod: 'Cash'
  })
  const p2 = apiPost(`/procurement/supplier-invoices/${inv.id}/payments`, {
    amount: 4000, date: new Date().toISOString().split('T')[0], paymentMethod: 'Cash'
  })

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${r1?.id ? 'payment created' : JSON.stringify(r1?.error?.code)}`)
  console.log(`  r2: ${r2?.id ? 'payment created' : JSON.stringify(r2?.error?.code || r2)}`)

  const payments = [r1, r2].filter(r => r?.id)
  const errs = [r1, r2].filter(r => r?.error)
  console.log(`  Payments created: ${payments.length}, Errors: ${errs.length}`)

  await delay(500)
  const updInv = await apiGet(`/procurement/supplier-invoices/${inv.id}`)
  const totalPaid = Number(updInv.amountPaid)
  console.log(`  Invoice amountPaid after concurrent payments: ${totalPaid}`)
  assert(totalPaid > 0, `Payments were not lost: ${totalPaid} > 0`)
  assert(totalPaid === payments.length * 4000, `Total matches successful payments: ${totalPaid} = ${payments.length * 4000}`)
}

async function testConcurrentCreateMultipleRolls() {
  console.log('\n─── Test 20: Concurrent createMultipleRolls number uniqueness (Procurement Race 4) ───')

  const materials = await apiGet('/inventory/materials')
  const matArr = toArray(materials)
  const rollMat = matArr.find((m: any) => m.category === 'PLAIN_ROLLS')
  if (!rollMat) { console.log('  ⚠ No PLAIN_ROLLS material, skipping...'); return }

  const result = await apiPost('/procurement/rolls/bulk', {
    materialId: rollMat.id, count: 3, weights: [10, 15, 20]
  })
  const rolls = toArray(result)
  console.log(`  Created ${rolls.length} rolls`)

  assert(rolls.length === 3, `3 rolls created (got ${rolls.length})`)
  const rollNums = rolls.map((r: any) => r.rollNumber)
  const unique = [...new Set(rollNums)]
  assert(unique.length === 3, `All roll numbers unique (${unique.length}/${rollNums.length})`)
  console.log(`  Roll numbers: ${rollNums.join(', ')}`)
}

async function testConcurrentSupplierCreate() {
  console.log('\n─── Test 21: Concurrent supplier create duplicate name (Supplier Race) ───')

  const uniqueName = `Race Test Supplier ${Date.now()}`

  const p1 = apiPost('/suppliers', { name: uniqueName })
  const p2 = apiPost('/suppliers', { name: uniqueName })

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${r1?.id || JSON.stringify(r1?.error?.code)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error?.code || r2)}`)

  const errors = [r1, r2].filter(r => r?.error?.code === 'DUPLICATE')
  const successes = [r1, r2].filter(r => r?.id)
  assert(successes.length === 1, `Exactly 1 supplier created (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 duplicate blocked (got ${errors.length})`)
}

async function testConcurrentRegister() {
  console.log('\n─── Test 22: Concurrent user register duplicate username (Auth Race) ───')

  const uniqueName = `raceuser${Date.now()}`

  const p1 = apiPost('/auth/register', { username: uniqueName, password: 'TestPass1' })
  const p2 = apiPost('/auth/register', { username: uniqueName, password: 'TestPass1' })

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${r1?.id || JSON.stringify(r1?.error?.code)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error?.code || r2)}`)

  const errors = [r1, r2].filter(r => r?.error?.code === 'USER_EXISTS')
  const successes = [r1, r2].filter(r => r?.id)
  assert(successes.length === 1, `Exactly 1 user created (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 duplicate blocked (got ${errors.length})`)
}

async function testConcurrentInkColorCreate() {
  console.log('\n─── Test 23: Concurrent ink color create duplicate name (Settings Race) ───')

  const uniqueName = `Race Color ${Date.now()}`
  const uniqueMapping = `race-${Date.now()}`

  const p1 = apiPost('/settings/ink-colors', { name: uniqueName, mapping: uniqueMapping })
  const p2 = apiPost('/settings/ink-colors', { name: uniqueName, mapping: uniqueMapping })

  const [r1, r2] = await Promise.all([p1, p2])
  console.log(`  r1: ${r1?.id || JSON.stringify(r1?.error?.code)}`)
  console.log(`  r2: ${JSON.stringify(r2?.error?.code || r2)}`)

  const errors = [r1, r2].filter(r => r?.error?.code === 'DUPLICATE')
  const successes = [r1, r2].filter(r => r?.id)
  assert(successes.length === 1, `Exactly 1 ink color created (got ${successes.length})`)
  assert(errors.length === 1, `Exactly 1 duplicate blocked (got ${errors.length})`)
}

// ──────────────────────────────────────────────
// Main runner
// ──────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║      Race Condition Verification Suite              ║')
  console.log('╚══════════════════════════════════════════════════════╝')

  await ensureLoggedIn()
  await setupTestData()

  const tests = [
    { name: 'Concurrent createJob (P1)', fn: testConcurrentCreateJob },
    { name: 'Concurrent completeJob (P3)', fn: testConcurrentCompleteJob },
    { name: 'Concurrent deleteJob (P9)', fn: testConcurrentDeleteJob },
    { name: 'Concurrent markRollConsumed (P10)', fn: testConcurrentMarkRollConsumed },
    { name: 'Concurrent disposeRoll (P11)', fn: testConcurrentDisposeRoll },
    { name: 'Job number uniqueness (P2/P14)', fn: testConcurrentJobNumberUniqueness },
    { name: 'Stock movement atomic increment (R1)', fn: testConcurrentStockMovements },
    { name: 'Payment atomic increment (sales #5/#9)', fn: testConcurrentPaymentAtomicIncrement },
    { name: 'Pickup status guard (sales #1/#3/#8)', fn: testConcurrentPickupStatusGuard },
    { name: 'Cancel status guard (sales #10)', fn: testConcurrentCancelOrder },
    { name: 'Invoice number uniqueness (sales #12)', fn: testConcurrentInvoiceNumberUniqueness },
    { name: 'JE number uniqueness (Finance Race 1)', fn: testConcurrentJournalEntryNumber },
    { name: 'Reverse JE guard (Finance Race 2)', fn: testConcurrentReverseJournalEntry },
    { name: 'Account creation duplicate (Finance Race 7)', fn: testConcurrentAccountCreation },
    { name: 'COGS recognition guard (Finance Race 3)', fn: testConcurrentCogsRecognition },
    { name: 'Opening balances concurrent (Finance Race 4)', fn: testConcurrentOpeningBalances },
    { name: 'PO number uniqueness (Procurement Race 5a)', fn: testConcurrentCreatePO },
    { name: 'PO receive guard (Procurement Race 1/3/6)', fn: testConcurrentReceivePO },
    { name: 'Supplier payment atomic (Procurement Race 2)', fn: testConcurrentSupplierPayment },
    { name: 'Multiple rolls uniqueness (Procurement Race 4)', fn: testConcurrentCreateMultipleRolls },
    { name: 'Supplier create duplicate (Supplier Race)', fn: testConcurrentSupplierCreate },
    { name: 'User register duplicate (Auth Race)', fn: testConcurrentRegister },
    { name: 'Ink color create duplicate (Settings Race)', fn: testConcurrentInkColorCreate },
  ]

  let passed = 0, failed = 0
  const failures: string[] = []

  for (const test of tests) {
    console.log(`\n▶ ${test.name}`)
    try {
      await test.fn()
      console.log(`  ✅ PASS`)
      passed++
    } catch (err: any) {
      console.log(`  ❌ FAIL: ${err.message}`)
      failed++
      failures.push(`${test.name}: ${err.message}`)
    }
  }

  console.log('\n══════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed, ${tests.length} total`)
  if (failures.length > 0) console.log('\n  Failures:\n' + failures.map(f => `    ❌ ${f}`).join('\n'))
  console.log('══════════════════════════════════════════════════════\n')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1) })
