import { Request, Response, NextFunction } from 'express'
import { settingsService } from './service'

export const settingsController = {
  async getConsumptionRates(req: Request, res: Response, next: NextFunction) {
    try {
      const rates = await settingsService.getConsumptionRates()
      res.json({ data: rates })
    } catch (error) { next(error) }
  },

  async updateConsumptionRates(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body
      const rates = await settingsService.updateConsumptionRates(input)
      res.json({ data: rates })
    } catch (error) { next(error) }
  }
}
