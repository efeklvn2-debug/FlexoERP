import { prisma } from '../../database'
import { Prisma } from '@prisma/client'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { salesOrderRepository, paymentRepository, invoiceRepository, coreBuybackRepository } from './repository'
import { decomposeInclusive } from '../../lib/vat-utils'
import { inventoryService } from '../inventory/service'
import { financeService } from '../finance/service'
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

  async approveOrder(id: string, userId?: string) {
    const order = await salesOrderRepository.findById(id)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'PENDING') {
      throw new AppError(400, 'INVALID', 'Order is not in pending status')
    }

    const updated = await salesOrderRepository.update(id, {
      status: 'APPROVED',
      approvedAt: new Date()
    })

    logger.info({ orderId: id }, 'Sales order approved')

    return updated
  },

  async startProduction(id: string, input: {
    machine: string
    category?: string
    rollIds: string[]
    printedRollWeights: number[]
    wasteWeight?: number
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
      customerName: order.customer?.name || '',
      machine: input.machine,
      rollIds: input.rollIds,
      printedRollWeights: input.printedRollWeights,
      wasteWeight: input.wasteWeight,
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

  async cancelOrder(id: string, userId?: string) {
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
      const updatedOrder = await tx.salesOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date()
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

  async recordPickup(id: string, userId?: string, quantityPickedUp?: number, packingBags?: number, amountPaid?: number, paymentMethod?: string) {
    const order = await salesOrderRepository.findById(id)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'READY') {
      throw new AppError(400, 'INVALID', 'Order is not ready for pickup')
    }

    const currentDelivered = Number(order.quantityDelivered) || 0
    const quantityOrdered = Number(order.quantityOrdered)
    const quantity = quantityPickedUp || quantityOrdered
    const newDelivered = currentDelivered + quantity
    const fullyDelivered = newDelivered >= quantityOrdered

    return prisma.$transaction(async (tx) => {
      if (order.productionJobId) {
        const productionJob = await tx.productionJob.findUnique({
          where: { id: order.productionJobId },
          include: { printedRolls: true }
        })

        if (productionJob && productionJob.printedRolls.length > 0) {
          await tx.printedRoll.updateMany({
            where: { id: { in: productionJob.printedRolls.map(pr => pr.id) } },
            data: {
              status: 'PICKED_UP',
              customerId: order.customerId,
              pickedUpAt: new Date()
            }
          })
          
          // =====================================================
          // RECOGNIZE DEFERRED COGS (Move from 1330 to 5000)
          // =====================================================
          try {
            const cogsAccountId = await financeService.getAccountIdByCode('5000')
            const deferredCogsAccountId = await financeService.getAccountIdByCode('1330')
            
            // Calculate total deferred cost from production job
            // Use printed weight × cost per kg (same as production service fix)
            const totalPrintedWeight = productionJob.printedRolls.reduce((sum: number, pr: any) => sum + Number(pr.weightUsed || 0), 0)
            let totalDeferredCost = 0
            
            // Get parent rolls for material cost
            if (productionJob.parentRollIds && productionJob.parentRollIds.length > 0) {
              const parentRolls = await tx.roll.findMany({
                where: { id: { in: productionJob.parentRollIds } },
                include: { material: true }
              })
              
              // Material cost: printed weight × cost per kg (NOT roll weight delta)
              const parentMaterial = parentRolls[0]?.material
              const costPerKg = parentMaterial?.costPrice ? Number(parentMaterial.costPrice) : 0
              const materialCost = totalPrintedWeight * costPerKg
              totalDeferredCost += materialCost
            }
            
            // Add consumables cost (ink + IPA + Butanol)
            const settings = await tx.settings.findUnique({ where: { id: 'default' } })
            if (settings) {
              const inkRate = Number(settings.inkConsumptionRate) || 0.2
              const ipaRate = Number(settings.ipaConsumptionRate) || 0.1
              const butanolRate = Number(settings.butanolConsumptionRate) || 0.1
              const inkCostPerLiter = Number(settings.inkCostPerKg) || 50
              
              // Get IPA and Butanol material costs
              const consumableMaterials = await tx.material.findMany({
                where: { category: 'INK_SOLVENTS' }
              })
              const ipaMat = consumableMaterials.find(m => m.subCategory === 'IPA')
              const butanolMat = consumableMaterials.find(m => m.subCategory === 'Butanol')
              const ipaCostPerLiter = ipaMat?.costPrice ? Number(ipaMat.costPrice) : 60
              const butanolCostPerLiter = butanolMat?.costPrice ? Number(butanolMat.costPrice) : 60
              
              const inkCost = totalPrintedWeight * inkRate * inkCostPerLiter
              const ipaCost = totalPrintedWeight * ipaRate * ipaCostPerLiter
              const butanolCost = totalPrintedWeight * butanolRate * butanolCostPerLiter
              totalDeferredCost += inkCost + ipaCost + butanolCost
              
              // Add overhead cost
              const overheadRate = Number(settings.overheadRatePerKg) || 0
              const overheadCost = totalPrintedWeight * overheadRate
              totalDeferredCost += overheadCost
            }
            
            if (totalDeferredCost > 0) {
              await financeService.postJournalEntry({
                description: `Recognize COGS - SO ${order.orderNumber}`,
                sourceModule: 'SALES',
                sourceId: order.id,
                reference: order.orderNumber,
                lines: [
                  { accountId: cogsAccountId, debit: totalDeferredCost, credit: 0, memo: 'COGS recognized on delivery' },
                  { accountId: deferredCogsAccountId, debit: 0, credit: totalDeferredCost, memo: 'Deferred COGS cleared' }
                ]
              }, tx)
              
              logger.info({ orderId: order.id, orderNumber: order.orderNumber, cogsAmount: totalDeferredCost }, 'Deferred COGS recognized on pickup')
            }
          } catch (financeErr) {
            logger.error({ err: financeErr, orderId: order.id }, 'Failed to recognize Deferred COGS - continuing anyway')
          }
        }
      }

      const packingBagMaterial = packingBags && packingBags > 0 
        ? await tx.material.findFirst({ where: { code: 'PBAG' } })
        : null
      
      let bagPricePerUnit = 0
      if (packingBagMaterial) {
        const priceList = await tx.priceList.findFirst({
          where: { materialId: packingBagMaterial.id },
          orderBy: { effectiveFrom: 'desc' }
        })
        bagPricePerUnit = priceList?.pricePerPack ? Number(priceList.pricePerPack) : 0
      }
      
      const bagTotalAmount = packingBags && packingBags > 0 
        ? packingBags * bagPricePerUnit 
        : 0
      
      const updated = await tx.salesOrder.update({
        where: { id },
        data: {
          status: 'PICKED_UP',
          quantityDelivered: newDelivered,
          completedAt: fullyDelivered ? new Date() : undefined,
          packingBagsQuantity: packingBags && packingBags > 0 
            ? { increment: packingBags }
            : undefined,
          packingBagsAmount: bagTotalAmount > 0 
            ? { increment: bagTotalAmount }
            : undefined,
          totalAmount: bagTotalAmount > 0 
            ? { increment: bagTotalAmount }
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
              lines: [
                { accountId: cogsId, debit: bagTotalAmount, credit: 0, memo: 'COGS - Packing Bags' },
                { accountId: packingBagInventoryId, debit: 0, credit: bagTotalAmount, memo: 'Packing Bag Inventory' }
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
      // RECOGNIZE REVENUE (Merge payment into pickup)
      // =====================================================
      try {
        const settings = await tx.settings.findUnique({ where: { id: 'default' } })
        const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5

        const deliveryValue = quantity * Number(order.unitPrice)
        const bagValue = bagTotalAmount
        const totalRevenue = deliveryValue + bagValue

        const { exclusive: deliveryExclusive, vat: deliveryVat } = decomposeInclusive(deliveryValue, vatRate)
        const { exclusive: bagExclusive, vat: bagVat } = decomposeInclusive(bagValue, vatRate)
        const totalVat = deliveryVat + bagVat

        const cashAccountId = await financeService.getAccountIdByCode('1000')
        const arAccountId = await financeService.getAccountIdByCode('1200')
        const salesRevenueId = await financeService.getAccountIdByCode('4000')
        const packingBagRevenueId = await financeService.getAccountIdByCode('4100')
        const vatOutputId = await financeService.getAccountIdByCode('2100')

        const lines: { accountId: string; debit: number; credit: number; memo?: string }[] = []

        if (deliveryExclusive > 0) {
          lines.push({ accountId: salesRevenueId, debit: 0, credit: deliveryExclusive, memo: 'Roll revenue (excl. VAT)' })
        }
        if (bagExclusive > 0) {
          lines.push({ accountId: packingBagRevenueId, debit: 0, credit: bagExclusive, memo: 'Packing bags revenue (excl. VAT)' })
        }
        if (totalVat > 0) {
          lines.push({ accountId: vatOutputId, debit: 0, credit: totalVat, memo: 'Output VAT' })
        }

        const previousPayments = Number(order.totalPaid)
        const amountPaidNow = amountPaid || 0
        const balanceDue = Math.max(0, totalRevenue - previousPayments - amountPaidNow)

        if (amountPaidNow > 0) {
          lines.push({ accountId: cashAccountId, debit: amountPaidNow, credit: 0, memo: 'Cash collected at pickup' })
        }
        if (balanceDue > 0) {
          lines.push({ accountId: arAccountId, debit: balanceDue, credit: 0, memo: 'Accounts receivable' })
        }

        if (lines.length > 0) {
          await financeService.postJournalEntry({
            description: `Pickup & Revenue - SO ${order.orderNumber}`,
            sourceModule: 'SALES',
            sourceId: order.id,
            reference: order.orderNumber,
            lines
          }, tx)
        }

        // Record payment transaction if cash collected
        if (amountPaidNow > 0) {
          await tx.paymentTransaction.create({
            data: {
              salesOrderId: order.id,
              customerId: order.customerId,
              transactionType: 'PAYMENT',
              paymentMethod: (PAYMENT_METHOD_MAP[paymentMethod || 'Cash'] || 'CASH') as any,
              amount: new Prisma.Decimal(String(amountPaidNow)),
              receivedById: userId,
              paymentCategory: bagValue > 0 && deliveryValue > 0 ? 'BOTH' : bagValue > 0 ? 'BAG' : 'ROLL',
              notes: `Payment at pickup`
            }
          })

          // Update order payment status
          const newTotalPaid = previousPayments + amountPaidNow
          let paymentStatus = 'PENDING_PAYMENT'
          if (newTotalPaid >= totalRevenue) {
            paymentStatus = 'FULLY_PAID'
          } else if (newTotalPaid > 0) {
            paymentStatus = 'PARTIAL_PAYMENT'
          }

          await tx.salesOrder.update({
            where: { id },
            data: {
              totalPaid: newTotalPaid,
              balancePaid: amountPaidNow,
              paymentStatus: paymentStatus as any
            }
          })

          // Auto-create invoice and complete order if fully paid at pickup
          if (paymentStatus === 'FULLY_PAID') {
            const autoInvoiceNumber = await invoiceRepository.getNextInvoiceNumber()

            const invoiceRollInclusive = quantity * Number(order.unitPrice)
            const invoicePackingBagsQty = packingBags || 0
            const invoiceBagInclusive = bagTotalAmount
            const invoiceTotalInclusive = invoiceRollInclusive + invoiceBagInclusive
            const { exclusive: invoiceRollExclusive, vat: invoiceRollVat } = decomposeInclusive(invoiceRollInclusive, vatRate)
            const { exclusive: invoiceBagExclusive, vat: invoiceBagVat } = decomposeInclusive(invoiceBagInclusive, vatRate)
            const invoiceVatAmount = invoiceRollVat + invoiceBagVat
            const invoiceSubtotalExcl = invoiceRollExclusive + invoiceBagExclusive
            const invoiceDepositApplied = Number(order.depositPaid)
            const invoiceCoreCreditApplied = Number(order.coreCreditApplied)
            const invoicePreviousPayments = newTotalPaid
            const invoiceBalanceDue = Math.max(0, invoiceTotalInclusive - invoiceDepositApplied - invoiceCoreCreditApplied - invoicePreviousPayments)

            const packingBagsUnitPriceVal = bagTotalAmount > 0 && (packingBags || 0) > 0
              ? bagTotalAmount / (packingBags || 1)
              : 0

            await tx.invoice.create({
              data: {
                invoiceNumber: autoInvoiceNumber,
                salesOrderId: order.id,
                customerId: order.customerId,
                quantityDelivered: quantity,
                unitPrice: new Prisma.Decimal(String(Number(order.unitPrice))),
                subtotal: new Prisma.Decimal(String(invoiceRollExclusive)),
                vatAmount: new Prisma.Decimal(String(invoiceVatAmount)),
                totalAmount: new Prisma.Decimal(String(invoiceTotalInclusive)),
                depositApplied: new Prisma.Decimal(String(invoiceDepositApplied)),
                coreCreditApplied: new Prisma.Decimal(String(invoiceCoreCreditApplied)),
                previousPayments: new Prisma.Decimal(String(invoicePreviousPayments)),
                balanceDue: new Prisma.Decimal(String(invoiceBalanceDue)),
                coresReturned: 0,
                packingBagsQuantity: invoicePackingBagsQty || 0,
                packingBagsUnitPrice: new Prisma.Decimal(String(packingBagsUnitPriceVal)),
                packingBagsSubtotal: new Prisma.Decimal(String(invoiceBagExclusive))
              }
            })

            await tx.salesOrder.update({
              where: { id },
              data: { status: 'COMPLETED' }
            })

            logger.info({ orderId: id, invoiceNumber: autoInvoiceNumber }, 'Invoice auto-created and order completed on full payment at pickup')
          }
        }
      } catch (financeErr) {
        logger.error({ err: financeErr, orderId: id }, 'Failed to post revenue journal at pickup - continuing anyway')
      }

      logger.info({ orderId: id, quantityPickedUp: quantity, totalDelivered: newDelivered, fullyDelivered, packingBags }, 'Sales order pickup recorded')

      return updated
    })
  },

  async createInvoice(input: { salesOrderId: string; quantityDelivered?: number; coresReturned?: number }, userId?: string) {
    const order = await salesOrderRepository.findById(input.salesOrderId)
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'READY' && order.status !== 'PICKED_UP') {
      throw new AppError(400, 'INVALID', 'Order must be ready or picked up to generate invoice')
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
      packingBagsUnitPrice = priceList?.pricePerPack ? Number(priceList.pricePerPack) : 0
    }
    const packingBagsInclusive = packingBagsQuantity * packingBagsUnitPrice
    
    const { exclusive: rollExcl, vat: rollVat } = decomposeInclusive(subtotal, vatRate)
    const { exclusive: bagsExcl, vat: bagsVat } = decomposeInclusive(packingBagsInclusive, vatRate)
    const vatAmount = rollVat + bagsVat
    const invoiceSubtotalExcl = rollExcl
    const packingBagsSubtotalExcl = bagsExcl
    const totalAmount = subtotal + packingBagsInclusive

    const depositApplied = Number(order.depositPaid)
    const coreCreditApplied = Number(order.coreCreditApplied)
    const previousPayments = Number(order.balancePaid)
    const balanceDue = totalAmount - depositApplied - coreCreditApplied - previousPayments

    const invoiceNumber = await invoiceRepository.getNextInvoiceNumber()

    let invoice
    try {
      invoice = await prisma.$transaction(async (tx) => {
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
            coreCreditApplied: new Prisma.Decimal(String(coreCreditApplied)),
            previousPayments: new Prisma.Decimal(String(previousPayments)),
            balanceDue: new Prisma.Decimal(String(balanceDue)),
            coresReturned: input.coresReturned || 0,
            packingBagsQuantity,
            packingBagsUnitPrice: new Prisma.Decimal(String(packingBagsUnitPrice)),
            packingBagsSubtotal: new Prisma.Decimal(String(packingBagsSubtotalExcl)),
            packingBagsPaid: new Prisma.Decimal('0')
          },
          include: { customer: true, salesOrder: true }
        })

        await tx.salesOrder.update({
          where: { id: order.id },
          data: { status: 'INVOICED', quantityDelivered: new Prisma.Decimal(String(quantityDelivered)) }
        })

        return createdInvoice
      })
    } catch (error: any) {
      if (error.code === 'P2002' || error.code === 'P2025') {
        throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Cannot invoice right now; accounting system temporarily unavailable.')
      }
      throw error
    }

    logger.info({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, orderId: order.id }, 'Invoice created')

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
    const totalAmountWithVat = subtotal

    const orderNumber = await salesOrderRepository.generateUniqueOrderNumber()
    const invoiceNumber = await invoiceRepository.getNextInvoiceNumber()

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
            quantityOrdered: new Prisma.Decimal(String(input.quantity)),
            quantityProduced: new Prisma.Decimal(String(input.quantity)),
            quantityDelivered: new Prisma.Decimal(String(input.quantity)),
            unitPrice: new Prisma.Decimal(String(input.unitPrice)),
            totalAmount: new Prisma.Decimal(String(totalAmountWithVat)),
            deliveryMethod: 'PICKUP' as any,
            depositRequired: new Prisma.Decimal('0'),
            status: 'INVOICED' as any,
            paymentStatus: 'FULLY_PAID' as any,
            approvedAt: new Date(),
            completedAt: new Date(),
            totalPaid: new Prisma.Decimal(String(totalAmountWithVat)),
            balancePaid: new Prisma.Decimal(String(totalAmountWithVat))
          }
        })

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            salesOrderId: order.id,
            customerId: effectiveCustomerId,
            quantityDelivered: input.quantity,
            unitPrice: new Prisma.Decimal(String(input.unitPrice)),
            subtotal: new Prisma.Decimal(String(subtotal)),
            vatAmount: new Prisma.Decimal(String(vatAmount)),
            totalAmount: new Prisma.Decimal(String(totalAmountWithVat)),
            depositApplied: new Prisma.Decimal('0'),
            coreCreditApplied: new Prisma.Decimal('0'),
            previousPayments: new Prisma.Decimal('0'),
            balanceDue: new Prisma.Decimal('0'),
            coresReturned: 0,
            packingBagsQuantity: input.quantity,
            packingBagsUnitPrice: new Prisma.Decimal(String(input.unitPrice)),
            packingBagsSubtotal: new Prisma.Decimal(String(packingBagsSubtotal)),
            packingBagsPaid: new Prisma.Decimal(String(totalAmountWithVat)),
            amountPaid: new Prisma.Decimal(String(totalAmountWithVat)),
            status: 'PAID' as any,
            paidAt: new Date()
          }
        })

        if (customerId) {
          await tx.paymentTransaction.create({
            data: {
              customerId,
              transactionType: 'PAYMENT',
              paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
              amount: new Prisma.Decimal(String(totalAmountWithVat)),
              referenceNumber: input.referenceNumber,
              notes: input.notes || `Packing bag sale: ${input.quantity} bags (Invoice ${invoiceNumber})`,
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
          const cashAccountId = await financeService.getAccountIdByCode('1000')

          await financeService.postJournalEntry({
            description: `Invoice ${invoiceNumber} - Packing Bags`,
            sourceModule: 'SALES',
            sourceId: invoice.id,
            reference: invoiceNumber,
            postedById: input.userId,
            lines: [
              { accountId: arAccountId, debit: totalAmountWithVat, credit: 0, memo: 'Accounts Receivable' },
              { accountId: packingBagRevenueId, debit: 0, credit: subtotal, memo: 'Packing Bags Revenue' }
            ].concat(
              vatAmount > 0 ? [{ accountId: vatOutputId, debit: 0, credit: vatAmount, memo: 'Output VAT' }] : []
            )
          }, tx)

          await financeService.postJournalEntry({
            description: `COGS - Packing Bags ${invoiceNumber}`,
            sourceModule: 'SALES',
            sourceId: invoice.id,
            reference: invoiceNumber,
            lines: [
              { accountId: cogsId, debit: packingBagsSubtotal, credit: 0, memo: 'COGS - Packing Bags' },
              { accountId: packingBagInventoryId, debit: 0, credit: packingBagsSubtotal, memo: 'Packing Bag Inventory' }
            ]
          }, tx)

          await financeService.postJournalEntry({
            description: `Payment - Packing Bags ${invoiceNumber}`,
            sourceModule: 'PAYMENT',
            sourceId: invoice.id,
            reference: input.referenceNumber || invoiceNumber,
            lines: [
              { accountId: cashAccountId, debit: totalAmountWithVat, credit: 0, memo: 'Cash received' },
              { accountId: arAccountId, debit: 0, credit: totalAmountWithVat, memo: 'AR cleared' }
            ]
          }, tx)
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
      totalAmount: totalAmountWithVat
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
  }
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
    paymentCategory?: 'ROLL' | 'BAG' | 'BOTH'
  }, userId?: string) {
    if (!input.salesOrderId && !input.customerId) {
      throw new AppError(400, 'VALIDATION', 'Either salesOrderId or customerId is required')
    }

    const payment = await paymentRepository.create({
      salesOrderId: input.salesOrderId,
      customerId: input.customerId!,
      transactionType: input.transactionType as any,
      paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
      amount: new Prisma.Decimal(String(input.amount)),
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      receivedById: userId,
      paymentCategory: input.paymentCategory as any
    })

    // Update sales order if linked
    if (input.salesOrderId) {
      const order = await salesOrderRepository.findById(input.salesOrderId)
      if (order) {
        const newPaid = Number(order.totalPaid) + Number(input.amount)
        let paymentStatus = 'PARTIAL_PAYMENT'
        if (newPaid >= Number(order.totalAmount)) {
          paymentStatus = 'FULLY_PAID'
        } else if (newPaid >= Number(order.depositRequired)) {
          paymentStatus = 'DEPOSIT_COMPLETE'
        }

        await salesOrderRepository.update(input.salesOrderId, {
          totalPaid: newPaid,
          balancePaid: newPaid,
          paymentStatus: paymentStatus as any
        })
      }
    }

    logger.info({ paymentId: payment.id, amount: input.amount }, 'Payment recorded')
    return payment
  },

  async getPayments(options?: { salesOrderId?: string; customerId?: string; dateFrom?: string; dateTo?: string }) {
    const where: any = {}
    if (options?.salesOrderId) where.salesOrderId = options.salesOrderId
    if (options?.customerId) where.customerId = options.customerId
    if (options?.dateFrom || options?.dateTo) {
      where.receivedAt = {}
      if (options.dateFrom) where.receivedAt.gte = new Date(options.dateFrom)
      if (options.dateTo) where.receivedAt.lte = new Date(options.dateTo)
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
  async createInvoice(input: { salesOrderId: string; quantityDelivered?: number; coresReturned?: number }, userId?: string) {
    return salesOrderService.createInvoice(input, userId)
  },

  async getInvoices(options?: { status?: string; customerId?: string }) {
    return invoiceRepository.findAll(options)
  },

  async getInvoiceById(id: string) {
    return invoiceRepository.findById(id)
  },

  async issueInvoice(id: string) {
    return invoiceRepository.update(id, { status: 'ISSUED' as any, issuedAt: new Date() })
  },

  async addPayment(invoiceId: string, amount: number, date: Date, reference?: string, notes?: string) {
    const invoice = await invoiceRepository.findById(invoiceId)
    if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found')

    const newAmountPaid = (Number(invoice.amountPaid) || 0) + amount
    const newStatus = newAmountPaid >= Number(invoice.totalAmount) ? 'PAID' : newAmountPaid > 0 ? 'PARTIAL' : invoice.status

    logger.info({ invoiceId, amount, newStatus }, 'Recording payment received')

    let payment
    try {
      payment = await prisma.$transaction(async (tx) => {
        const createdPayment = await tx.paymentReceived.create({
          data: {
            invoiceId,
            amount: new Prisma.Decimal(String(amount)),
            date: new Date(date),
            reference,
            notes
          }
        })

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            amountPaid: new Prisma.Decimal(String(newAmountPaid)),
            status: newStatus as any
          }
        })

        try {
          const cashAccountId = await financeService.getAccountIdByCode('1000')
          const bankAccountId = await financeService.getAccountIdByCode('1100')
          const arAccountId = await financeService.getAccountIdByCode('1200')

          await financeService.postJournalEntry({
            description: `Payment received - ${invoice.invoiceNumber}`,
            sourceModule: 'PAYMENT',
            sourceId: createdPayment.id,
            reference: reference || `Inv ${invoice.invoiceNumber}`,
            date: new Date(date),
            lines: [
              { accountId: cashAccountId, debit: amount, credit: 0, memo: 'Cash received' },
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
      createdAt: payment.createdAt
    }
  }
}

// Core Buyback Service
export const coreBuybackService = {
  async recordBuyback(input: {
    customerId?: string
    sellerName: string
    coresQuantity: number
    ratePerCore: number
    paymentMethod: string
    paidAmount?: number
  }) {
    const totalValue = input.coresQuantity * input.ratePerCore
    
    const buyback = await coreBuybackRepository.create({
      customerId: input.customerId,
      sellerName: input.sellerName,
      coresQuantity: input.coresQuantity,
      ratePerCore: input.ratePerCore,
      totalValue,
      paymentMethod: (PAYMENT_METHOD_MAP[input.paymentMethod] || input.paymentMethod) as any,
      paidAmount: input.paidAmount || totalValue
    })

    // Update customer core credit if applicable
    if (input.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: input.customerId } })
      if (customer) {
        const newBalance = Number(customer.coreCreditBalance) + totalValue
        await prisma.customer.update({
          where: { id: input.customerId },
          data: { coreCreditBalance: new Prisma.Decimal(String(newBalance)) }
        })
      }
    }

    logger.info({ buybackId: buyback.id, cores: input.coresQuantity, value: totalValue }, 'Core buyback recorded')
    return buyback
  },

  async getBuybacks(customerId?: string) {
    return coreBuybackRepository.findAll(customerId)
  }
}
