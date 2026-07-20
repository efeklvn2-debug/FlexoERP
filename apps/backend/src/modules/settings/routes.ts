import { Router } from 'express'
import { settingsController } from './controller'
import { validateRequest } from '../../middleware/validation'
import { inkColorSchema, updateInkColorSchema, consumptionRatesSchema, overheadRateSchema, vatSettingsSchema, invoiceSettingsSchema } from './validation'
import { authenticate, loadUser, requirePermission } from '../../middleware/auth'

export const settingsRouter = Router()

settingsRouter.use(authenticate, loadUser)

settingsRouter.get('/', requirePermission('settings:read'), settingsController.getSettings)
settingsRouter.get('/consumption-rates', requirePermission('settings:read'), settingsController.getConsumptionRates)
settingsRouter.patch('/consumption-rates', requirePermission('settings:write'), validateRequest(consumptionRatesSchema), settingsController.updateConsumptionRates)
settingsRouter.get('/overhead-rate', requirePermission('settings:read'), settingsController.getOverheadRate)
settingsRouter.patch('/overhead-rate', requirePermission('settings:write'), validateRequest(overheadRateSchema), settingsController.updateOverheadRate)
settingsRouter.get('/overhead-rate-history', requirePermission('settings:read'), settingsController.getOverheadRateHistory)
settingsRouter.patch('/vat', requirePermission('settings:write'), validateRequest(vatSettingsSchema), settingsController.updateVatSettings)
settingsRouter.get('/invoice', requirePermission('settings:read'), settingsController.getInvoiceSettings)
settingsRouter.patch('/invoice', requirePermission('settings:write'), validateRequest(invoiceSettingsSchema), settingsController.updateInvoiceSettings)

// Ink Colors
settingsRouter.get('/ink-colors', requirePermission('settings:read'), settingsController.getInkColors)
settingsRouter.post('/ink-colors', requirePermission('settings:manage_colors'), validateRequest(inkColorSchema), settingsController.createInkColor)
settingsRouter.patch('/ink-colors/:id', requirePermission('settings:manage_colors'), validateRequest(updateInkColorSchema), settingsController.updateInkColor)
settingsRouter.patch('/ink-colors/:id/archive', requirePermission('settings:manage_colors'), settingsController.archiveInkColor)
settingsRouter.patch('/ink-colors/:id/restore', requirePermission('settings:manage_colors'), settingsController.restoreInkColor)
