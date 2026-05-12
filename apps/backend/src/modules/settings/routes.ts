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
