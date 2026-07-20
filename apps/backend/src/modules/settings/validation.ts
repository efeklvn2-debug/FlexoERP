import { z } from 'zod'

export const inkColorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  mapping: z.string().min(1, 'Mapping is required').max(100)
})

export const updateInkColorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  mapping: z.string().min(1).max(100).optional()
})

export const consumptionRatesSchema = z.object({
  coreWeight: z.number().min(0).optional(),
  inkConsumptionRate: z.number().min(0).optional(),
  ipaConsumptionRate: z.number().min(0).optional(),
  butanolConsumptionRate: z.number().min(0).optional(),
  coreDepositValue: z.number().min(0).optional()
})

export const overheadRateSchema = z.object({
  rate: z.number().min(0, 'Rate must be non-negative')
})

export const vatSettingsSchema = z.object({
  vatRate: z.number().min(0).max(100).optional(),
  businessTin: z.string().max(50).optional(),
  businessAddress: z.string().max(500).optional()
})

export const invoiceSettingsSchema = z.object({
  invoiceCompanyName: z.string().max(200).optional(),
  invoiceLogoUrl: z.string().max(500).optional(),
  invoicePrimaryColor: z.string().max(20).optional(),
  invoiceAccentColor: z.string().max(20).optional(),
  invoiceFooter: z.string().max(1000).optional(),
  receiptCompanyName: z.string().max(200).optional(),
  receiptLogoUrl: z.string().max(500).optional(),
  receiptFooter: z.string().max(1000).optional()
})
