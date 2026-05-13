import { procurementRepository } from './repository'
import { PurchaseOrderInput, RollInput, ReceivePOInput, AddLineItemInput, UpdatePOInput } from './validation'
import { PurchaseOrder, Roll, SupplierInvoice, PaymentMade, SupplierInvoiceStatus } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { prisma } from '../../database'
import { inventoryService } from '../inventory/service'
import { financeService } from '../finance/service'
import { decomposeInclusive } from '../../lib/vat-utils'

const logger = createChildLogger('procurement:service')

async function generateSupplierInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await prisma.supplierInvoice.count({
    where: {
      invoiceNumber: { startsWith: `SI-${year}-` }
    }
  })
  return `SI-${year}-${String(count + 1).padStart(3, '0')}`
}

export const procurementService = {
  // Purchase Orders
  async getAllPOs(status?: string): Promise<PurchaseOrder[]> {
    return procurementRepository.findAllPOs({ status })
  },

  async getPOById(id: string): Promise<PurchaseOrder> {
    const po = await procurementRepository.findPOById(id)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    return po
  },

  async createPO(input: PurchaseOrderInput, userId?: string): Promise<PurchaseOrder> {
    const poNumber = await procurementRepository.generatePONumber()
    logger.info({ poNumber, supplier: input.supplier, items: input.items.length }, 'Creating purchase order with line items')
    
    const totalAmount = input.items.reduce((sum, item) => {
      return sum + (Number(item.totalWeight) * Number(item.unitPrice))
    }, 0)

    return procurementRepository.createPOWithItems({
      poNumber,
      supplier: input.supplier,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      notes: input.notes,
      createdById: userId,
      totalAmount,
      items: input.items.map(item => ({
        materialId: item.materialId,
        quantity: item.quantity,
        totalWeight: item.totalWeight,
        unitPrice: item.unitPrice,
        rollWeights: item.rollWeights || []
      }))
    })
  },

  async updatePO(id: string, input: UpdatePOInput): Promise<PurchaseOrder> {
    const existing = await procurementRepository.findPOById(id)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only edit pending purchase orders')
    }
    
    logger.info({ poId: id, updates: input }, 'Updating purchase order')
    return procurementRepository.updatePO(id, {
      supplier: input.supplier,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      notes: input.notes
    })
  },

  async addLineItem(poId: string, input: AddLineItemInput): Promise<PurchaseOrder> {
    const existing = await procurementRepository.findPOById(poId)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only edit pending purchase orders')
    }

    logger.info({ poId, materialId: input.materialId }, 'Adding line item to PO')
    await prisma.pOLineItem.create({
      data: {
        purchaseOrderId: poId,
        materialId: input.materialId,
        quantity: input.quantity,
        totalWeight: input.totalWeight,
        unitPrice: input.unitPrice,
        rollWeights: input.rollWeights || []
      }
    })

    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    return po
  },

  async removeLineItem(poId: string, lineItemId: string): Promise<PurchaseOrder> {
    const existing = await procurementRepository.findPOById(poId)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only edit pending purchase orders')
    }

    logger.info({ poId, lineItemId }, 'Removing line item from PO')
    await prisma.pOLineItem.delete({ where: { id: lineItemId } })

    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    return po
  },

  async deletePO(id: string): Promise<void> {
    const existing = await procurementRepository.findPOById(id)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only delete pending purchase orders')
    }
    
    logger.info({ poId: id }, 'Deleting purchase order')
    await procurementRepository.deletePO(id)
  },

  async receivePO(poId: string, userId?: string): Promise<{ po: PurchaseOrder; rolls: Roll[] }> {
    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (po.status === 'RECEIVED') throw new AppError(400, 'INVALID_OPERATION', 'PO already fully received')
    if (po.status === 'CANCELLED') throw new AppError(400, 'INVALID_OPERATION', 'PO is cancelled')

    logger.info({ poId, lineItems: po.items?.length }, 'Receiving purchase order - handling different category types')

    const allRolls: Roll[] = []

    for (const lineItem of po.items || []) {
      const material = await prisma.material.findUnique({ where: { id: lineItem.materialId } })
      if (!material) continue

      if (material.category === 'PLAIN_ROLLS') {
        const rollWeights = (lineItem.rollWeights as number[] || []).length > 0 
          ? lineItem.rollWeights as number[]
          : Array(lineItem.quantity).fill(Number(lineItem.totalWeight) / lineItem.quantity)

        const rolls = await procurementRepository.createRollsFromWeights(
          poId,
          lineItem.materialId,
          rollWeights
        )
        allRolls.push(...rolls)
      }

      await inventoryService.addStock(
        lineItem.materialId, 
        material.category === 'PACKAGING' ? lineItem.quantity : Number(lineItem.totalWeight), 
        `PO ${po.poNumber} received`, 
        poId
      )

      await procurementRepository.updateLineItemReceivedQty(lineItem.id, lineItem.quantity)
    }

    const updatedPO = await procurementRepository.updatePO(poId, {
      status: 'RECEIVED',
      receivedDate: new Date()
    })

    logger.info({ poId, rollsCreated: allRolls.length }, 'PO received successfully')
    return { po: updatedPO, rolls: allRolls }
  },

  // Rolls
  async getAllRolls(materialId?: string, status?: string): Promise<Roll[]> {
    return procurementRepository.findAllRolls({ materialId, status })
  },

  async getRollById(id: string): Promise<Roll> {
    const roll = await procurementRepository.findRollById(id)
    if (!roll) throw new AppError(404, 'NOT_FOUND', 'Roll not found')
    return roll
  },

  async createRoll(input: RollInput): Promise<Roll> {
    const rollNumber = await procurementRepository.generateRollNumber()
    logger.info({ rollNumber, materialId: input.materialId }, 'Creating roll')
    return procurementRepository.createRoll({
      rollNumber,
      materialId: input.materialId,
      purchaseOrderId: input.purchaseOrderId,
      weight: input.weight,
      width: input.width,
      length: input.length,
      coreSize: input.coreSize,
      notes: input.notes
    })
  },

  async createMultipleRolls(materialId: string, count: number, weights: number[], purchaseOrderId?: string): Promise<Roll[]> {
    const rolls = []
    for (let i = 0; i < count; i++) {
      const rollNumber = await procurementRepository.generateRollNumber()
      rolls.push({
        rollNumber,
        materialId,
        purchaseOrderId,
        weight: weights[i],
        notes: ''
      })
    }
    logger.info({ count, materialId }, 'Creating multiple rolls')
    return procurementRepository.createRolls(rolls)
  },

  // Supplier Invoices
  async getAllSupplierInvoices(status?: string): Promise<SupplierInvoice[]> {
    const where = status ? { status: status as SupplierInvoiceStatus } : {}
    const invoices = await prisma.supplierInvoice.findMany({
      where,
      include: {
        po: true,
        supplier: true,
        payments: true
      },
      orderBy: { date: 'desc' }
    })
    return invoices.map(inv => ({
      id: inv.id,
      poId: inv.poId,
      purchaseOrder: inv.po ? {
        id: inv.po.id,
        poNumber: inv.po.poNumber,
        supplier: inv.po.supplier,
        status: inv.po.status,
        totalAmount: Number(inv.po.totalAmount),
        createdAt: inv.po.createdAt,
        updatedAt: inv.po.updatedAt
      } : undefined,
      supplierId: inv.supplierId,
      supplier: inv.supplier ? {
        id: inv.supplier.id,
        name: inv.supplier.name
      } : undefined,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      amount: Number(inv.amount),
      status: inv.status,
      amountPaid: Number(inv.amountPaid),
      createdAt: inv.createdAt,
      payments: inv.payments?.map((p: any) => ({
        id: p.id,
        supplierInvoiceId: p.supplierInvoiceId,
        amount: Number(p.amount),
        date: p.date,
        reference: p.reference || undefined,
        notes: p.notes || undefined,
        createdAt: p.createdAt
      })) || []
    }))
  },

  async getSupplierInvoiceById(id: string): Promise<SupplierInvoice> {
    const inv = await prisma.supplierInvoice.findUnique({
      where: { id },
      include: {
        po: true,
        supplier: true,
        payments: true
      }
    })
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Supplier invoice not found')
    return {
      id: inv.id,
      poId: inv.poId,
      purchaseOrder: inv.po ? {
        id: inv.po.id,
        poNumber: inv.po.poNumber,
        supplier: inv.po.supplier,
        status: inv.po.status,
        totalAmount: Number(inv.po.totalAmount),
        createdAt: inv.po.createdAt,
        updatedAt: inv.po.updatedAt
      } : undefined,
      supplierId: inv.supplierId,
      supplier: inv.supplier ? {
        id: inv.supplier.id,
        name: inv.supplier.name
      } : undefined,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      amount: Number(inv.amount),
      status: inv.status,
      amountPaid: Number(inv.amountPaid),
      createdAt: inv.createdAt,
      payments: inv.payments?.map((p: any) => ({
        id: p.id,
        supplierInvoiceId: p.supplierInvoiceId,
        amount: Number(p.amount),
        date: p.date,
        reference: p.reference || undefined,
        notes: p.notes || undefined,
        createdAt: p.createdAt
      })) || []
    }
  },

  async createSupplierInvoice(poId: string, date: Date, amount: number, invoiceNumber?: string): Promise<SupplierInvoice> {
    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')

    const customer = await prisma.customer.findFirst({
      where: { name: po.supplier }
    })
    if (!customer) throw new AppError(400, 'INVALID_OPERATION', 'Supplier not found as customer in system')

    const finalInvoiceNumber = invoiceNumber || await generateSupplierInvoiceNumber()
    logger.info({ poId, invoiceNumber: finalInvoiceNumber, amount }, 'Creating supplier invoice')

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5
    const { exclusive: totalExclusive, vat: totalVat } = decomposeInclusive(amount, vatRate)

    let rawMaterialExclusive = totalExclusive
    let packagingExclusive = 0
    const poItems = po.items || []
    if (poItems.length > 0) {
      let rawTotal = 0
      let packagingTotal = 0
      for (const item of poItems) {
        const material = await prisma.material.findUnique({ where: { id: item.materialId } })
        const itemTotal = Number(item.totalWeight) * Number(item.unitPrice)
        if (material?.category === 'PACKAGING') {
          packagingTotal += itemTotal
        } else {
          rawTotal += itemTotal
        }
      }
      const grandTotal = rawTotal + packagingTotal
      if (grandTotal > 0) {
        rawMaterialExclusive = totalExclusive * (rawTotal / grandTotal)
        packagingExclusive = totalExclusive * (packagingTotal / grandTotal)
      }
    }

    const inv = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.supplierInvoice.create({
        data: {
          poId,
          supplierId: customer.id,
          invoiceNumber: finalInvoiceNumber,
          date: new Date(date),
          amount,
          status: 'PENDING',
          amountPaid: 0
        },
        include: {
          po: true,
          supplier: true,
          payments: true
        }
      })

      try {
        const rawMaterialAccountId = await financeService.getAccountIdByCode('1300')
        const packagingAccountId = await financeService.getAccountIdByCode('1510')
        const vatInputId = await financeService.getAccountIdByCode('1400')
        const apAccountId = await financeService.getAccountIdByCode('2000')

        const lines: { accountId: string; debit: number; credit: number; memo?: string }[] = []

        if (rawMaterialExclusive > 0) {
          lines.push({ accountId: rawMaterialAccountId, debit: rawMaterialExclusive, credit: 0, memo: 'Raw material inventory (excl. VAT)' })
        }
        if (packagingExclusive > 0) {
          lines.push({ accountId: packagingAccountId, debit: packagingExclusive, credit: 0, memo: 'Packaging inventory (excl. VAT)' })
        }
        if (totalVat > 0) {
          lines.push({ accountId: vatInputId, debit: totalVat, credit: 0, memo: 'Input VAT on purchase' })
        }
        lines.push({ accountId: apAccountId, debit: 0, credit: amount, memo: `Supplier invoice ${finalInvoiceNumber}` })

        await financeService.postJournalEntry({
          description: `Supplier Invoice ${finalInvoiceNumber} - ${po.supplier}`,
          sourceModule: 'PROCUREMENT',
          sourceId: createdInvoice.id,
          reference: finalInvoiceNumber,
          date: new Date(date),
          lines
        }, tx)
      } catch (financeErr) {
        logger.error({ err: financeErr }, 'Failed to post procurement journal entry - continuing')
      }

      return createdInvoice
    })

    return {
      id: inv.id,
      poId: inv.poId,
      purchaseOrder: inv.po ? {
        id: inv.po.id,
        poNumber: inv.po.poNumber,
        supplier: inv.po.supplier,
        status: inv.po.status,
        totalAmount: Number(inv.po.totalAmount),
        createdAt: inv.po.createdAt,
        updatedAt: inv.po.updatedAt
      } : undefined,
      supplierId: inv.supplierId,
      supplier: inv.supplier ? {
        id: inv.supplier.id,
        name: inv.supplier.name
      } : undefined,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      amount: Number(inv.amount),
      status: inv.status,
      amountPaid: Number(inv.amountPaid),
      createdAt: inv.createdAt,
      payments: []
    }
  },

  async addPayment(supplierInvoiceId: string, amount: number, date: Date, reference?: string, notes?: string): Promise<PaymentMade> {
    const inv = await prisma.supplierInvoice.findUnique({ where: { id: supplierInvoiceId } })
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Supplier invoice not found')

    const newAmountPaid = Number(inv.amountPaid) + amount
    const newStatus = newAmountPaid >= Number(inv.amount) ? 'PAID' : newAmountPaid > 0 ? 'PARTIAL' : 'PENDING'

    logger.info({ supplierInvoiceId, amount, newStatus }, 'Recording payment to supplier invoice')

    const payment = await prisma.paymentMade.create({
      data: {
        supplierInvoiceId,
        amount,
        date: new Date(date),
        reference,
        notes
      }
    })

    await prisma.supplierInvoice.update({
      where: { id: supplierInvoiceId },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus
      }
    })

    return {
      id: payment.id,
      supplierInvoiceId: payment.supplierInvoiceId,
      amount: Number(payment.amount),
      date: payment.date,
      reference: payment.reference || undefined,
      notes: payment.notes || undefined,
      createdAt: payment.createdAt
    }
  }
}
