import { api } from './client'

export interface ConsumptionRates {
  coreWeight: number
  inkConsumptionRate: number
  ipaConsumptionRate: number
  butanolConsumptionRate: number
  coreDepositValue: number
}

export const settingsApi = {
  getConsumptionRates: async () => {
    return api.get<ConsumptionRates>('/settings/consumption-rates')
  },

  updateConsumptionRates: async (data: Partial<ConsumptionRates>) => {
    return api.patch<ConsumptionRates>('/settings/consumption-rates', data)
  }
}
