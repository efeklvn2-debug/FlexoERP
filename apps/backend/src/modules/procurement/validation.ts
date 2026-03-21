import { z } from 'zod'

export const poLineItemSchema = z.object({
  materialId: z.string().min(1, 'Material is required'),
  quantity: z.number().int().positive('Quantity must be positive'),
  totalWeight: z.number().positive('Total weight must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  rollWeights: z.array(z.number().positive()).optional()
})

export const purchaseOrderSchema = z.object({
  supplier: z.string().min(1, 'Supplier is required'),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(poLineItemSchema).min(1, 'At least one line item is required')
})

export const addLineItemSchema = z.object({
  materialId: z.string().min(1, 'Material is required'),
  quantity: z.number().int().positive('Quantity must be positive'),
  totalWeight: z.number().positive('Total weight must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  rollWeights: z.array(z.number().positive()).optional()
})

export const updatePOSchema = z.object({
  supplier: z.string().min(1, 'Supplier is required').optional(),
  expectedDate: z.string().optional(),
  notes: z.string().optional()
})

export const receivePOSchema = z.object({
  poId: z.string().min(1, 'PO ID is required'),
  lineItems: z.array(z.object({
    lineItemId: z.string(),
    rollWeights: z.array(z.number().positive()).min(1, 'At least one roll weight is required')
  })).min(1, 'At least one line item is required')
})

export const rollSchema = z.object({
  materialId: z.string().min(1, 'Material is required'),
  purchaseOrderId: z.string().optional(),
  weight: z.number().positive('Weight must be positive'),
  width: z.number().positive().optional(),
  length: z.number().positive().optional(),
  coreSize: z.string().optional(),
  notes: z.string().optional()
})

export const productionJobSchema = z.object({
  orderId: z.string().optional(),
  machine: z.string().optional(),
  notes: z.string().optional(),
  rolls: z.array(z.object({
    rollId: z.string(),
    weightUsed: z.number().positive()
  })).min(1, 'At least one roll is required')
})

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>
export type POLineItemInput = z.infer<typeof poLineItemSchema>
export type AddLineItemInput = z.infer<typeof addLineItemSchema>
export type UpdatePOInput = z.infer<typeof updatePOSchema>
export type ReceivePOInput = z.infer<typeof receivePOSchema>
export type RollInput = z.infer<typeof rollSchema>
export type ProductionJobInput = z.infer<typeof productionJobSchema>
