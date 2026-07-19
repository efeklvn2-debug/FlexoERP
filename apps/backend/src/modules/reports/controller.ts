import { Request, Response } from 'express'
import { reportsService } from './service'
import { sendError } from '../../middleware/errorHandler'

export const reportsController = {
  async getAgingReceivables(req: Request, res: Response) {
    try {
      const { asOf } = req.query
      const data = await reportsService.getAgingReceivables(asOf as string)
      res.json({ data })
    } catch (error: any) {
      sendError(res, error, 'reports.getAgingReceivables')
    }
  },

  async getAgingPayables(req: Request, res: Response) {
    try {
      const { asOf } = req.query
      const data = await reportsService.getAgingPayables(asOf as string)
      res.json({ data })
    } catch (error: any) {
      sendError(res, error, 'reports.getAgingPayables')
    }
  },

  async getSalesByCustomer(req: Request, res: Response) {
    try {
      const { from, to } = req.query
      const data = await reportsService.getSalesByCustomer(from as string, to as string)
      res.json({ data })
    } catch (error: any) {
      sendError(res, error, 'reports.getSalesByCustomer')
    }
  },

  async getSalesByProduct(req: Request, res: Response) {
    try {
      const { from, to } = req.query
      const data = await reportsService.getSalesByProduct(from as string, to as string)
      res.json({ data })
    } catch (error: any) {
      sendError(res, error, 'reports.getSalesByProduct')
    }
  },

  async getInventoryMovements(req: Request, res: Response) {
    try {
      const { from, to } = req.query
      const data = await reportsService.getInventoryMovements(from as string, to as string)
      res.json({ data })
    } catch (error: any) {
      sendError(res, error, 'reports.getInventoryMovements')
    }
  },

  async getProfitRange(req: Request, res: Response) {
    try {
      const { from, to } = req.query
      const data = await reportsService.getProfitRange(from as string, to as string)
      res.json({ data })
    } catch (error: any) {
      sendError(res, error, 'reports.getProfitRange')
    }
  }
}
