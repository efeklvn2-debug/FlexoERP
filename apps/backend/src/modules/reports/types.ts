export interface AgingBucket {
  label: string
  minDays: number
  maxDays: number
  total: number
  count: number
}

export interface AgingEntry {
  id: string
  name: string
  current: number
  age31to60: number
  age61to90: number
  age90plus: number
  total: number
}

export interface AgingReport {
  asOfDate: string
  totalOutstanding: number
  entries: AgingEntry[]
  buckets: AgingBucket[]
}

export interface SalesByCustomerEntry {
  customerId: string
  customerName: string
  invoiceCount: number
  quantityDelivered: number
  revenue: number
  vatAmount: number
  totalAmount: number
}

export interface SalesByCustomerReport {
  from: string
  to: string
  totalRevenue: number
  totalVat: number
  totalAmount: number
  totalInvoices: number
  customers: SalesByCustomerEntry[]
}

export interface SalesByProductEntry {
  product: string
  invoiceCount: number
  quantityDelivered: number
  revenue: number
  percentage: number
}

export interface SalesByProductReport {
  from: string
  to: string
  totalRevenue: number
  totalQuantity: number
  products: SalesByProductEntry[]
}

export interface MovementByType {
  type: string
  totalQuantity: number
  count: number
}

export interface MovementByMaterial {
  materialId: string
  materialName: string
  category: string
  inQuantity: number
  outQuantity: number
  netChange: number
}

export interface InventoryMovementReport {
  from: string
  to: string
  totalIn: number
  totalOut: number
  netChange: number
  byType: MovementByType[]
  byMaterial: MovementByMaterial[]
}
