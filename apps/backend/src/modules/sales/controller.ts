import { Request, Response, NextFunction } from 'express'
import { salesService } from './service'
import { CustomerInput, OrderInput, OrderUpdateInput } from './validation'
import { AuthenticatedRequest } from '../../middleware/auth'

export const salesController = {
  // Customer endpoints
  async getAllCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true'
      const customers = await salesService.getAllCustomers(includeInactive)
      res.json({ data: customers })
    } catch (error) {
      next(error)
    }
  },

  async getCustomerById(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await salesService.getCustomerById(req.params.id)
      res.json({ data: customer })
    } catch (error) {
      next(error)
    }
  },

  async createCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as CustomerInput
      
      if (!input.name || !input.name.trim()) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Name is required' }
        })
        return
      }
      
      if (!input.colors || input.colors.length === 0) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'At least one ink color is required' }
        })
        return
      }
      
      const customer = await salesService.createCustomer(input)
      res.status(201).json({ data: customer })
    } catch (error) {
      next(error)
    }
  },

  async updateCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as Partial<CustomerInput>
      const customer = await salesService.updateCustomer(req.params.id, input)
      res.json({ data: customer })
    } catch (error) {
      next(error)
    }
  },

  async deleteCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await salesService.deleteCustomer(req.params.id)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },

  // Order endpoints
  async getAllOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        customerId: req.query.customerId as string | undefined,
        status: req.query.status as string | undefined
      }
      const orders = await salesService.getAllOrders(filters)
      res.json({ data: orders })
    } catch (error) {
      next(error)
    }
  },

  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await salesService.getOrderById(req.params.id)
      res.json({ data: order })
    } catch (error) {
      next(error)
    }
  },

  async createOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as OrderInput
      const userId = req.user?.id
      const order = await salesService.createOrder(input, userId)
      res.status(201).json({ data: order })
    } catch (error) {
      next(error)
    }
  },

  async updateOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as OrderUpdateInput
      const userId = req.user?.id
      const order = await salesService.updateOrder(req.params.id, input, userId)
      res.json({ data: order })
    } catch (error) {
      next(error)
    }
  },

  async cancelOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await salesService.cancelOrder(req.params.id)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
}
