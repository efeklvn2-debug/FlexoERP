const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const ORDER_NUMBER = 'SO-2026-0135';

function fmt(n) {
  if (n === null || n === undefined) return 'NULL';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtD(d) {
  if (!d) return 'NULL';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function line(label, value, extra) {
  const e = extra ? `  (${extra})` : '';
  console.log(`  ${label.padEnd(30)} ${String(value).padEnd(20)}${e}`);
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  INVESTIGATION: ${ORDER_NUMBER}`);
  console.log(`  Generated: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(80)}`);

  // ============================================================================
  // 1. SALES ORDER — ALL FIELDS
  // ============================================================================
  const so = await db.salesOrder.findUnique({
    where: { orderNumber: ORDER_NUMBER },
    include: { customer: true }
  });
  if (!so) {
    console.log(`\n❌ Order ${ORDER_NUMBER} NOT FOUND\n`);
    await db.$disconnect();
    return;
  }

  console.log(`\n─── 1. SALES ORDER ─────────────────────────────────────────────`);
  console.log(`  Order:     ${so.orderNumber}`);
  console.log(`  Customer:  ${so.customer?.name} (${so.customer?.code})`);
  console.log(`  Status:    ${so.status}`);
  console.log(`  Payment:   ${so.paymentStatus}`);
  console.log(`  Delivery:  ${so.deliveryMethod}`);
  console.log(`  Deleted:   ${so.isDeleted}`);
  console.log(`─── Quantities ───`);
  line('quantityOrdered',  fmt(so.quantityOrdered));
  line('quantityProduced', fmt(so.quantityProduced));
  line('quantityDelivered', fmt(so.quantityDelivered));
  console.log(`─── Pricing ───`);
  line('unitPrice',      '₦ ' + fmt(so.unitPrice));
  line('totalAmount',    '₦ ' + fmt(so.totalAmount));
  line('depositRequired','₦ ' + fmt(so.depositRequired));
  line('depositPaid',    '₦ ' + fmt(so.depositPaid));
  line('balancePaid',    '₦ ' + fmt(so.balancePaid));
  line('totalPaid',      '₦ ' + fmt(so.totalPaid));
  console.log(`─── Packing Bags ───`);
  line('packingBagsQuantity', fmt(so.packingBagsQuantity));
  line('packingBagsAmount',   '₦ ' + fmt(so.packingBagsAmount));
  console.log(`─── Specifications ───`);
  console.log(`  specsJson:  ${JSON.stringify(so.specsJson)}`);
  console.log(`─── Shipping ───`);
  line('shippingAddress', so.shippingAddress || 'NULL');
  console.log(`─── Timestamps ───`);
  line('createdAt',   fmtD(so.createdAt));
  line('updatedAt',   fmtD(so.updatedAt));
  line('approvedAt',  fmtD(so.approvedAt));
  line('cancelledAt', fmtD(so.cancelledAt));
  line('completedAt', fmtD(so.completedAt));
  line('productionJobId', so.productionJobId || 'NULL');
  line('id', so.id);

  // Quantity sanity check
  console.log(`─── Quantity Check ───`);
  const qOrdered = Number(so.quantityOrdered);
  const qProduced = Number(so.quantityProduced || 0);
  const qDelivered = Number(so.quantityDelivered);
  if (qProduced > 0 && qProduced !== qOrdered) {
    console.log(`  ⚠️  Produced (${qProduced}) ≠ Ordered (${qOrdered})`);
  }
  if (qDelivered > qProduced && qProduced > 0) {
    console.log(`  ⚠️  Delivered (${qDelivered}) > Produced (${qProduced})`);
  }
  if (qDelivered > 0) {
    console.log(`  Delivered ${qDelivered}/${qOrdered} (${(qDelivered/qOrdered*100).toFixed(1)}%)`);
  } else {
    console.log(`  Nothing delivered yet`);
  }

  // Amount sanity check
  console.log(`─── Amount Check ───`);
  const totalAmt = Number(so.totalAmount);
  const totPaid = Number(so.totalPaid);
  const depPaid = Number(so.depositPaid);
  const balPaid = Number(so.balancePaid);
  console.log(`  totalAmount(${fmt(totalAmt)}) =?= depositPaid(${fmt(depPaid)}) + balancePaid(${fmt(balPaid)})`);
  console.log(`  depositPaid + balancePaid = ${fmt(depPaid + balPaid)}`);
  if (Math.abs(totalAmt - (depPaid + balPaid)) < 0.01) {
    console.log(`  ✅ Amounts reconcile`);
  } else {
    console.log(`  ❌ Amounts DO NOT reconcile (diff=${fmt(totalAmt - (depPaid + balPaid))})`);
  }
  console.log(`  totalPaid = ${fmt(totPaid)} (stored, should match depositPaid+balancePaid)`);
  if (Math.abs(totPaid - (depPaid + balPaid)) > 0.01) {
    console.log(`  ⚠️  totalPaid(${fmt(totPaid)}) ≠ depositPaid(${fmt(depPaid)})+balancePaid(${fmt(balPaid)})`);
  }

  // ============================================================================
  // 2. PRODUCTION JOB + PRINTED ROLLS
  // ============================================================================
  const job = so.productionJobId
    ? await db.productionJob.findUnique({
        where: { id: so.productionJobId },
        include: {
          printedRolls: {
            include: {
              roll: { select: { rollNumber: true, weight: true, remainingWeight: true, status: true, materialId: true } }
            }
          },
          materialIssues: {
            include: { material: { select: { name: true, subCategory: true } } }
          }
        }
      })
    : null;

  if (job) {
    console.log(`\n─── 2. PRODUCTION JOB ─────────────────────────────────────────`);
    line('jobNumber',       job.jobNumber);
    line('status',          job.status);
    line('customerName',    job.customerName || 'NULL');
    line('machine',         job.machine);
    line('wasteWeight',     fmt(job.wasteWeight));
    line('materialCost',    '₦ ' + fmt(job.materialCost));
    line('consumablesCost', '₦ ' + fmt(job.consumablesCost));
    line('overheadCost',    '₦ ' + fmt(job.overheadCost));
    line('materialOverride', job.materialOverride || 'NULL');
    line('startDate',      fmtD(job.startDate));
    line('endDate',        fmtD(job.endDate));
    line('notes',          job.notes || 'NULL');
    console.log(`  parentRollIds:   ${JSON.stringify(job.parentRollIds)}`);
    console.log(`  printedRollMapping: ${JSON.stringify(job.printedRollMapping)}`);
    console.log(`  rollWaste:       ${JSON.stringify(job.rollWaste)}`);

    const costSum = Number(job.materialCost||0) + Number(job.consumablesCost||0) + Number(job.overheadCost||0);
    console.log(`  Total Deferred Cost: ₦${fmt(costSum)}`);

    // Printed Rolls
    if (job.printedRolls.length > 0) {
      console.log(`\n  ── Printed Rolls (${job.printedRolls.length}) ──`);
      let totalWeight = 0;
      let inStock = 0, pickedUp = 0, returned = 0;
      for (const pr of job.printedRolls) {
        totalWeight += Number(pr.weightUsed);
        if (pr.status === 'IN_STOCK') inStock++;
        else if (pr.status === 'PICKED_UP') pickedUp++;
        else if (pr.status === 'RETURNED') returned++;
        console.log(`    Roll #${pr.roll?.rollNumber || 'N/A'.padEnd(15)}  status=${String(pr.status).padEnd(10)} weightUsed=${fmt(pr.weightUsed)}kg  roll.status=${pr.roll?.status || 'N/A'}  isCombination=${pr.isCombination}`);
      }
      console.log(`  Total printed weight: ${fmt(totalWeight)} kg`);
      console.log(`  Roll counts: IN_STOCK=${inStock}  PICKED_UP=${pickedUp}  RETURNED=${returned}`);
    }

    // Material Issues
    if (job.materialIssues.length > 0) {
      console.log(`\n  ── Material Issues (${job.materialIssues.length}) ──`);
      for (const mi of job.materialIssues) {
        console.log(`    ${(mi.material?.name || '?').padEnd(20)} sub=${(mi.material?.subCategory || '?').padEnd(16)} qty=${fmt(mi.quantityKg)}kg  unitCost=₦${fmt(mi.unitCost)}  totalCost=₦${fmt(mi.totalCost)}`);
      }
    }
  } else {
    console.log(`\n─── 2. PRODUCTION JOB ─────────────────────────────────────────`);
    console.log(`  No production job linked`);
  }

  // ============================================================================
  // 3. INVOICES — ALL FIELDS
  // ============================================================================
  const invoices = await db.invoice.findMany({
    where: { salesOrderId: so.id },
    include: {
      payments: true,
      customer: { select: { name: true, code: true } }
    },
    orderBy: { issuedAt: 'asc' }
  });

  console.log(`\n─── 3. INVOICES (${invoices.length}) ────────────────────────────────────────`);
  if (invoices.length === 0) {
    console.log(`  No invoices linked to this order`);
  }

  let invoiceTotalAmount = 0;
  let invoiceAmountPaid = 0;
  let invoiceDepositApplied = 0;
  let invoicePrevPayments = 0;
  let invoiceBalanceSum = 0;
  let invoiceQtySum = 0;

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    invoiceTotalAmount += Number(inv.totalAmount);
    invoiceAmountPaid += Number(inv.amountPaid);
    invoiceDepositApplied += Number(inv.depositApplied);
    invoicePrevPayments += Number(inv.previousPayments);
    invoiceBalanceSum += Number(inv.balanceDue);
    invoiceQtySum += Number(inv.quantityDelivered);

    console.log(`\n  ── Invoice #${i + 1}: ${inv.invoiceNumber} ──`);
    line('invoiceNumber',       inv.invoiceNumber);
    line('status',              inv.status);
    line('customer',            `${inv.customer?.name} (${inv.customer?.code})`);
    console.log(`  ── Line Items ──`);
    line('quantityDelivered',   fmt(inv.quantityDelivered) + ' kg');
    line('unitPrice',           '₦ ' + fmt(inv.unitPrice) + '/kg');
    line('subtotal',            '₦ ' + fmt(inv.subtotal));
    line('vatAmount',           '₦ ' + fmt(inv.vatAmount));
    line('totalAmount',         '₦ ' + fmt(inv.totalAmount));
    console.log(`  ── Adjustments ──`);
    line('depositApplied',      '₦ ' + fmt(inv.depositApplied));
    line('previousPayments',    '₦ ' + fmt(inv.previousPayments));
    line('balanceDue',          '₦ ' + fmt(inv.balanceDue));
    line('amountPaid',          '₦ ' + fmt(inv.amountPaid));
    console.log(`  ── Packing Bags ──`);
    line('packingBagsQuantity', fmt(inv.packingBagsQuantity));
    line('packingBagsUnitPrice','₦ ' + fmt(inv.packingBagsUnitPrice));
    line('packingBagsSubtotal', '₦ ' + fmt(inv.packingBagsSubtotal));
    line('packingBagsPaid',     '₦ ' + fmt(inv.packingBagsPaid));
    console.log(`  ── Core & Dates ──`);
    line('coresReturned',       inv.coresReturned);
    line('issuedAt',            fmtD(inv.issuedAt));
    line('dueDate',             fmtD(inv.dueDate));
    line('paidAt',              fmtD(inv.paidAt));
    line('createdAt',           fmtD(inv.createdAt));
    line('id',                  inv.id);

    // Invoice sanity
    console.log(`  ── Invoice Sanity Check ──`);
    const invCalc = Number(inv.subtotal) + Number(inv.vatAmount);
    if (Math.abs(invCalc - Number(inv.totalAmount)) > 0.01) {
      console.log(`  ❌ subtotal(${fmt(inv.subtotal)}) + vat(${fmt(inv.vatAmount)}) = ${fmt(invCalc)} ≠ totalAmount(${fmt(inv.totalAmount)})`);
    } else {
      console.log(`  ✅ subtotal + vat = totalAmount (${fmt(invCalc)})`);
    }

    const invDue = Number(inv.totalAmount) - Number(inv.depositApplied) - Number(inv.previousPayments);
    if (Math.abs(invDue - Number(inv.balanceDue)) > 0.01) {
      console.log(`  ❌ balanceDue calc: total(${fmt(inv.totalAmount)}) - deposit(${fmt(inv.depositApplied)}) - prevPymts(${fmt(inv.previousPayments)}) = ${fmt(invDue)} ≠ stored balanceDue(${fmt(inv.balanceDue)})`);
    } else {
      console.log(`  ✅ balanceDue correct`);
    }

    if (inv.status === 'PAID') {
      const expectedPaid = Number(inv.balanceDue); // after deposit & prev applied
      if (Number(inv.amountPaid) < expectedPaid - 0.01 && inv.status === 'PAID') {
        console.log(`  ⚠️  Status PAID but amountPaid(${fmt(inv.amountPaid)}) < balanceDue(${fmt(inv.balanceDue)})`);
      }
    }

    // Payments for this invoice
    if (inv.payments.length > 0) {
      console.log(`  ── Payments Received (${inv.payments.length}) ──`);
      let pymtSum = 0;
      for (const pr of inv.payments) {
        pymtSum += Number(pr.amount);
        console.log(`    id=${pr.id}  amount=₦${fmt(pr.amount)}  method=${pr.paymentMethod || 'N/A'}  ref=${pr.reference || 'N/A'}  date=${fmtD(pr.date)}  notes=${pr.notes || ''}`);
      }
      if (Math.abs(pymtSum - Number(inv.amountPaid)) > 0.01) {
        console.log(`  ⚠️  PaymentReceived total(${fmt(pymtSum)}) ≠ invoice.amountPaid(${fmt(inv.amountPaid)})`);
      } else {
        console.log(`  ✅ PaymentReceived total matches amountPaid`);
      }
    } else {
      console.log(`  No PaymentReceived records for this invoice`);
    }
  }

  // ============================================================================
  // 4. PAYMENTS — Transaction-level
  // ============================================================================
  const payments = await db.paymentTransaction.findMany({
    where: { salesOrderId: so.id },
    orderBy: { receivedAt: 'asc' }
  });

  console.log(`\n─── 4. PAYMENT TRANSACTIONS (${payments.length}) ─────────────────────────────────`);
  if (payments.length === 0) {
    console.log(`  No PaymentTransaction records linked to this order`);
  }
  let paymentSum = 0;
  let depositSum = 0;
  for (const pt of payments) {
    const isDeposit = pt.transactionType === 'DEPOSIT';
    if (isDeposit) depositSum += Number(pt.amount);
    else paymentSum += Number(pt.amount);
    console.log(`  id=${pt.id}  type=${String(pt.transactionType).padEnd(20)}  method=${String(pt.paymentMethod || '').padEnd(13)}  amount=₦${fmt(pt.amount)}  ref=${pt.referenceNumber || 'N/A'}  date=${fmtD(pt.receivedAt)}  cat=${pt.paymentCategory || 'N/A'}  notes=${pt.notes || ''}`);
  }
  console.log(`  Total Deposits:  ₦${fmt(depositSum)}`);
  console.log(`  Total Payments:  ₦${fmt(paymentSum)}`);
  console.log(`  Grand Total PT:  ₦${fmt(depositSum + paymentSum)}`);

  // ============================================================================
  // 5. JOURNAL ENTRIES (sourceModule = SALES, sourceId = order.id)
  // ============================================================================
  const orderJEs = await db.journalEntry.findMany({
    where: {
      sourceModule: 'SALES',
      sourceId: so.id
    },
    include: { lines: { include: { account: true } } },
    orderBy: { postedAt: 'asc' }
  });

  console.log(`\n─── 5. JOURNAL ENTRIES (SALES, sourceId = order) ───────────────`);
  if (orderJEs.length === 0) {
    console.log(`  No SALES journal entries with sourceId = order.id`);
  }
  for (const je of orderJEs) {
    let totalDr = 0, totalCr = 0;
    console.log(`\n  ${je.entryNumber}  |  ${je.description}`);
    console.log(`  date=${fmtD(je.date)}  reference=${je.reference || 'N/A'}  module=${je.sourceModule}  sourceId=${je.sourceId || 'N/A'}`);
    for (const l of je.lines) {
      totalDr += Number(l.debit);
      totalCr += Number(l.credit);
      console.log(`    ${(l.account?.code || '????').padEnd(6)} ${(l.account?.name || '?').padEnd(28)} Dr=${fmt(l.debit)}  Cr=${fmt(l.credit)}  ${l.memo || ''}`);
    }
    const balanced = Math.abs(totalDr - totalCr) < 0.01;
    console.log(`    ${balanced ? '✅' : '❌'}  Total Dr=${fmt(totalDr)}  Total Cr=${fmt(totalCr)}`);
  }

  // ============================================================================
  // 6. JOURNAL ENTRIES for invoices
  // ============================================================================
  const invoiceIds = invoices.map(i => i.id);
  let invoiceJEs = [];
  if (invoiceIds.length > 0) {
    invoiceJEs = await db.journalEntry.findMany({
      where: { sourceId: { in: invoiceIds } },
      include: { lines: { include: { account: true } } },
      orderBy: { postedAt: 'asc' }
    });
  }

  console.log(`\n─── 6. JOURNAL ENTRIES (sourceId = invoice IDs) ────────────────`);
  if (invoiceJEs.length === 0) {
    console.log(`  No journal entries with sourceId matching any invoice`);
  }
  for (const je of invoiceJEs) {
    let totalDr = 0, totalCr = 0;
    console.log(`\n  ${je.entryNumber}  |  ${je.description}`);
    console.log(`  date=${fmtD(je.date)}  reference=${je.reference || 'N/A'}  module=${je.sourceModule}  sourceId=${je.sourceId || 'N/A'}`);
    for (const l of je.lines) {
      totalDr += Number(l.debit);
      totalCr += Number(l.credit);
      console.log(`    ${(l.account?.code || '????').padEnd(6)} ${(l.account?.name || '?').padEnd(28)} Dr=${fmt(l.debit)}  Cr=${fmt(l.credit)}  ${l.memo || ''}`);
    }
    const balanced = Math.abs(totalDr - totalCr) < 0.01;
    console.log(`    ${balanced ? '✅' : '❌'}  Total Dr=${fmt(totalDr)}  Total Cr=${fmt(totalCr)}`);
  }

  // ============================================================================
  // 7. CROSS-VALIDATION SUMMARY
  // ============================================================================
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  CROSS-VALIDATION SUMMARY`);
  console.log(`${'='.repeat(80)}`);

  // Quantities
  console.log(`\n  ── Quantities ──`);
  console.log(`  Order:    Ordered=${fmt(so.quantityOrdered)}  Produced=${fmt(so.quantityProduced)}  Delivered=${fmt(so.quantityDelivered)}`);
  console.log(`  Invoices: Sum of invoice quantities = ${fmt(invoiceQtySum)}`);
  if (Math.abs(Number(so.quantityDelivered) - invoiceQtySum) < 0.01) {
    console.log(`  ✅ Order.quantityDelivered matches invoice quantity sum`);
  } else {
    console.log(`  ❌ Order.quantityDelivered(${fmt(so.quantityDelivered)}) ≠ Invoice qty sum(${fmt(invoiceQtySum)})`);
  }

  // Amounts
  console.log(`\n  ── Amounts ──`);
  console.log(`  Order.totalAmount:         ₦${fmt(so.totalAmount)}`);
  console.log(`  Invoice totalAmounts sum:  ₦${fmt(invoiceTotalAmount)}`);
  if (Math.abs(Number(so.totalAmount) - invoiceTotalAmount) < 0.01) {
    console.log(`  ✅ Order.totalAmount matches sum of invoice totals`);
  } else {
    console.log(`  ❌ Order.totalAmount(${fmt(so.totalAmount)}) ≠ Invoice totals sum(${fmt(invoiceTotalAmount)})`);
  }

  console.log(`\n  ── Payments ──`);
  console.log(`  Order depositPaid:         ₦${fmt(so.depositPaid)}`);
  console.log(`  Order balancePaid:         ₦${fmt(so.balancePaid)}`);
  console.log(`  Order totalPaid:           ₦${fmt(so.totalPaid)}`);
  console.log(`  PaymentTransaction deposits: ₦${fmt(depositSum)}`);
  console.log(`  PaymentTransaction payments:  ₦${fmt(paymentSum)}`);
  console.log(`  PaymentTransaction total:    ₦${fmt(depositSum + paymentSum)}`);
  console.log(`  Invoice amountPaid sum:     ₦${fmt(invoiceAmountPaid)}`);
  console.log(`  Invoice depositApplied sum: ₦${fmt(invoiceDepositApplied)}`);
  console.log(`  Invoice prevPayments sum:   ₦${fmt(invoicePrevPayments)}`);

  // payment reconciliation
  const totalInvoiceMoney = invoiceAmountPaid + invoiceDepositApplied + invoicePrevPayments;
  if (Math.abs(totalInvoiceMoney - (depositSum + paymentSum)) < 0.01 && Math.abs(totalInvoiceMoney - Number(so.totalPaid)) < 0.01) {
    console.log(`  ✅ Payments fully reconcile across all sources`);
  } else {
    console.log(`  ⚠️  Payment totals diverge:`);
    console.log(`      Invoice paid+deposit+prev = ₦${fmt(totalInvoiceMoney)}`);
    console.log(`      PaymentTransaction total  = ₦${fmt(depositSum + paymentSum)}`);
    console.log(`      Order.totalPaid           = ₦${fmt(so.totalPaid)}`);
  }

  // Status chain
  console.log(`\n  ── Status Chain ──`);
  console.log(`  Order:   ${so.status}  |  Payment: ${so.paymentStatus}`);
  for (const inv of invoices) {
    const p = inv.payments.length > 0 ? ` (${inv.payments.length} payment(s))` : '';
    console.log(`  Invoice ${inv.invoiceNumber}: ${String(inv.status).padEnd(8)}${p}`);
  }
  if (job) {
    console.log(`  Job:     ${job.status}`);
  }

  // Final verdict
  console.log(`\n  ── Issues Found ──`);
  let issues = 0;
  if (Math.abs(Number(so.quantityDelivered) - invoiceQtySum) > 0.01) {
    console.log(`  ❌ ISSUE: Order qtyDelivered ≠ invoice quantities`);
    issues++;
  }
  if (Math.abs(Number(so.totalAmount) - invoiceTotalAmount) > 0.01) {
    console.log(`  ❌ ISSUE: Order totalAmount ≠ invoice totals`);
    issues++;
  }
  if (Math.abs(Number(so.totalPaid) - (depositSum + paymentSum)) > 0.01) {
    console.log(`  ⚠️  ISSUE: Order totalPaid ≠ PaymentTransaction total`);
    issues++;
  }
  if (so.status === 'COMPLETED' && invoiceBalanceSum > 0.01) {
    console.log(`  ⚠️  ISSUE: Order COMPLETED but invoices have ₦${fmt(invoiceBalanceSum)} balance due`);
    issues++;
  }

  if (issues === 0) {
    console.log(`  ✅ No issues detected`);
  }

  console.log(`\n${'='.repeat(80)}\n`);

  await db.$disconnect();
}

main().catch(e => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
