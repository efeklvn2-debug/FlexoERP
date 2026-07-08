import { api } from './client'

export type DeliveryMethod = 'PICKUP' | 'SHIPPING'
export type MTOOrderStatus = 'PENDING' | 'APPROVED' | 'MRP_PENDING' | 'IN_PRODUCTION' | 'READY' | 'PICKED_UP' | 'COMPLETED' | 'CANCELLED'
export type MTOPaymentStatus = 'PENDING_PAYMENT' | 'PARTIAL_DEPOSIT' | 'DEPOSIT_COMPLETE' | 'PARTIAL_PAYMENT' | 'FULLY_PAID' | 'OVERPAID'
export type TransactionType = 'DEPOSIT' | 'PAYMENT' | 'CORE_BUYBACK' | 'DEPOSIT_APPLIED' | 'REFUND'
export type PaymentMethod = 'Cash' | 'Electronic' | 'CORE_CREDIT'
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
  colors?: string[]
  paymentType: 'CASH' | 'CREDIT'
  creditLimit: number
  depositPercentDefault: number
  paymentTermsDays: number
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
  status: MTOOrderStatus
  productionJobId?: string
  productionJob?: { id: string; jobNumber: string; printedRolls?: { id: string; weightUsed: number; status: string; rollId: string }[] }
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
  previousPayments: number
  balanceDue: number
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
  payments?: PaymentReceived[]
}

export interface PaymentReceived {
  id: string
  invoiceId: string
  amount: number
  date: string
  reference?: string
  notes?: string
  paymentMethod?: string
}

export interface Receipt {
  id: string
  receiptNumber: string
  paymentTransactionId: string
  customerName: string
  amount: number
  paymentMethod: string
  referenceNumber?: string
  generatedById: string
  generatedAt: string
  paymentTransaction: PaymentTransaction
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
  availableCredit: number
  ordersCount: number
  availableRollsCount: number
  lastTransactionDate: string | null
}

export interface CustomerTransaction {
  id: string
  type: 'ORDER' | 'INVOICE' | 'PAYMENT' | 'CORE_BUYBACK'
  date: string
  description: string
  amount: number
  status: string
  reference: string
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
  approveOrder: (id: string, date?: string) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/approve`, { date }),
  startProduction: (id: string, data: {
    machine: string
    category?: string
    materialOverride?: string
    rollIds: string[]
    printedRollWeights: number[]
    rollWaste?: Record<string, number>
    rollConsumption?: Record<string, number>
    notes?: string
  }) => api.patch<{ order: SalesOrder; productionJob: any }>(`/sales-orders/orders/${id}/start-production`, data),
  cancelOrder: (id: string, date?: string) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/cancel`, { date }),
  markReady: (id: string) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/ready`, {}),
  recordPickup: (id: string, rollIds?: string[], packingBags?: number, packingBagPrice?: number, date?: string) => api.patch<SalesOrder>(`/sales-orders/orders/${id}/pickup`, { rollIds, packingBags, packingBagPrice, date }),

  // Payments
  recordPayment: (data: {
    salesOrderId?: string
    customerId?: string
    transactionType: TransactionType
    paymentMethod: PaymentMethod
    amount: number
    referenceNumber?: string
    notes?: string
    date?: string
  }) => api.post<PaymentTransaction>('/sales-orders/payments', data),
  getPayments: (params?: { salesOrderId?: string; customerId?: string; dateFrom?: string; dateTo?: string }) => {
    const query = new URLSearchParams()
    if (params?.salesOrderId) query.append('salesOrderId', params.salesOrderId)
    if (params?.customerId) query.append('customerId', params.customerId)
    if (params?.dateFrom) query.append('dateFrom', params.dateFrom)
    if (params?.dateTo) query.append('dateTo', params.dateTo)
    const queryStr = query.toString()
    return api.get<PaymentTransaction[]>(`/sales-orders/payments${queryStr ? '?' + queryStr : ''}`)
  },
  getPaymentsByOrder: (salesOrderId: string) => api.get<PaymentTransaction[]>(`/sales-orders/payments/order/${salesOrderId}`),

  // Invoices
  createInvoice: (data: { salesOrderId: string; quantityDelivered?: number }) =>
    api.post<Invoice>('/sales-orders/invoices', data),
  getInvoices: (params?: { status?: string; customerId?: string }) => {
    const query = new URLSearchParams()
    if (params?.status) query.append('status', params.status)
    if (params?.customerId) query.append('customerId', params.customerId)
    const queryStr = query.toString()
    return api.get<Invoice[]>(`/sales-orders/invoices${queryStr ? '?' + queryStr : ''}`)
  },
  getInvoiceById: (id: string) => api.get<Invoice>(`/sales-orders/invoices/${id}`),
  issueInvoice: (id: string, date?: string) => api.patch<Invoice>(`/sales-orders/invoices/${id}/issue`, { date }),
  addPayment: (id: string, data: { amount: number; date: string; paymentMethod?: string; reference?: string; notes?: string }) =>
    api.post<PaymentReceived>(`/sales-orders/invoices/${id}/payments`, data),

  // Core Buyback
  recordCoreBuyback: (data: {
    customerId?: string
    sellerName?: string
    coresQuantity: number
    ratePerCore?: number
    paymentMethod: PaymentMethod
    notes?: string
  }) => api.post<CoreBuyback>('/sales-orders/core-buyback', data),
  getCoreBuybacks: (params?: { customerId?: string; dateFrom?: string; dateTo?: string }) => {
    const query = new URLSearchParams()
    if (params?.customerId) query.append('customerId', params.customerId)
    if (params?.dateFrom) query.append('dateFrom', params.dateFrom)
    if (params?.dateTo) query.append('dateTo', params.dateTo)
    const queryStr = query.toString()
    return api.get<CoreBuyback[]>(`/sales-orders/core-buyback${queryStr ? '?' + queryStr : ''}`)
  },

  // Customer Balance
  getCustomerBalance: (customerId: string) => api.get<CustomerBalance>(`/sales-orders/customers/${customerId}/balance`),
  getCustomerAging: (customerId: string) => api.get<CustomerAging>(`/sales-orders/customers/${customerId}/aging`),
  getAllCustomerBalances: () => api.get<CustomerBalance[]>('/sales-orders/customer-balances'),
  adjustDeposit: (customerId: string, amount: number) => api.post<CustomerBalance>(`/sales-orders/customers/${customerId}/deposit`, { amount }),

  // Customers (MTO)
  getCustomers: () => api.get<Customer[]>('/sales-orders/customers'),
  getCustomer: (id: string) => api.get<Customer>(`/sales-orders/customers/${id}`),
  getCustomerTransactions: (customerId: string) => api.get<CustomerTransaction[]>(`/sales-orders/customers/${customerId}/transactions`),
  createCustomer: (data: {
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
  }) => api.post<Customer>('/sales-orders/customers', data),
  updateCustomer: (id: string, data: Partial<{
    name: string
    email?: string
    phone?: string
    address?: string
    colors?: string[]
    paymentType: 'CASH' | 'CREDIT'
    creditLimit: number
    depositPercentDefault: number
    paymentTermsDays: number
    notifyEmail: boolean
    notifyWhatsApp: boolean
  }>) => api.patch<Customer>(`/sales-orders/customers/${id}`, data),

  // Packing Bag Sales
  sellPackingBags: (data: {
    customerId?: string
    quantity: number
    unitPrice: number
    paymentMethod: PaymentMethod
    referenceNumber?: string
    notes?: string
    applyDeposit?: boolean
    date?: string
  }) => api.post<{
    success: boolean
    order: { id: string; orderNumber: string }
    invoice: { id: string; invoiceNumber: string }
    customer: string
    quantity: number
    unitPrice: number
    subtotal: number
    vatAmount: number
    totalAmount: number
    depositApplied: number
  }>('/sales-orders/packing-bags/sell', data),

  // Receipts
  generateReceipt: (paymentTransactionId: string) =>
    api.post<Receipt>(`/sales-orders/payments/${paymentTransactionId}/generate-receipt`, {}),

  downloadReceiptPdf: async (id: string) => {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/sales-orders/receipts/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!response.ok) throw new Error('Failed to download receipt PDF')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-${id.slice(0, 8)}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  downloadInvoicePdf: async (id: string) => {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/sales-orders/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!response.ok) throw new Error('Failed to download invoice PDF')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-${id.slice(0, 8)}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
