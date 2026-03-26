import { api } from './client'

export type DeliveryMethod = 'PICKUP' | 'SHIPPING'
export type MTOOrderStatus = 'PENDING' | 'APPROVED' | 'MRP_PENDING' | 'IN_PRODUCTION' | 'READY' | 'PICKED_UP' | 'INVOICED' | 'COMPLETED' | 'CANCELLED'
export type MTOPaymentStatus = 'PENDING_PAYMENT' | 'PARTIAL_DEPOSIT' | 'DEPOSIT_COMPLETE' | 'PARTIAL_PAYMENT' | 'FULLY_PAID' | 'OVERPAID'
export type TransactionType = 'DEPOSIT' | 'PAYMENT' | 'CORE_BUYBACK' | 'CORE_CREDIT_APPLIED' | 'REFUND'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CORE_CREDIT'
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED'

export interface SpecsJson {
  width?: number
  color?: string
  material?: string
  gsm?: number
  notes?: string
  [key: string]: any
}

export interface Customer {
  id: string
  name: string
  code: string
  email?: string
  phone?: string
  address?: string
  paymentType: 'CASH' | 'CREDIT'
  creditLimit: number
  depositPercentDefault: number
  paymentTermsDays: number
  coreCreditBalance: number
  notifyEmail: boolean
  notifyWhatsApp: boolean
}

export interface SalesOrder {
  id: string
  orderNumber: string
  customerId: string
  customer: Customer
  specsJson: SpecsJson
  quantityOrdered: number
  quantityProduced?: number
  quantityDelivered: number
  packingBagsQuantity?: number
  unitPrice: number
  totalAmount: number
  deliveryMethod: DeliveryMethod
  shippingAddress?: string
  depositRequired: number
  depositPaid: number
  balancePaid: number
  totalPaid: number
  paymentStatus: MTOPaymentStatus
  coreCreditApplied: number
  status: MTOOrderStatus
  productionJobId?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
  cancelledAt?: string
  completedAt?: string
  payments: PaymentTransaction[]
  invoices: Invoice[]
}

export interface PaymentTransaction {
  id: string
  salesOrderId?: string
  customerId?: string
  transactionType: TransactionType
  paymentMethod: PaymentMethod
  amount: number
  referenceNumber?: string
  notes?: string
  sellerName?: string
  coresQuantity?: number
  coreCreditBalance?: number
  receivedAt: string
  customer?: Customer
  salesOrder?: SalesOrder
}

export interface Invoice {
  id: string
  invoiceNumber: string
  salesOrderId: string
  customerId: string
  quantityDelivered: number
  unitPrice: number
  subtotal: number
  vatAmount: number
  totalAmount: number
  depositApplied: number
  coreCreditApplied: number
  previousPayments: number
  balanceDue: number
  coresReturned: number
  packingBagsQuantity?: number
  packingBagsUnitPrice?: number
  packingBagsSubtotal?: number
  packingBagsPaid?: number
  status: InvoiceStatus
  issuedAt?: string
  dueDate?: string
  paidAt?: string
  createdAt: string
  customer?: Customer
  salesOrder?: SalesOrder
}

export interface CoreBuyback {
  id: string
  date: string
  customerId?: string
  sellerName?: string
  coresQuantity: number
  ratePerCore: number
  totalValue: number
  paymentMethod: PaymentMethod
  paidAmount: number
  customer?: Customer
}

export interface CustomerBalance {
  customerId: string
  customerName: string
  totalOutstanding: number
  depositHeld: number
  coreCreditBalance: number
  availableCredit: number
  ordersCount: number
}

export interface CustomerAging {
  customerId: string
  customerName: string
  current: number
  days31to60: number
  days61to90: number
  days90Plus: number
  total: number
}

export const ORDER_STATUS_LABELS: Record<MTOOrderStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  MRP_PENDING: 'Awaiting Materials',
  IN_PRODUCTION: 'In Production',
  READY: 'Ready for Pickup',
  PICKED_UP: 'Picked Up',
  INVOICED: 'Invoiced',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
}

export const PAYMENT_STATUS_LABELS: Record<MTOPaymentStatus, string> = {
  PENDING_PAYMENT: 'Pending Payment',
  PARTIAL_DEPOSIT: 'Partial Deposit',
  DEPOSIT_COMPLETE: 'Deposit Complete',
  PARTIAL_PAYMENT: 'Partial Payment',
  FULLY_PAID: 'Fully Paid',
  OVERPAID: 'Overpaid'
}

export const salesOrderApi = {
  // Orders
  getOrders: (params?: { status?: string; customerId?: string }) => {
    const query = new URLSearchParams()
    if (params?.status) query.append('status', params.status)
    if (params?.customerId) query.append('customerId', params.customerId)
    const queryStr = query.toString()
    return api.get<SalesOrder[]>(`/sales-orders/orders${queryStr ? '?' + queryStr : ''}`)
  },
  getOrderById: (id: string) => api.get<SalesOrder>(`/sales-orders/orders/${id}`),
  createOrder: (data: {
    customerId: string
    specsJson: SpecsJson
    quantityOrdered: number
    unitPrice: number
    deliveryMethod?: DeliveryMethod
    shippingAddress?: string
  }) => api.post<SalesOrder>('/sales-orders/orders', data),
  updateOrder: (id: string, data: any) => api.patch<SalesOrder>(`/sales-orders/orders/${id}`, data),
  approveOrder: (id: string) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/approve`, {}),
  startProduction: (id: string, data: {
    machine: string
    category?: string
    rollIds: string[]
    printedRollWeights: number[]
    wasteWeight?: number
    notes?: string
  }) => api.patch<{ order: SalesOrder; productionJob: any }>(`/sales-orders/orders/${id}/start-production`, data),
  cancelOrder: (id: string) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/cancel`, {}),
  markReady: (id: string) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/ready`, {}),
  recordPickup: (id: string, quantityPickedUp?: number, packingBags?: number) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/pickup`, { quantityPickedUp, packingBags }),

  // Payments
  recordPayment: (data: {
    salesOrderId?: string
    customerId?: string
    transactionType: TransactionType
    paymentMethod: PaymentMethod
    paymentCategory?: 'ROLL' | 'BAG' | 'BOTH'
    amount: number
    referenceNumber?: string
    notes?: string
  }) => api.post<PaymentTransaction>('/sales-orders/payments', data),
  getPayments: (params?: { salesOrderId?: string; customerId?: string }) => {
    const query = new URLSearchParams()
    if (params?.salesOrderId) query.append('salesOrderId', params.salesOrderId)
    if (params?.customerId) query.append('customerId', params.customerId)
    const queryStr = query.toString()
    return api.get<PaymentTransaction[]>(`/sales-orders/payments${queryStr ? '?' + queryStr : ''}`)
  },
  getPaymentsByOrder: (salesOrderId: string) => api.get<PaymentTransaction[]>(`/sales-orders/payments/order/${salesOrderId}`),

  // Invoices
  createInvoice: (data: { salesOrderId: string; quantityDelivered?: number; coresReturned?: number }) =>
    api.post<Invoice>('/sales-orders/invoices', data),
  getInvoices: (params?: { status?: string; customerId?: string }) => {
    const query = new URLSearchParams()
    if (params?.status) query.append('status', params.status)
    if (params?.customerId) query.append('customerId', params.customerId)
    const queryStr = query.toString()
    return api.get<Invoice[]>(`/sales-orders/invoices${queryStr ? '?' + queryStr : ''}`)
  },
  getInvoiceById: (id: string) => api.get<Invoice>(`/sales-orders/invoices/${id}`),
  issueInvoice: (id: string) => api.patch<Invoice>(`/sales-orders/invoices/${id}/issue`, {}),

  // Core Buyback
  recordCoreBuyback: (data: {
    customerId?: string
    sellerName?: string
    coresQuantity: number
    paymentMethod: PaymentMethod
    notes?: string
  }) => api.post<CoreBuyback>('/sales-orders/core-buyback', data),
  getCoreBuybacks: (params?: { customerId?: string }) => {
    const query = new URLSearchParams()
    if (params?.customerId) query.append('customerId', params.customerId)
    const queryStr = query.toString()
    return api.get<CoreBuyback[]>(`/sales-orders/core-buyback${queryStr ? '?' + queryStr : ''}`)
  },
  getCustomerCoreBalance: (customerId: string) => api.get<{ customerId: string; customerName: string; coreCreditBalance: number }>(`/sales-orders/core-buyback/customer/${customerId}`),

  // Customer Balance
  getCustomerBalance: (customerId: string) => api.get<CustomerBalance>(`/sales-orders/customers/${customerId}/balance`),
  getCustomerAging: (customerId: string) => api.get<CustomerAging>(`/sales-orders/customers/${customerId}/aging`),
  getAllCustomerBalances: () => api.get<CustomerBalance[]>('/sales-orders/customer-balances'),

  // Packing Bag Sales
  sellPackingBags: (data: {
    customerId: string
    quantity: number
    unitPrice: number
    paymentMethod: 'CASH' | 'BANK_TRANSFER'
    referenceNumber?: string
    notes?: string
  }) => api.post<{
    success: boolean
    customer: { id: string; name: string }
    quantity: number
    unitPrice: number
    totalAmount: number
    payment: { id: string; method: string; amount: number }
  }>('/sales-orders/packing-bags/sell', data)
}
