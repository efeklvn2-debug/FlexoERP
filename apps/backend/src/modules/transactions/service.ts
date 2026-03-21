import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('transactions:service')

interface TransactionInput {
  customerId: string
  type: 'PICKUP' | 'PAYMENT' | 'CORE_DEPOSIT'
  amount?: number
  notes?: string
  printedRollIds?: string[]
  date?: string
  packingBags?: number
  amountPaid?: number
}

export const transactionService = {
  async getTransactions(filters?: { customerId?: string; type?: string; dateFrom?: string; dateTo?: string }) {
    const where: any = {}
    
    if (filters?.customerId) {
      where.customerId = filters.customerId
    }
    if (filters?.type) {
      where.type = filters.type
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {}
      if (filters.dateFrom) {
        where.date.gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo)
        toDate.setHours(23, 59, 59, 999)
        where.date.lte = toDate
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { customer: true },
      orderBy: { date: 'desc' }
    })

    // Get printed roll details for PICKUP transactions with printedRollIds
    const allPrintedRollIds = [...new Set(transactions.flatMap(t => t.printedRollIds || []))]
    if (allPrintedRollIds.length > 0) {
      const printedRolls = await prisma.printedRoll.findMany({
        where: { id: { in: allPrintedRollIds } },
        include: { roll: { include: { material: true } } }
      })
      
      // Create lookup map
      const rollMap = new Map(printedRolls.map(pr => [pr.id, {
        id: pr.id,
        rollNumber: pr.roll?.rollNumber || 'N/A',
        materialName: pr.roll?.material?.name || 'N/A',
        weightUsed: Number(pr.weightUsed)
      }]))
      
      // Attach printed roll details to each transaction
      for (const tx of transactions) {
        const details = (tx.printedRollIds || []).map(id => rollMap.get(id)).filter(Boolean)
        ;(tx as any).printedRollDetails = details
      }
    }
    
    return transactions
  },

  async getTransactionById(id: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { customer: true }
    })
    
    if (!transaction) {
      throw new AppError(404, 'NOT_FOUND', 'Transaction not found')
    }
    
    return transaction
  },

  async getTransactionsWithPrintedRolls(id: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { 
        customer: true
      }
    }) as any
    
    if (!transaction) {
      throw new AppError(404, 'NOT_FOUND', 'Transaction not found')
    }
    
    return transaction
  },

  async createTransaction(input: TransactionInput) {
    const { customerId, type, amount, notes, printedRollIds, date, packingBags, amountPaid } = input

    if (type === 'PICKUP' && (!printedRollIds || printedRollIds.length === 0)) {
      throw new AppError(400, 'INVALID_INPUT', 'At least one printed roll is required for pickup')
    }

    if ((type === 'PAYMENT' || type === 'CORE_DEPOSIT') && !amount) {
      throw new AppError(400, 'INVALID_INPUT', 'Amount is required for payment or core deposit')
    }

    return prisma.$transaction(async (tx) => {
      // For PICKUP: update printed rolls status
      if (type === 'PICKUP' && printedRollIds) {
        await tx.printedRoll.updateMany({
          where: { id: { in: printedRollIds } },
          data: {
            status: 'PICKED_UP',
            customerId,
            pickedUpAt: new Date()
          }
        })
      }

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          customerId,
          type,
          amount: amount ?? 0,
          notes,
          printedRollIds: printedRollIds ?? [],
          packingBags: packingBags ?? 0,
          amountPaid: amountPaid ?? 0,
          date: date ? new Date(date) : new Date()
        },
        include: {
          customer: true
        }
      })

      return transaction
    })
  },

  async deleteTransaction(id: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id }
    })
    
    if (!transaction) {
      throw new AppError(404, 'NOT_FOUND', 'Transaction not found')
    }

    // If this was a pickup, revert the printed roll status
    if (transaction.type === 'PICKUP' && transaction.printedRollIds.length > 0) {
      await prisma.printedRoll.updateMany({
        where: { id: { in: transaction.printedRollIds } },
        data: {
          status: 'IN_STOCK',
          customerId: null,
          pickedUpAt: null
        }
      })
    }

    await prisma.transaction.delete({ where: { id } })
    return { success: true }
  },

  async getCustomerAvailableRolls(customerId: string) {
    // Get customer details to match by name
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })
    
    if (!customer) {
      return []
    }

    const rolls = await prisma.printedRoll.findMany({
      where: {
        status: 'IN_STOCK',
        productionJob: {
          customerName: customer.name
        }
      },
      include: {
        roll: { include: { material: true } },
        productionJob: true,
        customer: true
      },
      orderBy: { createdAt: 'asc' }
    })
    
    return rolls.map(r => ({
      id: r.id,
      rollNumber: r.roll.rollNumber,
      jobNumber: r.productionJob.jobNumber,
      materialName: r.roll.material.name,
      weightUsed: Number(r.weightUsed),
      createdAt: r.createdAt
    }))
  }
}
