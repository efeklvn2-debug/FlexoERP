import { Request, Response } from 'express'
import { transactionService } from './service'
import { logger } from '../../logger'
import { sendError } from '../../middleware/errorHandler'

export const transactionController = {
  async getTransactions(req: Request, res: Response) {
    try {
      const { customerId, type, dateFrom, dateTo } = req.query
      const transactions = await transactionService.getTransactions({
        customerId: customerId as string,
        type: type as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string
      })
      res.json({ data: transactions })
    } catch (error: any) {
      sendError(res, error, 'transactions.getTransactions')
    }
  },

  async getTransactionById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const transaction = await transactionService.getTransactionById(id)
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' })
      }
      res.json({ data: transaction })
    } catch (error: any) {
      sendError(res, error, 'transactions.getTransactionById')
    }
  },

  async createTransaction(req: Request, res: Response) {
    try {
      const transaction = await transactionService.createTransaction(req.body)
      res.status(201).json({ data: transaction })
    } catch (error: any) {
      sendError(res, error, 'transactions.createTransaction')
    }
  },

  async deleteTransaction(req: Request, res: Response) {
    try {
      const { id } = req.params
      const result = await transactionService.deleteTransaction(id)
      res.json(result)
    } catch (error: any) {
      sendError(res, error, 'transactions.deleteTransaction')
    }
  },

  async getAvailableRolls(req: Request, res: Response) {
    try {
      const { customerId } = req.query
      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' })
      }
      const rolls = await transactionService.getCustomerAvailableRolls(customerId as string)
      res.json({ data: rolls })
    } catch (error: any) {
      sendError(res, error, 'transactions.getAvailableRolls')
    }
  }
}
