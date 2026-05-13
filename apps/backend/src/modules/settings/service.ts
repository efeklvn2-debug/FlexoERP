import { prisma } from '../../database'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('settings:service')

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
  inkCostPerKg: number
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

export const settingsService = {
  async getSettings(): Promise<Settings> {
    let settings = await prisma.settings.findUnique({
      where: { id: 'default' }
    })

    if (!settings) {
      settings = await prisma.settings.create({
        data: { id: 'default' }
      })
    }

    return {
      id: settings.id,
      coreWeight: Number(settings.coreWeight),
      rollWeight: Number(settings.rollWeight || 15),
      inkConsumptionRate: Number(settings.inkConsumptionRate),
      ipaConsumptionRate: Number(settings.ipaConsumptionRate),
      butanolConsumptionRate: Number(settings.butanolConsumptionRate),
      inkCostPerKg: Number(settings.inkCostPerKg || 500),
      coreDepositValue: Number(settings.coreDepositValue),
      vatRate: Number(settings.vatRate),
      overheadRatePerKg: Number(settings.overheadRatePerKg || 0),
      businessTin: settings.businessTin || undefined,
      businessAddress: settings.businessAddress || undefined
    }
  },

  async getConsumptionRates(): Promise<ConsumptionRates> {
    const settings = await this.getSettings()
    return {
      coreWeight: settings.coreWeight,
      inkConsumptionRate: settings.inkConsumptionRate,
      inkCostPerLiter: settings.inkCostPerKg,
      ipaConsumptionRate: settings.ipaConsumptionRate,
      butanolConsumptionRate: settings.butanolConsumptionRate,
      coreDepositValue: settings.coreDepositValue
    }
  },

  async updateConsumptionRates(input: Partial<ConsumptionRates>): Promise<ConsumptionRates> {
    console.log('BACKEND updateConsumptionRates RECEIVED:', JSON.stringify(input))
    
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: {
        coreWeight: input.coreWeight,
        inkConsumptionRate: input.inkConsumptionRate,
        inkCostPerKg: input.inkCostPerLiter,
        ipaConsumptionRate: input.ipaConsumptionRate,
        butanolConsumptionRate: input.butanolConsumptionRate,
        coreDepositValue: input.coreDepositValue
      },
      create: {
        id: 'default',
        coreWeight: input.coreWeight || 0.7,
        inkConsumptionRate: input.inkConsumptionRate || 0.7,
        inkCostPerKg: input.inkCostPerLiter || 500,
        ipaConsumptionRate: input.ipaConsumptionRate || 0.1,
        butanolConsumptionRate: input.butanolConsumptionRate || 0.1,
        coreDepositValue: input.coreDepositValue || 150
      }
    })

    console.log('BACKEND updateConsumptionRates SETTINGS NOW:', settings.inkCostPerKg)

    const result = {
      coreWeight: Number(settings.coreWeight),
      inkConsumptionRate: Number(settings.inkConsumptionRate),
      inkCostPerLiter: Number(settings.inkCostPerKg || 500),
      ipaConsumptionRate: Number(settings.ipaConsumptionRate),
      butanolConsumptionRate: Number(settings.butanolConsumptionRate),
      coreDepositValue: Number(settings.coreDepositValue)
    }
    console.log('BACKEND updateConsumptionRates RETURNING:', JSON.stringify(result))
    return result
  },

  async getOverheadRate(): Promise<number> {
    const settings = await this.getSettings()
    return settings.overheadRatePerKg
  },

  async updateOverheadRate(rate: number, userId?: string): Promise<number> {
    logger.info({ rate }, 'Updating overhead rate')

    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    await prisma.overheadRateHistory.upsert({
      where: { month: monthStr },
      create: {
        month: monthStr,
        ratePerKg: rate,
        createdBy: userId || null
      },
      update: {
        ratePerKg: rate,
        createdBy: userId || null
      }
    })

    await prisma.settings.upsert({
      where: { id: 'default' },
      update: { overheadRatePerKg: rate },
      create: { id: 'default', overheadRatePerKg: rate }
    })

    return rate
  },

  async updateVatSettings(input: Partial<VatSettings>): Promise<Settings> {
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: {
        vatRate: input.vatRate,
        businessTin: input.businessTin,
        businessAddress: input.businessAddress
      },
      create: {
        id: 'default',
        vatRate: input.vatRate || 7.5,
        businessTin: input.businessTin,
        businessAddress: input.businessAddress
      }
    })
    return this.getSettings()
  },

  async getOverheadRateHistory(): Promise<OverheadRateHistoryEntry[]> {
    const history = await prisma.overheadRateHistory.findMany({
      orderBy: { month: 'desc' }
    })
    return history.map(h => ({
      id: h.id,
      month: new Date(h.month + '-01'),
      ratePerKg: Number(h.ratePerKg),
      createdAt: h.createdAt,
      createdBy: h.createdBy || undefined
    }))
  }
}
