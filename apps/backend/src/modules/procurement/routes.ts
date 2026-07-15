import { Router } from 'express'
import { procurementController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'
import { validateRequest } from '../../middleware/validation'
import {
  purchaseOrderSchema, updatePOSchema, addLineItemSchema,
  receivePOSchema, rollSchema, bulkRollSchema,
  supplierInvoiceSchema, supplierPaymentSchema
} from './validation'

export const procurementRouter = Router()

procurementRouter.use(authenticate, loadUser)

// Purchase Orders
procurementRouter.get('/purchase-orders', procurementController.getAllPOs)
procurementRouter.get('/purchase-orders/:id', procurementController.getPOById)
procurementRouter.post('/purchase-orders', validateRequest(purchaseOrderSchema), procurementController.createPO)
procurementRouter.patch('/purchase-orders/:id', validateRequest(updatePOSchema), procurementController.updatePO)
procurementRouter.post('/purchase-orders/:id/items', validateRequest(addLineItemSchema), procurementController.addLineItem)
procurementRouter.delete('/purchase-orders/:id/items/:lineItemId', procurementController.removeLineItem)
procurementRouter.delete('/purchase-orders/:id', procurementController.deletePO)
procurementRouter.post('/purchase-orders/:id/receive', validateRequest(receivePOSchema), procurementController.receivePO)

// Rolls
procurementRouter.get('/rolls', procurementController.getAllRolls)
procurementRouter.get('/rolls/:id', procurementController.getRollById)
procurementRouter.post('/rolls', validateRequest(rollSchema), procurementController.createRoll)
procurementRouter.post('/rolls/bulk', validateRequest(bulkRollSchema), procurementController.createMultipleRolls)

// Supplier Invoices
procurementRouter.get('/supplier-invoices', procurementController.getAllSupplierInvoices)
procurementRouter.get('/supplier-invoices/:id', procurementController.getSupplierInvoiceById)
procurementRouter.post('/supplier-invoices', validateRequest(supplierInvoiceSchema), procurementController.createSupplierInvoice)
procurementRouter.post('/supplier-invoices/:id/payments', validateRequest(supplierPaymentSchema), procurementController.addPayment)
