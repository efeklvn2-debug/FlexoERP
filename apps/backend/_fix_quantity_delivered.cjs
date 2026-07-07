/**
 * Corrective script: updates salesOrder.quantityDelivered to match
 * the sum of invoice quantities where they diverged.
 *
 * Only fixes cases where quantityDelivered < invoiceSum (the direction
 * of the createInvoice overwrite bug). Cases where quantityDelivered >
 * invoiceSum are legitimate differences (e.g. un-invoiced deliveries).
 *
 * Root cause: createInvoice() at line 643-644 unconditionally
 * overwrote quantityDelivered with the single-pickup amount instead
 * of preserving the cumulative total set by recordPickup.
 *
 * Usage: node _fix_quantity_delivered.cjs
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.salesOrder.findMany({
    where: { isDeleted: false },
    include: {
      invoices: { select: { quantityDelivered: true, invoiceNumber: true } }
    },
    orderBy: { orderNumber: 'asc' }
  })

  let fixed = 0
  let skipped = 0
  let ignored = 0

  for (const o of orders) {
    const currentDeliv = Number(o.quantityDelivered)
    const invSum = o.invoices.reduce((s, i) => s + Number(i.quantityDelivered), 0)
    if (o.invoices.length > 0 && Math.abs(invSum - currentDeliv) > 0.01) {
      if (invSum > currentDeliv) {
        // Bug direction: createInvoice overwrote a HIGHER cumulative total
        // with a LOWER pickup amount. Restore to invoice sum.
        console.log('FIX: ' + o.orderNumber + ': ' + currentDeliv + ' -> ' + invSum + ' (invoices: ' + o.invoices.map(i => i.invoiceNumber + '=' + Number(i.quantityDelivered)).join(', ') + ')')
        await prisma.salesOrder.update({
          where: { id: o.id },
          data: { quantityDelivered: invSum }
        })
        fixed++
      } else {
        // Legitimate difference: delivery > invoices (e.g. un-invoiced deliveries)
        console.log('SKIP: ' + o.orderNumber + ': delivered=' + currentDeliv + ' > invoices=' + invSum + ' (legitimate)')
        ignored++
      }
    } else {
      skipped++
    }
  }

  console.log('\nDone. Fixed: ' + fixed + ', Skipped (correct): ' + skipped + ', Ignored (delivery > invoice): ' + ignored)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
