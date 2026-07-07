const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

;(async () => {
  const orderNumber = process.argv[2]
  if (!orderNumber) { console.log('Usage: node _audit_dates.cjs SO-YYYY-NNNN'); process.exit(1) }

  const so = await p.salesOrder.findUnique({ where: { orderNumber } })
  if (!so) { console.log('Order not found'); process.exit(1) }

  console.log('=== SALES ORDER ===')
  console.log('createdAt:  ', so.createdAt)
  console.log('approvedAt: ', so.approvedAt)
  console.log('completedAt:', so.completedAt)

  const job = await p.productionJob.findFirst({ where: { salesOrderId: so.id } })
  if (job) {
    console.log('\n=== PRODUCTION JOB ===')
    console.log('createdAt: ', job.createdAt)
    console.log('startDate: ', job.startDate)
    console.log('endDate:   ', job.endDate)
    const rolls = await p.printedRoll.findMany({ where: { productionJobId: job.id }, include: { roll: true } })
    console.log('\n=== PRINTED ROLLS ===')
    for (const r of rolls) {
      console.log(`  ${r.roll?.rollNumber || 'N/A'} | createdAt: ${r.createdAt}`)
    }
  }

  const inv = await p.invoice.findFirst({ where: { salesOrderId: so.id } })
  if (inv) {
    console.log('\n=== INVOICE ===')
    console.log('createdAt:', inv.createdAt)
    console.log('issuedAt: ', inv.issuedAt)
    console.log('paidAt:   ', inv.paidAt)
  }

  const payments = await p.paymentTransaction.findMany({ where: { salesOrderId: so.id } })
  console.log('\n=== PAYMENTS ===')
  for (const pay of payments) {
    console.log(`  ${pay.referenceNumber || 'N/A'} | receivedAt: ${pay.receivedAt} | createdAt: ${pay.createdAt}`)
  }

  const jes = await p.journalEntry.findMany({ where: { OR: [{ sourceId: so.id }, { sourceId: job?.id }] } })
  console.log('\n=== JOURNAL ENTRIES (date vs createdAt) ===')
  for (const je of jes) {
    console.log(`  ${je.reference || je.id} | date: ${je.date} | createdAt: ${je.createdAt} | postedAt: ${je.postedAt}`)
  }

  await p.$disconnect()
})()
