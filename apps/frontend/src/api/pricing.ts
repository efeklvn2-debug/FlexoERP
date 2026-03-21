import { api } from './client'

export interface MaterialWithPrice {
  id: string
  code: string
  name: string
  category: 'PLAIN_ROLLS' | 'INK_SOLVENTS' | 'PACKAGING'
  subCategory?: string
  packSize?: number
  costPrice: number | null
  pricePerKg: number | null
  pricePerPack: number | null
  priceListId: string | null
}

export interface PriceListInput {
  materialId: string
  pricePerKg?: number
  pricePerPack?: number
  effectiveFrom?: string
}

export const pricingApi = {
  getMaterialsWithPrices: async () => {
    return api.get<MaterialWithPrice[]>('/pricing/materials-prices')
  },

  getPriceLists: async () => {
    return api.get<any[]>('/pricing')
  },

  createPriceList: async (data: PriceListInput) => {
    return api.post<any>('/pricing', data)
  },

  updatePriceList: async (id: string, data: Partial<PriceListInput>) => {
    return api.patch<any>(`/pricing/${id}`, data)
  },

  deletePriceList: async (id: string) => {
    return api.delete<void>(`/pricing/${id}`)
  }
}
