import { Request, Response, NextFunction } from 'express'
import { procurementService } from './service'
import { PurchaseOrderInput, RollInput, ReceivePOInput, AddLineItemInput, UpdatePOInput } from './validation'
import { AuthenticatedRequest } from '../../middleware/auth'

export const procurementController = {
  // Purchase Orders
  async getAllPOs(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined
      const pos = await procurementService.getAllPOs(status)
      res.json({ data: pos })
    } catch (error) { next(error) }
  },

  async getPOById(req: Request, res: Response, next: NextFunction) {
    try {
      const po = await procurementService.getPOById(req.params.id)
      res.json({ data: po })
    } catch (error) { next(error) }
  },

  async createPO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as PurchaseOrderInput
      const po = await procurementService.createPO(input, req.user?.id)
      res.status(201).json({ data: po })
    } catch (error) { next(error) }
  },

  async updatePO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdatePOInput
      const po = await procurementService.updatePO(req.params.id, input)
      res.json({ data: po })
    } catch (error) { next(error) }
  },

  async addLineItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as AddLineItemInput
      const po = await procurementService.addLineItem(req.params.id, input)
      res.status(201).json({ data: po })
    } catch (error) { next(error) }
  },

  async removeLineItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { lineItemId } = req.params
      const po = await procurementService.removeLineItem(req.params.id, lineItemId)
      res.json({ data: po })
    } catch (error) { next(error) }
  },

  async deletePO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await procurementService.deletePO(req.params.id)
      res.status(204).send()
    } catch (error) { next(error) }
  },

  async receivePO(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await procurementService.receivePO(req.params.id, req.user?.id)
      res.status(201).json({ data: result })
    } catch (error) { next(error) }
  },

  // Rolls
  async getAllRolls(req: Request, res: Response, next: NextFunction) {
    try {
      const materialId = req.query.materialId as string | undefined
      const status = req.query.status as string | undefined
      const rolls = await procurementService.getAllRolls(materialId, status)
      res.json({ data: rolls })
    } catch (error) { next(error) }
  },

  async getRollById(req: Request, res: Response, next: NextFunction) {
    try {
      const roll = await procurementService.getRollById(req.params.id)
      res.json({ data: roll })
    } catch (error) { next(error) }
  },

  async createRoll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as RollInput
      const roll = await procurementService.createRoll(input)
      res.status(201).json({ data: roll })
    } catch (error) { next(error) }
  },

  async createMultipleRolls(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { materialId, count, weights, purchaseOrderId } = req.body
      const rolls = await procurementService.createMultipleRolls(materialId, count, weights, purchaseOrderId)
      res.status(201).json({ data: rolls })
    } catch (error) { next(error) }
  }
}
