import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { financeRepository } from './repository'
import { Prisma } from '@prisma/client'

const logger = createChildLogger('finance:service')

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
    const account = await financeRepository.findAccountByCode(code)
    if (!account) throw new AppError(404, 'NOT_FOUND', `Account ${code} not found`)
    return account
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
  }) {
    const { lines, description, sourceModule, sourceId, reference, postedById, date } = input

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

    const entryNumber = await financeRepository.getNextEntryNumber()

    return prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: date || new Date(),
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
    })
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
      dateFrom: options?.dateFrom ? new Date(options.dateFrom) : undefined,
      dateTo: options?.dateTo ? new Date(options.dateTo) : undefined,
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
      asOfDate ? new Date(asOfDate) : undefined
    )
  },

  async getAllAccountBalances(asOfDate?: string) {
    return financeRepository.getAllAccountBalances(
      asOfDate ? new Date(asOfDate) : undefined
    )
  },

  async getTrialBalance(asOfDate?: string) {
    const balances = await financeRepository.getAllAccountBalances(
      asOfDate ? new Date(asOfDate) : undefined
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

    const totalRevenue = revenue.sales + revenue.packing
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
    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), 0, 1)
    const to = dateTo ? new Date(dateTo) : new Date()

    const outputVat = await financeRepository.getOutputVat(from, to)
    const inputVat = await financeRepository.getInputVat(from, to)

    return {
      outputVat,
      inputVat,
      vatPayable: outputVat - inputVat
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

    const totalRevenue = revenue.sales + revenue.packing
    const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0)

    return {
      revenue: totalRevenue,
      breakdown: {
        salesRevenue: revenue.sales,
        packingRevenue: revenue.packing
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
      dateFrom ? new Date(dateFrom) : undefined
    )

    const entries = await prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          date: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) })
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
    const existingAccounts = await financeRepository.findAllAccounts(true)
    if (existingAccounts.length > 0) {
      logger.info('Chart of accounts already exists, skipping seed')
      return { message: 'Accounts already seeded', count: existingAccounts.length }
    }

    const accounts = [
      { code: '1000', name: 'Cash', type: 'ASSET', description: 'Cash on hand' },
      { code: '1100', name: 'Bank', type: 'ASSET', description: 'Bank accounts' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', description: 'Money owed by customers' },
      { code: '1300', name: 'Raw Material Inventory', type: 'ASSET', description: 'Plain rolls, ink, solvents' },
      { code: '1310', name: 'Work in Progress', type: 'ASSET', description: 'Materials in production' },
      { code: '1320', name: 'Finished Goods', type: 'ASSET', description: 'Printed rolls ready for sale' },
      { code: '1400', name: 'VAT Input', type: 'ASSET', isVatEnabled: true, description: 'VAT paid on purchases' },

      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', description: 'Money owed to suppliers' },
      { code: '2100', name: 'VAT Output', type: 'LIABILITY', isVatEnabled: true, description: 'VAT collected on sales' },
      { code: '2200', name: 'Customer Deposits', type: 'LIABILITY', description: 'Core deposits held' },

      { code: '3000', name: 'Opening Balance Equity', type: 'EQUITY', description: 'Opening balances' },
      { code: '3100', name: 'Retained Earnings', type: 'EQUITY', description: 'Accumulated profits' },

      { code: '4000', name: 'Sales Revenue', type: 'REVENUE', description: 'Income from printed roll sales' },
      { code: '4100', name: 'Packing Bags Revenue', type: 'REVENUE', description: 'Income from packing bag sales' },
      { code: '4200', name: 'Other Income', type: 'REVENUE', description: 'Miscellaneous income' },

      { code: '5000', name: 'Cost of Goods Sold', type: 'COGS', description: 'Material cost of goods sold' },
      { code: '5100', name: 'Material Costs', type: 'COGS', description: 'Plain roll material costs' },
      { code: '5200', name: 'Production Costs', type: 'COGS', description: 'Direct production costs' },

      { code: '6000', name: 'Fuel & Transport', type: 'EXPENSE', description: 'Fuel and transportation expenses' },
      { code: '6100', name: 'Maintenance', type: 'EXPENSE', description: 'Equipment maintenance' },
      { code: '6200', name: 'Diesel', type: 'EXPENSE', description: 'Generator diesel' },
      { code: '6300', name: 'Salaries', type: 'EXPENSE', description: 'Staff salaries' },
      { code: '6400', name: 'Administrative', type: 'EXPENSE', description: 'Office and administrative expenses' },
      { code: '6500', name: 'Utilities', type: 'EXPENSE', description: 'Electricity, water, etc.' },
      { code: '6600', name: 'Miscellaneous', type: 'EXPENSE', description: 'Other expenses' }
    ]

    for (const acc of accounts) {
      await prisma.account.create({ data: acc as any })
    }

    logger.info({ count: accounts.length }, 'Chart of accounts seeded')
    return { message: 'Chart of accounts seeded', count: accounts.length }
  }
}
