import { Router } from 'express'
import { settingsController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const settingsRouter = Router()

settingsRouter.get('/consumption-rates', authenticate, loadUser, settingsController.getConsumptionRates)
settingsRouter.patch('/consumption-rates', authenticate, loadUser, settingsController.updateConsumptionRates)
