import { z } from 'zod'

export const specsJsonSchema = z.object({
  width: z.number().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  gsm: z.number().optional(),
  notes: z.string().optional()
}).passthrough()

export const createOrderSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  specsJson: specsJsonSchema,
  quantityOrdered: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  deliveryMethod: z.enum(['PICKUP', 'SHIPPING']).optional(),
  shippingAddress: z.string().optional(),
  expectedDeliveryDate: z.string().optional()
})

export const updateOrderSchema = createOrderSchema.partial()

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  colors: z.array(z.string()).optional(),
  paymentType: z.enum(['CASH', 'CREDIT']).optional(),
  creditLimit: z.number().min(0).optional(),
  depositPercentDefault: z.number().min(0).max(100).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  notifyEmail: z.boolean().optional(),
  notifyWhatsApp: z.boolean().optional()
})

export const updateCustomerSchema = createCustomerSchema.partial()

export const recordPickupSchema = z.object({
  rollIds: z.array(z.string()).optional(),
  packingBags: z.number().min(0).optional(),
  packingBagPrice: z.number().min(0).optional(),
  date: z.string().optional()
})

export const recordPaymentSchema = z.object({
  salesOrderId: z.string().optional(),
  customerId: z.string().optional(),
  transactionType: z.enum(['DEPOSIT', 'PAYMENT', 'CORE_BUYBACK', 'DEPOSIT_APPLIED', 'REFUND']),
  paymentMethod: z.enum(['Cash', 'Electronic', 'CORE_CREDIT']),
  amount: z.number().positive('Amount must be positive'),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  sellerName: z.string().optional(),
  coresQuantity: z.number().int().min(0).optional(),
  date: z.string().optional()
})

export const createInvoiceSchema = z.object({
  salesOrderId: z.string().min(1, 'Sales order ID is required'),
  quantityDelivered: z.number().positive().optional(),
  date: z.string().optional()
})

export const addInvoicePaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  date: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(['Cash', 'Electronic', 'CORE_CREDIT']).optional()
})

export const coreBuybackSchema = z.object({
  customerId: z.string().optional(),
  sellerName: z.string().optional(),
  coresQuantity: z.number().int().positive('Cores quantity must be positive'),
  paymentMethod: z.enum(['Cash', 'Electronic', 'CORE_CREDIT']),
  notes: z.string().optional(),
  date: z.string().optional()
})

export const adjustDepositSchema = z.object({
  amount: z.number().refine(v => v !== 0, 'Amount must be non-zero')
})

export const sellPackingBagsSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  paymentMethod: z.enum(['Cash', 'Electronic', 'CORE_CREDIT']),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  applyDeposit: z.boolean().optional(),
  date: z.string().optional()
})

export const startProductionSchema = z.object({
  machine: z.string().min(1, 'Machine is required'),
  category: z.string().optional(),
  materialOverride: z.string().optional(),
  rollIds: z.array(z.string()).min(1, 'At least one roll is required'),
  printedRollWeights: z.array(z.number().positive()).min(1, 'At least one printed roll weight is required'),
  rollWaste: z.record(z.number()).optional(),
  rollConsumption: z.record(z.number()).optional(),
  notes: z.string().optional()
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type CoreBuybackInput = z.infer<typeof coreBuybackSchema>
export type StartProductionInput = z.infer<typeof startProductionSchema>
