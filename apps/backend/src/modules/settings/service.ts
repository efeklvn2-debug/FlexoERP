import { prisma } from '../../database'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('settings:service')

export interface ConsumptionRates {
  coreWeight: number
  inkConsumptionRate: number
  ipaConsumptionRate: number
  butanolConsumptionRate: number
  coreDepositValue: number
}

export const settingsService = {
  async getConsumptionRates(): Promise<ConsumptionRates> {
    let settings = await prisma.settings.findUnique({
      where: { id: 'default' }
    })

    if (!settings) {
      settings = await prisma.settings.create({
        data: { id: 'default' }
      })
    }

    return {
      coreWeight: Number(settings.coreWeight),
      inkConsumptionRate: Number(settings.inkConsumptionRate),
      ipaConsumptionRate: Number(settings.ipaConsumptionRate),
      butanolConsumptionRate: Number(settings.butanolConsumptionRate),
      coreDepositValue: Number(settings.coreDepositValue)
    }
  },

  async updateConsumptionRates(input: Partial<ConsumptionRates>): Promise<ConsumptionRates> {
    logger.info({ rates: input }, 'Updating consumption rates')

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: {
        coreWeight: input.coreWeight,
        inkConsumptionRate: input.inkConsumptionRate,
        ipaConsumptionRate: input.ipaConsumptionRate,
        butanolConsumptionRate: input.butanolConsensationRate,
        coreDepositValue: input.coreDepositValue
      },
      create: {
        id: 'default',
        coreWeight: input.coreWeight || 0.7,
        inkConsumptionRate: input.inkConsumptionRate || 0.7,
        ipaConsumptionRate: input.ipaConsumptionRate || 0.1,
        butanolConsumptionRate: input.butanolConsumptionRate || 0.1,
        coreDepositValue: input.coreDepositValue || 150
      }
    })

    return {
      coreWeight: Number(settings.coreWeight),
      inkConsumptionRate: Number(settings.inkConsumptionRate),
      ipaConsumptionRate: Number(settings.ipaConsumptionRate),
      butanolConsumptionRate: Number(settings.butanolConsumptionRate),
      coreDepositValue: Number(settings.coreDepositValue)
    }
  }
}
