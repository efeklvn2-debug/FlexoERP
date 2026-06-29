import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { financeRepository } from './repository'
import { Prisma, Account, JournalEntry } from '@prisma/client'
import { dateFromInput, dateStartOfDay, dateEndOfDay } from '../../utils/dates'

const logger = createChildLogger('finance:service')

const ACCOUNT_CACHE: Map<string, Account> = new Map()

async function loadAccountCache() {
  if (ACCOUNT_CACHE.size === 0) {
    const accounts = await prisma.account.findMany({ where: { isActive: true } })
    accounts.forEach(acc => ACCOUNT_CACHE.set(acc.code, acc))
  }
}

export const financeService = {
  async getAccounts() {
    return financeRepository.findAllAccounts()
  },

  async getRootAccounts() {
    return financeRepository.findRootAccounts()
  },

  async getAccountById(id: string) {
    const account = await financeRepository.findAccountById(id)
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found')
    return account
  },

  async getAccountByCode(code: string) {
    await loadAccountCache()
    const account = ACCOUNT_CACHE.get(code)
    if (!account) throw new AppError(404, 'NOT_FOUND', `Account ${code} not found`)
    return account
  },

  async getAccountIdByCode(code: string): Promise<string> {
    const account = await this.getAccountByCode(code)
    return account.id
  },

  async getEarliestJournalDate(tx?: Prisma.TransactionClient): Promise<Date> {
    const client = tx || prisma
    const earliest = await client.journalEntry.findFirst({
      orderBy: { date: 'asc' },
      select: { date: true }
    })
    return earliest?.date || new Date('2026-01-01')
  },

  async validateJournalDate(date: Date, tx?: Prisma.TransactionClient): Promise<void> {
    const earliestDate = await this.getEarliestJournalDate(tx)
    if (new Date(date) < earliestDate) {
      throw new AppError(400, 'INVALID_DATE', 
        `Journal date cannot be before earliest entry: ${earliestDate.toISOString().split('T')[0]}`)
    }
  },

  async createAccount(input: {
    code: string
    name: string
    type: string
    parentId?: string
    isVatEnabled?: boolean
    description?: string
  }) {
    const existing = await financeRepository.findAccountByCode(input.code)
    if (existing) {
      throw new AppError(400, 'DUPLICATE', `Account code ${input.code} already exists`)
    }

    if (input.parentId) {
      const parent = await financeRepository.findAccountById(input.parentId)
      if (!parent) throw new AppError(400, 'INVALID', 'Parent account not found')
    }

    return financeRepository.createAccount({
      code: input.code,
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      isVatEnabled: input.isVatEnabled,
      description: input.description
    })
  },

  async postJournalEntry(input: {
    description: string
    sourceModule: string
    sourceId?: string
    reference?: string
    postedById?: string
    date?: Date
    lines: { accountId: string; debit: number; credit: number; memo?: string }[]
  }, tx?: Prisma.TransactionClient) {
    const { lines, description, sourceModule, sourceId, reference, postedById, date } = input
    const db = tx || prisma

    if (!lines || lines.length < 2) {
      throw new AppError(400, 'INVALID', 'Journal entry must have at least 2 lines')
    }

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new AppError(400, 'UNBALANCED', `Journal entry must balance. Debits: ${totalDebit}, Credits: ${totalCredit}`)
    }

    for (const line of lines) {
      if (line.debit < 0 || line.credit < 0) {
        throw new AppError(400, 'INVALID', 'Debits and credits cannot be negative')
      }
      if (line.debit > 0 && line.credit > 0) {
        throw new AppError(400, 'INVALID', 'A line cannot have both debit and credit')
      }
    }

    const entryDate = dateFromInput(date as string | undefined)
    await this.validateJournalDate(entryDate, db)

    const entryNumber = await financeRepository.getNextEntryNumber(db)

    const createEntry = async (client: Prisma.TransactionClient) => {
      const entry = await client.journalEntry.create({
        data: {
          entryNumber,
          date: entryDate,
          description,
          sourceModule: sourceModule as any,
          sourceId,
          reference,
          postedById,
          lines: {
            create: lines.map(l => ({
              accountId: l.accountId,
              debit: new Prisma.Decimal(l.debit.toFixed(2)),
              credit: new Prisma.Decimal(l.credit.toFixed(2)),
              memo: l.memo
            }))
          }
        },
        include: { lines: { include: { account: true } } }
      })

      logger.info({ entryNumber: entry.entryNumber, sourceModule, sourceId }, 'Journal entry posted')
      return entry
    }

    if (tx) {
      return createEntry(tx)
    }

    return prisma.$transaction(async (dbTx) => createEntry(dbTx))
  },

  async getJournalEntries(options?: {
    dateFrom?: string
    dateTo?: string
    sourceModule?: string
    accountId?: string
    limit?: number
    offset?: number
  }) {
    return financeRepository.getJournalEntries({
      dateFrom: options?.dateFrom ? dateStartOfDay(options.dateFrom) : undefined,
      dateTo: options?.dateTo ? dateEndOfDay(options.dateTo) : undefined,
      sourceModule: options?.sourceModule,
      accountId: options?.accountId,
      limit: options?.limit,
      offset: options?.offset
    })
  },

  async getJournalEntryById(id: string) {
    const entry = await financeRepository.getJournalEntryById(id)
    if (!entry) throw new AppError(404, 'NOT_FOUND', 'Journal entry not found')
    return entry
  },

  async getAccountBalance(accountId: string, asOfDate?: string) {
    return financeRepository.getAccountBalance(
      accountId,
      asOfDate ? dateEndOfDay(asOfDate) : undefined
    )
  },

  async getAllAccountBalances(asOfDate?: string) {
    return financeRepository.getAllAccountBalances(
      asOfDate ? dateEndOfDay(asOfDate) : undefined
    )
  },

  async getTrialBalance(asOfDate?: string) {
    const balances = await financeRepository.getAllAccountBalances(
      asOfDate ? dateEndOfDay(asOfDate) : undefined
    )

    const totals = balances.reduce((acc: any, b: any) => ({
      totalDebit: acc.totalDebit + b.totalDebit,
      totalCredit: acc.totalCredit + b.totalCredit,
      totalBalance: acc.totalBalance + b.balance
    }), { totalDebit: 0, totalCredit: 0, totalBalance: 0 })

    return { accounts: balances, totals }
  },

  async getFinanceDashboard() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const cashFlow = await financeRepository.getCashFlow(today, tomorrow)

    const revenue = await financeRepository.getRevenueByPeriod(startOfMonth, tomorrow)
    const expenses = await financeRepository.getExpensesByPeriod(startOfMonth, tomorrow)
    const cogs = await financeRepository.getCogsByPeriod(startOfMonth, tomorrow)

    const totalRevenue = revenue.sales + revenue.packing + revenue.otherIncome
    const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0)

    const receivablesAccount = await financeRepository.findAccountByCode('1200')
    let receivablesTotal = 0
    let overdueAmount = 0
    let customerCount = 0

    if (receivablesAccount) {
      const balance = await financeRepository.getAccountBalance(receivablesAccount.id)
      receivablesTotal = Math.max(0, balance.balance)
    }

    const payablesAccount = await financeRepository.findAccountByCode('2000')
    let payablesTotal = 0
    let supplierCount = 0

    if (payablesAccount) {
      const balance = await financeRepository.getAccountBalance(payablesAccount.id)
      payablesTotal = Math.abs(Math.min(0, balance.balance))
    }

    return {
      cashPosition: {
        openingBalance: cashFlow.openingBalance,
        moneyInToday: cashFlow.moneyInToday,
        moneyOutToday: cashFlow.moneyOutToday,
        closingBalance: cashFlow.closingBalance
      },
      receivables: {
        totalOwed: receivablesTotal,
        overdueAmount,
        customerCount
      },
      payables: {
        totalPayable: payablesTotal,
        supplierCount
      },
      profitSnapshot: {
        revenueThisMonth: totalRevenue,
        materialCostThisMonth: cogs,
        expensesThisMonth: totalExpenses,
        estimatedProfit: totalRevenue - cogs - totalExpenses
      }
    }
  },

  async getVatSummary(dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? dateStartOfDay(dateFrom) : new Date(new Date().getFullYear(), 0, 1)
    const to = dateTo ? dateEndOfDay(dateTo) : new Date()

    const outputVat = await financeRepository.getOutputVat(from, to)
    const inputVat = await financeRepository.getInputVat(from, to)

    const periods: { month: string; outputVat: number; inputVat: number; vatPayable: number }[] = []
    const startYear = from.getFullYear()
    const startMonth = from.getMonth()
    const endYear = to.getFullYear()
    const endMonth = to.getMonth()
    let cursor = new Date(startYear, startMonth, 1)
    while (cursor <= to) {
      const periodStart = new Date(cursor)
      const periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59)
      const monthOutput = await financeRepository.getOutputVat(periodStart, periodEnd)
      const monthInput = await financeRepository.getInputVat(periodStart, periodEnd)
      periods.push({
        month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        outputVat: monthOutput,
        inputVat: monthInput,
        vatPayable: monthOutput - monthInput
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }

    return {
      outputVat,
      inputVat,
      vatPayable: outputVat - inputVat,
      periods
    }
  },

  async getProfitSummary(month?: string) {
    let startOfMonth: Date
    let endOfMonth: Date

    if (month) {
      const [year, monthNum] = month.split('-').map(Number)
      startOfMonth = new Date(year, monthNum - 1, 1)
      endOfMonth = new Date(year, monthNum, 0, 23, 59, 59)
    } else {
      const today = new Date()
      startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
    }

    const revenue = await financeRepository.getRevenueByPeriod(startOfMonth, endOfMonth)
    const expenses = await financeRepository.getExpensesByPeriod(startOfMonth, endOfMonth)
    const cogs = await financeRepository.getCogsByPeriod(startOfMonth, endOfMonth)

    const totalRevenue = revenue.sales + revenue.packing + revenue.otherIncome
    const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0)

    return {
      revenue: totalRevenue,
      breakdown: {
        salesRevenue: revenue.sales,
        packingRevenue: revenue.packing,
        otherIncome: revenue.otherIncome
      },
      costOfGoodsSold: cogs,
      expenses: totalExpenses,
      expenseBreakdown: expenses,
      netProfit: totalRevenue - cogs - totalExpenses
    }
  },

  async getGeneralLedger(accountId: string, dateFrom?: string, dateTo?: string) {
    const account = await financeRepository.findAccountById(accountId)
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found')

    const openingBalance = await financeRepository.getAccountBalance(
      accountId,
      dateFrom ? dateStartOfDay(dateFrom) : undefined
    )

    const entries = await prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          date: {
            ...(dateFrom && { gte: dateStartOfDay(dateFrom) }),
            ...(dateTo && { lte: dateEndOfDay(dateTo) })
          }
        }
      },
      include: { journalEntry: true },
      orderBy: { journalEntry: { date: 'asc' } }
    })

    let runningBalance = openingBalance.openingBalance + openingBalance.totalDebit - openingBalance.totalCredit

    const transactions = entries.map((line: any) => {
      runningBalance += Number(line.debit) - Number(line.credit)
      return {
        date: line.journalEntry.date,
        entryNumber: line.journalEntry.entryNumber,
        description: line.journalEntry.description,
        reference: line.journalEntry.reference,
        debit: Number(line.debit),
        credit: Number(line.credit),
        balance: runningBalance,
        memo: line.memo
      }
    })

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type
      },
      openingBalance: openingBalance.openingBalance,
      closingBalance: runningBalance,
      transactions
    }
  },

  async seedDefaultAccounts() {
    const accounts = [
      { code: '1000', name: 'Cash', type: 'ASSET', description: 'Cash on hand' },
      { code: '1100', name: 'Bank', type: 'ASSET', description: 'Bank accounts' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', description: 'Money owed by customers' },
      { code: '1300', name: 'Raw Material Inventory', type: 'ASSET', description: 'Plain rolls, ink, solvents' },
      { code: '1310', name: 'Work in Progress', type: 'ASSET', description: 'Materials in production' },
      { code: '1320', name: 'Finished Goods', type: 'ASSET', description: 'Printed rolls ready for sale' },
      { code: '1330', name: 'Deferred Cost of Goods Sold', type: 'ASSET', description: 'Cost of completed jobs awaiting delivery' },
      { code: '1400', name: 'VAT Input', type: 'ASSET', isVatEnabled: true, description: 'VAT paid on purchases' },
      { code: '1510', name: 'Packing Bag Inventory', type: 'ASSET', description: 'Packing bags held for resale' },

      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', description: 'Money owed to suppliers' },
      { code: '2100', name: 'VAT Output', type: 'LIABILITY', isVatEnabled: true, description: 'VAT collected on sales' },
      { code: '2200', name: 'Customer Deposits', type: 'LIABILITY', description: 'Core deposits held' },
      { code: '2250', name: 'Advance Customer Payments', type: 'LIABILITY', description: 'Prepayments against future invoices' },

      { code: '3000', name: 'Opening Balance Equity', type: 'EQUITY', description: 'Opening balances' },
      { code: '3100', name: 'Retained Earnings', type: 'EQUITY', description: 'Accumulated profits' },

      { code: '4000', name: 'Sales Revenue', type: 'REVENUE', description: 'Income from printed roll sales' },
      { code: '4100', name: 'Packing Bags Revenue', type: 'REVENUE', description: 'Income from packing bag sales' },
      { code: '4200', name: 'Other Income', type: 'REVENUE', description: 'Miscellaneous income' },

      { code: '5000', name: 'Cost of Goods Sold', type: 'COGS', description: 'Material cost of goods sold' },
      { code: '5100', name: 'Material Costs', type: 'COGS', description: 'Plain roll material costs' },
      { code: '5200', name: 'Production Costs', type: 'COGS', description: 'Direct production costs' },
      { code: '5300', name: 'Scrap/Waste Expense', type: 'COGS', description: 'Scrapped and wasted materials' },

      { code: '6000', name: 'Fuel & Transport', type: 'EXPENSE', description: 'Fuel and transportation expenses' },
      { code: '6100', name: 'Maintenance', type: 'EXPENSE', description: 'Equipment maintenance' },
      { code: '6200', name: 'Diesel', type: 'EXPENSE', description: 'Generator diesel' },
      { code: '6300', name: 'Salaries', type: 'EXPENSE', description: 'Staff salaries' },
      { code: '6400', name: 'Administrative', type: 'EXPENSE', description: 'Office and administrative expenses' },
      { code: '6500', name: 'Utilities', type: 'EXPENSE', description: 'Electricity, water, etc.' },
      { code: '6600', name: 'Miscellaneous', type: 'EXPENSE', description: 'Other expenses' }
    ]

    let created = 0
    for (const acc of accounts) {
      await prisma.account.upsert({
        where: { code: acc.code },
        create: acc as any,
        update: {}
      })
      created++
    }

    logger.info({ count: created }, 'Chart of accounts seeded')
    return { message: 'Chart of accounts seeded', count: created }
  },

  async getDeferredCogsSummary() {
    try {
      // Get Deferred COGS account balance
      const deferredCogsAccount = await this.getAccountByCode('1330')
      const balanceResult = await financeRepository.getAccountBalance(deferredCogsAccount.id)
      const totalDeferred = Math.max(0, Number(balanceResult?.balance || 0))

      // Get orders with pending deferred COGS (status READY or PICKED_UP that have completed jobs)
      const pendingOrders = await prisma.salesOrder.findMany({
        where: {
          status: { in: ['READY', 'PICKED_UP'] },
          productionJobId: { not: null }
        },
        include: {
          customer: true,
          productionJob: true
        },
        orderBy: { updatedAt: 'desc' }
      })

      // Get all journal entries for 1330 to calculate actual deferred amounts
      const allJournalEntries = await prisma.journalEntry.findMany({
        include: {
          lines: {
            where: {
              accountId: deferredCogsAccount.id
            }
          }
        }
      })

      // Calculate deferred amount per jobId (from PRODUCTION entries)
      const deferredByJob: Record<string, number> = {}
      for (const entry of allJournalEntries) {
        if (entry.sourceModule !== 'PRODUCTION') continue
        const jobId = entry.sourceId
        if (!jobId) continue
        
        for (const line of entry.lines) {
          const amount = Number(line.debit) - Number(line.credit)
          if (amount > 0) {
            deferredByJob[jobId] = (deferredByJob[jobId] || 0) + amount
          }
        }
      }

      // Calculate recognized amount per order (from SALES entries)
      const recognizedByOrder: Record<string, number> = {}
      for (const entry of allJournalEntries) {
        if (entry.sourceModule !== 'SALES') continue
        
        // The sourceId for SALES is the salesOrderId
        const orderId = entry.sourceId
        if (!orderId) continue
        
        for (const line of entry.lines) {
          const amount = Number(line.credit)
          if (amount > 0) {
            recognizedByOrder[orderId] = (recognizedByOrder[orderId] || 0) + amount
          }
        }
      }

      const ordersWithDeferred = pendingOrders.map(order => {
        const completedAt = order.productionJob?.endDate || order.updatedAt
        const daysPending = Math.floor((Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60 * 24))
        
        const jobId = order.productionJobId
        const orderId = order.id
        
        // Get deferred amount from journal entries
        let deferredAmount = 0
        if (jobId) {
          const deferred = deferredByJob[jobId] || 0
          const recognized = recognizedByOrder[orderId] || 0
          deferredAmount = Math.max(0, deferred - recognized)
        }
        
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customer?.name || 'Unknown',
          deferredAmount,
          completedAt: completedAt,
          daysPending
        }
      })

      const overdueOrders = ordersWithDeferred.filter(o => o.daysPending > 7)

      return {
        totalDeferred,
        pendingCount: ordersWithDeferred.length,
        overdueCount: overdueOrders.length,
        orders: ordersWithDeferred
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get Deferred COGS summary')
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to get Deferred COGS summary')
    }
  },

  async recognizeDeferredCogs(orderId: string, userId?: string) {
    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        productionJob: true
      }
    })

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Sales order not found')
    }

    if (order.status !== 'READY' && order.status !== 'PICKED_UP') {
      throw new AppError(400, 'INVALID', 'Order must be READY or PICKED_UP to recognize COGS')
    }

    if (!order.productionJobId || !order.productionJob) {
      throw new AppError(400, 'INVALID', 'Order has no production job')
    }

    // Read cost snapshot from ProductionJob (saved at completion)
    const job = order.productionJob
    let totalDeferredCost = Number(job.materialCost || 0)
      + Number((job as any).consumablesCost || 0)
      + Number(job.overheadCost || 0)

    // Fallback for pre-fix jobs where costs were never saved
    if (!totalDeferredCost) {
      const totalPrintedWeight = Number(order.quantityProduced) || 0

      // Get parent rolls for material cost
      if (job.parentRollIds && job.parentRollIds.length > 0) {
        const parentRolls = await prisma.roll.findMany({
          where: { id: { in: job.parentRollIds } },
          include: { material: true }
        })

        const parentMaterial = parentRolls[0]?.material
        const costPerKg = parentMaterial?.costPrice ? Number(parentMaterial.costPrice) : 0
        totalDeferredCost += totalPrintedWeight * costPerKg
      }

      // Add consumables and overhead
      const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
      if (settings) {
        const inkRate = Number(settings.inkConsumptionRate) || 0.2
        const ipaRate = Number(settings.ipaConsumptionRate) || 0.1
        const butanolRate = Number(settings.butanolConsumptionRate) || 0.1

        const consumableMaterials = await prisma.material.findMany({ where: { category: 'INK_SOLVENTS', isActive: true } })
        const ipaMat = consumableMaterials.find(m => m.subCategory === 'IPA')
        const butanolMat = consumableMaterials.find(m => m.subCategory === 'Butanol')
        const ipaCostPerLiter = ipaMat?.costPrice ? Number(ipaMat.costPrice) : 60
        const butanolCostPerLiter = butanolMat?.costPrice ? Number(butanolMat.costPrice) : 60

        // Average costPrice of ink materials (exclude IPA/Butanol)
        const inkMats = consumableMaterials.filter(m => m.subCategory !== 'IPA' && m.subCategory !== 'Butanol')
        const avgInkCostPrice = inkMats.length > 0
          ? inkMats.reduce((sum, m) => sum + (Number(m.costPrice) || 0), 0) / inkMats.length
          : 0

        totalDeferredCost += totalPrintedWeight * inkRate * avgInkCostPrice
          + totalPrintedWeight * ipaRate * ipaCostPerLiter
          + totalPrintedWeight * butanolRate * butanolCostPerLiter

        const overheadRate = Number(settings.overheadRatePerKg) || 0
        totalDeferredCost += totalPrintedWeight * overheadRate
      }
    }

    if (totalDeferredCost <= 0) {
      throw new AppError(400, 'INVALID', 'No deferred COGS to recognize')
    }

    const cogsAccountId = await this.getAccountIdByCode('5000')
    const deferredCogsAccountId = await this.getAccountIdByCode('1330')

    const entry = await this.postJournalEntry({
      description: `Recognize COGS - SO ${order.orderNumber}`,
      sourceModule: 'SALES',
      sourceId: order.id,
      reference: order.orderNumber,
      postedById: userId,
      lines: [
        { accountId: cogsAccountId, debit: totalDeferredCost, credit: 0, memo: 'COGS recognized on delivery' },
        { accountId: deferredCogsAccountId, debit: 0, credit: totalDeferredCost, memo: 'Deferred COGS cleared' }
      ]
    })

    logger.info({ orderId, orderNumber: order.orderNumber, amount: totalDeferredCost }, 'Deferred COGS manually recognized')

    return {
      success: true,
      amount: totalDeferredCost,
      journalEntry: entry
    }
  },

  async reverseJournalEntry(entryId: string, userId?: string) {
    const entry = await this.getJournalEntryById(entryId)
    if (!entry) throw new AppError(404, 'NOT_FOUND', 'Journal entry not found')

    const reversedLines = entry.lines.map(l => ({
      accountId: l.accountId,
      debit: Number(l.credit),
      credit: Number(l.debit),
      memo: `Reversal: ${l.memo || ''}`
    }))

    return this.postJournalEntry({
      description: `Reversal of ${entry.entryNumber} - ${entry.description}`,
      sourceModule: entry.sourceModule,
      sourceId: entry.sourceId || undefined,
      reference: entry.reference || undefined,
      postedById: userId,
      lines: reversedLines
    })
  },

  async postOpeningBalances(input: {
    date: Date
    lines: { accountId: string; amount: number }[]
  }, userId?: string) {
    const { lines, date } = input

    if (!lines || lines.length === 0) {
      throw new AppError(400, 'INVALID', 'At least one account line is required')
    }

    let totalAssetDebits = 0
    let totalLiabilityEquityCredits = 0
    const assetLines: { account: any; amount: number }[] = []
    const liabilityEquityLines: { account: any; amount: number }[] = []

    for (const line of lines) {
      if (line.amount < 0) {
        throw new AppError(400, 'INVALID', 'Amount must be non-negative')
      }
      const account = await prisma.account.findUnique({ where: { id: line.accountId } })
      if (!account) throw new AppError(404, 'NOT_FOUND', `Account ${line.accountId} not found`)

      if (account.type === 'ASSET') {
        totalAssetDebits += line.amount
        assetLines.push({ account, amount: line.amount })
      } else if (account.type === 'LIABILITY' || account.type === 'EQUITY') {
        totalLiabilityEquityCredits += line.amount
        liabilityEquityLines.push({ account, amount: line.amount })
      } else {
        throw new AppError(400, 'INVALID', `Account ${account.code} (${account.type}) cannot have an opening balance. Only ASSET, LIABILITY, and EQUITY accounts are allowed.`)
      }
    }

    const difference = totalAssetDebits - totalLiabilityEquityCredits
    const obeAccount = await prisma.account.findUnique({ where: { code: '3000' } })
    if (!obeAccount) throw new AppError(500, 'INTERNAL', 'Opening Balance Equity account (3000) not found')

    return prisma.$transaction(async (tx) => {
      for (const { account, amount } of assetLines) {
        await tx.account.update({
          where: { id: account.id },
          data: { openingBalance: amount }
        })
      }

      for (const { account, amount } of liabilityEquityLines) {
        await tx.account.update({
          where: { id: account.id },
          data: { openingBalance: -amount }
        })
      }

      const entryNumber = await financeRepository.getNextEntryNumber(tx)
      const entryDate = dateFromInput(date as any)

      if (Math.abs(difference) > 0.01) {
        if (difference > 0) {
          await tx.journalEntry.create({
            data: {
              entryNumber,
              date: entryDate,
              description: `Opening balances as of ${entryDate.toISOString().split('T')[0]} — credit to Opening Balance Equity (3000)`,
              sourceModule: 'OPENING',
              postedById: userId,
              lines: {
                create: [{
                  accountId: obeAccount.id,
                  debit: 0,
                  credit: Math.abs(difference),
                  memo: `Balancing entry: total assets (${totalAssetDebits}) exceed total liabilities + equity (${totalLiabilityEquityCredits})`
                }]
              }
            }
          })
        } else {
          await tx.journalEntry.create({
            data: {
              entryNumber,
              date: entryDate,
              description: `Opening balances as of ${entryDate.toISOString().split('T')[0]} — debit to Opening Balance Equity (3000)`,
              sourceModule: 'OPENING',
              postedById: userId,
              lines: {
                create: [{
                  accountId: obeAccount.id,
                  debit: Math.abs(difference),
                  credit: 0,
                  memo: `Balancing entry: total liabilities + equity (${totalLiabilityEquityCredits}) exceed total assets (${totalAssetDebits})`
                }]
              }
            }
          })
        }
      }

      logger.info({ accountsUpdated: lines.length, difference, date: entryDate }, 'Opening balances posted')

      return {
        success: true,
        accountsUpdated: lines.length,
        totalAssetDebits,
        totalLiabilityEquityCredits,
        unbalancedAmount: Math.abs(difference),
        obeAccountId: obeAccount.id
      }
    })
  }
}
