export type RollStatus = 'AVAILABLE' | 'IN_PRODUCTION' | 'CONSUMED' | 'RETURNED' | 'WASTED'
export type POStatus = 'PENDING' | 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'CANCELLED'

export interface POLineItem {
  id: string
  purchaseOrderId: string
  materialId: string
  material?: { id: string; code: string; name: string; costPrice?: number }
  quantity: number
  totalWeight: number
  unitPrice: number
  receivedQty: number
  rollWeights?: number[]
  createdAt: Date
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  supplier: string
  status: POStatus
  expectedDate?: Date
  issuedDate?: Date
  receivedDate?: Date
  notes?: string
  totalAmount?: number
  createdAt: Date
  updatedAt: Date
  createdById?: string
  rolls?: Roll[]
  items?: POLineItem[]
}

export interface Roll {
  id: string
  rollNumber: string
  materialId: string
  material?: { id: string; code: string; name: string }
  purchaseOrderId?: string
  purchaseOrder?: PurchaseOrder
  weight: number
  remainingWeight: number
  width?: number
  length?: number
  coreSize?: string
  status: RollStatus
  receivedDate?: Date
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type SupplierInvoiceStatus = 'PENDING' | 'PARTIAL' | 'PAID'

export interface SupplierInvoice {
  id: string
  poId: string
  purchaseOrder?: PurchaseOrder
  supplierId: string
  supplier?: { id: string; name: string }
  invoiceNumber: string
  date: Date
  amount: number
  status: SupplierInvoiceStatus
  amountPaid: number
  createdAt: Date
  payments?: PaymentMade[]
}

export interface PaymentMade {
  id: string
  supplierInvoiceId: string
  supplierInvoice?: SupplierInvoice
  amount: number
  date: Date
  paymentMethod: 'Cash' | 'Bank Transfer'
  reference?: string
  notes?: string
  createdAt: Date
}
