import { prisma } from '../../database'
import { Prisma } from '@prisma/client'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { salesOrderRepository, paymentRepository, invoiceRepository, coreBuybackRepository } from './repository'
import { inventoryService } from '../inventory/service'
import type { SpecsJson, SalesOrderInput, SalesOrderUpdateInput, PaymentInput, CoreBuybackInput } from './types'

const logger = createChildLogger('salesOrders:service')

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

  async recordPickup(id: string, userId?: string, quantityPickedUp?: number, packingBags?: number) {
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
        } catch (err) {
          logger.error({ err, orderId: id }, 'Failed to record packing bag sale')
        }
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
    const packingBagsSubtotal = packingBagsQuantity * packingBagsUnitPrice
    
    const vatAmount = subtotal * (vatRate / 100)
    const totalAmount = subtotal + packingBagsSubtotal + vatAmount

    const depositApplied = Number(order.depositPaid)
    const coreCreditApplied = Number(order.coreCreditApplied)
    const previousPayments = Number(order.balancePaid)
    const balanceDue = totalAmount - depositApplied - coreCreditApplied - previousPayments

    const invoiceNumber = await invoiceRepository.getNextInvoiceNumber()

    const invoice = await invoiceRepository.create({
      invoiceNumber,
      salesOrderId: order.id,
      customerId: order.customerId,
      quantityDelivered,
      unitPrice,
      subtotal,
      vatAmount,
      totalAmount,
      depositApplied,
      coreCreditApplied,
      previousPayments,
      balanceDue,
      coresReturned: input.coresReturned || 0,
      packingBagsQuantity,
      packingBagsUnitPrice,
      packingBagsSubtotal,
      packingBagsPaid: 0
    })

    await salesOrderRepository.update(order.id, {
      status: 'INVOICED',
      quantityDelivered
    })

    logger.info({ invoiceId: invoice.id, invoiceNumber, orderId: order.id }, 'Invoice created')

    return invoice
  },

  async sellPackingBags(input: {
    customerId: string
    quantity: number
    unitPrice: number
    paymentMethod: 'CASH' | 'BANK_TRANSFER'
    referenceNumber?: string
    notes?: string
    userId?: string
  }) {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId }
    })

    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }

    const material = await prisma.material.findFirst({
      where: { code: 'PBAG' }
    })

    if (!material) {
      throw new AppError(404, 'NOT_FOUND', 'Packing bag material not found')
    }

    const totalAmount = input.quantity * input.unitPrice

    await inventoryService.recordPackingBagChange(
      material.id,
      input.quantity,
      'SALE',
      input.referenceNumber,
      input.userId
    )

    const payment = await paymentRepository.create({
      customerId: input.customerId,
      transactionType: 'PAYMENT',
      paymentMethod: input.paymentMethod,
      amount: new Prisma.Decimal(String(totalAmount)),
      referenceNumber: input.referenceNumber,
      notes: input.notes || `Packing bag sale: ${input.quantity} bags`,
      receivedById: input.userId
    })

    logger.info({ customerId: input.customerId, quantity: input.quantity, totalAmount }, 'Packing bags sold')

    return {
      success: true,
      customer: { id: customer.id, name: customer.name },
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      totalAmount,
      payment: { id: payment.id, method: payment.paymentMethod, amount: Number(payment.amount) }
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
      paymentMethod: input.paymentMethod as any,
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
      paymentMethod: input.paymentMethod as any,
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
