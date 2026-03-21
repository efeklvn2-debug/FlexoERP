import { salesRepository } from './repository'
import { CustomerInput, CustomerUpdateInput, OrderInput, OrderUpdateInput } from './validation'
import { Customer, Order } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('sales:service')

export const salesService = {
  // Customer operations
  async getAllCustomers(includeInactive = false): Promise<Customer[]> {
    return salesRepository.findAllCustomers(includeInactive)
  },

  async getCustomerById(id: string): Promise<Customer> {
    const customer = await salesRepository.findCustomerById(id)
    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }
    return customer
  },

  async createCustomer(input: CustomerInput): Promise<Customer> {
    const existing = await salesRepository.findCustomerByCode(input.code)
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'Customer code already exists')
    }
    logger.info({ code: input.code, name: input.name }, 'Creating customer')
    return salesRepository.createCustomer(input)
  },

  async updateCustomer(id: string, input: CustomerUpdateInput): Promise<Customer> {
    const existing = await salesRepository.findCustomerById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }

    if (input.code && input.code !== existing.code) {
      const codeExists = await salesRepository.findCustomerByCode(input.code)
      if (codeExists) {
        throw new AppError(409, 'CONFLICT', 'Customer code already exists')
      }
    }

    logger.info({ customerId: id, updates: input }, 'Updating customer')
    return salesRepository.updateCustomer(id, input)
  },

  async deleteCustomer(id: string): Promise<void> {
    const existing = await salesRepository.findCustomerById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }
    logger.info({ customerId: id }, 'Deactivating customer')
    await salesRepository.deleteCustomer(id)
  },

  // Order operations
  async getAllOrders(filters?: { customerId?: string; status?: string }): Promise<Order[]> {
    return salesRepository.findAllOrders(filters)
  },

  async getOrderById(id: string): Promise<Order> {
    const order = await salesRepository.findOrderById(id)
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Order not found')
    }
    return order
  },

  async createOrder(input: OrderInput, userId?: string): Promise<Order> {
    const customer = await salesRepository.findCustomerById(input.customerId)
    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer not found')
    }

    const totalAmount = input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    const orderNumber = await salesRepository.generateOrderNumber()

    const items = input.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice
    }))

    logger.info({ orderNumber, customerId: input.customerId, totalAmount }, 'Creating order')
    return salesRepository.createOrder({
      orderNumber,
      customerId: input.customerId,
      totalAmount,
      notes: input.notes,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      createdById: userId,
      items
    })
  },

  async updateOrder(id: string, input: OrderUpdateInput, userId?: string): Promise<Order> {
    const existing = await salesRepository.findOrderById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Order not found')
    }

    logger.info({ orderId: id, updates: input, userId }, 'Updating order')
    return salesRepository.updateOrder(id, {
      ...input,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined
    })
  },

  async cancelOrder(id: string): Promise<void> {
    const existing = await salesRepository.findOrderById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Order not found')
    }
    logger.info({ orderId: id }, 'Cancelling order')
    await salesRepository.deleteOrder(id)
  }
}
