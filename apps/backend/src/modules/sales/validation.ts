import { z } from 'zod'

export const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  colors: z.array(z.string())
})

export type CustomerInput = z.infer<typeof customerSchema> & { colors: string[] }

export const customerUpdateSchema = customerSchema.partial()

export const orderSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1, 'Description is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0, 'Unit price must be positive')
  })).min(1, 'At least one item is required')
})

export const orderUpdateSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional()
})

export type CustomerInput = z.infer<typeof customerSchema>
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>
export type OrderInput = z.infer<typeof orderSchema>
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>
