import { Router } from 'express'
import { settingsController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const settingsRouter = Router()

settingsRouter.get('/', authenticate, loadUser, settingsController.getSettings)
settingsRouter.get('/consumption-rates', authenticate, loadUser, settingsController.getConsumptionRates)
settingsRouter.patch('/consumption-rates', authenticate, loadUser, settingsController.updateConsumptionRates)
settingsRouter.get('/overhead-rate', authenticate, loadUser, settingsController.getOverheadRate)
settingsRouter.patch('/overhead-rate', authenticate, loadUser, settingsController.updateOverheadRate)
settingsRouter.get('/overhead-rate-history', authenticate, loadUser, settingsController.getOverheadRateHistory)
settingsRouter.patch('/vat', authenticate, loadUser, settingsController.updateVatSettings)
settingsRouter.get('/invoice', authenticate, loadUser, settingsController.getInvoiceSettings)
settingsRouter.patch('/invoice', authenticate, loadUser, settingsController.updateInvoiceSettings)

// Ink Colors
settingsRouter.get('/ink-colors', authenticate, loadUser, settingsController.getInkColors)
settingsRouter.post('/ink-colors', authenticate, loadUser, settingsController.createInkColor)
settingsRouter.put('/ink-colors/:id', authenticate, loadUser, settingsController.updateInkColor)
settingsRouter.patch('/ink-colors/:id/archive', authenticate, loadUser, settingsController.archiveInkColor)
settingsRouter.patch('/ink-colors/:id/restore', authenticate, loadUser, settingsController.restoreInkColor)
