import { Router } from 'express'
import { transactionController } from './controller'

export const transactionRouter = Router()

transactionRouter.get('/', transactionController.getTransactions)
transactionRouter.get('/available-rolls', transactionController.getAvailableRolls)
transactionRouter.get('/:id', transactionController.getTransactionById)
transactionRouter.post('/', transactionController.createTransaction)
transactionRouter.delete('/:id', transactionController.deleteTransaction)
