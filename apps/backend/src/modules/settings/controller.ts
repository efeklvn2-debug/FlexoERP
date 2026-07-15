import { Request, Response, NextFunction } from 'express'
import { settingsService } from './service'
import { sendError } from '../../middleware/errorHandler'

export const settingsController = {
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsService.getSettings()
      res.json({ data: settings })
    } catch (error) { sendError(res, error, 'settings.getSettings') }
  },

  async getConsumptionRates(req: Request, res: Response, next: NextFunction) {
    try {
      const rates = await settingsService.getConsumptionRates()
      res.json({ data: rates })
    } catch (error) { sendError(res, error, 'settings.getConsumptionRates') }
  },

  async updateConsumptionRates(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body
      const rates = await settingsService.updateConsumptionRates(input)
      res.json({ data: rates })
    } catch (error) { sendError(res, error, 'settings.updateConsumptionRates') }
  },

  async getOverheadRate(req: Request, res: Response, next: NextFunction) {
    try {
      const rate = await settingsService.getOverheadRate()
      res.json({ data: rate })
    } catch (error) { sendError(res, error, 'settings.getOverheadRate') }
  },

  async updateOverheadRate(req: Request, res: Response, next: NextFunction) {
    try {
      const { rate } = req.body
      const userId = (req as any).user?.id
      const updatedRate = await settingsService.updateOverheadRate(rate, userId)
      res.json({ data: updatedRate })
    } catch (error) { sendError(res, error, 'settings.updateOverheadRate') }
  },

  async getOverheadRateHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await settingsService.getOverheadRateHistory()
      res.json({ data: history })
    } catch (error) { sendError(res, error, 'settings.getOverheadRateHistory') }
  },

  async updateVatSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body
      const settings = await settingsService.updateVatSettings(input)
      res.json({ data: settings })
    } catch (error) { sendError(res, error, 'settings.updateVatSettings') }
  },

  async getInvoiceSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsService.getInvoiceSettings()
      res.json({ data: settings })
    } catch (error) { sendError(res, error, 'settings.getInvoiceSettings') }
  },

  async updateInvoiceSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body
      const settings = await settingsService.updateInvoiceSettings(input)
      res.json({ data: settings })
    } catch (error) { sendError(res, error, 'settings.updateInvoiceSettings') }
  },

  // ── Ink Colors ────────────────────────────────────────

  async getInkColors(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true'
      const colors = await settingsService.getInkColors(includeInactive)
      res.json({ data: colors })
    } catch (error) { sendError(res, error, 'settings.getInkColors') }
  },

  async createInkColor(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, mapping } = req.body
      const color = await settingsService.createInkColor({ name, mapping })
      res.status(201).json({ data: color })
    } catch (error) { sendError(res, error, 'settings.createInkColor') }
  },

  async updateInkColor(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const data = await settingsService.updateInkColor(id, req.body)
      res.json({ data })
    } catch (error) { sendError(res, error, 'settings.updateInkColor') }
  },

  async archiveInkColor(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const data = await settingsService.archiveInkColor(id)
      res.json({ data })
    } catch (error) { sendError(res, error, 'settings.archiveInkColor') }
  },

  async restoreInkColor(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const data = await settingsService.restoreInkColor(id)
      res.json({ data })
    } catch (error) { sendError(res, error, 'settings.restoreInkColor') }
  }
}
