import { Request, Response } from 'express'
import { financeService } from './service'
import { logger } from '../../logger'

export const financeController = {
  async getAccounts(req: Request, res: Response) {
    try {
      const accounts = await financeService.getAccounts()
      res.json({ data: accounts })
    } catch (error: any) {
      logger.error(error, 'Error fetching accounts')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch accounts' })
    }
  },

  async getRootAccounts(req: Request, res: Response) {
    try {
      const accounts = await financeService.getRootAccounts()
      res.json({ data: accounts })
    } catch (error: any) {
      logger.error(error, 'Error fetching root accounts')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch accounts' })
    }
  },

  async getAccountById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const account = await financeService.getAccountById(id)
      res.json({ data: account })
    } catch (error: any) {
      logger.error(error, 'Error fetching account')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch account' })
    }
  },

  async createAccount(req: Request, res: Response) {
    try {
      const account = await financeService.createAccount(req.body)
      res.status(201).json({ data: account })
    } catch (error: any) {
      logger.error(error, 'Error creating account')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create account' })
    }
  },

  async postJournalEntry(req: Request, res: Response) {
    try {
      const entry = await financeService.postJournalEntry({
        ...req.body,
        postedById: (req as any).user?.id
      })
      res.status(201).json({ data: entry })
    } catch (error: any) {
      logger.error(error, 'Error posting journal entry')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to post journal entry' })
    }
  },

  async getJournalEntries(req: Request, res: Response) {
    try {
      const { dateFrom, dateTo, sourceModule, accountId, limit, offset } = req.query
      const entries = await financeService.getJournalEntries({
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        sourceModule: sourceModule as string,
        accountId: accountId as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      })
      res.json({ data: entries })
    } catch (error: any) {
      logger.error(error, 'Error fetching journal entries')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch entries' })
    }
  },

  async getJournalEntryById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const entry = await financeService.getJournalEntryById(id)
      res.json({ data: entry })
    } catch (error: any) {
      logger.error(error, 'Error fetching journal entry')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch entry' })
    }
  },

  async getAccountBalance(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { asOfDate } = req.query
      const balance = await financeService.getAccountBalance(id, asOfDate as string)
      res.json({ data: balance })
    } catch (error: any) {
      logger.error(error, 'Error fetching account balance')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch balance' })
    }
  },

  async getAllAccountBalances(req: Request, res: Response) {
    try {
      const { asOfDate } = req.query
      const balances = await financeService.getAllAccountBalances(asOfDate as string)
      res.json({ data: balances })
    } catch (error: any) {
      logger.error(error, 'Error fetching account balances')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch balances' })
    }
  },

  async getTrialBalance(req: Request, res: Response) {
    try {
      const { asOfDate } = req.query
      const trialBalance = await financeService.getTrialBalance(asOfDate as string)
      res.json({ data: trialBalance })
    } catch (error: any) {
      logger.error(error, 'Error fetching trial balance')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch trial balance' })
    }
  },

  async getFinanceDashboard(req: Request, res: Response) {
    try {
      const dashboard = await financeService.getFinanceDashboard()
      res.json({ data: dashboard })
    } catch (error: any) {
      logger.error(error, 'Error fetching finance dashboard')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch dashboard' })
    }
  },

  async getVatSummary(req: Request, res: Response) {
    try {
      const { dateFrom, dateTo } = req.query
      const summary = await financeService.getVatSummary(dateFrom as string, dateTo as string)
      res.json({ data: summary })
    } catch (error: any) {
      logger.error(error, 'Error fetching VAT summary')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch VAT summary' })
    }
  },

  async getProfitSummary(req: Request, res: Response) {
    try {
      const { month } = req.query
      const summary = await financeService.getProfitSummary(month as string)
      res.json({ data: summary })
    } catch (error: any) {
      logger.error(error, 'Error fetching profit summary')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch profit summary' })
    }
  },

  async getGeneralLedger(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { dateFrom, dateTo } = req.query
      const ledger = await financeService.getGeneralLedger(id, dateFrom as string, dateTo as string)
      res.json({ data: ledger })
    } catch (error: any) {
      logger.error(error, 'Error fetching general ledger')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch ledger' })
    }
  },

  async seedAccounts(req: Request, res: Response) {
    try {
      const result = await financeService.seedDefaultAccounts()
      res.json({ data: result })
    } catch (error: any) {
      logger.error(error, 'Error seeding accounts')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to seed accounts' })
    }
  }
}
