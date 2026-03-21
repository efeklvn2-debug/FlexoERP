import { api } from './client'

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'IN_PRODUCTION' | 'COMPLETED' | 'CANCELLED'

export interface Customer {
  id: string
  name: string
  code: string
  email?: string
  phone?: string
  address?: string
  colors: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface OrderItem {
  id: string
  orderId: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string
  customer?: Customer
  status: OrderStatus
  totalAmount: number
  notes?: string
  dueDate?: string
  createdAt: string
  updatedAt: string
  createdById?: string
  items: OrderItem[]
}

export const salesApi = {
  // Customers
  getCustomers: async () => {
    return api.get<Customer[]>('/sales/customers')
  },
  getCustomer: async (id: string) => {
    return api.get<Customer>(`/sales/customers/${id}`)
  },
  createCustomer: async (data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>) => {
    return api.post<Customer>('/sales/customers', data)
  },
  updateCustomer: async (id: string, data: Partial<Customer>) => {
    return api.patch<Customer>(`/sales/customers/${id}`, data)
  },
  deleteCustomer: async (id: string) => {
    return api.delete(`/sales/customers/${id}`)
  },

  // Orders
  getOrders: async (filters?: { customerId?: string; status?: string }) => {
    const params = new URLSearchParams()
    if (filters?.customerId) params.append('customerId', filters.customerId)
    if (filters?.status) params.append('status', filters.status)
    const query = params.toString() ? `?${params.toString()}` : ''
    return api.get<Order[]>(`/sales/orders${query}`)
  },
  getOrder: async (id: string) => {
    return api.get<Order>(`/sales/orders/${id}`)
  },
  createOrder: async (data: {
    customerId: string
    notes?: string
    dueDate?: string
    items: { description: string; quantity: number; unitPrice: number }[]
  }) => {
    return api.post<Order>('/sales/orders', data)
  },
  updateOrder: async (id: string, data: Partial<Order>) => {
    return api.patch<Order>(`/sales/orders/${id}`, data)
  },
  cancelOrder: async (id: string) => {
    return api.delete(`/sales/orders/${id}`)
  }
}
