import { Request, Response } from 'express'
import { transactionService } from './service'
import { logger } from '../../logger'

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
      logger.error(error, 'Error fetching transactions')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch transactions' })
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
      logger.error(error, 'Error fetching transaction')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch transaction' })
    }
  },

  async createTransaction(req: Request, res: Response) {
    try {
      const transaction = await transactionService.createTransaction(req.body)
      res.status(201).json({ data: transaction })
    } catch (error: any) {
      logger.error(error, 'Error creating transaction')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create transaction' })
    }
  },

  async deleteTransaction(req: Request, res: Response) {
    try {
      const { id } = req.params
      const result = await transactionService.deleteTransaction(id)
      res.json(result)
    } catch (error: any) {
      logger.error(error, 'Error deleting transaction')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete transaction' })
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
      logger.error(error, 'Error fetching available rolls')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch available rolls' })
    }
  }
}
