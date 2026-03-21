import { Router } from 'express'
import { pricingController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const pricingRouter = Router()

pricingRouter.get(
  '/materials-prices',
  authenticate,
  loadUser,
  pricingController.getMaterialsWithPrices
)

pricingRouter.get(
  '/',
  authenticate,
  loadUser,
  pricingController.getPriceLists
)

pricingRouter.post(
  '/',
  authenticate,
  loadUser,
  pricingController.createPriceList
)

pricingRouter.patch(
  '/:id',
  authenticate,
  loadUser,
  pricingController.updatePriceList
)

pricingRouter.delete(
  '/:id',
  authenticate,
  loadUser,
  pricingController.deletePriceList
)
