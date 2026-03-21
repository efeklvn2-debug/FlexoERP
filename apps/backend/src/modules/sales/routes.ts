import { Router } from 'express'
import { salesController } from './controller'
import { validateRequest } from '../../middleware/validation'
import { customerSchema, orderSchema, orderUpdateSchema } from './validation'
import { authenticate, loadUser } from '../../middleware/auth'

export const salesRouter = Router()

// Customer routes
salesRouter.get(
  '/customers',
  authenticate,
  loadUser,
  salesController.getAllCustomers
)

salesRouter.get(
  '/customers/:id',
  authenticate,
  loadUser,
  salesController.getCustomerById
)

salesRouter.post(
  '/customers',
  authenticate,
  loadUser,
  salesController.createCustomer
)

salesRouter.patch(
  '/customers/:id',
  authenticate,
  loadUser,
  salesController.updateCustomer
)

salesRouter.delete(
  '/customers/:id',
  authenticate,
  loadUser,
  salesController.deleteCustomer
)

// Order routes
salesRouter.get(
  '/orders',
  authenticate,
  loadUser,
  salesController.getAllOrders
)

salesRouter.get(
  '/orders/:id',
  authenticate,
  loadUser,
  salesController.getOrderById
)

salesRouter.post(
  '/orders',
  authenticate,
  loadUser,
  validateRequest(orderSchema),
  salesController.createOrder
)

salesRouter.patch(
  '/orders/:id',
  authenticate,
  loadUser,
  validateRequest(orderUpdateSchema),
  salesController.updateOrder
)

salesRouter.delete(
  '/orders/:id',
  authenticate,
  loadUser,
  salesController.cancelOrder
)
