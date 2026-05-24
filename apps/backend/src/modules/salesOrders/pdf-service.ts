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

  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5
  const businessTin = settings?.businessTin || ''
  const businessAddress = settings?.businessAddress || ''
  const companyName = settings?.invoiceCompanyName || 'FLEXOPRINT NIGERIA LTD'
  const logoUrl = settings?.invoiceLogoUrl || ''
  const primaryColor = settings?.invoicePrimaryColor || '#1e3a5f'
  const accentColor = settings?.invoiceAccentColor || '#dc2626'
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

  const lineItems: any[] = [
    [
      { text: 'Printed Rolls', style: 'itemName' },
      { text: `${Number(invoice.quantityDelivered || 0).toFixed(1)} kg`, alignment: 'right' },
      { text: formatNaira(rollExcl), alignment: 'right' }
    ]
  ]
  if (Number(invoice.packingBagsQuantity) > 0) {
    lineItems.push([
      { text: 'Packing Bags', style: 'itemName' },
      { text: `${invoice.packingBagsQuantity} pcs`, alignment: 'right' },
      { text: formatNaira(bagExcl), alignment: 'right' }
    ])
  }

  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1e293b' },
    content: [
      {
        columns: [
          {
            width: '60%',
            stack: (() => {
              const items: any[] = []
              if (logoUrl) {
                items.push({ image: logoUrl, width: 60, margin: [0, 0, 0, 4] })
              }
              items.push({ text: companyName, style: 'companyName' })
              if (businessAddress) items.push({ text: businessAddress, style: 'address', margin: [0, 2, 0, 0] })
              if (businessTin) items.push({ text: `TIN: ${businessTin}`, style: 'tin', margin: [0, 2, 0, 0] })
              return items
            })()
          },
          {
            width: '40%',
            alignment: 'right',
            stack: (() => {
              const items: any[] = [
                { text: 'INVOICE', style: 'headerTitle' },
                { text: invoice.invoiceNumber, style: 'invoiceNumber', margin: [0, 2, 0, 0] },
                { text: `Date: ${invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}`, style: 'fieldValue', margin: [0, 2, 0, 0] }
              ]
              if (invoice.dueDate) {
                items.push({ text: `Due: ${new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, style: 'fieldValue', margin: [0, 2, 0, 0] })
              }
              return items
            })()
          }
        ]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#cbd5e1' }], margin: [0, 12, 0, 0] },
      { text: 'Bill To', style: 'sectionLabel', margin: [0, 16, 0, 0] },
      { text: customerName, style: 'fieldValue', margin: [0, 2, 0, 0] },
      { text: 'Order Details', style: 'sectionLabel', margin: [0, 16, 0, 0] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 80, 100],
          body: [
            [
              { text: 'Item', style: 'tableHeader', alignment: 'left' },
              { text: 'Quantity', style: 'tableHeader', alignment: 'right' },
              { text: 'Amount (excl. VAT)', style: 'tableHeader', alignment: 'right' }
            ],
            ...lineItems
          ]
        },
        layout: {
          hLineWidth: (i: number) => (i === 0 || i === 1) ? 1 : 0.5,
          vLineWidth: () => 0,
          hLineColor: (i: number) => i === 1 ? '#1e293b' : '#e2e8f0',
          paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 6, paddingBottom: () => 6
        },
        margin: [0, 4, 0, 0]
      },
      {
        table: {
          widths: ['*', 100],
          body: [
            [{ text: 'Subtotal (excl. VAT)', alignment: 'right', style: 'totalLabel' }, { text: formatNaira(rollExcl + bagExcl), alignment: 'right', style: 'totalValue' }],
            ...(vatAmount > 0 ? [[{ text: `VAT (${vatRate}%)`, alignment: 'right', style: 'totalLabel' }, { text: formatNaira(vatAmount), alignment: 'right', style: 'totalValue' }]] : []),
            [{ text: 'Total (incl. VAT)', alignment: 'right', style: 'grandTotalLabel' }, { text: formatNaira(totalIncl), alignment: 'right', style: 'grandTotalValue' }],
            ...(depositApplied > 0 ? [[{ text: 'Deposit Applied', alignment: 'right', style: 'totalLabel' }, { text: `-${formatNaira(depositApplied)}`, alignment: 'right', style: 'deductionValue' }]] : []),
            ...(previousPayments > 0 ? [[{ text: 'Previous Payments', alignment: 'right', style: 'totalLabel' }, { text: `-${formatNaira(previousPayments)}`, alignment: 'right', style: 'deductionValue' }]] : []),
            ...(balanceDue > 0
              ? [[{ text: 'Balance Due', alignment: 'right', style: 'balanceDueLabel' }, { text: formatNaira(balanceDue), alignment: 'right', style: 'balanceDueValue' }]]
              : [[{ text: 'Amount Paid', alignment: 'right', style: 'balanceDueLabel' }, { text: formatNaira(totalIncl - balanceDue), alignment: 'right', style: 'grandTotalValue' }]]
            )
          ]
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3
        },
        margin: [0, 8, 0, 0]
      },
      ...(invoice.customerId
        ? [{
            table: {
              widths: ['*'],
              body: [
                [{ text: `Customer Deposit Balance: ${formatNaira(depositHeld)}`, alignment: 'center', style: 'depositCallout' }]
              ]
            },
            layout: {
              hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 2 : 0,
              vLineWidth: () => 2,
              hLineColor: () => '#3b82f6',
              vLineColor: () => '#3b82f6',
              fillColor: () => '#eff6ff',
              paddingLeft: () => 10,
              paddingRight: () => 10,
              paddingTop: () => 8,
              paddingBottom: () => 8
            },
            margin: [0, 12, 0, 0]
          }]
        : []),
      { text: footerText, style: 'footer', margin: [0, 24, 0, 0] }
    ],
    styles: {
      companyName: { fontSize: 14, bold: true, color: primaryColor },
      address: { fontSize: 8, color: '#64748b' },
      tin: { fontSize: 8, color: '#64748b' },
      headerTitle: { fontSize: 16, bold: true, color: primaryColor },
      invoiceNumber: { fontSize: 11, bold: true, color: '#0f172a' },
      fieldValue: { fontSize: 10, color: '#334155' },
      sectionLabel: { fontSize: 9, bold: true, color: '#64748b', margin: [0, 0, 0, 2] },
      tableHeader: { fontSize: 8, bold: true, color: '#475569', fillColor: '#f1f5f9' },
      itemName: { fontSize: 9, color: '#1e293b' },
      totalLabel: { fontSize: 9, color: '#475569' },
      totalValue: { fontSize: 9, color: '#1e293b' },
      grandTotalLabel: { fontSize: 10, bold: true, color: '#0f172a' },
      grandTotalValue: { fontSize: 10, bold: true, color: '#0f172a' },
      deductionValue: { fontSize: 9, color: accentColor },
      balanceDueLabel: { fontSize: 10, bold: true, color: accentColor },
      balanceDueValue: { fontSize: 10, bold: true, color: accentColor },
      depositCallout: { fontSize: 11, bold: true, color: '#1d4ed8' },
      footer: { fontSize: 9, color: '#94a3b8', alignment: 'center' }
    }
  }

  const outputDoc = pdfmake.createPdf(docDefinition)
  return outputDoc.getBuffer()
}
