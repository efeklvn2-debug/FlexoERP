/**
 * Quick audit script for FlexoPrint ERP.
 * Usage: node _audit.cjs SO-2026-XXXX
 *        node _audit.cjs                           (defaults to latest order)
 */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const orderNumber = process.argv[2];

async function auditOrder(ordNum) {
  console.log(`\n========== AUDIT: ${ordNum} ==========\n`);

  // 1. Sales Order
  const so = await db.salesOrder.findUnique({
    where: { orderNumber: ordNum },
    include: { customer: true, productionJob: { include: { printedRolls: true } }, payments: true, invoices: true }
  });
  if (!so) { console.log('Order not found'); return; }

  console.log('--- SALES ORDER ---');
  console.log('Status:', so.status, '| Payment:', so.paymentStatus);
  console.log('Customer:', so.customer?.name);
  console.log('Qty Ordered:', Number(so.quantityOrdered), '| Produced:', Number(so.quantityProduced));
  console.log('Unit Price: ₦' + Number(so.unitPrice).toLocaleString(), '| Total: ₦' + Number(so.totalAmount).toLocaleString());
  console.log('Deposit Paid: ₦' + Number(so.depositPaid).toLocaleString(), '| Total Paid: ₦' + Number(so.totalPaid).toLocaleString());
  console.log('Packing Bags: qty=' + Number(so.packingBagsQuantity) + ' amt=₦' + Number(so.packingBagsAmount).toLocaleString());

  // 2. Production Job
  const job = so.productionJob;
  if (job) {
    console.log('\n--- PRODUCTION JOB ---');
    console.log('Job#:', job.jobNumber, '| Status:', job.status);
    console.log('Customer:', job.customerName, '| Machine:', job.machine);
    const totalWeight = job.printedRolls.reduce((s, pr) => s + Number(pr.weightUsed), 0);
    console.log('Printed Weight:', totalWeight, 'kg');

    // Cost snapshot
    const matCost = Number(job.materialCost);
    const consCost = Number(job.consumablesCost);
    const ohCost = Number(job.overheadCost);
    const totalDeferred = matCost + consCost + ohCost;
    console.log('Cost Snapshot:');
    console.log('  materialCost:     ₦' + matCost.toLocaleString());
    console.log('  consumablesCost:  ₦' + consCost.toLocaleString());
    console.log('  overheadCost:     ₦' + ohCost.toLocaleString());
    console.log('  totalDeferred:    ₦' + totalDeferred.toLocaleString());

    // Verify materialCost
    if (job.parentRollIds?.length > 0) {
      const parents = await db.roll.findMany({
        where: { id: { in: job.parentRollIds } },
        include: { material: true }
      });
      const parent = parents[0];
      const costPerKg = Number(parent?.material?.costPrice || 0);
      console.log('\n  Verify materialCost:');
      console.log('    parent material:', parent?.material?.name, '| costPrice: ₦' + costPerKg);
      console.log('    expected:', totalWeight, '×', costPerKg, '= ₦' + (totalWeight * costPerKg).toLocaleString());
      console.log('    actual:   ₦' + matCost.toLocaleString(), (matCost === totalWeight * costPerKg ? '✅' : '❌'));
    }

    // Verify consumablesCost (formula check)
    const settings = await db.settings.findUnique({ where: { id: 'default' } });
    if (settings) {
      const inkMats = await db.material.findMany({ where: { category: 'INK_SOLVENTS', isActive: true } });
      const ipaMat = inkMats.find(m => m.subCategory === 'IPA');
      const butanolMat = inkMats.find(m => m.subCategory === 'Butanol');
      const inkRate = Number(settings.inkConsumptionRate) || 0.2;
      const ipaRate = Number(settings.ipaConsumptionRate) || 0.1;
      const butanolRate = Number(settings.butanolConsumptionRate) || 0.1;
      const ipaCost = Number(ipaMat?.costPrice || 500);
      const butanolCost = Number(butanolMat?.costPrice || 600);

      // Map customer's colors to get avgInkCostPrice
      const customer = await db.customer.findFirst({ where: { name: { contains: job.customerName || '', mode: 'insensitive' } } });
      const inkColors = await db.inkColor.findMany({ where: { isActive: true } });
      const inkColorMap = Object.fromEntries(inkColors.map(ic => [ic.name, ic.mapping]));
      const custColors = customer?.colors || [];
      const subCats = inkMats.map(m => m.subCategory).filter(Boolean);
      const mappedSubCats = custColors.map(c => inkColorMap[c] || subCats.find(sc => sc.toLowerCase() === c.toLowerCase()) || null).filter(Boolean);
      const mappedInks = inkMats.filter(m => mappedSubCats.includes(m.subCategory || ''));
      const avgInkPrice = mappedInks.length > 0 ? mappedInks.reduce((s, m) => s + Number(m.costPrice || 0), 0) / mappedInks.length : 0;

      const expInkCost = totalWeight * inkRate * avgInkPrice;
      const expIpaCost = totalWeight * ipaRate * ipaCost;
      const expButanolCost = totalWeight * butanolRate * butanolCost;
      const expConsCost = expInkCost + expIpaCost + expButanolCost;

      console.log('\n  Verify consumablesCost:');
      console.log('    settings: inkRate=' + inkRate + ' ipaRate=' + ipaRate + ' butanolRate=' + butanolRate);
      console.log('    customer colors:', custColors.join(', '));
      console.log('    mapped ink subs:', mappedSubCats.join(', '));
      console.log('    avgInkCostPrice: ₦' + avgInkPrice.toFixed(2) + ' (from ' + mappedInks.length + ' materials)');
      console.log('    ipaCostPerLiter: ₦' + ipaCost + ' | butanolCostPerLiter: ₦' + butanolCost);
      console.log('    expected inkCost:     ₦' + expInkCost.toLocaleString());
      console.log('    expected ipaCost:     ₦' + expIpaCost.toLocaleString());
      console.log('    expected butanolCost: ₦' + expButanolCost.toLocaleString());
      console.log('    expected consumables: ₦' + expConsCost.toLocaleString());
      console.log('    actual consumables:   ₦' + consCost.toLocaleString(), (Math.abs(consCost - expConsCost) < 1 ? '✅' : '❌'));

      // Overhead
      const ohRate = Number(settings.overheadRatePerKg) || 0;
      const expOhCost = totalWeight * ohRate;
      console.log('\n  Verify overheadCost:');
      console.log('    rate: ₦' + ohRate + '/kg | expected: ₦' + expOhCost.toLocaleString() + ' | actual: ₦' + ohCost.toLocaleString(), (Math.abs(ohCost - expOhCost) < 1 ? '✅' : '❌'));
    }
  }

  // 3. Journal Entries
  const entries = await db.journalEntry.findMany({
    where: { OR: [{ reference: ordNum }, { reference: job?.jobNumber }].filter(Boolean) },
    include: { lines: { include: { account: true } } },
    orderBy: { postedAt: 'asc' }
  });
  console.log('\n--- JOURNAL ENTRIES ---');
  for (const e of entries) {
    let totalDr = 0, totalCr = 0;
    e.lines.forEach(l => { totalDr += Number(l.debit); totalCr += Number(l.credit); });
    const balanced = Math.abs(totalDr - totalCr) < 0.01;
    console.log(e.entryNumber, '|', e.description);
    console.log('  Balanced:', balanced ? '✅' : '❌', '| Dr:', totalDr.toFixed(2), 'Cr:', totalCr.toFixed(2));
    e.lines.forEach(l => console.log('    ' + (l.account?.code || '??') + ' ' + (l.account?.name || '??') + '  Dr:' + Number(l.debit).toFixed(2) + '  Cr:' + Number(l.credit).toFixed(2)));
  }

  // 4. Stock Movements
  if (job) {
    const movements = await db.stockMovement.findMany({
      where: { OR: [
        { reference: { contains: job.jobNumber } },
        { notes: { contains: job.jobNumber } }
      ] },
      include: { material: { select: { name: true, subCategory: true } } },
      orderBy: { createdAt: 'asc' }
    });
    console.log('\n--- STOCK MOVEMENTS ---');
    for (const m of movements) {
      console.log(m.material?.name.padEnd(20), m.material?.subCategory.padEnd(16), String(Number(m.quantity)).padStart(8), m.type);
    }
  }

  // 5. Invoices
  if (so.invoices?.length > 0) {
    console.log('\n--- INVOICES ---');
    for (const inv of so.invoices) {
      console.log(inv.invoiceNumber, '| Status:', inv.status, '| Total: ₦' + Number(inv.totalAmount).toLocaleString(), '| Paid: ₦' + Number(inv.amountPaid).toLocaleString());
      console.log('  Deposit Applied: ₦' + Number(inv.depositApplied).toLocaleString(), '| Prev Pymts: ₦' + Number(inv.previousPayments).toLocaleString(), '| Balance: ₦' + Number(inv.balanceDue).toLocaleString());
    }
  }

  console.log('\n========== AUDIT COMPLETE ==========\n');
  await db.$disconnect();
}

async function main() {
  if (orderNumber) {
    await auditOrder(orderNumber);
  } else {
    // Find latest order
    const latest = await db.salesOrder.findFirst({ orderBy: { createdAt: 'desc' }, select: { orderNumber: true } });
    if (latest) await auditOrder(latest.orderNumber);
    else console.log('No orders found');
  }
}
main().catch(e => { console.error(e); db.$disconnect(); });
