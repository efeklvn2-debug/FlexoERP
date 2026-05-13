import { Request, Response, NextFunction } from 'express'
import { settingsService } from './service'

export const settingsController = {
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsService.getSettings()
      res.json({ data: settings })
    } catch (error) { next(error) }
  },

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
  },

  async getOverheadRate(req: Request, res: Response, next: NextFunction) {
    try {
      const rate = await settingsService.getOverheadRate()
      res.json({ data: rate })
    } catch (error) { next(error) }
  },

  async updateOverheadRate(req: Request, res: Response, next: NextFunction) {
    try {
      const { rate } = req.body
      const userId = (req as any).user?.id
      const updatedRate = await settingsService.updateOverheadRate(rate, userId)
      res.json({ data: updatedRate })
    } catch (error) { next(error) }
  },

  async getOverheadRateHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await settingsService.getOverheadRateHistory()
      res.json({ data: history })
    } catch (error) { next(error) }
  },

  async updateVatSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body
      const settings = await settingsService.updateVatSettings(input)
      res.json({ data: settings })
    } catch (error) { next(error) }
  }
}
