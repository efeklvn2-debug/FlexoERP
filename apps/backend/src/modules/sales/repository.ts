import { Prisma } from '@prisma/client'
import { prisma } from '../../database'
import { Customer, Order, OrderItem } from './types'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('sales:repository')

export const salesRepository = {
  // Customer methods
  async findCustomerById(id: string): Promise<Customer | null> {
    return prisma.customer.findUnique({ where: { id } }) as Promise<Customer | null>
  },

  async findCustomerByCode(code: string): Promise<Customer | null> {
    return prisma.customer.findUnique({ where: { code } }) as Promise<Customer | null>
  },

  async findAllCustomers(includeInactive = false): Promise<Customer[]> {
    const where = includeInactive ? {} : { isActive: true }
    return prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' }
    }) as Promise<Customer[]>
  },

  async createCustomer(data: {
    name: string
    code: string
    email?: string
    phone?: string
    address?: string
  }): Promise<Customer> {
    const customer = await prisma.customer.create({ data })
    logger.info({ customerId: customer.id, code: customer.code }, 'Customer created')
    return customer as Customer
  },

  async updateCustomer(id: string, data: Partial<Prisma.CustomerUpdateInput>): Promise<Customer> {
    const customer = await prisma.customer.update({ where: { id }, data })
    return customer as Customer
  },

  async deleteCustomer(id: string): Promise<void> {
    await prisma.customer.update({ where: { id }, data: { isActive: false } })
    logger.info({ customerId: id }, 'Customer deactivated')
  },

  // Order methods
  async findOrderById(id: string): Promise<Order | null> {
    return prisma.order.findUnique({
      where: { id },
      include: { customer: true, items: true }
    }) as Promise<Order | null>
  },

  async findOrderByNumber(orderNumber: string): Promise<Order | null> {
    return prisma.order.findUnique({
      where: { orderNumber },
      include: { customer: true, items: true }
    }) as Promise<Order | null>
  },

  async findAllOrders(filters?: {
    customerId?: string
    status?: string
  }): Promise<Order[]> {
    const where: Prisma.OrderWhereInput = {}
    if (filters?.customerId) where.customerId = filters.customerId
    if (filters?.status) where.status = filters.status as any

    return prisma.order.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { createdAt: 'desc' }
    }) as Promise<Order[]>
  },

  async generateOrderNumber(): Promise<string> {
    const today = new Date()
    const prefix = `ORD-${today.getFullYear()}-`
    
    const lastOrder = await prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' }
    })

    if (lastOrder) {
      const lastNumber = parseInt(lastOrder.orderNumber.replace(prefix, ''))
      return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`
    }

    return `${prefix}0001`
  },

  async createOrder(data: {
    orderNumber: string
    customerId: string
    status?: string
    totalAmount: number
    notes?: string
    dueDate?: Date
    createdById?: string
    items: { description: string; quantity: number; unitPrice: number; totalPrice: number }[]
  }): Promise<Order> {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber: data.orderNumber,
          customerId: data.customerId,
          status: (data.status || 'PENDING') as any,
          totalAmount: data.totalAmount,
          notes: data.notes,
          dueDate: data.dueDate,
          createdById: data.createdById,
          items: {
            create: data.items
          }
        },
        include: { customer: true, items: true }
      })
      logger.info({ orderId: order.id, orderNumber: order.orderNumber }, 'Order created')
      return order as Order
    })
  },

  async updateOrder(id: string, data: Partial<Prisma.OrderUpdateInput>): Promise<Order> {
    const order = await prisma.order.update({
      where: { id },
      data,
      include: { customer: true, items: true }
    })
    logger.info({ orderId: id }, 'Order updated')
    return order as Order
  },

  async deleteOrder(id: string): Promise<void> {
    await prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' as any }
    })
    logger.info({ orderId: id }, 'Order cancelled')
  }
}
