export type DeliveryMethod = 'PICKUP' | 'SHIPPING'
export type MTOOrderStatus = 'PENDING' | 'APPROVED' | 'MRP_PENDING' | 'IN_PRODUCTION' | 'READY' | 'PICKED_UP' | 'INVOICED' | 'COMPLETED' | 'CANCELLED'
export type MTOPaymentStatus = 'PENDING_PAYMENT' | 'PARTIAL_DEPOSIT' | 'DEPOSIT_COMPLETE' | 'PARTIAL_PAYMENT' | 'FULLY_PAID' | 'OVERPAID'
export type TransactionType = 'DEPOSIT' | 'PAYMENT' | 'CORE_BUYBACK' | 'CORE_CREDIT_APPLIED' | 'REFUND'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CORE_CREDIT'
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED'
export type PaymentType = 'CASH' | 'CREDIT'

export interface SpecsJson {
  width?: number
  color?: string
  material?: string
  gsm?: number
  notes?: string
  [key: string]: any
}

export interface SalesOrderInput {
  customerId: string
  specsJson: SpecsJson
  quantityOrdered: number
  unitPrice: number
  deliveryMethod?: DeliveryMethod
  shippingAddress?: string
}

export interface SalesOrderUpdateInput {
   specsJson?: SpecsJson
   quantityOrdered?: number
   unitPrice?: number
   deliveryMethod?: DeliveryMethod
   shippingAddress?: string
   productionJobId?: string
}

export interface PaymentInput {
  salesOrderId?: string
  customerId?: string
  transactionType: TransactionType
  paymentMethod: PaymentMethod
  amount: number
  referenceNumber?: string
  notes?: string
  sellerName?: string
  coresQuantity?: number
}

export interface CoreBuybackInput {
  customerId?: string
  sellerName?: string
  coresQuantity: number
  paymentMethod: PaymentMethod
  notes?: string
}

export interface InvoiceInput {
  salesOrderId: string
  coresReturned?: number
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
