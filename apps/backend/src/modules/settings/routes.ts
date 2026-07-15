import { Router } from 'express'
import { settingsController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const settingsRouter = Router()

settingsRouter.use(authenticate, loadUser)

settingsRouter.get('/', settingsController.getSettings)
settingsRouter.get('/consumption-rates', settingsController.getConsumptionRates)
settingsRouter.patch('/consumption-rates', settingsController.updateConsumptionRates)
settingsRouter.get('/overhead-rate', settingsController.getOverheadRate)
settingsRouter.patch('/overhead-rate', settingsController.updateOverheadRate)
settingsRouter.get('/overhead-rate-history', settingsController.getOverheadRateHistory)
settingsRouter.patch('/vat', settingsController.updateVatSettings)
settingsRouter.get('/invoice', settingsController.getInvoiceSettings)
settingsRouter.patch('/invoice', settingsController.updateInvoiceSettings)

// Ink Colors
settingsRouter.get('/ink-colors', settingsController.getInkColors)
settingsRouter.post('/ink-colors', settingsController.createInkColor)
settingsRouter.patch('/ink-colors/:id', settingsController.updateInkColor)
settingsRouter.patch('/ink-colors/:id/archive', settingsController.archiveInkColor)
settingsRouter.patch('/ink-colors/:id/restore', settingsController.restoreInkColor)
