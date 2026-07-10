import { prisma } from '../../database'
import { Prisma } from '@prisma/client'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { salesOrderRepository, paymentRepository, invoiceRepository, coreBuybackRepository, receiptRepository } from './repository'
import { decomposeInclusive } from '../../lib/vat-utils'
import { inventoryService } from '../inventory/service'
import { financeService } from '../finance/service'
import { dateFromInput, dateStartOfDay, dateEndOfDay } from '../../utils/dates'
import type { SpecsJson, SalesOrderInput, SalesOrderUpdateInput, PaymentInput, CoreBuybackInput } from './types'

const logger = createChildLogger('salesOrders:service')

const PAYMENT_METHOD_MAP: Record<string, string> = {
  Cash: 'CASH',
  Electronic: 'BANK_TRANSFER',
}

export const salesOrderService = {
  async getOrders(options?: { status?: string; customerId?: string; limit?: number; offset?: number }) {
    return salesOrderRepository.findAll(options)
  },

  async getOrderById(id: string) {
    const order = await salesOrderRepository.findById(id)
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }
    return order
  },

  async createOrder(input: SalesOrderInput, userId?: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId }
    })

    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }

    if (!customer.isActive) {
      throw new AppError(400, 'INVALID', 'Customer account is inactive')
    }

    const totalAmount = new Prisma.Decimal(String(input.quantityOrdered)).times(new Prisma.Decimal(String(input.unitPrice)))
    const depositRequired = totalAmount.times(new Prisma.Decimal(String(customer.depositPercentDefault)).dividedBy(new Prisma.Decimal('100')))

    const orderNumber = await salesOrderRepository.generateUniqueOrderNumber()

    const order = await salesOrderRepository.create({
      orderNumber,
      customerId: input.customerId,
      specsJson: input.specsJson,
      quantityOrdered: input.quantityOrdered,
      unitPrice: input.unitPrice,
      totalAmount,
      deliveryMethod: input.deliveryMethod || 'PICKUP',
      shippingAddress: input.shippingAddress,
      expectedDeliveryDate: input.expectedDeliveryDate ? dateFromInput(input.expectedDeliveryDate) : undefined,
      depositRequired
    })

    logger.info({ orderId: order.id, orderNumber: order.orderNumber, customerId: input.customerId }, 'Sales order created')

    return order
  },

  async updateOrder(id: string, input: SalesOrderUpdateInput) {
    const order = await salesOrderRepository.findById(id)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    const totalAmount = input.quantityOrdered && input.unitPrice
      ? new Prisma.Decimal(String(input.quantityOrdered)).times(new Prisma.Decimal(String(input.unitPrice)))
      : undefined

    const updated = await salesOrderRepository.update(id, {
      ...input,
      totalAmount
    })

    logger.info({ orderId: id }, 'Sales order updated')

    return updated
  },

  async approveOrder(id: string, userId?: string, date?: string) {
    const order = await salesOrderRepository.findById(id)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'PENDING') {
      throw new AppError(400, 'INVALID', 'Order is not in pending status')
    }

    const updated = await salesOrderRepository.update(id, {
      status: 'APPROVED',
      approvedAt: dateFromInput(date)
    })

    logger.info({ orderId: id }, 'Sales order approved')

    return updated
  },

  async startProduction(id: string, input: {
    machine: string
    category?: string
    materialOverride?: string
    rollIds: string[]
    printedRollWeights: number[]
    rollWaste?: Record<string, number>
    rollConsumption?: Record<string, number>
    notes?: string
  }, userId?: string) {
    const order = await salesOrderRepository.findById(id)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'APPROVED' && order.status !== 'MRP_PENDING') {
      throw new AppError(400, 'INVALID', 'Order is not ready for production')
    }

    // Import production service dynamically to avoid circular imports
    const { productionService } = await import('../production/service')
    
    // Create the production job
    const productionJob = await productionService.createJob({
      salesOrderId: id,
      customerId: order.customerId,
      customerName: order.customer?.name || '',
      machine: input.machine,
      materialOverride: input.materialOverride,
      rollIds: input.rollIds,
      printedRollWeights: input.printedRollWeights,
      rollWaste: input.rollWaste,
      rollConsumption: input.rollConsumption,
      notes: input.notes
    })

    // Update sales order with production job
    const updated = await salesOrderRepository.update(id, {
      status: 'IN_PRODUCTION',
      productionJobId: productionJob.id
    })

    logger.info({ orderId: id, productionJobId: productionJob.id }, 'Production started for sales order')

    return { order: updated, productionJob }
  },

  async cancelOrder(id: string, userId?: string, date?: string) {
    const order = await salesOrderRepository.findById(id)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status === 'CANCELLED') {
      throw new AppError(400, 'INVALID', 'Order is already cancelled')
    }

    // Check if order has active production
    if (order.productionJobId) {
      const productionJob = await prisma.productionJob.findUnique({
        where: { id: order.productionJobId }
      })
      
      if (productionJob && (productionJob.status === 'IN_PRODUCTION' || productionJob.status === 'COMPLETED')) {
        throw new AppError(400, 'INVALID', 'Cannot cancel order with active or completed production')
      }
    }

    if (order.status !== 'PENDING' && order.status !== 'APPROVED' && order.status !== 'MRP_PENDING') {
      throw new AppError(400, 'INVALID', 'Can only cancel pending, approved, or MRP pending orders')
    }

    // Refund any deposits
    if (Number(order.depositPaid) > 0) {
      await paymentRepository.create({
        salesOrderId: id,
        customerId: order.customerId,
        transactionType: 'REFUND',
        paymentMethod: 'CASH',
        amount: order.depositPaid,
        receivedById: userId,
        notes: `Refund for cancelled order ${order.orderNumber}`
      })
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Re-attribute PAYMENT transactions linked to this order as standalone deposits
      // so the customer retains credit (cancelled order is excluded from balances).
      // DEPOSIT transactions are already handled by the refund logic above.
      await tx.paymentTransaction.updateMany({
        where: { salesOrderId: id, transactionType: 'PAYMENT' },
        data: { salesOrderId: null, transactionType: 'DEPOSIT' }
      })

      const updatedOrder = await tx.salesOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: dateFromInput(date)
        }
      })

      logger.info({ orderId: id }, 'Sales order cancelled')

      return updatedOrder
    })

    return updated
  },

  async markReadyForPickup(id: string) {
    const order = await salesOrderRepository.findById(id)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'IN_PRODUCTION' && order.status !== 'APPROVED') {
      throw new AppError(400, 'INVALID', 'Order is not ready for pickup')
    }

    // Sync production data to sales order
    let productionData: any = { status: 'READY' }
    
    if (order.productionJobId) {
      const productionJob = await prisma.productionJob.findUnique({
        where: { id: order.productionJobId },
        include: { printedRolls: true }
      })

      if (productionJob && productionJob.printedRolls.length > 0) {
        const actualWeight = productionJob.printedRolls.reduce(
          (sum, pr) => sum + Number(pr.weightUsed || 0), 0
        )
        
        const unitPrice = Number(order.unitPrice)
        const totalAmount = actualWeight * unitPrice

        productionData = {
          status: 'READY',
          quantityOrdered: actualWeight,
          quantityProduced: actualWeight,
          totalAmount
        }

        logger.info({ 
          orderId: id, 
          productionJobId: order.productionJobId,
          actualWeight,
          unitPrice,
          totalAmount
        }, 'Synced production data to sales order')
      }
    }

    const updated = await salesOrderRepository.update(id, productionData)

    logger.info({ orderId: id }, 'Sales order marked as ready for pickup')

    return updated
  },

  async recordPickup(id: string, userId?: string, rollIds?: string[], packingBags?: number, packingBagPrice?: number, date?: string) {
    const order = await salesOrderRepository.findById(id)

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'READY' && order.status !== 'PICKED_UP') {
      throw new AppError(400, 'INVALID', 'Order is not ready for pickup')
    }

    // Resolve quantity from selected rolls, or fall back to order defaults
    let selectedRolls: any[] = []
    let quantity = 0

    if (rollIds && rollIds.length > 0) {
      // Validate rolls belong to this order's production job
      const productionJob = await prisma.productionJob.findUnique({
        where: { id: order.productionJobId! },
        include: { printedRolls: true }
      })
      if (!productionJob) {
        throw new AppError(400, 'INVALID', 'No production job found for this order')
      }

      const validRollIds = new Set(productionJob.printedRolls.map(pr => pr.id))
      for (const rid of rollIds) {
        if (!validRollIds.has(rid)) {
          throw new AppError(400, 'INVALID', `Roll ${rid} does not belong to this order's production job`)
        }
      }

      selectedRolls = productionJob.printedRolls.filter(pr => rollIds.includes(pr.id))

      // Validate all selected rolls are available
      for (const roll of selectedRolls) {
        if (roll.status !== 'IN_STOCK') {
          throw new AppError(400, 'INVALID', `Roll ${roll.id} is not available for pickup (status: ${roll.status})`)
        }
      }

      quantity = selectedRolls.reduce((sum, pr) => sum + Number(pr.weightUsed || 0), 0)
      if (quantity <= 0) {
        throw new AppError(400, 'INVALID', 'Selected rolls have zero weight')
      }
    } else {
      // No roll selection ΓÇö use default quantity (backward compat for manual orders)
      quantity = Number(order.quantityOrdered)
    }

    const currentDelivered = Number(order.quantityDelivered) || 0
    const newDelivered = currentDelivered + quantity
    const quantityOrdered = Number(order.quantityOrdered)
    const fullyDelivered = newDelivered >= quantityOrdered

    const result = await prisma.$transaction(async (tx) => {
      if (selectedRolls.length > 0) {
        // Only mark the selected rolls as picked up
        await tx.printedRoll.updateMany({
          where: { id: { in: selectedRolls.map(pr => pr.id) } },
          data: {
          status: 'PICKED_UP',
            customerId: order.customerId,
            pickedUpAt: dateFromInput(date)
          }
        })

        // =====================================================
        // RECOGNIZE DEFERRED COGS (Move from 1330 to 5000)
        // =====================================================
        try {
          const cogsAccountId = await financeService.getAccountIdByCode('5000')
          const deferredCogsAccountId = await financeService.getAccountIdByCode('1330')

          // Get the full production job to compute COGS
          const productionJob = await tx.productionJob.findUnique({
            where: { id: order.productionJobId! },
            include: { printedRolls: true }
          })

          if (productionJob) {
            const totalJobCost = Number(productionJob.materialCost || 0)
              + Number((productionJob as any).consumablesCost || 0)
              + Number(productionJob.overheadCost || 0)

            const totalPrintedWeight = productionJob.printedRolls.reduce((sum: number, pr: any) => sum + Number(pr.weightUsed || 0), 0)
            let totalJobCostCalc = totalJobCost
            if (!totalJobCostCalc && totalPrintedWeight > 0) {
              totalJobCostCalc = 0
              if (productionJob.parentRollIds && productionJob.parentRollIds.length > 0) {
                const parentRolls = await tx.roll.findMany({
                  where: { id: { in: productionJob.parentRollIds } },
                  include: { material: true }
                })
                const parentMaterial = parentRolls[0]?.material
                const costPerKg = parentMaterial?.costPrice ? Number(parentMaterial.costPrice) : 0
                totalJobCostCalc += totalPrintedWeight * costPerKg
              }
              const fbSettings = await tx.settings.findUnique({ where: { id: 'default' } })
              if (fbSettings) {
                const inkRate = Number(fbSettings.inkConsumptionRate) || 0.2
                const ipaRate = Number(fbSettings.ipaConsumptionRate) || 0.1
                const butanolRate = Number(fbSettings.butanolConsumptionRate) || 0.1
                const consumableMaterials = await tx.material.findMany({ where: { category: 'INK_SOLVENTS', isActive: true } })
                const ipaMat = consumableMaterials.find(m => m.subCategory === 'IPA')
                const butanolMat = consumableMaterials.find(m => m.subCategory === 'Butanol')
                const ipaCostPerLiter = ipaMat?.costPrice ? Number(ipaMat.costPrice) : 60
                const butanolCostPerLiter = butanolMat?.costPrice ? Number(butanolMat.costPrice) : 60
                const inkMats = consumableMaterials.filter(m => m.subCategory !== 'IPA' && m.subCategory !== 'Butanol')
                const avgInkCostPrice = inkMats.length > 0
                  ? inkMats.reduce((sum, m) => sum + (Number(m.costPrice) || 0), 0) / inkMats.length
                  : 0
                totalJobCostCalc += totalPrintedWeight * inkRate * avgInkCostPrice
                  + totalPrintedWeight * ipaRate * ipaCostPerLiter
                  + totalPrintedWeight * butanolRate * butanolCostPerLiter
                const overheadRate = Number(fbSettings.overheadRatePerKg) || 0
                totalJobCostCalc += totalPrintedWeight * overheadRate
              }
            }

            // Prorate COGS by actual selected weight vs total printed weight
            const cogsRatio = totalPrintedWeight > 0
              ? quantity / totalPrintedWeight
              : 1
            const cogsAmount = totalJobCostCalc > 0
              ? Math.round((totalJobCostCalc * cogsRatio) * 100) / 100
              : 0

            if (cogsAmount > 0) {
              await financeService.postJournalEntry({
                description: `Recognize COGS - SO ${order.orderNumber}`,
                sourceModule: 'SALES',
                sourceId: order.id,
                reference: order.orderNumber,
                date,
                lines: [
                  { accountId: cogsAccountId, debit: cogsAmount, credit: 0, memo: 'COGS recognized on delivery' },
                  { accountId: deferredCogsAccountId, debit: 0, credit: cogsAmount, memo: 'Deferred COGS cleared' }
                ]
              }, tx)

              logger.info({ orderId: order.id, orderNumber: order.orderNumber, cogsAmount }, 'Deferred COGS recognized on pickup')
            }
          }
        } catch (financeErr) {
          logger.error({ err: financeErr, orderId: order.id }, 'Failed to recognize Deferred COGS - continuing anyway')
        }
      }

      const packingBagMaterial = packingBags && packingBags > 0
        ? await tx.material.findFirst({ where: { code: 'PBAG' } })
        : null

      let bagCostPerUnit = 0
      if (packingBagMaterial) {
        bagCostPerUnit = packingBagMaterial.costPrice ? Number(packingBagMaterial.costPrice) : 0
      }

      const bagCostAmount = packingBags && packingBags > 0
        ? packingBags * bagCostPerUnit
        : 0
      const bagSellingPrice = (packingBagPrice && packingBagPrice > 0) ? packingBagPrice : bagCostPerUnit
      const bagRevenueAmount = packingBags && packingBags > 0
        ? packingBags * bagSellingPrice
        : 0

      const updated = await tx.salesOrder.update({
        where: { id },
        data: {
          status: fullyDelivered ? 'COMPLETED' : 'PICKED_UP',
          quantityDelivered: newDelivered,
          completedAt: fullyDelivered ? dateFromInput(date) : undefined,
          packingBagsQuantity: packingBags && packingBags > 0
            ? { increment: packingBags }
            : undefined,
          packingBagsAmount: bagCostAmount > 0
            ? { increment: bagCostAmount }
            : undefined,
          totalAmount: bagRevenueAmount > 0
            ? { increment: bagRevenueAmount }
            : undefined
        }
      })

      if (packingBags && packingBags > 0 && packingBagMaterial) {
        try {
          await inventoryService.recordPackingBagChange(
            packingBagMaterial.id,
            packingBags,
            'SALE',
            `Sales Order ${order.orderNumber}`,
            userId
          )

          try {
            const cogsId = await financeService.getAccountIdByCode('5000')
            const packingBagInventoryId = await financeService.getAccountIdByCode('1510')

            await financeService.postJournalEntry({
              description: `COGS - Packing Bags SO ${order.orderNumber}`,
              sourceModule: 'SALES',
              sourceId: order.id,
              reference: order.orderNumber,
              date,
              lines: [
                { accountId: cogsId, debit: bagCostAmount, credit: 0, memo: 'COGS - Packing Bags' },
                { accountId: packingBagInventoryId, debit: 0, credit: bagCostAmount, memo: 'Packing Bag Inventory' }
              ]
            }, tx)
          } catch (financeErr) {
            logger.error({ err: financeErr }, 'Failed to post COGS journal for packing bags at pickup')
          }
        } catch (err) {
          logger.error({ err, orderId: id }, 'Failed to record packing bag sale')
        }
      }

      // =====================================================
      // RECOGNIZE REVENUE (Dr AR, Cr Revenue + VAT)
      // =====================================================
      try {
        const settings = await tx.settings.findUnique({ where: { id: 'default' } })
        const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5

        const deliveryValue = quantity * Number(order.unitPrice)
        const bagValue = bagRevenueAmount
        const totalRevenue = deliveryValue + bagValue

        const { exclusive: deliveryExclusive, vat: deliveryVat } = decomposeInclusive(deliveryValue, vatRate)
        const { exclusive: bagExclusive, vat: bagVat } = decomposeInclusive(bagValue, vatRate)
        const totalVat = deliveryVat + bagVat

        const arAccountId = await financeService.getAccountIdByCode('1200')
        const salesRevenueId = await financeService.getAccountIdByCode('4000')
        const packingBagRevenueId = await financeService.getAccountIdByCode('4100')
        const vatOutputId = await financeService.getAccountIdByCode('2100')

        const lines: { accountId: string; debit: number; credit: number; memo?: string }[] = [
          { accountId: arAccountId, debit: totalRevenue, credit: 0, memo: 'Accounts receivable' }
        ]

        if (deliveryExclusive > 0) {
          lines.push({ accountId: salesRevenueId, debit: 0, credit: deliveryExclusive, memo: 'Roll revenue (excl. VAT)' })
        }
        if (bagExclusive > 0) {
          lines.push({ accountId: packingBagRevenueId, debit: 0, credit: bagExclusive, memo: 'Packing bags revenue (excl. VAT)' })
        }
        if (totalVat > 0) {
          lines.push({ accountId: vatOutputId, debit: 0, credit: totalVat, memo: 'Output VAT' })
        }

        if (lines.length > 1) {
          await financeService.postJournalEntry({
            description: `Pickup & Revenue - SO ${order.orderNumber}`,
            sourceModule: 'SALES',
            sourceId: order.id,
            reference: order.orderNumber,
            date,
            lines
          }, tx)
        }
      } catch (financeErr) {
        logger.error({ err: financeErr, orderId: id }, 'Failed to post revenue journal at pickup - continuing anyway')
      }

      logger.info({ orderId: id, quantity, totalDelivered: newDelivered, fullyDelivered, packingBags, rollCount: selectedRolls.length }, 'Sales order pickup recorded')

      return updated
    })

    try {
      await invoiceService.createInvoice({ salesOrderId: id, quantityDelivered: quantity, date })
    } catch (err) {
      logger.error({ err, orderId: id }, 'Failed to create invoice after pickup')
    }

    return result
  },

  async createInvoice(input: { salesOrderId: string; quantityDelivered?: number; date?: string }, userId?: string) {
    const order = await salesOrderRepository.findById(input.salesOrderId)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'READY' && order.status !== 'PICKED_UP' && order.status !== 'COMPLETED') {
      throw new AppError(400, 'INVALID', 'Order must be ready, picked up, or completed to generate invoice')
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' }
    })
    const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5

    const quantityDelivered = input.quantityDelivered || Number(order.quantityDelivered) || Number(order.quantityOrdered)
    const unitPrice = Number(order.unitPrice)
    const subtotal = quantityDelivered * unitPrice
    const { exclusive: invoiceRollExcl } = decomposeInclusive(subtotal, vatRate)
    
    const packingBagsQuantity = Number(order.packingBagsQuantity) || 0
    const packingBagsMaterial = await prisma.material.findFirst({ where: { code: 'PBAG' } })
    let packingBagsUnitPrice = 0
    if (packingBagsMaterial) {
      const priceList = await prisma.priceList.findFirst({
        where: { materialId: packingBagsMaterial.id },
        orderBy: { effectiveFrom: 'desc' }
      })
      const pricePerPack = priceList?.pricePerPack ? Number(priceList.pricePerPack) : 0
      const packSize = packingBagsMaterial.packSize || 1
      packingBagsUnitPrice = pricePerPack * packSize
    }
    const packingBagsInclusive = packingBagsQuantity * packingBagsUnitPrice
    
    const { exclusive: rollExcl, vat: rollVat } = decomposeInclusive(subtotal, vatRate)
    const { exclusive: bagsExcl, vat: bagsVat } = decomposeInclusive(packingBagsInclusive, vatRate)
    const vatAmount = rollVat + bagsVat
    const invoiceSubtotalExcl = rollExcl
    const packingBagsSubtotalExcl = bagsExcl
    const totalAmount = subtotal + packingBagsInclusive

    let depositApplied = Number(order.depositPaid)
    // Unallocated cash = balancePaid minus what's already in existing invoices' amountPaid
    // (amountPaid already includes depositApplied, so subtract that)
    const existingInvoices = await prisma.invoice.findMany({
      where: { salesOrderId: order.id },
      select: { amountPaid: true, depositApplied: true }
    })
    const cashAllocatedToInvoices = existingInvoices.reduce(
      (sum, inv) => sum + Number(inv.amountPaid) - Number(inv.depositApplied), 0
    )
    const previousPayments = Math.max(0, Number(order.balancePaid) - cashAllocatedToInvoices)
    let balanceDue = totalAmount - depositApplied - previousPayments

    // Auto-apply available advance payment balance (2250) if there's an outstanding balance
    let advancePaymentApplied = 0
    if (balanceDue > 0) {
      const standaloneDeposits = await prisma.paymentTransaction.aggregate({
        where: { customerId: order.customerId, transactionType: 'DEPOSIT', salesOrderId: null },
        _sum: { amount: true }
      })
      const appliedOnInvoices = await prisma.invoice.aggregate({
        where: { customerId: order.customerId },
        _sum: { depositApplied: true }
      })
      const availableAdvance = Number(standaloneDeposits._sum.amount || 0) - Number(appliedOnInvoices._sum.depositApplied || 0)
      advancePaymentApplied = Math.min(availableAdvance, balanceDue)
      depositApplied += advancePaymentApplied
      balanceDue -= advancePaymentApplied
    }

    const invoiceNumber = await invoiceRepository.getNextInvoiceNumber()

    let invoice
    try {
      invoice = await prisma.$transaction(async (tx) => {
        const invoiceStatus = balanceDue <= 0 ? 'PAID' : advancePaymentApplied > 0 ? 'PARTIAL' : 'ISSUED'
        const createdInvoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            salesOrderId: order.id,
            customerId: order.customerId,
            quantityDelivered,
            unitPrice: new Prisma.Decimal(String(unitPrice)),
            subtotal: new Prisma.Decimal(String(invoiceSubtotalExcl)),
            vatAmount: new Prisma.Decimal(String(vatAmount)),
            totalAmount: new Prisma.Decimal(String(totalAmount)),
            depositApplied: new Prisma.Decimal(String(depositApplied)),
            previousPayments: new Prisma.Decimal(String(previousPayments)),
            balanceDue: new Prisma.Decimal(String(balanceDue)),
            packingBagsQuantity: new Prisma.Decimal(String(packingBagsQuantity)),
            packingBagsUnitPrice: new Prisma.Decimal(String(packingBagsUnitPrice)),
            packingBagsSubtotal: new Prisma.Decimal(String(packingBagsSubtotalExcl)),
            packingBagsPaid: new Prisma.Decimal('0'),
            amountPaid: new Prisma.Decimal(String(depositApplied + previousPayments)),
            status: invoiceStatus as any,
            issuedAt: dateFromInput(input.date),
            ...(invoiceStatus === 'PAID' ? { paidAt: dateFromInput(input.date) } : {})
          },
          include: { customer: true, salesOrder: true }
        })

        // Update order quantity (never decrease ΓÇö recordPickup sets cumulative total)
        const orderUpdateData: any = {
          quantityDelivered: new Prisma.Decimal(String(Math.max(Number(order.quantityDelivered || 0), quantityDelivered)))
        }
        if (advancePaymentApplied > 0) {
          const newTotalPaid = Number(order.totalPaid) + advancePaymentApplied
          let newPaymentStatus = order.paymentStatus
          if (newTotalPaid >= Number(order.totalAmount)) {
            newPaymentStatus = 'FULLY_PAID'
          } else if (newTotalPaid >= Number(order.depositRequired)) {
            newPaymentStatus = 'DEPOSIT_COMPLETE'
          } else if (newTotalPaid > 0) {
            newPaymentStatus = 'PARTIAL_PAYMENT'
          }
          orderUpdateData.totalPaid = new Prisma.Decimal(String(newTotalPaid))
          orderUpdateData.paymentStatus = newPaymentStatus
          if (newPaymentStatus === 'FULLY_PAID' && order.status === 'PICKED_UP') {
            orderUpdateData.status = 'COMPLETED'
            orderUpdateData.completedAt = dateFromInput(input.date)
          }
        }
        // Already fully paid via direct payment before pickup
        if (Number(order.totalPaid) >= Number(order.totalAmount) && order.status === 'PICKED_UP' && !orderUpdateData.status) {
          orderUpdateData.status = 'COMPLETED'
          orderUpdateData.completedAt = dateFromInput(input.date)
        }
        await tx.salesOrder.update({
          where: { id: order.id },
          data: orderUpdateData
        })

        // Post journal entry for advance payment application: Dr 2250, Cr 1200
        if (advancePaymentApplied > 0) {
          try {
            const creditAccountCode = '2250'
            let creditAccountId: string
            try {
              creditAccountId = await financeService.getAccountIdByCode(creditAccountCode)
            } catch {
              creditAccountId = await financeService.createAccount({
                code: '2250', name: 'Advance Customer Payments',
                type: 'LIABILITY', description: 'Prepayments against future invoices'
              }).then(a => a.id)
            }
            const arAccountId = await financeService.getAccountIdByCode('1200')
            await financeService.postJournalEntry({
              description: `Advance payment applied - ${invoiceNumber}`,
              sourceModule: 'SALES',
              sourceId: order.id,
              reference: invoiceNumber,
              date: input.date,
              lines: [
                { accountId: creditAccountId, debit: advancePaymentApplied, credit: 0, memo: 'Advance payment applied to invoice' },
                { accountId: arAccountId, debit: 0, credit: advancePaymentApplied, memo: `Applied to ${invoiceNumber}` }
              ]
            }, tx)
          } catch (jeErr) {
            logger.error({ err: jeErr, amount: advancePaymentApplied }, 'Failed to post advance payment journal entry - continuing')
          }
        }

        return createdInvoice
      })
    } catch (error: any) {
      if (error.code === 'P2002' || error.code === 'P2025') {
        throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cannot invoice right now; accounting system temporarily unavailable.')
      }
      throw error
    }

    logger.info({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, orderId: order.id, depositApplied, advancePaymentApplied }, 'Invoice created')

    return invoice
  },

  async sellPackingBags(input: {
    customerId?: string
    quantity: number
    unitPrice: number
    paymentMethod: 'Cash' | 'Electronic'
    referenceNumber?: string
    notes?: string
    userId?: string
    applyDeposit?: boolean
    date?: string
  }) {
    const material = await prisma.material.findFirst({
      where: { code: 'PBAG' }
    })

    if (!material) {
      throw new AppError(404, 'NOT_FOUND', 'Packing bag material not found')
    }

    const totalAmount = input.quantity * input.unitPrice

    const customerId = input.customerId || null
    logger.info({ customerId, isNull: customerId === null, isUndefined: customerId === undefined }, 'Customer ID check')
    
    let customerName = 'Walk-in'
    
    let effectiveCustomerId: string
    
    if (!customerId) {
      let walkInCustomer = await prisma.customer.findFirst({
        where: { code: 'WALK-IN' }
      })
      if (!walkInCustomer) {
        walkInCustomer = await prisma.customer.create({
          data: {
            name: 'Walk-in Customer',
            code: 'WALK-IN',
            isActive: true,
            paymentType: 'CASH'
          }
        })
      }
      effectiveCustomerId = walkInCustomer.id
      customerName = 'Walk-in'
    } else {
      effectiveCustomerId = customerId
      const customer = await prisma.customer.findUnique({ where: { id: effectiveCustomerId } })
      if (customer) customerName = customer.name
    }

    const specsJson = {
      materialCode: 'PBAG',
      materialType: 'packaging',
      quantityType: 'bags',
      quantityInUnits: input.quantity
    }

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5
    const subtotal = input.quantity * input.unitPrice
    const { exclusive: bagsExclusive, vat: vatAmount } = decomposeInclusive(subtotal, vatRate)
    const packingBagsSubtotal = bagsExclusive
    const packingBagCostPrice = material.costPrice ? Number(material.costPrice) : 0
    const packingBagsCost = packingBagCostPrice > 0 ? input.quantity * packingBagCostPrice : packingBagsSubtotal
    const totalAmountWithVat = subtotal

    const orderNumber = await salesOrderRepository.generateUniqueOrderNumber()
    const invoiceNumber = await invoiceRepository.getNextInvoiceNumber()

    // Compute available deposit if requested
    let depositToApply = 0
    if (input.applyDeposit && customerId) {
      const standaloneDeposits = await prisma.paymentTransaction.aggregate({
        where: { customerId, transactionType: 'DEPOSIT', salesOrderId: null },
        _sum: { amount: true }
      })
      const appliedOnInvoices = await prisma.invoice.aggregate({
        where: { customerId },
        _sum: { depositApplied: true }
      })
      const availableDeposit = Number(standaloneDeposits._sum.amount || 0) - Number(appliedOnInvoices._sum.depositApplied || 0)
      depositToApply = Math.min(availableDeposit, totalAmountWithVat)
    }

    const cashPaymentAmount = totalAmountWithVat - depositToApply

    try {
      await prisma.$transaction(async (tx) => {
        await inventoryService.recordPackingBagChange(
          material.id,
          input.quantity,
          'SALE',
          input.referenceNumber,
          input.userId
        )

        const order = await tx.salesOrder.create({
          data: {
            orderNumber,
            customerId: effectiveCustomerId,
            specsJson,
            quantityOrdered: new Prisma.Decimal('0'),
            quantityProduced: new Prisma.Decimal('0'),
            quantityDelivered: new Prisma.Decimal('0'),
            unitPrice: new Prisma.Decimal('0'),
            totalAmount: new Prisma.Decimal(String(totalAmountWithVat)),
            deliveryMethod: 'PICKUP' as any,
            depositRequired: new Prisma.Decimal('0'),
            status: 'COMPLETED' as any,
            paymentStatus: 'FULLY_PAID' as any,
            approvedAt: dateFromInput(input.date),
            completedAt: dateFromInput(input.date),
            totalPaid: new Prisma.Decimal(String(totalAmountWithVat)),
            balancePaid: new Prisma.Decimal(String(totalAmountWithVat))
          }
        })

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            salesOrderId: order.id,
            customerId: effectiveCustomerId,
            quantityDelivered: 0,
            unitPrice: new Prisma.Decimal('0'),
            subtotal: new Prisma.Decimal('0'),
            vatAmount: new Prisma.Decimal(String(vatAmount)),
            totalAmount: new Prisma.Decimal(String(totalAmountWithVat)),
            depositApplied: new Prisma.Decimal(String(depositToApply)),
            previousPayments: new Prisma.Decimal('0'),
            balanceDue: new Prisma.Decimal('0'),
            packingBagsQuantity: new Prisma.Decimal(String(input.quantity)),
            packingBagsUnitPrice: new Prisma.Decimal(String(input.unitPrice)),
            packingBagsSubtotal: new Prisma.Decimal(String(packingBagsSubtotal)),
            packingBagsPaid: new Prisma.Decimal(String(cashPaymentAmount)),
            amountPaid: new Prisma.Decimal(String(totalAmountWithVat)),
            status: 'PAID' as any,
            paidAt: dateFromInput(input.date)
          }
        })

        if (customerId && cashPaymentAmount > 0) {
          await tx.paymentTransaction.create({
            data: {
              customerId,
              transactionType: 'PAYMENT',
              paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
              amount: new Prisma.Decimal(String(cashPaymentAmount)),
              referenceNumber: input.referenceNumber,
              notes: input.notes || `Packing bag sale: ${input.quantity} bags (Invoice ${invoiceNumber})`,
              receivedById: input.userId,
              salesOrderId: order.id
            }
          })
        }

        if (depositToApply > 0) {
          await tx.paymentTransaction.create({
            data: {
              customerId,
              transactionType: 'DEPOSIT_APPLIED',
              paymentMethod: 'CASH' as any,
              amount: new Prisma.Decimal(String(depositToApply)),
              referenceNumber: input.referenceNumber,
              notes: `Deposit applied to packing bag sale: ${input.quantity} bags (Invoice ${invoiceNumber})`,
              receivedById: input.userId,
              salesOrderId: order.id
            }
          })
        }

        try {
          const arAccountId = await financeService.getAccountIdByCode('1200')
          const packingBagRevenueId = await financeService.getAccountIdByCode('4100')
          const vatOutputId = await financeService.getAccountIdByCode('2100')
          const cogsId = await financeService.getAccountIdByCode('5000')
          const packingBagInventoryId = await financeService.getAccountIdByCode('1510')
          const isElectronic = input.paymentMethod === 'Electronic'
          const debitAccountCode = isElectronic ? '1100' : '1000'
          const debitAccountId = await financeService.getAccountIdByCode(debitAccountCode)

          await financeService.postJournalEntry({
            description: `Invoice ${invoiceNumber} - Packing Bags`,
            sourceModule: 'SALES',
            sourceId: invoice.id,
            reference: invoiceNumber,
            date: input.date,
            postedById: input.userId,
            lines: [
              { accountId: arAccountId, debit: totalAmountWithVat, credit: 0, memo: 'Accounts Receivable' },
              { accountId: packingBagRevenueId, debit: 0, credit: packingBagsSubtotal, memo: 'Packing Bags Revenue (excl. VAT)' }
            ].concat(
              vatAmount > 0 ? [{ accountId: vatOutputId, debit: 0, credit: vatAmount, memo: 'Output VAT' }] : []
            )
          }, tx)

          await financeService.postJournalEntry({
            description: `COGS - Packing Bags ${invoiceNumber}`,
            sourceModule: 'SALES',
            sourceId: invoice.id,
            reference: invoiceNumber,
            date: input.date,
            lines: [
              { accountId: cogsId, debit: packingBagsCost, credit: 0, memo: 'COGS - Packing Bags' },
              { accountId: packingBagInventoryId, debit: 0, credit: packingBagsCost, memo: 'Packing Bag Inventory' }
            ]
          }, tx)

          if (cashPaymentAmount > 0) {
            await financeService.postJournalEntry({
              description: `Payment - Packing Bags ${invoiceNumber}`,
              sourceModule: 'PAYMENT',
              sourceId: invoice.id,
              reference: input.referenceNumber || invoiceNumber,
              date: input.date,
              lines: [
                { accountId: debitAccountId, debit: cashPaymentAmount, credit: 0, memo: isElectronic ? 'Bank transfer' : 'Cash received' },
                { accountId: arAccountId, debit: 0, credit: cashPaymentAmount, memo: 'AR cleared (cash portion)' }
              ]
            }, tx)
          }

          if (depositToApply > 0) {
            const depositLiabilityId = await financeService.getAccountIdByCode('2250')
            await financeService.postJournalEntry({
              description: `Deposit Applied - Packing Bags ${invoiceNumber}`,
              sourceModule: 'SALES',
              sourceId: invoice.id,
              reference: invoiceNumber,
              date: input.date,
              lines: [
                { accountId: depositLiabilityId, debit: depositToApply, credit: 0, memo: 'Customer deposit applied' },
                { accountId: arAccountId, debit: 0, credit: depositToApply, memo: 'AR cleared (deposit portion)' }
              ]
            }, tx)
          }
        } catch (financeError: any) {
          logger.error({ error: financeError }, 'Failed to post journal entries for packing bag sale')
          throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cannot complete packing bag sale; accounting system temporarily unavailable.')
        }

        logger.info({ orderId: order.id, invoiceId: invoice.id, quantity: input.quantity, totalAmount: totalAmountWithVat }, 'Packing bags sold with journals')
      })
    } catch (error: any) {
      if (error.statusCode === 503) throw error
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cannot complete packing bag sale; accounting system temporarily unavailable.')
    }

    return {
      success: true,
      order: { id: '', orderNumber },
      invoice: { id: '', invoiceNumber },
      customer: customerName,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      subtotal,
      vatAmount,
      totalAmount: totalAmountWithVat,
      depositApplied: depositToApply
    }
  },

  async getCustomers() {
    return salesOrderRepository.getCustomers()
  },

  async getCustomerById(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })
    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }
    return customer
  },

  async createCustomer(input: {
    name: string
    code?: string
    email?: string
    phone?: string
    address?: string
    colors?: string[]
    paymentType?: 'CASH' | 'CREDIT'
    creditLimit?: number
    depositPercentDefault?: number
    paymentTermsDays?: number
    notifyEmail?: boolean
    notifyWhatsApp?: boolean
  }, userId?: string) {
    return salesOrderRepository.createCustomer(input)
  },

  async updateCustomer(customerId: string, input: {
    name?: string
    email?: string
    phone?: string
    address?: string
    colors?: string[]
    paymentType?: 'CASH' | 'CREDIT'
    creditLimit?: number
    depositPercentDefault?: number
    paymentTermsDays?: number
    notifyEmail?: boolean
    notifyWhatsApp?: boolean
  }) {
    return salesOrderRepository.updateCustomer(customerId, input)
  },

  async getCustomerBalance(customerId: string) {
    return salesOrderRepository.getCustomerBalance(customerId)
  },

  async getCustomerAging(customerId: string) {
    return salesOrderRepository.getCustomerAging(customerId)
  },

  async getAllCustomerBalances() {
    return salesOrderRepository.getAllCustomerBalances()
  },

  async getCustomerTransactions(customerId: string) {
    return salesOrderRepository.getCustomerTransactions(customerId)
  },

  async adjustDeposit(customerId: string, amount: number, userId?: string) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) throw new AppError(404, 'NOT_FOUND', 'Customer not found')

    const refNumber = `ADJ-${Date.now().toString(36).toUpperCase()}`
    const absAmount = Math.abs(amount)

    const depositAccountId = await financeService.getAccountIdByCode('2200')
    const otherIncomeId = await financeService.getAccountIdByCode('4200')

    await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.create({
        data: {
          customerId,
          transactionType: 'DEPOSIT',
          paymentMethod: 'CASH',
          amount: new Prisma.Decimal(String(amount)),
          referenceNumber: refNumber,
          notes: `Deposit adjustment by user ${userId || 'system'}`,
          receivedById: userId
        }
      })

      await financeService.postJournalEntry({
        description: `Deposit ${amount > 0 ? 'Increase' : 'Decrease'} (${absAmount}) - ${customer.name}`,
        sourceModule: 'SALES',
        sourceId: customerId,
        reference: refNumber,
        postedById: userId,
        lines: amount > 0
          ? [
              { accountId: otherIncomeId, debit: absAmount, credit: 0, memo: 'Deposit increase offset' },
              { accountId: depositAccountId, debit: 0, credit: absAmount, memo: 'Customer deposit increased' }
            ]
          : [
              { accountId: depositAccountId, debit: absAmount, credit: 0, memo: 'Customer deposit decreased' },
              { accountId: otherIncomeId, debit: 0, credit: absAmount, memo: 'Deposit decrease offset' }
            ]
      }, tx)
    })

    const balance = await salesOrderRepository.getCustomerBalance(customerId)
    return balance
  },

  async generateReceipt(paymentTransactionId: string, userId: string) {
    const existing = await receiptRepository.findByPaymentTransactionId(paymentTransactionId)
    if (existing) {
      return receiptRepository.findById(existing.id)
    }

    const payment = await paymentRepository.findById(paymentTransactionId)
    if (!payment) {
      throw new AppError(404, 'NOT_FOUND', 'Payment transaction not found')
    }

    const customerName = payment.customer?.name || payment.sellerName || 'Walk-in'
    const receiptNumber = await receiptRepository.getNextReceiptNumber()

    const receipt = await receiptRepository.create({
      receiptNumber,
      paymentTransactionId: payment.id,
      customerName,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber || undefined,
      generatedById: userId
    })

    return receiptRepository.findById(receipt.id)
  },
}

// Payment Service
export const paymentService = {
  async recordPayment(input: {
    salesOrderId?: string
    customerId?: string
    transactionType: string
    paymentMethod: string
    amount: number
    referenceNumber?: string
    notes?: string
    date?: string
  }, userId?: string) {
    if (!input.salesOrderId && !input.customerId) {
      throw new AppError(400, 'VALIDATION', 'Either salesOrderId or customerId is required')
    }

    // Defensive: a standalone payment with no sales order is functionally a deposit
    if (!input.salesOrderId && input.transactionType === 'PAYMENT') {
      input.transactionType = 'DEPOSIT'
    }

    // Auto-generate reference number if not provided
    if (!input.referenceNumber) {
      const prefixMap: Record<string, string> = {
        DEPOSIT: 'DEP', PAYMENT: 'PAY', CORE_BUYBACK: 'CBY',
        REFUND: 'RFD'
      }
      const prefix = prefixMap[input.transactionType] || 'PAY'
      const refDate = dateFromInput(input.date)
      const ymd = `${refDate.getFullYear()}${String(refDate.getMonth() + 1).padStart(2, '0')}${String(refDate.getDate()).padStart(2, '0')}`
      const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
      input.referenceNumber = `${prefix}-${ymd}-${suffix}`
    }

    const result = await prisma.$transaction(async (tx) => {
      // Compute overpayment when a PAYMENT on an order exceeds the remaining balance
      let overpayment = 0
      let revenuePortion = input.amount
      if (input.salesOrderId && input.transactionType === 'PAYMENT') {
        const order = await tx.salesOrder.findUnique({
          where: { id: input.salesOrderId },
          select: { totalPaid: true, totalAmount: true, approvedAt: true }
        })
        if (order) {
          const payDate = dateFromInput(input.date)
          if (order.approvedAt && payDate < order.approvedAt) {
            logger.warn({ orderId: input.salesOrderId, paymentDate: payDate, approvedAt: order.approvedAt },
              'Payment date is before order approval date — sequencing issue')
          }
          const previousPayments = Number(order.totalPaid)
          const orderTotal = Number(order.totalAmount)
          const remaining = Math.max(0, orderTotal - previousPayments)
          if (input.amount > remaining) {
            overpayment = input.amount - remaining
            revenuePortion = remaining
          }
        }
      }

      let payment: any = null
      if (revenuePortion > 0) {
        payment = await tx.paymentTransaction.create({
          data: {
            salesOrderId: input.salesOrderId,
            customerId: input.customerId!,
            transactionType: input.transactionType as any,
            paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
            amount: new Prisma.Decimal(String(revenuePortion)),
            referenceNumber: input.referenceNumber,
            notes: input.notes,
            receivedById: userId,
            receivedAt: dateFromInput(input.date)
          }
        })
      }

      let overpaymentDeposit: any = null
      // Create separate DEPOSIT for overpayment (standalone, crediting 2250)
      if (overpayment > 0) {
        const depRef = `OVR-${input.referenceNumber || Date.now().toString(36).toUpperCase()}`
        overpaymentDeposit = await tx.paymentTransaction.create({
          data: {
            customerId: input.customerId!,
            transactionType: 'DEPOSIT',
            paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
            amount: new Prisma.Decimal(String(overpayment)),
            receivedById: userId,
            referenceNumber: depRef,
            notes: `Overpayment from payment ${input.referenceNumber || ''}`,
            receivedAt: dateFromInput(input.date)
          }
        })
      }

      // Update sales order if linked (skip if revenuePortion is 0 ΓÇö no change needed)
      if (input.salesOrderId && revenuePortion > 0) {
        const order = await tx.salesOrder.findUnique({
          where: { id: input.salesOrderId }
        })
        if (order) {
          const newPaid = Number(order.totalPaid) + revenuePortion
          let paymentStatus = 'PARTIAL_PAYMENT'
          if (newPaid >= Number(order.totalAmount)) {
            paymentStatus = 'FULLY_PAID'
          } else if (newPaid >= Number(order.depositRequired)) {
            paymentStatus = 'DEPOSIT_COMPLETE'
          }

          const newBalancePaid = Number(order.balancePaid) + revenuePortion
          const orderUpdateData: any = {
            totalPaid: newPaid,
            balancePaid: newBalancePaid,
            paymentStatus: paymentStatus as any
          }
          if (input.transactionType === 'DEPOSIT') {
            orderUpdateData.depositPaid = new Prisma.Decimal(String(Number(order.depositPaid) + Number(input.amount)))
          }
          if (paymentStatus === 'FULLY_PAID' && order.status === 'PICKED_UP' && Number(order.quantityDelivered) >= Number(order.quantityOrdered)) {
            orderUpdateData.status = 'COMPLETED'
            orderUpdateData.completedAt = dateFromInput(input.date)
          }

          await tx.salesOrder.update({
            where: { id: input.salesOrderId },
            data: orderUpdateData
          })

          // Also update linked invoice if one exists
          const linkedInvoice = await tx.invoice.findFirst({
            where: { salesOrderId: input.salesOrderId },
            orderBy: { createdAt: 'desc' }
          })
          if (linkedInvoice) {
            const prevAmountPaid = Number(linkedInvoice.amountPaid) || 0
            const newInvoiceAmountPaid = prevAmountPaid + revenuePortion
            // Decrement the old balanceDue by this payment's revenuePortion.
            // This is correct regardless of whether depositApplied/previousPayments
            // are already included in amountPaid (new invoices) or stored separately (old).
            const newInvoiceBalanceDue = Math.max(0, (Number(linkedInvoice.balanceDue) || 0) - revenuePortion)
            const newInvoiceStatus = newInvoiceBalanceDue <= 0 ? 'PAID' : newInvoiceAmountPaid > 0 ? 'PARTIAL' : linkedInvoice.status

            await tx.invoice.update({
              where: { id: linkedInvoice.id },
              data: {
                amountPaid: new Prisma.Decimal(String(newInvoiceAmountPaid)),
                balanceDue: new Prisma.Decimal(String(newInvoiceBalanceDue)),
                status: newInvoiceStatus as any,
                ...(newInvoiceStatus === 'PAID' ? { paidAt: dateFromInput(input.date) } : {})
              }
            })
          }
        }
      }

      // Post journal entry:
      //   Standalone:             D/Cash-or-Bank, C/2250
      //   Payment within balance: D/Cash-or-Bank, C/1200
      //   Overpayment split:      D/Cash-or-Bank, C/1200 (revenue), C/2250 (excess)
      try {
        const isElectronicPayment = input.paymentMethod === 'Electronic'
        const debitAccountCode = isElectronicPayment ? '1100' : '1000'
        const debitAccountId = await financeService.getAccountIdByCode(debitAccountCode)

        const journalLines: { accountId: string; debit: number; credit: number; memo?: string }[] = [
          { accountId: debitAccountId, debit: input.amount, credit: 0, memo: isElectronicPayment ? 'Bank transfer' : 'Cash received' }
        ]

        if (input.salesOrderId) {
          const arAccountId = await financeService.getAccountIdByCode('1200')
          journalLines.push({ accountId: arAccountId, debit: 0, credit: revenuePortion, memo: 'Customer payment' })
          if (overpayment > 0) {
            let advancePaymentAccountId: string
            try {
              advancePaymentAccountId = await financeService.getAccountIdByCode('2250')
            } catch {
              advancePaymentAccountId = await financeService.createAccount({
                code: '2250', name: 'Advance Customer Payments',
                type: 'LIABILITY', description: 'Prepayments against future invoices'
              }).then(a => a.id)
            }
            journalLines.push({ accountId: advancePaymentAccountId, debit: 0, credit: overpayment, memo: 'Overpayment (advance credit)' })
          }
        } else {
          let advancePaymentAccountId: string
          try {
            advancePaymentAccountId = await financeService.getAccountIdByCode('2250')
          } catch {
            advancePaymentAccountId = await financeService.createAccount({
              code: '2250', name: 'Advance Customer Payments',
              type: 'LIABILITY', description: 'Prepayments against future invoices'
            }).then(a => a.id)
          }
          journalLines.push({ accountId: advancePaymentAccountId, debit: 0, credit: input.amount, memo: 'Advance payment (no order)' })
        }

        const customer = input.customerId ? await prisma.customer.findUnique({ where: { id: input.customerId }, select: { name: true } }) : null
        const customerLabel = customer ? ` (${customer.name})` : ''
        await financeService.postJournalEntry({
          description: `${input.salesOrderId ? 'Payment received' : 'Advance payment received'}${customerLabel} - ${input.referenceNumber || `₦${input.amount.toLocaleString()}`}`,
          sourceModule: 'PAYMENT',
          sourceId: input.salesOrderId,
          reference: input.referenceNumber,
          date: input.date,
          lines: journalLines
        }, tx)
      } catch (jeErr) {
        logger.error({ err: jeErr, amount: input.amount }, 'Failed to post payment journal entry - continuing')
      }

      return { payment: payment || overpaymentDeposit, overpayment }
    })

    logger.info({ paymentId: result?.payment?.id, amount: input.amount, overpayment: result.overpayment }, 'Payment recorded')
    return result
  },

  async getPayments(options?: { salesOrderId?: string; customerId?: string; dateFrom?: string; dateTo?: string }) {
    const where: any = {}
    if (options?.salesOrderId) where.salesOrderId = options.salesOrderId
    if (options?.customerId) where.customerId = options.customerId
    if (options?.dateFrom || options?.dateTo) {
      where.receivedAt = {}
      if (options.dateFrom) where.receivedAt.gte = dateStartOfDay(options.dateFrom)
      if (options.dateTo) where.receivedAt.lte = dateEndOfDay(options.dateTo)
    }

    return prisma.paymentTransaction.findMany({
      where,
      include: { customer: true, salesOrder: true },
      orderBy: { receivedAt: 'desc' }
    })
  },

  async getPaymentsBySalesOrder(salesOrderId: string) {
    return prisma.paymentTransaction.findMany({
      where: { salesOrderId },
      include: { customer: true },
      orderBy: { receivedAt: 'desc' }
    })
  },

  async getPaymentsByCustomer(customerId: string) {
    return prisma.paymentTransaction.findMany({
      where: { customerId },
      include: { salesOrder: true },
      orderBy: { receivedAt: 'desc' }
    })
  }
}

// Invoice Service  
export const invoiceService = {
  async createInvoice(input: { salesOrderId: string; quantityDelivered?: number; date?: string }, userId?: string) {
    return salesOrderService.createInvoice(input, userId)
  },

  async getInvoices(options?: { status?: string; customerId?: string }) {
    return invoiceRepository.findAll(options)
  },

  async getInvoiceById(id: string) {
    return invoiceRepository.findById(id)
  },

  async issueInvoice(id: string, date?: string) {
    return invoiceRepository.update(id, { status: 'ISSUED' as any, issuedAt: dateFromInput(date) })
  },

  async addPayment(invoiceId: string, amount: number, date: string | Date, reference?: string, notes?: string, paymentMethod?: string) {
    // Auto-generate reference number if not provided
    if (!reference) {
      const now = new Date()
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
      reference = `INVPAY-${ymd}-${suffix}`
    }

    const invoice = await invoiceRepository.findById(invoiceId)
    if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found')

    const newAmountPaid = (Number(invoice.amountPaid) || 0) + amount
    const newStatus = newAmountPaid >= Number(invoice.totalAmount) ? 'PAID' : newAmountPaid > 0 ? 'PARTIAL' : invoice.status

    logger.info({ invoiceId, amount, newStatus, paymentMethod }, 'Recording payment received')

    let payment
    try {
      payment = await prisma.$transaction(async (tx) => {
        const createdPayment = await tx.paymentReceived.create({
          data: {
            invoiceId,
            amount: new Prisma.Decimal(String(amount)),
            date: typeof date === 'string' ? date : undefined,
            reference,
            notes,
            paymentMethod
          }
        })

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            amountPaid: new Prisma.Decimal(String(newAmountPaid)),
            balanceDue: new Prisma.Decimal(String(Math.max(0, Number(invoice.balanceDue) - amount))),
            status: newStatus as any
          }
        })

        try {
          const isElectronicPayment = paymentMethod === 'Electronic'
          const debitAccountCode = isElectronicPayment ? '1100' : '1000'
          const debitAccountId = await financeService.getAccountIdByCode(debitAccountCode)
          const arAccountId = await financeService.getAccountIdByCode('1200')

          await financeService.postJournalEntry({
            description: `Payment received - ${invoice.invoiceNumber}`,
            sourceModule: 'PAYMENT',
            sourceId: createdPayment.id,
            reference: reference || `Inv ${invoice.invoiceNumber}`,
            date: typeof date === 'string' ? date : undefined,
            lines: [
              { accountId: debitAccountId, debit: amount, credit: 0, memo: isElectronicPayment ? 'Bank transfer' : 'Cash received' },
              { accountId: arAccountId, debit: 0, credit: amount, memo: `Payment against ${invoice.invoiceNumber}` }
            ]
          }, tx)
        } catch (financeError: any) {
          logger.error({ error: financeError }, 'Failed to post journal entry for payment')
          throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cannot record payment right now; accounting system temporarily unavailable.')
        }

        return createdPayment
      })
    } catch (error: any) {
      if (error.code === 'P2002' || error.code === 'P2025' || error.statusCode === 503) {
        throw error
      }
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cannot record payment right now; accounting system temporarily unavailable.')
    }

    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      amount: Number(payment.amount),
      date: payment.date,
      reference: payment.reference || undefined,
      notes: payment.notes || undefined,
      paymentMethod: paymentMethod || 'Cash',
      createdAt: payment.createdAt
    }
  },
}

// Core Buyback Service
export const coreBuybackService = {
  async recordCoreBuyback(input: {
    customerId?: string
    sellerName: string
    coresQuantity: number
    ratePerCore?: number
    paymentMethod: string
    paidAmount?: number
  }, userId?: string) {
    if (!input.ratePerCore) {
      const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
      input.ratePerCore = Number(settings?.coreDepositValue || 150)
    }
    const totalValue = input.coresQuantity * input.ratePerCore

    // If customer selected, credit their deposit + post journal entry
    if (input.customerId) {
      const expenseAccountId = await financeService.getAccountIdByCode('6600')
      const depositLiabilityId = await financeService.getAccountIdByCode('2200')

      const effectiveRate = input.ratePerCore!
      const { buyback } = await prisma.$transaction(async (tx) => {
        const buyback = await coreBuybackRepository.create({
          customerId: input.customerId,
          sellerName: input.sellerName,
          coresQuantity: input.coresQuantity,
          ratePerCore: effectiveRate,
          totalValue,
          paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
          paidAmount: 0,
          recordedById: userId
        }, tx)

        await inventoryService.recordCoreChange(input.coresQuantity, 'CORE_BUYBACK', undefined, userId, tx)

        await tx.paymentTransaction.create({
          data: {
            customerId: input.customerId,
            transactionType: 'DEPOSIT',
            paymentMethod: 'CASH' as any,
            amount: new Prisma.Decimal(String(totalValue)),
            referenceNumber: `CORE-${buyback.id.slice(-8)}`,
            notes: `Core buyback: ${input.coresQuantity} cores (Γéª${totalValue.toLocaleString()})`,
            receivedById: userId,
            salesOrderId: null
          }
        })

        await financeService.postJournalEntry({
          description: `Core buyback - ${input.coresQuantity} cores (Γéª${totalValue.toLocaleString()})`,
          sourceModule: 'SALES',
          sourceId: buyback.id,
          reference: `CORE-${buyback.id.slice(-8)}`,
          postedById: userId,
          lines: [
            { accountId: expenseAccountId, debit: totalValue, credit: 0, memo: 'Core buyback expense' },
            { accountId: depositLiabilityId, debit: 0, credit: totalValue, memo: 'Customer deposit credited for cores' }
          ]
        }, tx)

        return { buyback }
      })

      logger.info({ buybackId: buyback.id, cores: input.coresQuantity, value: totalValue }, 'Core buyback recorded')
      return buyback
    }

    // Walk-in: record cash payout + post journal entry
    const expenseAccountId = await financeService.getAccountIdByCode('6600')
    const cashPayoutCode = input.paymentMethod === 'Electronic' ? '1100' : '1000'
    const cashAccountId = await financeService.getAccountIdByCode(cashPayoutCode)
    const paidAmount = input.paidAmount || totalValue

    const { buyback } = await prisma.$transaction(async (tx) => {
      const buyback = await coreBuybackRepository.create({
        customerId: input.customerId,
        sellerName: input.sellerName,
        coresQuantity: input.coresQuantity,
        ratePerCore: input.ratePerCore!,
        totalValue,
        paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
        paidAmount,
        recordedById: userId
      }, tx)

      await inventoryService.recordCoreChange(input.coresQuantity, 'CORE_BUYBACK', undefined, userId, tx)

      await tx.paymentTransaction.create({
        data: {
          transactionType: 'CORE_BUYBACK',
          paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
          amount: new Prisma.Decimal(String(paidAmount)),
          referenceNumber: `CORE-${buyback.id.slice(-8)}`,
          notes: `Core buyback - ${input.sellerName}: ${input.coresQuantity} cores (Γéª${paidAmount.toLocaleString()})`,
          receivedById: userId,
          sellerName: input.sellerName,
          coresQuantity: input.coresQuantity
        }
      })

      await financeService.postJournalEntry({
        description: `Core buyback (walk-in) - ${input.sellerName}: ${input.coresQuantity} cores (Γéª${paidAmount.toLocaleString()})`,
        sourceModule: 'SALES',
        sourceId: buyback.id,
        reference: `CORE-${buyback.id.slice(-8)}`,
        postedById: userId,
        lines: [
          { accountId: expenseAccountId, debit: paidAmount, credit: 0, memo: 'Core buyback expense' },
          { accountId: cashAccountId, debit: 0, credit: paidAmount, memo: `Cash paid to ${input.sellerName}` }
        ]
      }, tx)

      return { buyback }
    })

    logger.info({ buybackId: buyback.id, cores: input.coresQuantity, value: totalValue }, 'Core buyback recorded')
    return buyback
  },

  async getCoreBuybacks(options?: { customerId?: string; dateFrom?: string; dateTo?: string }) {
    return coreBuybackRepository.findAll({
      customerId: options?.customerId,
      dateFrom: options?.dateFrom ? dateStartOfDay(options.dateFrom) : undefined,
      dateTo: options?.dateTo ? dateEndOfDay(options.dateTo) : undefined
    })
  },

}
