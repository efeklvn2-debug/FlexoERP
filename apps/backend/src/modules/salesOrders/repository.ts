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
        invoices: { orderBy: { issuedAt: 'desc' } },
        productionJob: {
          include: {
            printedRolls: {
              where: { status: 'IN_STOCK' },
              select: { id: true, weightUsed: true, status: true, rollId: true }
            }
          }
        }
      }
    })
  },

  async findByOrderNumber(orderNumber: string) {
    return prisma.salesOrder.findUnique({
      where: { orderNumber },
      include: {
        customer: true,
        payments: { orderBy: { receivedAt: 'desc' } },
        invoices: { orderBy: { issuedAt: 'desc' } },
        productionJob: {
          include: {
            printedRolls: {
              where: { status: 'IN_STOCK' },
              select: { id: true, weightUsed: true, status: true, rollId: true }
            }
          }
        }
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
        invoices: { orderBy: { issuedAt: 'desc' } },
        productionJob: {
          select: {
            id: true,
            jobNumber: true,
            printedRolls: {
              where: { status: 'IN_STOCK' },
              select: { id: true, weightUsed: true, status: true, rollId: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 500,
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
    throw new AppError(500, 'GENERATION_FAILED', 'Failed to generate unique order number')
  },

  async create(data: {
    orderNumber: string
    customerId: string
    specsJson: any
    quantityOrdered: Prisma.Decimal | number
    quantityProduced?: Prisma.Decimal | number
    quantityDelivered?: Prisma.Decimal | number
    unitPrice: Prisma.Decimal | number
    totalAmount: Prisma.Decimal | number
    deliveryMethod: string
    shippingAddress?: string
    depositRequired: Prisma.Decimal | number
    status?: string
    approvedAt?: Date
    completedAt?: Date
    totalPaid?: Prisma.Decimal | number
    balancePaid?: Prisma.Decimal | number
    paymentStatus?: string
  }) {
    return prisma.salesOrder.create({
      data: {
        orderNumber: data.orderNumber,
        customerId: data.customerId,
        specsJson: data.specsJson,
        quantityOrdered: new Prisma.Decimal(String(data.quantityOrdered)),
        quantityProduced: data.quantityProduced ? new Prisma.Decimal(String(data.quantityProduced)) : undefined,
        quantityDelivered: data.quantityDelivered ? new Prisma.Decimal(String(data.quantityDelivered)) : undefined,
        unitPrice: new Prisma.Decimal(String(data.unitPrice)),
        totalAmount: new Prisma.Decimal(String(data.totalAmount)),
        deliveryMethod: data.deliveryMethod as any,
        shippingAddress: data.shippingAddress,
        depositRequired: new Prisma.Decimal(String(data.depositRequired)),
        status: (data.status || 'PENDING') as any,
        paymentStatus: data.paymentStatus || 'PENDING_PAYMENT' as any,
        approvedAt: data.approvedAt,
        completedAt: data.completedAt,
        totalPaid: data.totalPaid ? new Prisma.Decimal(String(data.totalPaid)) : undefined,
        balancePaid: data.balancePaid ? new Prisma.Decimal(String(data.balancePaid)) : undefined
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

    // Add standalone deposits (no salesOrderId) that sit in 2250 Advance Customer Payments
    const standaloneDeposits = await prisma.paymentTransaction.aggregate({
      where: { customerId, transactionType: 'DEPOSIT', salesOrderId: null },
      _sum: { amount: true }
    })
    const standaloneDepositTotal = Number(standaloneDeposits._sum.amount || 0)

    // Subtract deposits already applied to invoices
    const appliedDeposits = await prisma.invoice.aggregate({
      where: { customerId },
      _sum: { depositApplied: true }
    })
    const appliedDepositTotal = Number(appliedDeposits._sum.depositApplied || 0)

    const advancePaymentBalance = standaloneDepositTotal - appliedDepositTotal
    depositHeld += advancePaymentBalance

    // Available printed rolls (IN_STOCK) for this customer via productionJob.customerName
    const availableRollsCount = await prisma.printedRoll.count({
      where: {
        status: 'IN_STOCK',
        productionJob: { customerName: customer.name }
      }
    })

    // Last transaction date across orders, invoices, and payments
    const lastOrder = await prisma.salesOrder.findFirst({
      where: { customerId, isDeleted: false },
      orderBy: [{ approvedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { approvedAt: true, createdAt: true }
    })
    const lastPayment = await prisma.paymentTransaction.findFirst({
      where: { customerId },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true }
    })
    const lastInvoice = await prisma.invoice.findFirst({
      where: { customerId },
      orderBy: { issuedAt: 'desc' },
      select: { issuedAt: true }
    })

    const dates: Date[] = []
    if (lastOrder?.approvedAt) dates.push(lastOrder.approvedAt)
    else if (lastOrder?.createdAt) dates.push(lastOrder.createdAt)
    if (lastPayment?.receivedAt) dates.push(lastPayment.receivedAt)
    if (lastInvoice?.issuedAt) dates.push(lastInvoice.issuedAt)
    const lastTransactionDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))).toISOString() : null

    return {
      customerId,
      customerName: customer.name,
      totalOutstanding,
      depositHeld,
      availableCredit: Number(customer.creditLimit) - totalOutstanding,
      ordersCount,
      availableRollsCount,
      lastTransactionDate
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

    // Batch: IN_STOCK printed rolls grouped by customer name via production job
    const inStockRolls = await prisma.printedRoll.findMany({
      where: { status: 'IN_STOCK' },
      select: { productionJob: { select: { customerName: true } } }
    })
    const rollCountByName: Record<string, number> = {}
    for (const roll of inStockRolls) {
      const name = roll.productionJob.customerName
      if (name) {
        rollCountByName[name] = (rollCountByName[name] || 0) + 1
      }
    }

    // Batch: latest transaction date per customer
    const latestOrders = await prisma.salesOrder.groupBy({
      by: ['customerId'],
      _max: { createdAt: true },
      where: { isDeleted: false }
    })
    const latestPayments = await prisma.paymentTransaction.groupBy({
      by: ['customerId'],
      _max: { receivedAt: true }
    })
    const latestInvoices = await prisma.invoice.groupBy({
      by: ['customerId'],
      _max: { createdAt: true }
    })
    const lastDateByCustomerId: Record<string, string> = {}
    for (const o of latestOrders) {
      if (o._max.createdAt && o.customerId) {
        const curr = lastDateByCustomerId[o.customerId]
        const ts = o._max.createdAt.toISOString()
        if (!curr || ts > curr) lastDateByCustomerId[o.customerId] = ts
      }
    }
    for (const p of latestPayments) {
      if (p._max.receivedAt && p.customerId) {
        const curr = lastDateByCustomerId[p.customerId]
        const ts = p._max.receivedAt.toISOString()
        if (!curr || ts > curr) lastDateByCustomerId[p.customerId] = ts
      }
    }
    for (const i of latestInvoices) {
      if (i._max.createdAt && i.customerId) {
        const curr = lastDateByCustomerId[i.customerId]
        const ts = i._max.createdAt.toISOString()
        if (!curr || ts > curr) lastDateByCustomerId[i.customerId] = ts
      }
    }

    const balances = []
    for (const customer of customers) {
      const orders = await prisma.salesOrder.findMany({
        where: {
          customerId: customer.id,
          isDeleted: false,
          status: { not: 'CANCELLED' }
        }
      })

      let totalOutstanding = 0
      let depositHeld = 0
      let ordersCount = orders.length

      for (const order of orders) {
        totalOutstanding += Number(order.totalAmount) - Number(order.totalPaid)
        depositHeld += Number(order.depositPaid)
      }

      const standaloneDeposits = await prisma.paymentTransaction.aggregate({
        where: { customerId: customer.id, transactionType: 'DEPOSIT', salesOrderId: null },
        _sum: { amount: true }
      })
      const standaloneDepositTotal = Number(standaloneDeposits._sum.amount || 0)

      // Subtract deposits already applied to invoices
      const appliedDeposits = await prisma.invoice.aggregate({
        where: { customerId: customer.id },
        _sum: { depositApplied: true }
      })
      const appliedDepositTotal = Number(appliedDeposits._sum.depositApplied || 0)

      const advancePaymentBalance = standaloneDepositTotal - appliedDepositTotal
      depositHeld += advancePaymentBalance

      balances.push({
        customerId: customer.id,
        customerName: customer.name,
        totalOutstanding,
        depositHeld,
        availableCredit: Number(customer.creditLimit) - totalOutstanding,
        ordersCount,
        availableRollsCount: rollCountByName[customer.name] || 0,
        lastTransactionDate: lastDateByCustomerId[customer.id] || null
      })
    }

    return balances
  },

  // Customer transaction history
  async getCustomerTransactions(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true }
    })
    if (!customer) throw new AppError(404, 'NOT_FOUND', 'Customer not found')

    const [orders, invoices, payments, coreBuybacks] = await Promise.all([
      prisma.salesOrder.findMany({
        where: { customerId, isDeleted: false },
        include: { productionJob: { select: { jobNumber: true } } },
        orderBy: [{ approvedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
      }),
      prisma.invoice.findMany({
        where: { customerId },
        orderBy: { issuedAt: 'desc' }
      }),
      prisma.paymentTransaction.findMany({
        where: { customerId },
        orderBy: { receivedAt: 'desc' }
      }),
      prisma.coreBuyback.findMany({
        where: { customerId },
        orderBy: { date: 'desc' }
      })
    ])

    const transactions: {
      id: string
      type: 'ORDER' | 'INVOICE' | 'PAYMENT' | 'CORE_BUYBACK'
      date: string
      description: string
      amount: number
      status: string
      reference: string
    }[] = []

    for (const o of orders) {
      transactions.push({
        id: o.id,
        type: 'ORDER',
        date: o.createdAt.toISOString(),
        description: `Sales Order${o.productionJob?.jobNumber ? ` (Job ${o.productionJob.jobNumber})` : ''}`,
        amount: Number(o.totalAmount),
        status: o.status,
        reference: o.orderNumber
      })
    }

    for (const inv of invoices) {
      transactions.push({
        id: inv.id,
        type: 'INVOICE',
        date: (inv.issuedAt || inv.createdAt).toISOString(),
        description: `Invoice - ${inv.status === 'PAID' ? 'Paid' : 'Balance Due: ₦' + Number(inv.balanceDue).toLocaleString()}`,
        amount: Number(inv.totalAmount),
        status: inv.status,
        reference: inv.invoiceNumber
      })
    }

    for (const p of payments) {
      transactions.push({
        id: p.id,
        type: 'PAYMENT',
        date: p.receivedAt.toISOString(),
        description: p.transactionType.replace(/_/g, ' ') + (p.paymentMethod ? ` (${p.paymentMethod})` : ''),
        amount: Number(p.amount),
        status: p.transactionType,
        reference: p.referenceNumber || '-'
      })
    }

    for (const cb of coreBuybacks) {
      transactions.push({
        id: cb.id,
        type: 'CORE_BUYBACK',
        date: cb.date.toISOString(),
        description: `${cb.coresQuantity} cores @ ₦${Number(cb.ratePerCore).toLocaleString()}`,
        amount: Number(cb.totalValue),
        status: 'COMPLETED',
        reference: cb.id.slice(0, 8)
      })
    }

    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return transactions
  },
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

  async findById(id: string) {
    return prisma.paymentTransaction.findUnique({
      where: { id },
      include: { customer: true, salesOrder: true }
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
    previousPayments: Prisma.Decimal | number
    balanceDue: Prisma.Decimal | number
    packingBagsQuantity?: Prisma.Decimal | number
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
        previousPayments: new Prisma.Decimal(String(data.previousPayments)),
        balanceDue: new Prisma.Decimal(String(data.balanceDue)),
        packingBagsQuantity: data.packingBagsQuantity ? new Prisma.Decimal(String(data.packingBagsQuantity)) : undefined,
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
        salesOrder: true,
        payments: true
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
        salesOrder: true,
        payments: true
      },
      orderBy: { issuedAt: 'desc' }
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
  }, tx?: Prisma.TransactionClient) {
    const db = tx || prisma
    return db.coreBuyback.create({
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
  },
}

export const receiptRepository = {
  async getNextReceiptNumber() {
    const year = new Date().getFullYear()
    const prefix = `REC-${year}-`

    const lastReceipt = await prisma.receipt.findFirst({
      where: { receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: 'desc' }
    })

    if (!lastReceipt) {
      return `${prefix}0001`
    }

    const lastNum = parseInt(lastReceipt.receiptNumber.replace(prefix, ''))
    return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
  },

  async create(data: {
    receiptNumber: string
    paymentTransactionId: string
    customerName: string
    amount: Prisma.Decimal | number
    paymentMethod: string
    referenceNumber?: string
    generatedById: string
  }) {
    return prisma.receipt.create({
      data: {
        receiptNumber: data.receiptNumber,
        paymentTransactionId: data.paymentTransactionId,
        customerName: data.customerName,
        amount: new Prisma.Decimal(String(data.amount)),
        paymentMethod: String(data.paymentMethod),
        referenceNumber: data.referenceNumber,
        generatedById: data.generatedById
      }
    })
  },

  async findById(id: string) {
    return prisma.receipt.findUnique({
      where: { id },
      include: {
        paymentTransaction: {
          include: {
            customer: true,
            salesOrder: true
          }
        },
        generatedBy: { select: { id: true, username: true } }
      }
    })
  },

  async findByPaymentTransactionId(paymentTransactionId: string) {
    return prisma.receipt.findFirst({
      where: { paymentTransactionId },
      orderBy: { generatedAt: 'desc' }
    })
  }
}
