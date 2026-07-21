import { Request, Response, NextFunction } from 'express'
import { procurementService } from './service'
import { PurchaseOrderInput, RollInput, ReceivePOInput, AddLineItemInput, UpdatePOInput } from './validation'
import { AuthenticatedRequest } from '../../middleware/auth'
import { sendError } from '../../middleware/errorHandler'
import { auditService } from '../audit'

export const procurementController = {
  // Purchase Orders
  async getAllPOs(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined
      const excludeInvoiced = req.query.excludeInvoiced === 'true'
      const pos = await procurementService.getAllPOs(status, excludeInvoiced)
      res.json({ data: pos })
    } catch (error) { sendError(res, error, 'procurement.getAllPOs') }
  },

  async getPOById(req: Request, res: Response, next: NextFunction) {
    try {
      const po = await procurementService.getPOById(req.params.id)
      res.json({ data: po })
    } catch (error) { sendError(res, error, 'procurement.getPOById') }
  },

  async createPO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as PurchaseOrderInput
      const po = await procurementService.createPO(input, req.user?.id)
      auditService.record({
        userId: req.user?.id,
        action: 'purchase_order.create',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        description: `Created ${po.poNumber} — ₦${Number(po.totalAmount).toLocaleString()}`,
        ipAddress: req.ip
      })
      res.status(201).json({ data: po })
    } catch (error) { sendError(res, error, 'procurement.createPO') }
  },

  async updatePO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdatePOInput
      const po = await procurementService.updatePO(req.params.id, input)
      res.json({ data: po })
    } catch (error) { sendError(res, error, 'procurement.updatePO') }
  },

  async addLineItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as AddLineItemInput
      const po = await procurementService.addLineItem(req.params.id, input)
      res.status(201).json({ data: po })
    } catch (error) { sendError(res, error, 'procurement.addLineItem') }
  },

  async removeLineItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { lineItemId } = req.params
      const po = await procurementService.removeLineItem(req.params.id, lineItemId)
      res.json({ data: po })
    } catch (error) { sendError(res, error, 'procurement.removeLineItem') }
  },

  async deletePO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await procurementService.deletePO(req.params.id)
      auditService.record({
        userId: req.user?.id,
        action: 'purchase_order.delete',
        entityType: 'PurchaseOrder',
        entityId: req.params.id,
        description: `Deleted purchase order ${req.params.id}`,
        ipAddress: req.ip
      })
      res.status(204).send()
    } catch (error) { sendError(res, error, 'procurement.deletePO') }
  },

  async receivePO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { date } = req.body
      const result = await procurementService.receivePO(req.params.id, req.user?.id, date)
      auditService.record({
        userId: req.user?.id,
        action: 'purchase_order.receive',
        entityType: 'PurchaseOrder',
        entityId: req.params.id,
        description: `Received purchase order ${req.params.id}`,
        ipAddress: req.ip
      })
      res.status(201).json({ data: result })
    } catch (error) { sendError(res, error, 'procurement.receivePO') }
  },

  // Rolls
  async getAllRolls(req: Request, res: Response, next: NextFunction) {
    try {
      const materialId = req.query.materialId as string | undefined
      const status = req.query.status as string | undefined
      const rolls = await procurementService.getAllRolls(materialId, status)
      res.json({ data: rolls })
    } catch (error) { sendError(res, error, 'procurement.getAllRolls') }
  },

  async getRollById(req: Request, res: Response, next: NextFunction) {
    try {
      const roll = await procurementService.getRollById(req.params.id)
      res.json({ data: roll })
    } catch (error) { sendError(res, error, 'procurement.getRollById') }
  },

  async createRoll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as RollInput
      const roll = await procurementService.createRoll(input)
      res.status(201).json({ data: roll })
    } catch (error) { sendError(res, error, 'procurement.createRoll') }
  },

  async createMultipleRolls(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { materialId, count, weights, purchaseOrderId } = req.body
      const rolls = await procurementService.createMultipleRolls(materialId, count, weights, purchaseOrderId)
      res.status(201).json({ data: rolls })
    } catch (error) { sendError(res, error, 'procurement.createMultipleRolls') }
  },

  // Supplier Invoices
  async getAllSupplierInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined
      const invoices = await procurementService.getAllSupplierInvoices(status)
      res.json({ data: invoices })
    } catch (error) { sendError(res, error, 'procurement.getAllSupplierInvoices') }
  },

  async getSupplierInvoiceById(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await procurementService.getSupplierInvoiceById(req.params.id)
      res.json({ data: invoice })
    } catch (error) { sendError(res, error, 'procurement.getSupplierInvoiceById') }
  },

  async createSupplierInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { poId, date, amount, invoiceNumber } = req.body
      const invoice = await procurementService.createSupplierInvoice(poId, date, amount, invoiceNumber)
      auditService.record({
        userId: req.user?.id,
        action: 'supplier_invoice.create',
        entityType: 'SupplierInvoice',
        entityId: invoice.id,
        description: `Created supplier invoice ${invoice.invoiceNumber || invoice.id} for ₦${Number(amount || 0).toLocaleString()}`,
        ipAddress: req.ip
      })
      res.status(201).json({ data: invoice })
    } catch (error) { sendError(res, error, 'procurement.createSupplierInvoice') }
  },

  async addPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { amount, date, paymentMethod, reference, notes } = req.body
      const payment = await procurementService.addPayment(req.params.id, amount, date, paymentMethod, reference, notes)
      auditService.record({
        userId: req.user?.id,
        action: 'supplier_invoice.payment',
        entityType: 'SupplierInvoice',
        entityId: req.params.id,
        description: `Paid ₦${Number(amount || 0).toLocaleString()} against supplier invoice ${req.params.id}`,
        metadata: { amount, paymentMethod },
        ipAddress: req.ip
      })
      res.status(201).json({ data: payment })
    } catch (error) { sendError(res, error, 'procurement.addPayment') }
  }
}
