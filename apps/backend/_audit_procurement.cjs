const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

;(async () => {
  const poNumber = process.argv[2] || 'PO-202607-0001'
  
  const po = await p.purchaseOrder.findUnique({ where: { poNumber }, include: { items: { include: { material: true } }, rolls: { include: { material: true } } } })
  if (!po) { console.log('PO not found'); process.exit(1) }

  console.log('=== PURCHASE ORDER ===')
  console.log('poNumber:', po.poNumber)
  console.log('supplier:', po.supplier)
  console.log('status:', po.status)
  console.log('createdAt:', po.createdAt)
  console.log('receivedDate:', po.receivedDate)
  console.log('expectedDate:', po.expectedDate)

  // Supplier Invoices
  const invs = await p.supplierInvoice.findMany({ where: { poId: po.id }, include: { payments: true } })
  console.log('\n=== SUPPLIER INVOICES ===')
  for (const inv of invs) {
    console.log(`  ${inv.invoiceNumber} | date: ${inv.date} | amount: ${inv.amount} | status: ${inv.status} | createdAt: ${inv.createdAt}`)
    for (const pay of inv.payments || []) {
      console.log(`    Payment: ${pay.id} | date: ${pay.date} | amount: ${pay.amount} | reference: ${pay.reference || 'N/A'}`)
    }
  }

  // Journal Entries linked to PO or supplier invoice
  const jes = await p.journalEntry.findMany({ where: { OR: [{ sourceId: po.id }, { reference: po.poNumber }] }, include: { lines: { include: { account: true } } } })
  
  // Also find JEs linked to supplier invoices
  for (const inv of invs) {
    const invJes = await p.journalEntry.findMany({ where: { OR: [{ sourceId: inv.id }, { reference: inv.invoiceNumber }] }, include: { lines: { include: { account: true } } } })
    jes.push(...invJes)
  }

  console.log('\n=== JOURNAL ENTRIES ===')
  for (const je of jes) {
    console.log(`\n  ${je.entryNumber} | ref: ${je.reference || 'N/A'}`)
    console.log(`  description: ${je.description}`)
    console.log(`  date: ${je.date}`)
    console.log(`  postedAt: ${je.postedAt}`)
    const d = new Date(je.date)
    const p = new Date(je.postedAt)
    const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const pStr = `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-${String(p.getDate()).padStart(2,'0')}`
    console.log(`  date(iso): ${dStr}`)
    console.log(`  postedAt(iso): ${pStr}`)
    for (const line of je.lines) {
      console.log(`    ${line.account?.code || 'N/A'} ${line.account?.name || 'N/A'} | Dr:${line.debit} Cr:${line.credit}`)
    }
  }

  await p.$disconnect()
})()
