import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { Prisma } from '@prisma/client'

async function generateUniqueCustomerCode(): Promise<string> {
  const prefix = 'C'
  const lastCustomer = await prisma.customer.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' }
  })
  
  if (!lastCustomer) {
    return `${prefix}0001`
  }
  
  const lastNum = parseInt(lastCustomer.code.replace(prefix, ''))
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
}

export const salesOrderRepository = {
  async findById(id: string) {
    return prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        payments: { orderBy: { receivedAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } }
      }
    })
  },

  async findByOrderNumber(orderNumber: string) {
    return prisma.salesOrder.findUnique({
      where: { orderNumber },
      include: {
        customer: true,
        payments: { orderBy: { receivedAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } }
      }
    })
  },

  async findAll(options?: {
    status?: string
    customerId?: string
    includeDeleted?: boolean
    limit?: number
    offset?: number
  }) {
    const where: any = {}
    
    if (!options?.includeDeleted) {
      where.isDeleted = false
    }
    if (options?.status) {
      where.status = options.status
    }
    if (options?.customerId) {
      where.customerId = options.customerId
    }

    return prisma.salesOrder.findMany({
      where,
      include: {
        customer: true,
        payments: { orderBy: { receivedAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0
    })
  },

  async getNextOrderNumber() {
    const year = new Date().getFullYear()
    const prefix = `SO-${year}-`
    
    const lastOrder = await prisma.salesOrder.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' }
    })
    
    if (!lastOrder) {
      return `${prefix}0001`
    }
    
    const lastNum = parseInt(lastOrder.orderNumber.replace(prefix, ''))
    return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
  },

  async generateUniqueOrderNumber() {
    const maxRetries = 5
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const orderNumber = await this.getNextOrderNumber()
      const exists = await prisma.salesOrder.findUnique({
        where: { orderNumber },
        select: { id: true }
      })
      if (!exists) {
        return orderNumber
      }
    }
    throw new AppError('Failed to generate unique order number', 500)
  },

  async create(data: {
    orderNumber: string
    customerId: string
    specsJson: any
    quantityOrdered: Prisma.Decimal | number
    unitPrice: Prisma.Decimal | number
    totalAmount: Prisma.Decimal | number
    deliveryMethod: string
    shippingAddress?: string
    depositRequired: Prisma.Decimal | number
  }) {
    return prisma.salesOrder.create({
      data: {
        orderNumber: data.orderNumber,
        customerId: data.customerId,
        specsJson: data.specsJson,
        quantityOrdered: new Prisma.Decimal(String(data.quantityOrdered)),
        unitPrice: new Prisma.Decimal(String(data.unitPrice)),
        totalAmount: new Prisma.Decimal(String(data.totalAmount)),
        deliveryMethod: data.deliveryMethod as any,
        shippingAddress: data.shippingAddress,
        depositRequired: new Prisma.Decimal(String(data.depositRequired)),
        status: 'PENDING' as any,
        paymentStatus: 'PENDING_PAYMENT' as any
      },
      include: {
        customer: true,
        payments: true,
        invoices: true
      }
    })
  },

  async update(id: string, data: any) {
    return prisma.salesOrder.update({
      where: { id },
      data: {
        ...data,
        specsJson: data.specsJson ? data.specsJson : undefined,
        quantityOrdered: data.quantityOrdered ? new Prisma.Decimal(String(data.quantityOrdered)) : undefined,
        unitPrice: data.unitPrice ? new Prisma.Decimal(String(data.unitPrice)) : undefined,
        totalAmount: data.totalAmount ? new Prisma.Decimal(String(data.totalAmount)) : undefined
      },
      include: {
        customer: true,
        payments: true,
        invoices: true
      }
    })
  },

  async updatePaymentStatus(id: string, data: {
    depositPaid?: Prisma.Decimal | number
    balancePaid?: Prisma.Decimal | number
    totalPaid?: Prisma.Decimal | number
    paymentStatus?: string
    coreCreditApplied?: Prisma.Decimal | number
  }) {
    const updateData: any = {}
    
    if (data.depositPaid !== undefined) {
      updateData.depositPaid = new Prisma.Decimal(String(data.depositPaid))
    }
    if (data.balancePaid !== undefined) {
      updateData.balancePaid = new Prisma.Decimal(String(data.balancePaid))
    }
    if (data.totalPaid !== undefined) {
      updateData.totalPaid = new Prisma.Decimal(String(data.totalPaid))
    }
    if (data.paymentStatus !== undefined) {
      updateData.paymentStatus = data.paymentStatus as any
    }
    if (data.coreCreditApplied !== undefined) {
      updateData.coreCreditApplied = new Prisma.Decimal(String(data.coreCreditApplied))
    }

    return prisma.salesOrder.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        payments: true,
        invoices: true
      }
    })
  },

  async softDelete(id: string) {
    return prisma.salesOrder.update({
      where: { id },
      data: { isDeleted: true }
    })
  },

  async linkToProductionJob(salesOrderId: string, productionJobId: string) {
    return prisma.salesOrder.update({
      where: { id: salesOrderId },
      data: {
        productionJobId,
        status: 'IN_PRODUCTION' as any
      }
    })
  },

  // Customers
  async getCustomers() {
    return prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    })
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
  }) {
    const code = input.code || await generateUniqueCustomerCode()
    return prisma.customer.create({
      data: {
        name: input.name,
        code,
        email: input.email,
        phone: input.phone,
        address: input.address,
        colors: input.colors || [],
        paymentType: input.paymentType || 'CASH',
        creditLimit: input.creditLimit || 0,
        depositPercentDefault: input.depositPercentDefault || 0,
        paymentTermsDays: input.paymentTermsDays || 0,
        notifyEmail: input.notifyEmail ?? true,
        notifyWhatsApp: input.notifyWhatsApp ?? true,
        isActive: true
      }
    })
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
    return prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.colors && { colors: input.colors }),
        ...(input.paymentType && { paymentType: input.paymentType }),
        ...(input.creditLimit !== undefined && { creditLimit: input.creditLimit }),
        ...(input.depositPercentDefault !== undefined && { depositPercentDefault: input.depositPercentDefault }),
        ...(input.paymentTermsDays !== undefined && { paymentTermsDays: input.paymentTermsDays }),
        ...(input.notifyEmail !== undefined && { notifyEmail: input.notifyEmail }),
        ...(input.notifyWhatsApp !== undefined && { notifyWhatsApp: input.notifyWhatsApp })
      }
    })
  },

  // Customer balance
  async getCustomerBalance(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })
    
    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }

    const orders = await prisma.salesOrder.findMany({
      where: {
        customerId,
        isDeleted: false,
        status: { not: 'CANCELLED' }
      },
      include: { invoices: true }
    })

    let totalOutstanding = 0
    let depositHeld = 0
    let ordersCount = orders.length

    for (const order of orders) {
      totalOutstanding += Number(order.totalAmount) - Number(order.totalPaid)
      depositHeld += Number(order.depositPaid)
    }

    return {
      customerId,
      customerName: customer.name,
      totalOutstanding,
      depositHeld,
      coreCreditBalance: Number(customer.coreCreditBalance),
      availableCredit: Number(customer.creditLimit) - totalOutstanding,
      ordersCount
    }
  },

  // Customer aging
  async getCustomerAging(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })

    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        customerId,
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] }
      },
      orderBy: { issuedAt: 'asc' }
    })

    const now = new Date()
    let current = 0
    let days31to60 = 0
    let days61to90 = 0
    let days90Plus = 0

    for (const invoice of invoices) {
      if (!invoice.issuedAt) continue
      
      const daysDiff = Math.floor((now.getTime() - new Date(invoice.issuedAt).getTime()) / (1000 * 60 * 60 * 24))
      const balance = Number(invoice.balanceDue)

      if (daysDiff <= 30) {
        current += balance
      } else if (daysDiff <= 60) {
        days31to60 += balance
      } else if (daysDiff <= 90) {
        days61to90 += balance
      } else {
        days90Plus += balance
      }
    }

    return {
      customerId,
      customerName: customer.name,
      current,
      days31to60,
      days61to90,
      days90Plus,
      total: current + days31to60 + days61to90 + days90Plus
    }
  },

  async getAllCustomerBalances() {
    const customers = await prisma.customer.findMany({
      where: { isActive: true }
    })

    const balances = []
    for (const customer of customers) {
      const orders = await prisma.salesOrder.findMany({
        where: {
          customerId: customer.id,
          status: { in: ['PENDING', 'APPROVED', 'MRP_PENDING', 'IN_PRODUCTION', 'READY', 'PICKED_UP', 'INVOICED'] }
        }
      })

      let totalOutstanding = 0
      let depositHeld = 0
      let ordersCount = orders.length

      for (const order of orders) {
        totalOutstanding += Number(order.totalAmount) - Number(order.totalPaid)
        depositHeld += Number(order.depositPaid)
      }

      balances.push({
        customerId: customer.id,
        customerName: customer.name,
        totalOutstanding,
        depositHeld,
        coreCreditBalance: Number(customer.coreCreditBalance),
        availableCredit: Number(customer.creditLimit) - totalOutstanding,
        ordersCount
      })
    }

    return balances
  }
}

export const paymentRepository = {
  async create(data: {
    salesOrderId?: string
    customerId?: string
    transactionType: string
    paymentMethod: string
    amount: Prisma.Decimal | number
    referenceNumber?: string
    notes?: string
    sellerName?: string
    coresQuantity?: number
    coreCreditBalance?: Prisma.Decimal | number
    receivedById?: string
  }) {
    return prisma.paymentTransaction.create({
      data: {
        salesOrderId: data.salesOrderId,
        customerId: data.customerId,
        transactionType: data.transactionType as any,
        paymentMethod: data.paymentMethod as any,
        amount: new Prisma.Decimal(String(data.amount)),
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        sellerName: data.sellerName,
        coresQuantity: data.coresQuantity,
        coreCreditBalance: data.coreCreditBalance ? new Prisma.Decimal(String(data.coreCreditBalance)) : null,
        receivedById: data.receivedById
      }
    })
  },

  async findBySalesOrder(salesOrderId: string) {
    return prisma.paymentTransaction.findMany({
      where: { salesOrderId },
      orderBy: { receivedAt: 'desc' }
    })
  },

  async findByCustomer(customerId: string, options?: { limit?: number; offset?: number }) {
    return prisma.paymentTransaction.findMany({
      where: { customerId },
      orderBy: { receivedAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0
    })
  },

  async findAll(options?: { transactionType?: string; dateFrom?: Date; dateTo?: Date }) {
    const where: any = {}
    
    if (options?.transactionType) {
      where.transactionType = options.transactionType
    }
    if (options?.dateFrom || options?.dateTo) {
      where.receivedAt = {}
      if (options.dateFrom) where.receivedAt.gte = options.dateFrom
      if (options.dateTo) where.receivedAt.lte = options.dateTo
    }

    return prisma.paymentTransaction.findMany({
      where,
      include: {
        customer: true,
        salesOrder: true
      },
      orderBy: { receivedAt: 'desc' }
    })
  }
}

export const invoiceRepository = {
  async getNextInvoiceNumber() {
    const year = new Date().getFullYear()
    const prefix = `INV-${year}-`
    
    const lastInvoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' }
    })
    
    if (!lastInvoice) {
      return `${prefix}0001`
    }
    
    const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ''))
    return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
  },

  async create(data: {
    invoiceNumber: string
    salesOrderId: string
    customerId: string
    quantityDelivered: Prisma.Decimal | number
    unitPrice: Prisma.Decimal | number
    subtotal: Prisma.Decimal | number
    vatAmount: Prisma.Decimal | number
    totalAmount: Prisma.Decimal | number
    depositApplied: Prisma.Decimal | number
    coreCreditApplied: Prisma.Decimal | number
    previousPayments: Prisma.Decimal | number
    balanceDue: Prisma.Decimal | number
    coresReturned?: number
    packingBagsQuantity?: number
    packingBagsUnitPrice?: number
    packingBagsSubtotal?: number
    packingBagsPaid?: number
  }) {
    return prisma.invoice.create({
      data: {
        invoiceNumber: data.invoiceNumber,
        salesOrderId: data.salesOrderId,
        customerId: data.customerId,
        quantityDelivered: new Prisma.Decimal(String(data.quantityDelivered)),
        unitPrice: new Prisma.Decimal(String(data.unitPrice)),
        subtotal: new Prisma.Decimal(String(data.subtotal)),
        vatAmount: new Prisma.Decimal(String(data.vatAmount)),
        totalAmount: new Prisma.Decimal(String(data.totalAmount)),
        depositApplied: new Prisma.Decimal(String(data.depositApplied)),
        coreCreditApplied: new Prisma.Decimal(String(data.coreCreditApplied)),
        previousPayments: new Prisma.Decimal(String(data.previousPayments)),
        balanceDue: new Prisma.Decimal(String(data.balanceDue)),
        coresReturned: data.coresReturned || 0,
        packingBagsQuantity: data.packingBagsQuantity || 0,
        packingBagsUnitPrice: new Prisma.Decimal(String(data.packingBagsUnitPrice || 0)),
        packingBagsSubtotal: new Prisma.Decimal(String(data.packingBagsSubtotal || 0)),
        packingBagsPaid: new Prisma.Decimal(String(data.packingBagsPaid || 0)),
        status: 'DRAFT' as any
      },
      include: {
        customer: true,
        salesOrder: { include: { customer: true } }
      }
    })
  },

  async findById(id: string) {
    return prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: true
      }
    })
  },

  async findAll(options?: {
    status?: string
    customerId?: string
  }) {
    const where: any = {}
    if (options?.status) where.status = options.status
    if (options?.customerId) where.customerId = options.customerId

    return prisma.invoice.findMany({
      where,
      include: {
        customer: true,
        salesOrder: true
      },
      orderBy: { createdAt: 'desc' }
    })
  },

  async update(id: string, data: any) {
    return prisma.invoice.update({
      where: { id },
      data
    })
  }
}

export const coreBuybackRepository = {
  async create(data: {
    customerId?: string
    sellerName?: string
    coresQuantity: number
    ratePerCore: Prisma.Decimal | number
    totalValue: Prisma.Decimal | number
    paymentMethod: string
    paidAmount?: Prisma.Decimal | number
    recordedById?: string
    notes?: string
  }) {
    return prisma.coreBuyback.create({
      data: {
        customerId: data.customerId,
        sellerName: data.sellerName,
        coresQuantity: data.coresQuantity,
        ratePerCore: new Prisma.Decimal(String(data.ratePerCore)),
        totalValue: new Prisma.Decimal(String(data.totalValue)),
        transactionType: 'CORE_BUYBACK' as any,
        paymentMethod: data.paymentMethod as any,
        paidAmount: data.paidAmount ? new Prisma.Decimal(String(data.paidAmount)) : new Prisma.Decimal('0'),
        recordedById: data.recordedById,
        notes: data.notes
      }
    })
  },

  async findAll(options?: { customerId?: string; dateFrom?: Date; dateTo?: Date }) {
    const where: any = {}
    if (options?.customerId) where.customerId = options.customerId
    if (options?.dateFrom || options?.dateTo) {
      where.date = {}
      if (options.dateFrom) where.date.gte = options.dateFrom
      if (options.dateTo) where.date.lte = options.dateTo
    }

    return prisma.coreBuyback.findMany({
      where,
      include: { customer: true },
      orderBy: { date: 'desc' }
    })
  }
}
