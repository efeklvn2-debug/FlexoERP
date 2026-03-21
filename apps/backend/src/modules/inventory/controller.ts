import { Request, Response, NextFunction } from 'express'
import { inventoryService } from './service'
import { MaterialInput, StockMovementInput } from './validation'
import { AuthenticatedRequest } from '../../middleware/auth'

export const inventoryController = {
  async getAllMaterials(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true'
      const materials = includeInactive 
        ? await inventoryService.getAllMaterials()
        : await inventoryService.getMaterialsWithStock()
      res.json({ data: materials })
    } catch (error) {
      next(error)
    }
  },

  async getMaterialById(req: Request, res: Response, next: NextFunction) {
    try {
      const material = await inventoryService.getMaterialById(req.params.id)
      res.json({ data: material })
    } catch (error) {
      next(error)
    }
  },

  async createMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as MaterialInput
      const userId = req.user?.id
      const material = await inventoryService.createMaterial(input, userId)
      res.status(201).json({ data: material })
    } catch (error) {
      next(error)
    }
  },

  async updateMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as Partial<MaterialInput>
      const userId = req.user?.id
      const material = await inventoryService.updateMaterial(req.params.id, input, userId)
      res.json({ data: material })
    } catch (error) {
      next(error)
    }
  },

  async archiveMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const material = await inventoryService.archiveMaterial(req.params.id)
      res.json({ data: material })
    } catch (error) {
      next(error)
    }
  },

  async restoreMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const material = await inventoryService.restoreMaterial(req.params.id)
      res.json({ data: material })
    } catch (error) {
      next(error)
    }
  },

  async deleteMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id
      await inventoryService.deleteMaterial(req.params.id, userId)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },

  async recordStockMovement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as StockMovementInput
      const userId = req.user?.id
      const movement = await inventoryService.recordStockMovement(input, userId)
      res.status(201).json({ data: movement })
    } catch (error) {
      next(error)
    }
  },

  async getStockMovements(req: Request, res: Response, next: NextFunction) {
    try {
      const materialId = req.query.materialId as string | undefined
      const limit = parseInt(req.query.limit as string) || 50
      const movements = await inventoryService.getStockMovements(materialId, limit)
      res.json({ data: movements })
    } catch (error) {
      next(error)
    }
  },

  async getMaterialRolls(req: Request, res: Response, next: NextFunction) {
    try {
      const rolls = await inventoryService.getMaterialRolls(req.params.id)
      res.json({ data: rolls })
    } catch (error) {
      next(error)
    }
  }
}
