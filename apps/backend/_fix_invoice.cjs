const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

;(async () => {
  // Fix DRAFT invoices: their balanceDue should be total - amountPaid
  // (DRAFT means no direct payments yet, amountPaid only reflects deposits/previous applied at creation)
  const drafts = await p.invoice.findMany({
    where: { status: 'DRAFT' },
    select: { id: true, invoiceNumber: true, totalAmount: true, amountPaid: true, balanceDue: true }
  })

  let fixed = 0
  for (const inv of drafts) {
    const correctBalance = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid))
    if (Math.abs(Number(inv.balanceDue) - correctBalance) > 0.01) {
      console.log(`${inv.invoiceNumber}: bal ${Number(inv.balanceDue)} -> ${correctBalance}`)
      await p.invoice.update({
        where: { id: inv.id },
        data: { balanceDue: correctBalance }
      })
      fixed++
    }
  }

  console.log(`Fixed ${fixed} DRAFT invoices`)
  await p.$disconnect()
})()
