import { Router } from 'express'
import { transactionController } from './controller'
import { authenticate, loadUser, requirePermission } from '../../middleware/auth'

export const transactionRouter = Router()

transactionRouter.use(authenticate, loadUser)

transactionRouter.get('/', requirePermission('customer:read'), transactionController.getTransactions)
transactionRouter.get('/available-rolls', requirePermission('inventory:read'), transactionController.getAvailableRolls)
transactionRouter.get('/:id', requirePermission('customer:read'), transactionController.getTransactionById)
transactionRouter.post('/', requirePermission('sales_order:payment'), transactionController.createTransaction)
transactionRouter.delete('/:id', requirePermission('sales_order:delete'), transactionController.deleteTransaction)
