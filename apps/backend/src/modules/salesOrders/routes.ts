import { Router } from 'express'
import { salesOrderController, paymentController, invoiceController, coreBuybackController } from './controller'
import { authenticate, loadUser } from '../../middleware/auth'

export const salesOrderRouter = Router()

salesOrderRouter.use(authenticate, loadUser)

// Sales Orders
salesOrderRouter.get('/orders', salesOrderController.getOrders)
salesOrderRouter.get('/orders/:id', salesOrderController.getOrderById)
salesOrderRouter.post('/orders', salesOrderController.createOrder)
salesOrderRouter.patch('/orders/:id', salesOrderController.updateOrder)
salesOrderRouter.patch('/orders/:id/approve', salesOrderController.approveOrder)
salesOrderRouter.patch('/orders/:id/start-production', salesOrderController.startProduction)
salesOrderRouter.patch('/orders/:id/cancel', salesOrderController.cancelOrder)
salesOrderRouter.patch('/orders/:id/ready', salesOrderController.markReady)
salesOrderRouter.patch('/orders/:id/pickup', salesOrderController.recordPickup)

// Payments
salesOrderRouter.post('/payments', paymentController.recordPayment)
salesOrderRouter.get('/payments', paymentController.getPayments)
salesOrderRouter.get('/payments/order/:salesOrderId', paymentController.getPaymentsBySalesOrder)
salesOrderRouter.get('/payments/customer/:customerId', paymentController.getPaymentsByCustomer)

// Invoices
salesOrderRouter.post('/invoices', invoiceController.createInvoice)
salesOrderRouter.get('/invoices', invoiceController.getInvoices)
salesOrderRouter.get('/invoices/:id', invoiceController.getInvoice)
salesOrderRouter.patch('/invoices/:id/issue', invoiceController.issueInvoice)

// Core Buyback
salesOrderRouter.post('/core-buyback', coreBuybackController.recordCoreBuyback)
salesOrderRouter.get('/core-buyback', coreBuybackController.getCoreBuybacks)
salesOrderRouter.get('/core-buyback/customer/:customerId', coreBuybackController.getCustomerCoreBalance)

// Customer Balance & Aging
salesOrderRouter.get('/customers', salesOrderController.getCustomers)
salesOrderRouter.get('/customers/:customerId', salesOrderController.getCustomerById)
salesOrderRouter.post('/customers', salesOrderController.createCustomer)
salesOrderRouter.patch('/customers/:customerId', salesOrderController.updateCustomer)
salesOrderRouter.get('/customers/:customerId/balance', salesOrderController.getCustomerBalance)
salesOrderRouter.get('/customers/:customerId/aging', salesOrderController.getCustomerAging)
salesOrderRouter.get('/customer-balances', salesOrderController.getAllCustomerBalances)

// Packing Bag Sales
salesOrderRouter.post('/packing-bags/sell', coreBuybackController.sellPackingBags)
