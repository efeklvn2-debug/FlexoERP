import { Router } from 'express'
import { pricingController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const pricingRouter = Router()

pricingRouter.use(authenticate, loadUser)

pricingRouter.get('/materials-prices', pricingController.getMaterialsWithPrices)
pricingRouter.get('/', pricingController.getPriceLists)
pricingRouter.post('/', pricingController.createPriceList)
pricingRouter.patch('/:id', pricingController.updatePriceList)
pricingRouter.delete('/:id', pricingController.deletePriceList)
