import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('settings:service')

export interface ConsumptionRates {
  coreWeight: number
  inkConsumptionRate: number
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
  invoiceCompanyName?: string
  invoiceLogoUrl?: string
  invoicePrimaryColor?: string
  invoiceAccentColor?: string
  invoiceFooter?: string
  receiptCompanyName?: string
  receiptLogoUrl?: string
  receiptFooter?: string
}

export interface VatSettings {
  vatRate: number
  businessTin?: string
  businessAddress?: string
}

export interface InvoiceSettings {
  invoiceCompanyName?: string
  invoiceLogoUrl?: string
  invoicePrimaryColor?: string
  invoiceAccentColor?: string
  invoiceFooter?: string
  receiptCompanyName?: string
  receiptLogoUrl?: string
  receiptFooter?: string
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
      coreDepositValue: Number(settings.coreDepositValue),
      vatRate: Number(settings.vatRate),
      overheadRatePerKg: Number(settings.overheadRatePerKg || 0),
      businessTin: settings.businessTin || undefined,
      businessAddress: settings.businessAddress || undefined,
      invoiceCompanyName: settings.invoiceCompanyName || undefined,
      invoiceLogoUrl: settings.invoiceLogoUrl || undefined,
      invoicePrimaryColor: settings.invoicePrimaryColor || undefined,
      invoiceAccentColor: settings.invoiceAccentColor || undefined,
      invoiceFooter: settings.invoiceFooter || undefined,
      receiptCompanyName: settings.receiptCompanyName || undefined,
      receiptLogoUrl: settings.receiptLogoUrl || undefined,
      receiptFooter: settings.receiptFooter || undefined
    }
  },

  async getConsumptionRates(): Promise<ConsumptionRates> {
    const settings = await this.getSettings()
    return {
      coreWeight: settings.coreWeight,
      inkConsumptionRate: settings.inkConsumptionRate,
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
        ipaConsumptionRate: input.ipaConsumptionRate,
        butanolConsumptionRate: input.butanolConsumptionRate,
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

    const result = {
      coreWeight: Number(settings.coreWeight),
      inkConsumptionRate: Number(settings.inkConsumptionRate),
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

    await prisma.$transaction(async (tx) => {
      await tx.overheadRateHistory.upsert({
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

      await tx.settings.upsert({
        where: { id: 'default' },
        update: { overheadRatePerKg: rate },
        create: { id: 'default', overheadRatePerKg: rate }
      })
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

  async getInvoiceSettings(): Promise<InvoiceSettings> {
    const settings = await this.getSettings()
    return {
      invoiceCompanyName: (settings as any).invoiceCompanyName || undefined,
      invoiceLogoUrl: (settings as any).invoiceLogoUrl || undefined,
      invoicePrimaryColor: (settings as any).invoicePrimaryColor || undefined,
      invoiceAccentColor: (settings as any).invoiceAccentColor || undefined,
      invoiceFooter: (settings as any).invoiceFooter || undefined,
      receiptCompanyName: (settings as any).receiptCompanyName || undefined,
      receiptLogoUrl: (settings as any).receiptLogoUrl || undefined,
      receiptFooter: (settings as any).receiptFooter || undefined
    }
  },

  async updateInvoiceSettings(input: InvoiceSettings): Promise<InvoiceSettings> {
    await prisma.settings.upsert({
      where: { id: 'default' },
      update: {
        invoiceCompanyName: input.invoiceCompanyName,
        invoiceLogoUrl: input.invoiceLogoUrl,
        invoicePrimaryColor: input.invoicePrimaryColor,
        invoiceAccentColor: input.invoiceAccentColor,
        invoiceFooter: input.invoiceFooter,
        receiptCompanyName: input.receiptCompanyName,
        receiptLogoUrl: input.receiptLogoUrl,
        receiptFooter: input.receiptFooter
      },
      create: {
        id: 'default',
        invoiceCompanyName: input.invoiceCompanyName,
        invoiceLogoUrl: input.invoiceLogoUrl,
        invoicePrimaryColor: input.invoicePrimaryColor,
        invoiceAccentColor: input.invoiceAccentColor,
        invoiceFooter: input.invoiceFooter,
        receiptCompanyName: input.receiptCompanyName,
        receiptLogoUrl: input.receiptLogoUrl,
        receiptFooter: input.receiptFooter
      }
    })
    return this.getInvoiceSettings()
  },

  // ── Ink Colors ──────────────────────────────────────────

  async getInkColors(includeInactive = false): Promise<any[]> {
    const where = includeInactive ? {} : { isActive: true }
    const colors = await prisma.inkColor.findMany({ where, orderBy: { name: 'asc' } })
    return colors.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() }))
  },

  async createInkColor(data: { name: string; mapping: string }): Promise<any> {
    try {
      return await prisma.$transaction(async (tx) => {
        const color = await tx.inkColor.create({ data: { name: data.name, mapping: data.mapping } })
        const existingMat = await tx.material.findFirst({ where: { subCategory: data.mapping, category: 'INK_SOLVENTS' } })
        if (!existingMat) {
          await tx.material.create({
            data: {
              code: `INK-${data.name.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
              name: `${data.name} Ink`,
              category: 'INK_SOLVENTS',
              subCategory: data.mapping,
              unitOfMeasure: 'kg',
              isActive: true
            }
          })
        }
        return color
      })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new AppError(400, 'DUPLICATE', 'Ink color with this name or mapping already exists')
      }
      throw error
    }
  },

  async updateInkColor(id: string, data: { name?: string; mapping?: string }): Promise<any> {
    return prisma.inkColor.update({ where: { id }, data })
  },

  async archiveInkColor(id: string): Promise<any> {
    return prisma.inkColor.update({ where: { id }, data: { isActive: false } })
  },

  async restoreInkColor(id: string): Promise<any> {
    return prisma.inkColor.update({ where: { id }, data: { isActive: true } })
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
