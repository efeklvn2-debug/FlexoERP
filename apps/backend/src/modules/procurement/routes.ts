import { Router } from 'express'
import { procurementController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const procurementRouter = Router()

// Purchase Orders
procurementRouter.get('/purchase-orders', authenticate, loadUser, procurementController.getAllPOs)
procurementRouter.get('/purchase-orders/:id', authenticate, loadUser, procurementController.getPOById)
procurementRouter.post('/purchase-orders', authenticate, loadUser, procurementController.createPO)
procurementRouter.patch('/purchase-orders/:id', authenticate, loadUser, procurementController.updatePO)
procurementRouter.post('/purchase-orders/:id/items', authenticate, loadUser, procurementController.addLineItem)
procurementRouter.delete('/purchase-orders/:id/items/:lineItemId', authenticate, loadUser, procurementController.removeLineItem)
procurementRouter.delete('/purchase-orders/:id', authenticate, loadUser, procurementController.deletePO)
procurementRouter.post('/purchase-orders/:id/receive', authenticate, loadUser, procurementController.receivePO)

// Rolls
procurementRouter.get('/rolls', authenticate, loadUser, procurementController.getAllRolls)
procurementRouter.get('/rolls/:id', authenticate, loadUser, procurementController.getRollById)
procurementRouter.post('/rolls', authenticate, loadUser, procurementController.createRoll)
procurementRouter.post('/rolls/bulk', authenticate, loadUser, procurementController.createMultipleRolls)
