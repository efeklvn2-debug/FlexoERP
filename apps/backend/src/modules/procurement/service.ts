import { procurementRepository, convertPO } from './repository'
import { PurchaseOrderInput, RollInput, ReceivePOInput, AddLineItemInput, UpdatePOInput } from './validation'
import { PurchaseOrder, Roll, SupplierInvoice, PaymentMade, SupplierInvoiceStatus } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { prisma } from '../../database'
import { inventoryService } from '../inventory/service'
import { financeService } from '../finance/service'
import { decomposeInclusive } from '../../lib/vat-utils'
import { dateFromInput } from '../../utils/dates'
import { supplierService } from '../suppliers/service'

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
  async getAllPOs(status?: string, excludeInvoiced?: boolean): Promise<PurchaseOrder[]> {
    return procurementRepository.findAllPOs({ status, excludeInvoiced })
  },

  async getPOById(id: string): Promise<PurchaseOrder> {
    const po = await procurementRepository.findPOById(id)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    return po
  },

  async createPO(input: PurchaseOrderInput, userId?: string): Promise<PurchaseOrder> {
    const totalAmount = input.items.reduce((sum, item) => {
      return sum + (Number(item.totalWeight) * Number(item.unitPrice))
    }, 0)

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const poNumber = await procurementRepository.generatePONumber()
        logger.info({ poNumber, supplier: input.supplier, items: input.items.length }, 'Creating purchase order with line items')

        return await procurementRepository.createPOWithItems({
          poNumber,
          supplier: input.supplier,
          expectedDate: input.expectedDate ? dateFromInput(input.expectedDate) : undefined,
          issuedDate: input.issuedDate ? dateFromInput(input.issuedDate) : undefined,
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
      } catch (error: any) {
        if (error?.code === 'P2002' && attempt < 3) {
          logger.warn({ attempt }, 'PO number collision, retrying...')
          continue
        }
        throw error
      }
    }
    throw new AppError(500, 'PO_CREATION_FAILED', 'Failed to create PO after multiple attempts')
  },

  async updatePO(id: string, input: UpdatePOInput): Promise<PurchaseOrder> {
    const existing = await procurementRepository.findPOById(id)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only edit pending purchase orders')
    }

    if (input.items) {
      const totalAmount = input.items.reduce((sum, item) => {
        return sum + (Number(item.totalWeight) * Number(item.unitPrice))
      }, 0)

      return prisma.$transaction(async (tx) => {
        await tx.pOLineItem.deleteMany({ where: { purchaseOrderId: id } })
        for (const item of input.items!) {
          await tx.pOLineItem.create({
            data: {
              purchaseOrderId: id,
              materialId: item.materialId,
              quantity: item.quantity,
              totalWeight: item.totalWeight,
              unitPrice: item.unitPrice,
              rollWeights: item.rollWeights || []
            }
          })
        }
        const updated = await tx.purchaseOrder.update({
          where: { id },
          data: {
            supplier: input.supplier,
            expectedDate: input.expectedDate ? dateFromInput(input.expectedDate) : undefined,
            notes: input.notes,
            totalAmount
          },
          include: { rolls: { include: { material: true } }, items: { include: { material: true } } }
        })
        return convertPO(updated)
      })
    }

    logger.info({ poId: id, updates: input }, 'Updating purchase order')
    return procurementRepository.updatePO(id, {
      supplier: input.supplier,
      expectedDate: input.expectedDate ? dateFromInput(input.expectedDate) : undefined,
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
    const deleted = await prisma.purchaseOrder.deleteMany({
      where: { id, status: 'PENDING' }
    })
    if (deleted.count === 0) {
      const existing = await procurementRepository.findPOById(id)
      if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
      throw new AppError(400, 'INVALID_OPERATION', 'Can only delete pending purchase orders')
    }
    logger.info({ poId: id }, 'Purchase order deleted')
  },

  async receivePO(poId: string, userId?: string, date?: string): Promise<{ po: PurchaseOrder; rolls: Roll[] }> {
    return prisma.$transaction(async (tx) => {
      // Lock the PO row to serialize concurrent receives
      await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${poId} FOR UPDATE`

      const poData = await tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: { rolls: { include: { material: true } }, items: { include: { material: true } } }
      })
      const po = poData ? convertPO(poData) : null
      if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
      if (po.status === 'RECEIVED') throw new AppError(400, 'INVALID_OPERATION', 'PO already fully received')
      if (po.status === 'CANCELLED') throw new AppError(400, 'INVALID_OPERATION', 'PO is cancelled')

      logger.info({ poId, lineItems: po.items?.length }, 'Receiving purchase order - handling different category types')

      const allRolls: Roll[] = []

      for (const lineItem of po.items || []) {
        const material = await tx.material.findUnique({ where: { id: lineItem.materialId } })
        if (!material) continue

        if (material.category === 'PLAIN_ROLLS') {
          const rollWeights = (lineItem.rollWeights as number[] || []).length > 0 
            ? lineItem.rollWeights as number[]
            : Array(lineItem.quantity).fill(Number(lineItem.totalWeight) / lineItem.quantity)

          const rolls = await procurementRepository.createRollsFromWeights(
            poId,
            lineItem.materialId,
            rollWeights,
            date ? dateFromInput(date) : undefined,
            tx
          )
          allRolls.push(...rolls)
        }

        await inventoryService.addStock(
          lineItem.materialId, 
          material.category === 'PACKAGING' ? lineItem.quantity : Number(lineItem.totalWeight), 
          `PO ${po.poNumber} received`, 
          poId,
          userId,
          tx
        )

        await tx.pOLineItem.update({
          where: { id: lineItem.id },
          data: { receivedQty: { increment: lineItem.quantity } }
        })
      }

      const updatedPO = await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: 'RECEIVED', receivedDate: dateFromInput(date) },
        include: { rolls: { include: { material: true } }, items: { include: { material: true } } }
      })

      logger.info({ poId, rollsCreated: allRolls.length }, 'PO received successfully')
      return { po: convertPO(updatedPO), rolls: allRolls }
    })
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
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const rollNumber = await procurementRepository.generateRollNumber()
        logger.info({ rollNumber, materialId: input.materialId }, 'Creating roll')
        return await procurementRepository.createRoll({
          rollNumber,
          materialId: input.materialId,
          purchaseOrderId: input.purchaseOrderId,
          weight: input.weight,
          width: input.width,
          length: input.length,
          coreSize: input.coreSize,
          notes: input.notes
        })
      } catch (error: any) {
        if (error?.code === 'P2002' && attempt < 3) {
          logger.warn({ attempt }, 'Roll number collision, retrying...')
          continue
        }
        throw error
      }
    }
    throw new AppError(500, 'ROLL_CREATION_FAILED', 'Failed to create roll after multiple attempts')
  },

  async createMultipleRolls(materialId: string, count: number, weights: number[], purchaseOrderId?: string): Promise<Roll[]> {
    logger.info({ count, materialId }, 'Creating multiple rolls')

    return prisma.$transaction(async (tx) => {
      const today = new Date()
      const prefix = `RL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-`
      const lastRoll = await tx.roll.findFirst({
        where: { rollNumber: { startsWith: prefix } },
        orderBy: { rollNumber: 'desc' }
      })
      let startNumber = lastRoll ? parseInt(lastRoll.rollNumber.replace(prefix, '')) : 0

      const rollData: Array<{
        rollNumber: string; materialId: string; purchaseOrderId?: string;
        weight: number; remainingWeight: number; status: any;
        receivedDate: Date; notes: string
      }> = []

      for (let i = 0; i < count; i++) {
        startNumber++
        const rollNumber = `${prefix}${String(startNumber).padStart(4, '0')}`
        rollData.push({
          rollNumber, materialId, purchaseOrderId,
          weight: weights[i] || 0,
          remainingWeight: weights[i] || 0,
          status: 'AVAILABLE',
          receivedDate: today,
          notes: ''
        })
      }

      const created = await tx.roll.createManyAndReturn({
        data: rollData as any,
        include: { material: true }
      })
      return created.map((r: any) => ({
        ...r,
        weight: Number(r.weight),
        remainingWeight: Number(r.remainingWeight),
        width: r.width ? Number(r.width) : undefined,
        length: r.length ? Number(r.length) : undefined,
        purchaseOrderId: r.purchaseOrderId || undefined
      }))
    })
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
        paymentMethod: p.paymentMethod || 'Cash',
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
        paymentMethod: p.paymentMethod || 'Cash',
        createdAt: p.createdAt
      })) || []
    }
  },

  async createSupplierInvoice(poId: string, date: string | Date, amount: number, invoiceNumber?: string): Promise<SupplierInvoice> {
    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (po.status !== 'RECEIVED') throw new AppError(400, 'INVALID_OPERATION', 'Purchase order must be received before creating a supplier invoice')

    const supplier = await supplierService.findOrCreateByName(po.supplier)
    logger.info({ poId, amount, supplierId: supplier.id }, 'Creating supplier invoice')

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

    const jeDateStr = typeof date === 'string' ? date : date instanceof Date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : undefined

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const finalInvoiceNumber = invoiceNumber || await generateSupplierInvoiceNumber()

        const inv = await prisma.$transaction(async (tx) => {
          const createdInvoice = await tx.supplierInvoice.create({
            data: {
              poId,
              supplierId: supplier.id,
              invoiceNumber: finalInvoiceNumber,
              date: typeof date === 'string' ? dateFromInput(date) : date,
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

          logger.info({ lines, totalVat, rawMaterialExclusive, packagingExclusive, amount }, 'Posting procurement journal entry')

          await financeService.postJournalEntry({
            description: `Supplier Invoice ${finalInvoiceNumber} - ${po.supplier}`,
            sourceModule: 'PROCUREMENT',
            sourceId: createdInvoice.id,
            reference: finalInvoiceNumber,
            date: jeDateStr,
            lines
          }, tx)

          logger.info({ invoiceNumber: finalInvoiceNumber, invoiceId: createdInvoice.id }, 'Procurement journal entry posted successfully')

          // Update material costPrice from PO item prices
          for (const item of poItems) {
            const material = await tx.material.findUnique({ where: { id: item.materialId } })
            if (material && material.category !== 'PACKAGING' && Number(item.unitPrice) > 0) {
              await tx.material.update({
                where: { id: item.materialId },
                data: { costPrice: item.unitPrice }
              })
              logger.info({ materialId: item.materialId, costPrice: item.unitPrice }, 'Material costPrice updated from supplier invoice')
            }
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
      } catch (error: any) {
        if (error?.code === 'P2002' && attempt < 3) {
          logger.warn({ attempt }, 'Supplier invoice number collision, retrying...')
          continue
        }
        throw error
      }
    }
    throw new AppError(500, 'INVOICE_CREATION_FAILED', 'Failed to create supplier invoice after multiple attempts')
  },

  async addPayment(supplierInvoiceId: string, amount: number, date: string | Date, paymentMethod: 'Cash' | 'Bank Transfer', reference?: string, notes?: string): Promise<PaymentMade> {
    const payJeDateStr = typeof date === 'string' ? date : date instanceof Date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : undefined

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.supplierInvoice.findUnique({
        where: { id: supplierInvoiceId },
        include: { po: true, supplier: true }
      })
      if (!inv) throw new AppError(404, 'NOT_FOUND', 'Supplier invoice not found')

      const remainingBalance = Number(inv.amount) - Number(inv.amountPaid)
      if (amount > remainingBalance) {
        throw new AppError(400, 'INVALID_AMOUNT', `Payment N${amount} exceeds remaining balance N${remainingBalance}`)
      }

      const payment = await tx.paymentMade.create({
        data: {
          supplierInvoiceId,
          amount,
          date: typeof date === 'string' ? dateFromInput(date) : date,
          reference,
          notes,
          paymentMethod
        }
      })

      // Atomic increment — prevents lost payments from concurrent writes
      const updated = await tx.supplierInvoice.update({
        where: { id: supplierInvoiceId },
        data: { amountPaid: { increment: amount } }
      })

      const newAmountPaid = Number(updated.amountPaid)
      const newStatus = newAmountPaid >= Number(updated.amount) ? 'PAID' : 'PARTIAL'
      await tx.supplierInvoice.update({
        where: { id: supplierInvoiceId },
        data: { status: newStatus }
      })

      const cashAccountCode = paymentMethod === 'Cash' ? '1000' : '1100'
      const apAccountId = await financeService.getAccountIdByCode('2000')
      const cashAccountId = await financeService.getAccountIdByCode(cashAccountCode)

      await financeService.postJournalEntry({
        description: `Payment for ${inv.invoiceNumber} - ${inv.po?.supplier || ''}`,
        sourceModule: 'PROCUREMENT',
        sourceId: inv.id,
        reference: reference || inv.invoiceNumber,
        date: payJeDateStr,
        lines: [
          { accountId: apAccountId, debit: amount, credit: 0, memo: `Payment to supplier ${inv.invoiceNumber}` },
          { accountId: cashAccountId, debit: 0, credit: amount, memo: paymentMethod === 'Cash' ? 'Cash payment' : 'Bank transfer' }
        ]
      }, tx)

      return payment
    })

    return {
      id: result.id,
      supplierInvoiceId: result.supplierInvoiceId,
      amount: Number(result.amount),
      date: result.date,
      reference: result.reference || undefined,
      notes: result.notes || undefined,
      paymentMethod: (result.paymentMethod || 'Cash') as 'Cash' | 'Bank Transfer',
      createdAt: result.createdAt
    }
  }
}
