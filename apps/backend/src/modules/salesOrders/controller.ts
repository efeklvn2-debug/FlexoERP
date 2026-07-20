import { Request, Response } from 'express'
import { salesOrderService, paymentService, invoiceService, coreBuybackService } from './service'
import { generateInvoicePdf, generateReceiptPdf } from './pdf-service'
import { receiptRepository } from './repository'
import { logger } from '../../logger'
import { sendError } from '../../middleware/errorHandler'

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
      sendError(res, error, 'salesOrders.getOrders')
    }
  },

  async getOrderById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.getOrderById(id)
      res.json({ data: order })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getOrderById')
    }
  },

  async createOrder(req: Request, res: Response) {
    try {
      const order = await salesOrderService.createOrder(req.body, (req as any).user?.id)
      res.status(201).json({ data: order })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.createOrder')
    }
  },

  async updateOrder(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.updateOrder(id, req.body)
      res.json({ data: order })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.updateOrder')
    }
  },

  async approveOrder(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const order = await salesOrderService.approveOrder(id, (req as any).user?.id, date)
      res.json({ data: order })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.approveOrder')
    }
  },

  async startProduction(req: Request, res: Response) {
    try {
      const { id } = req.params
      const result = await salesOrderService.startProduction(id, req.body, (req as any).user?.id)
      res.json({ data: result })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.startProduction')
    }
  },

  async cancelOrder(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const order = await salesOrderService.cancelOrder(id, (req as any).user?.id, date)
      res.json({ data: order })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.cancelOrder')
    }
  },

  async markReady(req: Request, res: Response) {
    try {
      const { id } = req.params
      const order = await salesOrderService.markReadyForPickup(id)
      res.json({ data: order })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.markReady')
    }
  },

  async recordPickup(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { rollIds, packingBags, packingBagPrice, date } = req.body
      const order = await salesOrderService.recordPickup(id, (req as any).user?.id, rollIds, packingBags, packingBagPrice, date)
      res.json({ data: order })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.recordPickup')
    }
  },

  async getCustomers(req: Request, res: Response) {
    try {
      const customers = await salesOrderService.getCustomers()
      res.json({ data: customers })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getCustomers')
    }
  },

  async getCustomerById(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const customer = await salesOrderService.getCustomerById(customerId)
      res.json({ data: customer })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getCustomerById')
    }
  },

  async createCustomer(req: Request, res: Response) {
    try {
      const customer = await salesOrderService.createCustomer(req.body, (req as any).user?.id)
      res.status(201).json({ data: customer })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.createCustomer')
    }
  },

  async updateCustomer(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const customer = await salesOrderService.updateCustomer(customerId, req.body)
      res.json({ data: customer })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.updateCustomer')
    }
  },

  async getCustomerBalance(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const balance = await salesOrderService.getCustomerBalance(customerId)
      res.json({ data: balance })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getCustomerBalance')
    }
  },

  async getCustomerAging(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const aging = await salesOrderService.getCustomerAging(customerId)
      res.json({ data: aging })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getCustomerAging')
    }
  },

  async getAllCustomerBalances(req: Request, res: Response) {
    try {
      const balances = await salesOrderService.getAllCustomerBalances()
      res.json({ data: balances })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getAllCustomerBalances')
    }
  },

  async getCustomerTransactions(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const transactions = await salesOrderService.getCustomerTransactions(customerId)
      res.json({ data: transactions })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getCustomerTransactions')
    }
  },

  async adjustDeposit(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const { amount } = req.body
      const userId = (req as any).user?.id
      if (!amount || typeof amount !== 'number' || amount === 0) {
        return res.status(400).json({ error: 'Amount must be a non-zero number' })
      }
      const result = await salesOrderService.adjustDeposit(customerId, amount, userId)
      res.json({ data: result })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.adjustDeposit')
    }
  },

  async generateReceipt(req: Request, res: Response) {
    try {
      const { id } = req.params
      const userId = (req as any).user?.id
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const receipt = await salesOrderService.generateReceipt(id, userId)
      res.json({ data: receipt })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.generateReceipt')
    }
  },

  async downloadReceiptPdf(req: Request, res: Response) {
    try {
      const { id } = req.params
      const pdfBuffer = await generateReceiptPdf(id)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="receipt-${id.slice(0, 8)}.pdf"`)
      res.send(pdfBuffer)
    } catch (error: any) {
      sendError(res, error, 'salesOrders.downloadReceiptPdf')
    }
  },
}

export const paymentController = {
  async recordPayment(req: Request, res: Response) {
    try {
      const payment = await paymentService.recordPayment(req.body, (req as any).user?.id)
      res.status(201).json({ data: payment })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.recordPayment')
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
      sendError(res, error, 'salesOrders.getPayments')
    }
  },

  async getPaymentsBySalesOrder(req: Request, res: Response) {
    try {
      const { salesOrderId } = req.params
      const payments = await paymentService.getPaymentsBySalesOrder(salesOrderId)
      res.json({ data: payments })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getPaymentsBySalesOrder')
    }
  },

  async getPaymentsByCustomer(req: Request, res: Response) {
    try {
      const { customerId } = req.params
      const payments = await paymentService.getPaymentsByCustomer(customerId)
      res.json({ data: payments })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getPaymentsByCustomer')
    }
  }
}

export const invoiceController = {
  async createInvoice(req: Request, res: Response) {
    try {
      const invoice = await invoiceService.createInvoice(req.body, (req as any).user?.id)
      res.status(201).json({ data: invoice })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.createInvoice')
    }
  },

  async issueInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const invoice = await invoiceService.issueInvoice(id, date)
      res.json({ data: invoice })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.issueInvoice')
    }
  },

  async getInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params
      const invoice = await invoiceService.getInvoiceById(id)
      res.json({ data: invoice })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.getInvoice')
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
      sendError(res, error, 'salesOrders.getInvoices')
    }
  },

  async addPayment(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { amount, date, reference, notes, paymentMethod } = req.body
      const payment = await invoiceService.addPayment(id, amount, date, reference, notes, paymentMethod)
      res.status(201).json({ data: payment })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.addPayment')
    }
  },

  async downloadPdf(req: Request, res: Response) {
    try {
      const { id } = req.params
      const pdfBuffer = await generateInvoicePdf(id)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${id.slice(0, 8)}.pdf"`)
      res.send(pdfBuffer)
    } catch (error: any) {
      sendError(res, error, 'salesOrders.downloadInvoicePdf')
    }
  }
}

export const coreBuybackController = {
  async recordCoreBuyback(req: Request, res: Response) {
    try {
      const buyback = await coreBuybackService.recordCoreBuyback(req.body, (req as any).user?.id)
      res.status(201).json({ data: buyback })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.recordCoreBuyback')
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
      sendError(res, error, 'salesOrders.getCoreBuybacks')
    }
  },

  async sellPackingBags(req: Request, res: Response) {
    try {
      const { customerId, quantity, unitPrice, paymentMethod, referenceNumber, notes, applyDeposit, date } = req.body
      const userId = (req as any).user?.id

      const result = await salesOrderService.sellPackingBags({
        customerId,
        quantity,
        unitPrice,
        paymentMethod,
        referenceNumber,
        notes,
        userId,
        applyDeposit,
        date
      })

      res.status(201).json({ data: result })
    } catch (error: any) {
      sendError(res, error, 'salesOrders.sellPackingBags')
    }
  },
}
