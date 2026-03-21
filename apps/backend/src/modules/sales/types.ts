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
  createdAt: Date
  updatedAt: Date
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
  dueDate?: Date
  createdAt: Date
  updatedAt: Date
  createdById?: string
  items: OrderItem[]
}
