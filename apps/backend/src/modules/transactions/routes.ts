import { Router } from 'express'
import { transactionController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const transactionRouter = Router()

transactionRouter.use(authenticate, loadUser)

transactionRouter.get('/', transactionController.getTransactions)
transactionRouter.get('/available-rolls', transactionController.getAvailableRolls)
transactionRouter.get('/:id', transactionController.getTransactionById)
transactionRouter.post('/', transactionController.createTransaction)
transactionRouter.delete('/:id', transactionController.deleteTransaction)
