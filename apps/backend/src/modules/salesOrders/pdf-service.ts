import path from 'path'
import { prisma } from '../../database'
import { salesOrderRepository } from './repository'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfmake = require('pdfmake')

function getFontPath(name: string): string {
  const pdfmakeDir = path.dirname(require.resolve('pdfmake/package.json'))
  return path.join(pdfmakeDir, 'fonts', 'Roboto', name)
}

pdfmake.fonts = {
  Roboto: {
    normal: getFontPath('Roboto-Regular.ttf'),
    bold: getFontPath('Roboto-Medium.ttf'),
    italics: getFontPath('Roboto-Italic.ttf'),
    bolditalics: getFontPath('Roboto-MediumItalic.ttf')
  }
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function generateInvoicePdf(invoiceId: string): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true, salesOrder: { include: { customer: true } }, payments: true }
  })

  if (!invoice) throw new Error('Invoice not found')

  const settings = await prisma.settings.findFirst()
  const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5
  const businessTin = settings?.businessTin || ''
  const businessAddress = settings?.businessAddress || ''
  const companyName = settings?.invoiceCompanyName || 'FLEXOPRINT NIGERIA LTD'
  const logoUrl = settings?.invoiceLogoUrl || ''
  const footerText = settings?.invoiceFooter || 'Thank you for your business!'

  const customerName = invoice.customer?.name || invoice.salesOrder?.customer?.name || 'N/A'
  let depositHeld = 0
  if (invoice.customerId) {
    try {
      const balance = await salesOrderRepository.getCustomerBalance(invoice.customerId)
      depositHeld = balance.depositHeld
    } catch { /* balance not available */ }
  }
  const rollExcl = Number(invoice.subtotal)
  const bagExcl = Number(invoice.packingBagsSubtotal || 0)
  const vatAmount = Number(invoice.vatAmount)
  const totalIncl = Number(invoice.totalAmount)
  const depositApplied = Number(invoice.depositApplied)
  const previousPayments = Number(invoice.previousPayments)
  const balanceDue = Number(invoice.balanceDue)
  const qtyDelivered = Number(invoice.quantityDelivered || 0)
  const bagQty = Number(invoice.packingBagsQuantity || 0)
  const unitPrice = Number(invoice.unitPrice || 0)
  const orderNumber = invoice.salesOrder?.orderNumber || invoice.salesOrderId || '—'

  const dateStr = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''
  const dueDateStr = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''

  const content: any[] = []

  if (logoUrl) {
    content.push({ image: logoUrl, width: 50, alignment: 'center', margin: [0, 0, 0, 4] })
  }
  content.push({ text: companyName, alignment: 'center', fontSize: 11, bold: true, margin: [0, 0, 0, 2] })
  if (businessAddress) content.push({ text: businessAddress, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 1] })
  if (businessTin) content.push({ text: `TIN: ${businessTin}`, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 2] })
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] })
  content.push({ text: 'INVOICE', alignment: 'center', fontSize: 12, bold: true, margin: [0, 0, 0, 2] })
  content.push({ text: invoice.invoiceNumber, alignment: 'center', fontSize: 9, margin: [0, 0, 0, 1] })
  content.push({ text: `Date: ${dateStr}`, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 1] })
  if (dueDateStr) content.push({ text: `Due: ${dueDateStr}`, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 1] })
  content.push({ text: `Status: ${invoice.status.replace(/_/g, ' ')}`, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 2] })
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] })
  content.push({ text: `Customer:  ${customerName}`, fontSize: 8, margin: [0, 0, 0, 2] })
  content.push({ text: `Order:     ${orderNumber}`, fontSize: 8, margin: [0, 0, 0, 4] })
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 2] })

  // Items header
  content.push({
    columns: [
      { text: 'Item', fontSize: 7, bold: true, color: '#475569' },
      { text: 'Qty', fontSize: 7, bold: true, color: '#475569', alignment: 'right', width: 50 },
      { text: 'Amount', fontSize: 7, bold: true, color: '#475569', alignment: 'right', width: 80 }
    ],
    margin: [0, 2, 0, 1]
  })

  // Printed rolls line
  content.push({
    columns: [
      { text: 'Printed Rolls', fontSize: 8 },
      { text: `${qtyDelivered.toFixed(1)} kg`, fontSize: 8, alignment: 'right', width: 50 },
      { text: formatNaira(rollExcl), fontSize: 8, alignment: 'right', width: 80 }
    ],
    margin: [0, 1, 0, 1]
  })

  // Packing bags line
  if (bagQty > 0) {
    content.push({
      columns: [
        { text: 'Packing Bags', fontSize: 8 },
        { text: `${bagQty} pcs`, fontSize: 8, alignment: 'right', width: 50 },
        { text: formatNaira(bagExcl), fontSize: 8, alignment: 'right', width: 80 }
      ],
      margin: [0, 1, 0, 1]
    })
  }

  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 2] })

  // Totals
  const addRow = (label: string, value: string, opts?: { bold?: boolean; color?: string }) => {
    content.push({
      columns: [
        { text: label, fontSize: 8, color: opts?.color || '#334155', bold: opts?.bold || false },
        { text: value, fontSize: 8, color: opts?.color || '#0f172a', bold: opts?.bold || false, alignment: 'right', width: 130 }
      ],
      margin: [0, 1, 0, 1]
    })
  }

  addRow('Subtotal (excl. VAT)', formatNaira(rollExcl + bagExcl))
  if (vatAmount > 0) addRow(`VAT (${vatRate}%)`, formatNaira(vatAmount))
  addRow('Total (incl. VAT)', formatNaira(totalIncl), { bold: true })
  if (depositApplied > 0) addRow('Deposit Applied', `-${formatNaira(depositApplied)}`, { color: '#dc2626' })
  if (previousPayments > 0) addRow('Previous Payments', `-${formatNaira(previousPayments)}`, { color: '#dc2626' })

  if (balanceDue > 0) {
    addRow('Balance Due', formatNaira(balanceDue), { bold: true, color: '#dc2626' })
  } else {
    addRow('Amount Paid', formatNaira(totalIncl - balanceDue), { bold: true, color: '#16a34a' })
  }

  // Customer deposit
  if (invoice.customerId) {
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] })
    content.push({ text: `Customer Deposit: ${formatNaira(depositHeld)}`, alignment: 'center', fontSize: 8, bold: true, color: '#1d4ed8', margin: [0, 0, 0, 2] })
  }

  if (invoice.status === 'PAID') {
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] })
    content.push({
      alignment: 'center',
      columns: [
        { text: '', width: '*', fontSize: 8 },
        { text: '✓ PAID', color: '#16a34a', bold: true, fontSize: 10, alignment: 'center', width: 80 },
        { text: '', width: '*', fontSize: 8 }
      ],
      margin: [0, 2, 0, 2]
    })
    if (invoice.paidAt) {
      const paidDateStr = new Date(invoice.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      content.push({ text: `Paid on: ${paidDateStr}`, alignment: 'center', fontSize: 7, color: '#16a34a', margin: [0, 0, 0, 2] })
    }
  }

  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] })
  content.push({ text: footerText, alignment: 'center', fontSize: 7, margin: [0, 4, 0, 0] })

  const docDefinition: any = {
    pageSize: { width: 280, height: 'auto' },
    pageMargins: [10, 10, 10, 10],
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#000000' },
    content,
    ...(invoice.status === 'PAID' ? {
      watermark: {
        text: 'PAID',
        color: '#16a34a',
        opacity: 0.2,
        bold: true,
        font: 'Roboto',
        fontSize: 60,
        angle: -30
      }
    } : {})
  }

  const outputDoc = pdfmake.createPdf(docDefinition)
  return outputDoc.getBuffer()
}

export async function generateReceiptPdf(receiptId: string): Promise<Buffer> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      paymentTransaction: {
        include: { customer: true, salesOrder: true }
      },
      generatedBy: { select: { username: true } }
    }
  })

  if (!receipt) throw new Error('Receipt not found')

  const settings = await prisma.settings.findFirst()
  const companyName = settings?.receiptCompanyName || settings?.invoiceCompanyName || 'FLEXOPRINT NIGERIA LTD'
  const businessAddress = settings?.businessAddress || ''
  const businessTin = settings?.businessTin || ''
  const footerText = settings?.receiptFooter || settings?.invoiceFooter || 'Thank you for your business!'
  const logoUrl = settings?.receiptLogoUrl || settings?.invoiceLogoUrl || ''

  const dateStr = new Date(receipt.generatedAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
  const timeStr = new Date(receipt.generatedAt).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  })
  const payMethod = receipt.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'Cash'
  const orderNumber = receipt.paymentTransaction.salesOrder?.orderNumber || '—'
  const amount = Number(receipt.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })

  const docDefinition: any = {
    pageSize: { width: 280, height: 'auto' },
    pageMargins: [10, 10, 10, 10],
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#000000' },
    content: [
      ...(logoUrl
        ? [{ image: logoUrl, width: 50, alignment: 'center', margin: [0, 0, 0, 4] }]
        : []),
      { text: companyName, alignment: 'center', fontSize: 11, bold: true, margin: [0, 0, 0, 2] },
      ...(businessAddress ? [{ text: businessAddress, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 1] }] : []),
      ...(businessTin ? [{ text: `TIN: ${businessTin}`, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 2] }] : []),
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] },
      { text: 'RECEIPT', alignment: 'center', fontSize: 12, bold: true, margin: [0, 0, 0, 2] },
      { text: receipt.receiptNumber, alignment: 'center', fontSize: 9, margin: [0, 0, 0, 1] },
      { text: `${dateStr}  ${timeStr}`, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 2] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] },
      { text: `Customer:  ${receipt.customerName}`, fontSize: 8, margin: [0, 0, 0, 2] },
      { text: `Order:     ${orderNumber}`, fontSize: 8, margin: [0, 0, 0, 2] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] },
      { text: `Payment:   ${receipt.paymentTransaction.transactionType.replace(/_/g, ' ')}`, fontSize: 8, margin: [0, 0, 0, 2] },
      { text: `Method:    ${payMethod}`, fontSize: 8, margin: [0, 0, 0, 2] },
      { text: `Amount:    ₦${amount}`, fontSize: 8, bold: true, margin: [0, 0, 0, 2] },
      ...(receipt.referenceNumber
        ? [{ text: `Ref:       ${receipt.referenceNumber}`, fontSize: 7, margin: [0, 0, 0, 2] }]
        : []),
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] },
      { text: footerText, alignment: 'center', fontSize: 7, margin: [0, 8, 0, 0] },
      { text: `Printed by: ${receipt.generatedBy?.username || ''}`, alignment: 'center', fontSize: 6, margin: [0, 4, 0, 0] }
    ]
  }

  const outputDoc = pdfmake.createPdf(docDefinition)
  return outputDoc.getBuffer()
}
