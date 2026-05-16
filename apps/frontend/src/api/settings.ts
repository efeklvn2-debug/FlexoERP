import { api } from './client'

export interface ConsumptionRates {
  coreWeight: number
  inkConsumptionRate: number
  inkCostPerLiter: number
  ipaConsumptionRate: number
  butanolConsumptionRate: number
  coreDepositValue: number
}

export interface Settings {
  id: string
  coreWeight: number
  rollWeight: number
  inkConsumptionRate: number
  ipaConsumptionRate: number
  butanolConsumptionRate: number
  coreDepositValue: number
  vatRate: number
  overheadRatePerKg: number
  businessTin?: string
  businessAddress?: string
}

export interface VatSettings {
  vatRate: number
  businessTin?: string
  businessAddress?: string
}

export interface OverheadRateHistoryEntry {
  id: string
  month: Date
  ratePerKg: number
  createdAt: Date
  createdBy?: string
}

export interface InvoiceSettings {
  invoiceCompanyName?: string
  invoiceLogoUrl?: string
  invoicePrimaryColor?: string
  invoiceAccentColor?: string
  invoiceFooter?: string
}

export const settingsApi = {
  getSettings: async () => {
    return api.get<Settings>('/settings')
  },

  getConsumptionRates: async () => {
    return api.get<ConsumptionRates>('/settings/consumption-rates')
  },

  updateConsumptionRates: async (data: Partial<ConsumptionRates>) => {
    return api.patch<ConsumptionRates>('/settings/consumption-rates', data)
  },

  getOverheadRate: async () => {
    return api.get<number>('/settings/overhead-rate')
  },

  updateOverheadRate: async (rate: number) => {
    return api.patch<number>('/settings/overhead-rate', { rate })
  },

  getOverheadRateHistory: async () => {
    return api.get<OverheadRateHistoryEntry[]>('/settings/overhead-rate-history')
  },

  updateVatSettings: async (data: Partial<VatSettings>) => {
    return api.patch<Settings>('/settings/vat', data)
  },

  getInvoiceSettings: async () => {
    return api.get<InvoiceSettings>('/settings/invoice')
  },

  updateInvoiceSettings: async (data: InvoiceSettings) => {
    return api.patch<InvoiceSettings>('/settings/invoice', data)
  }
}
