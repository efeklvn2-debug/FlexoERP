import { Router } from 'express'
import { financeController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const financeRouter = Router()

financeRouter.use(authenticate, loadUser)

financeRouter.get('/accounts', financeController.getAccounts)
financeRouter.get('/accounts/tree', financeController.getRootAccounts)
financeRouter.get('/accounts/:id', financeController.getAccountById)
financeRouter.post('/accounts', financeController.createAccount)

financeRouter.get('/journal', financeController.getJournalEntries)
financeRouter.get('/journal/:id', financeController.getJournalEntryById)
financeRouter.post('/journal', financeController.postJournalEntry)

financeRouter.get('/balances', financeController.getAllAccountBalances)
financeRouter.get('/balances/:id', financeController.getAccountBalance)
financeRouter.get('/trial-balance', financeController.getTrialBalance)
financeRouter.get('/ledger/:id', financeController.getGeneralLedger)

financeRouter.get('/dashboard', financeController.getFinanceDashboard)
financeRouter.get('/vat', financeController.getVatSummary)
financeRouter.get('/profit', financeController.getProfitSummary)

financeRouter.post('/seed', financeController.seedAccounts)
