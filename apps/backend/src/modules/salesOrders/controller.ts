import { Request, Response } from 'express'
import { salesOrderService, paymentService, invoiceService, coreBuybackService } from './service'
import { logger } from '../../logger'

console.log('[CONTROLLER] Loading salesOrderController...')

export const salesOrderController = {
  async getOrders(req: Request, res: Response) {
    try {
      const { status, customerId, limit, offset } = req.query
      const orders = await salesOrderService.getOrders({
        status: status as string,
        customerId: customerId as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      })
      res.json({ data: orders })
    } catch (error: any) {
      logger.error(error, 'Error fetching sales orders')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch orders' })
    }
  },

  async getOrderById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.getOrderById(id)
      res.json({ data: order })
    } catch (error: any) {
      logger.error(error, 'Error fetching sales order')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch order' })
    }
  },

  async createOrder(req: Request, res: Response) {
    try {
      const order = await salesOrderService.createOrder(req.body, (req as any).user?.id)
      res.status(201).json({ data: order })
    } catch (error: any) {
      logger.error(error, 'Error creating sales order')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create order' })
    }
  },

  async updateOrder(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.updateOrder(id, req.body)
      res.json({ data: order })
    } catch (error: any) {
      logger.error(error, 'Error updating sales order')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update order' })
    }
  },

  async approveOrder(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.approveOrder(id, (req as any).user?.id)
      res.json({ data: order })
    } catch (error: any) {
      logger.error(error, 'Error approving sales order')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to approve order' })
    }
  },

  async startProduction(req: Request, res: Response) {
    try {
      const { id } = req.params
      const result = await salesOrderService.startProduction(id, req.body, (req as any).user?.id)
      res.json({ data: result })
    } catch (error: any) {
      logger.error(error, 'Error starting production')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to start production' })
    }
  },

  async cancelOrder(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.cancelOrder(id, (req as any).user?.id)
      res.json({ data: order })
    } catch (error: any) {
      logger.error(error, 'Error cancelling sales order')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to cancel order' })
    }
  },

  async markReady(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.markReadyForPickup(id)
      res.json({ data: order })
    } catch (error: any) {
      logger.error(error, 'Error marking order ready')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async recordPickup(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { quantityPickedUp, packingBags } = req.body
      const order = await salesOrderService.recordPickup(id, (req as any).user?.id, quantityPickedUp, packingBags)
      res.json({ data: order })
    } catch (error: any) {
      logger.error(error, 'Error recording pickup')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getCustomers(req: Request, res: Response) {
    try {
      const customers = await salesOrderService.getCustomers()
      res.json({ data: customers })
    } catch (error: any) {
      logger.error(error, 'Error fetching customers')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch customers' })
    }
  },

  async getCustomerById(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const customer = await salesOrderService.getCustomerById(customerId)
      res.json({ data: customer })
    } catch (error: any) {
      logger.error(error, 'Error fetching customer')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch customer' })
    }
  },

  async createCustomer(req: Request, res: Response) {
    try {
      const customer = await salesOrderService.createCustomer(req.body, (req as any).user?.id)
      res.status(201).json({ data: customer })
    } catch (error: any) {
      logger.error(error, 'Error creating customer')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create customer' })
    }
  },

  async updateCustomer(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const customer = await salesOrderService.updateCustomer(customerId, req.body)
      res.json({ data: customer })
    } catch (error: any) {
      logger.error(error, 'Error updating customer')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update customer' })
    }
  },

  async getCustomerBalance(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const balance = await salesOrderService.getCustomerBalance(customerId)
      res.json({ data: balance })
    } catch (error: any) {
      logger.error(error, 'Error fetching customer balance')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getCustomerAging(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const aging = await salesOrderService.getCustomerAging(customerId)
      res.json({ data: aging })
    } catch (error: any) {
      logger.error(error, 'Error fetching customer aging')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getAllCustomerBalances(req: Request, res: Response) {
    try {
      const balances = await salesOrderService.getAllCustomerBalances()
      res.json({ data: balances })
    } catch (error: any) {
      logger.error(error, 'Error fetching customer balances')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  }
}

export const paymentController = {
  async recordPayment(req: Request, res: Response) {
    try {
      const payment = await paymentService.recordPayment(req.body, (req as any).user?.id)
      res.status(201).json({ data: payment })
    } catch (error: any) {
      logger.error(error, 'Error recording payment')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to record payment' })
    }
  },

  async getPayments(req: Request, res: Response) {
    try {
      const { salesOrderId, customerId, dateFrom, dateTo } = req.query
      const payments = await paymentService.getPayments({
        salesOrderId: salesOrderId as string,
        customerId: customerId as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string
      })
      res.json({ data: payments })
    } catch (error: any) {
      logger.error(error, 'Error fetching payments')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getPaymentsBySalesOrder(req: Request, res: Response) {
    try {
      const { salesOrderId } = req.params
      const payments = await paymentService.getPaymentsBySalesOrder(salesOrderId)
      res.json({ data: payments })
    } catch (error: any) {
      logger.error(error, 'Error fetching payments')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getPaymentsByCustomer(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const payments = await paymentService.getPaymentsByCustomer(customerId)
      res.json({ data: payments })
    } catch (error: any) {
      logger.error(error, 'Error fetching payments')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  }
}

export const invoiceController = {
  async createInvoice(req: Request, res: Response) {
    try {
      const invoice = await invoiceService.createInvoice(req.body, (req as any).user?.id)
      res.status(201).json({ data: invoice })
    } catch (error: any) {
      logger.error(error, 'Error creating invoice')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create invoice' })
    }
  },

  async issueInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params
      const invoice = await invoiceService.issueInvoice(id)
      res.json({ data: invoice })
    } catch (error: any) {
      logger.error(error, 'Error issuing invoice')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params
      const invoice = await invoiceService.getInvoice(id)
      res.json({ data: invoice })
    } catch (error: any) {
      logger.error(error, 'Error fetching invoice')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getInvoices(req: Request, res: Response) {
    try {
      const { status, customerId } = req.query
      const invoices = await invoiceService.getInvoices({
        status: status as string,
        customerId: customerId as string
      })
      res.json({ data: invoices })
    } catch (error: any) {
      logger.error(error, 'Error fetching invoices')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  }
}

export const coreBuybackController = {
  async recordCoreBuyback(req: Request, res: Response) {
    try {
      const buyback = await coreBuybackService.recordCoreBuyback(req.body, (req as any).user?.id)
      res.status(201).json({ data: buyback })
    } catch (error: any) {
      logger.error(error, 'Error recording core buyback')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getCoreBuybacks(req: Request, res: Response) {
    try {
      const { customerId, dateFrom, dateTo } = req.query
      const buybacks = await coreBuybackService.getCoreBuybacks({
        customerId: customerId as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string
      })
      res.json({ data: buybacks })
    } catch (error: any) {
      logger.error(error, 'Error fetching core buybacks')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async getCustomerCoreBalance(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const balance = await coreBuybackService.getCustomerCoreBalance(customerId)
      res.json({ data: balance })
    } catch (error: any) {
      logger.error(error, 'Error fetching core balance')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  },

  async sellPackingBags(req: Request, res: Response) {
    try {
      const { customerId, quantity, unitPrice, paymentMethod, referenceNumber, notes } = req.body
      const userId = (req as any).user?.id

      const result = await salesOrderService.sellPackingBags({
        customerId,
        quantity,
        unitPrice,
        paymentMethod,
        referenceNumber,
        notes,
        userId
      })

      res.status(201).json({ data: result })
    } catch (error: any) {
      logger.error(error, 'Error selling packing bags')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed' })
    }
  }
}
