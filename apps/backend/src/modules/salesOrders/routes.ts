import { Router } from 'express'
import { salesOrderController, paymentController, invoiceController, coreBuybackController } from './controller'
import { authenticate, loadUser, requirePermission } from '../../middleware/auth'
import { tenantMiddleware } from '../../middleware/tenant'
import { validateRequest } from '../../middleware/validation'
import { mutationLimiter } from '../../middleware/rateLimiters'
import {
  createOrderSchema, updateOrderSchema,
  createCustomerSchema, updateCustomerSchema,
  recordPickupSchema, recordPaymentSchema,
  createInvoiceSchema, addInvoicePaymentSchema,
  coreBuybackSchema, adjustDepositSchema,
  sellPackingBagsSchema, startProductionSchema
} from './validation'

export const salesOrderRouter = Router()

salesOrderRouter.use(authenticate, loadUser, tenantMiddleware)

// Sales Orders
salesOrderRouter.get('/orders', requirePermission('sales_order:read'), salesOrderController.getOrders)
salesOrderRouter.get('/orders/:id', requirePermission('sales_order:read'), salesOrderController.getOrderById)
salesOrderRouter.post('/orders', mutationLimiter, requirePermission('sales_order:create'), validateRequest(createOrderSchema), salesOrderController.createOrder)
salesOrderRouter.patch('/orders/:id', requirePermission('sales_order:edit'), validateRequest(updateOrderSchema), salesOrderController.updateOrder)
salesOrderRouter.patch('/orders/:id/approve', requirePermission('sales_order:approve'), salesOrderController.approveOrder)
salesOrderRouter.patch('/orders/:id/start-production', requirePermission('production:create'), validateRequest(startProductionSchema), salesOrderController.startProduction)
salesOrderRouter.patch('/orders/:id/cancel', mutationLimiter, requirePermission('sales_order:delete'), salesOrderController.cancelOrder)
salesOrderRouter.patch('/orders/:id/ready', requirePermission('sales_order:edit'), salesOrderController.markReady)
salesOrderRouter.patch('/orders/:id/pickup', mutationLimiter, requirePermission('sales_order:pickup'), validateRequest(recordPickupSchema), salesOrderController.recordPickup)

// Payments
salesOrderRouter.post('/payments', mutationLimiter, requirePermission('sales_order:payment'), validateRequest(recordPaymentSchema), paymentController.recordPayment)
salesOrderRouter.get('/payments', requirePermission('sales_order:read'), paymentController.getPayments)
salesOrderRouter.get('/payments/order/:salesOrderId', requirePermission('sales_order:read'), paymentController.getPaymentsBySalesOrder)
salesOrderRouter.get('/payments/customer/:customerId', requirePermission('sales_order:read'), paymentController.getPaymentsByCustomer)

// Invoices
salesOrderRouter.post('/invoices', mutationLimiter, requirePermission('sales_order:payment'), validateRequest(createInvoiceSchema), invoiceController.createInvoice)
salesOrderRouter.get('/invoices', requirePermission('sales_order:read'), invoiceController.getInvoices)
salesOrderRouter.get('/invoices/:id', requirePermission('sales_order:read'), invoiceController.getInvoice)
salesOrderRouter.patch('/invoices/:id/issue', requirePermission('sales_order:edit'), invoiceController.issueInvoice)
salesOrderRouter.post('/invoices/:id/payments', mutationLimiter, requirePermission('sales_order:payment'), validateRequest(addInvoicePaymentSchema), invoiceController.addPayment)
salesOrderRouter.get('/invoices/:id/pdf', requirePermission('sales_order:read'), invoiceController.downloadPdf)

// Core Buyback
salesOrderRouter.post('/core-buyback', requirePermission('inventory:adjust'), validateRequest(coreBuybackSchema), coreBuybackController.recordCoreBuyback)
salesOrderRouter.get('/core-buyback', requirePermission('inventory:read'), coreBuybackController.getCoreBuybacks)

// Customer Balance & Aging
salesOrderRouter.get('/customers', requirePermission('customer:read'), salesOrderController.getCustomers)
salesOrderRouter.get('/customers/:customerId', requirePermission('customer:read'), salesOrderController.getCustomerById)
salesOrderRouter.post('/customers', requirePermission('customer:create'), validateRequest(createCustomerSchema), salesOrderController.createCustomer)
salesOrderRouter.patch('/customers/:customerId', requirePermission('customer:edit'), validateRequest(updateCustomerSchema), salesOrderController.updateCustomer)
salesOrderRouter.get('/customers/:customerId/balance', requirePermission('customer:read'), salesOrderController.getCustomerBalance)
salesOrderRouter.get('/customers/:customerId/aging', requirePermission('customer:read'), salesOrderController.getCustomerAging)
salesOrderRouter.get('/customer-balances', requirePermission('customer:read'), salesOrderController.getAllCustomerBalances)
salesOrderRouter.get('/customers/:customerId/transactions', requirePermission('customer:read'), salesOrderController.getCustomerTransactions)
salesOrderRouter.post('/customers/:customerId/deposit', requirePermission('customer:payment'), validateRequest(adjustDepositSchema), salesOrderController.adjustDeposit)

// Packing Bag Sales
salesOrderRouter.post('/packing-bags/sell', requirePermission('sales_order:pickup'), validateRequest(sellPackingBagsSchema), coreBuybackController.sellPackingBags)

// Receipts
salesOrderRouter.post('/payments/:id/generate-receipt', requirePermission('sales_order:read'), salesOrderController.generateReceipt)
salesOrderRouter.get('/receipts/:id/pdf', requirePermission('sales_order:read'), salesOrderController.downloadReceiptPdf)
