import { Router } from 'express'
import { authenticate, loadUser } from '../../middleware/auth'
import { supplierController } from './controller'

export const supplierRouter = Router()

supplierRouter.use(authenticate)
supplierRouter.use(loadUser)

supplierRouter.get('/', supplierController.getAll)
supplierRouter.get('/:id', supplierController.getById)
supplierRouter.post('/', supplierController.create)
supplierRouter.patch('/:id', supplierController.update)
supplierRouter.patch('/:id/deactivate', supplierController.deactivate)
supplierRouter.delete('/:id', supplierController.deactivate)
