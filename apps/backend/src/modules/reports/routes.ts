import { Router } from 'express'
import { authenticate, loadUser, requirePermission } from '../../middleware/auth'
import { reportsController } from './controller'

export const reportsRouter = Router()

reportsRouter.use(authenticate)
reportsRouter.use(loadUser)
reportsRouter.use(requirePermission('reporting:read'))

reportsRouter.get('/aging/receivables', reportsController.getAgingReceivables)
reportsRouter.get('/aging/payables', reportsController.getAgingPayables)
reportsRouter.get('/sales/by-customer', reportsController.getSalesByCustomer)
reportsRouter.get('/sales/by-product', reportsController.getSalesByProduct)
reportsRouter.get('/inventory/movements', reportsController.getInventoryMovements)
reportsRouter.get('/profit', reportsController.getProfitRange)
