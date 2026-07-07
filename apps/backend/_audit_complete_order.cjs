/**
 * Audit: completeOrder + per-pickup-invoice edge cases.
 * Scans orders in PICKED_UP status with partial delivery,
 * checks invoice counts, deposit application consistency.
 * 
 * Usage: node _audit_complete_order.cjs
 * (read-only, no mutations)
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // ── 1. Find all PICKED_UP orders with partial delivery ──
  const orders = await prisma.salesOrder.findMany({
    where: {
      status: 'PICKED_UP',
      isDeleted: false,
      completedAt: null,
    },
    include: {
      customer: { select: { name: true } },
      invoices: { select: { id: true, invoiceNumber: true, quantityDelivered: true, totalAmount: true, depositApplied: true, balanceDue: true, status: true } },
    },
    orderBy: { orderNumber: 'asc' },
  })

  console.log('=== PICKED_UP orders NOT yet completed ===')
  console.log(`Found ${orders.length} orders\n`)

  let anomalies = 0

  for (const order of orders) {
    const qtyOrdered = Number(order.quantityOrdered)
    const qtyDelivered = Number(order.quantityDelivered)
    const partial = qtyDelivered < qtyOrdered
    const invoiceCount = order.invoices.length
    const invoiceTotalQty = order.invoices.reduce((s, inv) => s + Number(inv.quantityDelivered), 0)
    const invoiceTotalAmount = order.invoices.reduce((s, inv) => s + Number(inv.totalAmount), 0)

    console.log(`\n── ${order.orderNumber} ──`)
    console.log(`  Customer: ${order.customer?.name || 'N/A'}`)
    console.log(`  Ordered: ${qtyOrdered} kg  |  Delivered: ${qtyDelivered} kg  |  Partial: ${partial ? 'YES' : 'NO'}`)
    console.log(`  Invoices: ${invoiceCount}`)

    if (invoiceCount > 0) {
      console.log(`  Invoice total qty: ${invoiceTotalQty} kg  |  Invoice total amount: ₦${invoiceTotalAmount.toLocaleString()}`)
      for (const inv of order.invoices) {
        console.log(`    ${inv.invoiceNumber}: qty=${Number(inv.quantityDelivered)}kg, total=₦${Number(inv.totalAmount).toLocaleString()}, depositApplied=₦${Number(inv.depositApplied)}, balanceDue=₦${Number(inv.balanceDue).toLocaleString()}, status=${inv.status}`)
      }

      // Anomaly: invoice qty doesn't match delivered
      if (Math.abs(invoiceTotalQty - qtyDelivered) > 0.01) {
        console.log(`  ⚠️ ANOMALY: Invoice quantities (${invoiceTotalQty}) ≠ delivered (${qtyDelivered})`)
        anomalies++
      }

      // Anomaly: duplicate-like invoices (same qty in same order)
      const qtyCounts = {}
      for (const inv of order.invoices) {
        const q = Number(inv.quantityDelivered)
        qtyCounts[q] = (qtyCounts[q] || 0) + 1
      }
      for (const [q, count] of Object.entries(qtyCounts)) {
        if (count > 1) {
          console.log(`  ⚠️ ANOMALY: ${count} invoices with same quantity (${q} kg) — possible duplicates`)
          anomalies++
        }
      }
    } else {
      console.log(`  ⚠️ ANOMALY: Partial delivery (${qtyDelivered}/${qtyOrdered} kg) but NO invoices`)
      anomalies++
    }

    // What completeOrder WOULD do
    if (partial) {
      if (invoiceCount === 0) {
        console.log(`  → completeOrder WILL create invoice for ${qtyDelivered} kg (no existing invoices)`)
      } else {
        console.log(`  → completeOrder will SKIP invoice creation (${invoiceCount} invoice(s) already exist)`)
      }
    } else {
      console.log(`  → Not partial — completeOrder would not be called`)
    }
  }

  // ── 2. Edge case: fully delivered orders with multiple invoices ──
  const fullOrders = await prisma.salesOrder.findMany({
    where: {
      status: 'PICKED_UP',
      isDeleted: false,
      completedAt: null,
      quantityDelivered: { gte: prisma.salesOrder.fields.quantityOrdered },
    },
    include: {
      invoices: { select: { id: true, invoiceNumber: true, quantityDelivered: true } },
    },
    orderBy: { orderNumber: 'asc' },
    take: 10,
  })

  console.log('\n\n=== Fully delivered PICKED_UP orders (no completeOrder needed) ===')
  for (const order of fullOrders) {
    const qtyDelivered = Number(order.quantityDelivered)
    const qtyOrdered = Number(order.quantityOrdered)
    const invCount = order.invoices.length
    const invQtySum = order.invoices.reduce((s, inv) => s + Number(inv.quantityDelivered), 0)
    const multiple = invCount > 1
    console.log(`  ${order.orderNumber}: delivered=${qtyDelivered}/${qtyOrdered} kg, invoices=${invCount}, invQtySum=${invQtySum} ${multiple ? '⚠️ MULTIPLE INVOICES' : ''}`)
    if (multiple) {
      for (const inv of order.invoices) {
        console.log(`    ${inv.invoiceNumber}: qty=${Number(inv.quantityDelivered)} kg`)
      }
      anomalies++
    }
  }

  console.log(`\n\n=== SUMMARY ===`)
  console.log(`Anomalies found: ${anomalies}`)
  if (anomalies === 0) {
    console.log('✅ All orders pass integrity checks')
  } else {
    console.log(`⚠️ ${anomalies} issue(s) need attention`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
