import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { Prisma } from '@prisma/client'

export const financeRepository = {
  async findAccountByCode(code: string) {
    return prisma.account.findUnique({ where: { code } })
  },

  async findAccountById(id: string) {
    return prisma.account.findUnique({ where: { id } })
  },

  async findAllAccounts(includeInactive = false) {
    return prisma.account.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { code: 'asc' },
      include: { parent: true }
    })
  },

  async findAccountsByType(type: string) {
    return prisma.account.findMany({
      where: { type: type as any, isActive: true },
      orderBy: { code: 'asc' }
    })
  },

  async findRootAccounts() {
    return prisma.account.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { code: 'asc' },
      include: { children: { where: { isActive: true }, orderBy: { code: 'asc' } } }
    })
  },

  async createAccount(data: {
    code: string
    name: string
    type: string
    parentId?: string
    isVatEnabled?: boolean
    description?: string
  }) {
    return prisma.account.create({ data: data as any })
  },

  async updateAccount(id: string, data: {
    name?: string
    isVatEnabled?: boolean
    isActive?: boolean
  }) {
    return prisma.account.update({ where: { id }, data })
  },

  async getNextEntryNumber() {
    const year = new Date().getFullYear()
    const prefix = `JE-${year}-`
    
    const lastEntry = await prisma.journalEntry.findFirst({
      where: { entryNumber: { startsWith: prefix } },
      orderBy: { entryNumber: 'desc' }
    })
    
    if (!lastEntry) {
      return `${prefix}0001`
    }
    
    const lastNum = parseInt(lastEntry.entryNumber.replace(prefix, ''))
    return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
  },

  async createJournalEntry(data: {
    entryNumber: string
    date: Date
    description: string
    sourceModule: string
    sourceId?: string
    reference?: string
    postedById?: string
    lines: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; memo?: string }[]
  }) {
    return prisma.journalEntry.create({
      data: {
        entryNumber: data.entryNumber,
        date: data.date,
        description: data.description,
        sourceModule: data.sourceModule as any,
        sourceId: data.sourceId,
        reference: data.reference,
        postedById: data.postedById,
        lines: {
          create: data.lines
        }
      },
      include: { lines: { include: { account: true } } }
    })
  },

  async getJournalEntries(options?: {
    dateFrom?: Date
    dateTo?: Date
    sourceModule?: string
    accountId?: string
    limit?: number
    offset?: number
  }) {
    const where: any = {}
    
    if (options?.dateFrom || options?.dateTo) {
      where.date = {}
      if (options.dateFrom) where.date.gte = options.dateFrom
      if (options.dateTo) where.date.lte = options.dateTo
    }
    if (options?.sourceModule) where.sourceModule = options.sourceModule
    if (options?.accountId) {
      where.lines = { some: { accountId: options.accountId } }
    }
    
    return prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: true } } },
      orderBy: [{ date: 'desc' }, { entryNumber: 'desc' }],
      take: options?.limit || 50,
      skip: options?.offset || 0
    })
  },

  async getJournalEntryById(id: string) {
    return prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: true } } }
    })
  },

  async getJournalEntriesBySource(sourceModule: string, sourceId: string) {
    return prisma.journalEntry.findMany({
      where: { sourceModule: sourceModule as any, sourceId },
      include: { lines: { include: { account: true } } }
    })
  },

  async getAccountBalance(accountId: string, asOfDate?: Date) {
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found')

    const dateFilter = asOfDate ? { lte: asOfDate } : {}

    const result = await prisma.journalLine.aggregate({
      where: {
        accountId,
        journalEntry: { date: dateFilter }
      },
      _sum: { debit: true, credit: true }
    })

    const totalDebit = result._sum.debit ? Number(result._sum.debit) : 0
    const totalCredit = result._sum.credit ? Number(result._sum.credit) : 0

    return {
      openingBalance: Number(account.openingBalance),
      totalDebit,
      totalCredit,
      balance: Number(account.openingBalance) + totalDebit - totalCredit
    }
  },

  async getAllAccountBalances(asOfDate?: Date) {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' }
    })

    const balances: Record<string, { openingBalance: number; totalDebit: number; totalCredit: number }> = {}

    for (const account of accounts) {
      balances[account.id] = {
        openingBalance: Number(account.openingBalance),
        totalDebit: 0,
        totalCredit: 0
      }
    }

    const dateFilter = asOfDate ? { lte: asOfDate } : {}

    const lines = await prisma.journalLine.findMany({
      where: { journalEntry: { date: dateFilter } },
      include: { account: true }
    })

    for (const line of lines) {
      if (balances[line.accountId]) {
        balances[line.accountId].totalDebit += Number(line.debit)
        balances[line.accountId].totalCredit += Number(line.credit)
      }
    }

    return accounts.map((acc) => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      accountType: acc.type,
      ...balances[acc.id],
      balance: balances[acc.id].openingBalance + balances[acc.id].totalDebit - balances[acc.id].totalCredit
    }))
  },

  async getRevenueByPeriod(dateFrom: Date, dateTo: Date) {
    const salesAccount = await prisma.account.findUnique({ where: { code: '4000' } })
    const packingAccount = await prisma.account.findUnique({ where: { code: '4100' } })

    const result: Record<string, number> = { sales: 0, packing: 0 }

    if (salesAccount) {
      const salesTotal = await prisma.journalLine.aggregate({
        where: {
          accountId: salesAccount.id,
          journalEntry: { date: { gte: dateFrom, lte: dateTo } }
        },
        _sum: { credit: true }
      })
      result.sales = salesTotal._sum.credit ? Number(salesTotal._sum.credit) : 0
    }

    if (packingAccount) {
      const packingTotal = await prisma.journalLine.aggregate({
        where: {
          accountId: packingAccount.id,
          journalEntry: { date: { gte: dateFrom, lte: dateTo } }
        },
        _sum: { credit: true }
      })
      result.packing = packingTotal._sum.credit ? Number(packingTotal._sum.credit) : 0
    }

    return result
  },

  async getExpensesByPeriod(dateFrom: Date, dateTo: Date) {
    const expenseAccounts = await prisma.account.findMany({
      where: { type: 'EXPENSE', isActive: true }
    })

    const expenses: Record<string, number> = {}

    for (const account of expenseAccounts) {
      const result = await prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: { date: { gte: dateFrom, lte: dateTo } }
        },
        _sum: { debit: true }
      })
      expenses[account.code] = result._sum.debit ? Number(result._sum.debit) : 0
    }

    return expenses
  },

  async getCogsByPeriod(dateFrom: Date, dateTo: Date) {
    const cogsAccount = await prisma.account.findUnique({ where: { code: '5000' } })
    
    if (!cogsAccount) return 0

    const result = await prisma.journalLine.aggregate({
      where: {
        accountId: cogsAccount.id,
        journalEntry: { date: { gte: dateFrom, lte: dateTo } }
      },
      _sum: { debit: true }
    })

    return result._sum.debit ? Number(result._sum.debit) : 0
  },

  async getCashFlow(dateFrom: Date, dateTo: Date) {
    const cashAccounts = await prisma.account.findMany({
      where: { code: { in: ['1000', '1100'] }, isActive: true }
    })

    const cashIn = { opening: 0, closing: 0 }

    for (const account of cashAccounts) {
      const opening = await this.getAccountBalance(account.id)
      cashIn.opening += opening.balance

      const closing = await this.getAccountBalance(account.id, dateTo)
      cashIn.closing += closing.balance
    }

    const moneyIn = await prisma.journalLine.aggregate({
      where: {
        accountId: { in: cashAccounts.map(a => a.id) },
        journalEntry: { date: { gte: dateFrom, lte: dateTo } }
      },
      _sum: { debit: true }
    })

    const moneyOut = await prisma.journalLine.aggregate({
      where: {
        accountId: { in: cashAccounts.map(a => a.id) },
        journalEntry: { date: { gte: dateFrom, lte: dateTo } }
      },
      _sum: { credit: true }
    })

    return {
      openingBalance: cashIn.opening,
      moneyInToday: moneyIn._sum.debit ? Number(moneyIn._sum.debit) : 0,
      moneyOutToday: moneyOut._sum.credit ? Number(moneyOut._sum.credit) : 0,
      closingBalance: cashIn.closing
    }
  },

  async getOutputVat(dateFrom: Date, dateTo: Date) {
    const vatOutputAccount = await prisma.account.findUnique({ where: { code: '2100' } })
    if (!vatOutputAccount) return 0

    const result = await prisma.journalLine.aggregate({
      where: {
        accountId: vatOutputAccount.id,
        journalEntry: { date: { gte: dateFrom, lte: dateTo } }
      },
      _sum: { credit: true }
    })

    return result._sum.credit ? Number(result._sum.credit) : 0
  },

  async getInputVat(dateFrom: Date, dateTo: Date) {
    const vatInputAccount = await prisma.account.findUnique({ where: { code: '1400' } })
    if (!vatInputAccount) return 0

    const result = await prisma.journalLine.aggregate({
      where: {
        accountId: vatInputAccount.id,
        journalEntry: { date: { gte: dateFrom, lte: dateTo } }
      },
      _sum: { debit: true }
    })

    return result._sum.debit ? Number(result._sum.debit) : 0
  }
}
