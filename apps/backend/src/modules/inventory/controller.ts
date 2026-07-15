import { Request, Response, NextFunction } from 'express'
import { inventoryService } from './service'
import { dateFromInput } from '../../utils/dates'
import { MaterialInput, StockMovementInput } from './validation'
import { AuthenticatedRequest } from '../../middleware/auth'
import { AppError, sendError } from '../../middleware/errorHandler'

export const inventoryController = {
  async getSubCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await inventoryService.getSubCategories()
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'inventory.getSubCategories')
    }
  },

  async getAllMaterials(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true'
      const materials = includeInactive 
        ? await inventoryService.getAllMaterials()
        : await inventoryService.getMaterialsWithStock()
      res.json({ data: materials })
    } catch (error) {
      sendError(res, error, 'inventory.getAllMaterials')
    }
  },

  async getMaterialById(req: Request, res: Response, next: NextFunction) {
    try {
      const material = await inventoryService.getMaterialById(req.params.id)
      res.json({ data: material })
    } catch (error) {
      sendError(res, error, 'inventory.getMaterialById')
    }
  },

  async createMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as MaterialInput
      const userId = req.user?.id
      const material = await inventoryService.createMaterial(input, userId)
      res.status(201).json({ data: material })
    } catch (error) {
      sendError(res, error, 'inventory.createMaterial')
    }
  },

  async updateMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as Partial<MaterialInput>
      const userId = req.user?.id
      const material = await inventoryService.updateMaterial(req.params.id, input, userId)
      res.json({ data: material })
    } catch (error) {
      sendError(res, error, 'inventory.updateMaterial')
    }
  },

  async archiveMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const material = await inventoryService.archiveMaterial(req.params.id)
      res.json({ data: material })
    } catch (error) {
      sendError(res, error, 'inventory.archiveMaterial')
    }
  },

  async restoreMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const material = await inventoryService.restoreMaterial(req.params.id)
      res.json({ data: material })
    } catch (error) {
      sendError(res, error, 'inventory.restoreMaterial')
    }
  },

  async deleteMaterial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await inventoryService.deleteMaterial(req.params.id)
      res.status(204).send()
    } catch (error) {
      sendError(res, error, 'inventory.deleteMaterial')
    }
  },

  async adjustStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { newQuantity, reason } = req.body
      const material = await inventoryService.adjustStock(req.params.id, newQuantity, reason)
      res.json({ data: material })
    } catch (error) {
      sendError(res, error, 'inventory.adjustStock')
    }
  },

  async recordStockMovement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const input = req.body as StockMovementInput
      const userId = req.user?.id
      const movement = await inventoryService.recordStockMovement(input, userId)
      res.status(201).json({ data: movement })
    } catch (error) {
      sendError(res, error, 'inventory.recordStockMovement')
    }
  },

  async getStockMovements(req: Request, res: Response, next: NextFunction) {
    try {
      const materialId = req.query.materialId as string | undefined
      const limit = parseInt(req.query.limit as string) || 50
      const movements = await inventoryService.getStockMovements(materialId, limit)
      res.json({ data: movements })
    } catch (error) {
      sendError(res, error, 'inventory.getStockMovements')
    }
  },

  async getMaterialRolls(req: Request, res: Response, next: NextFunction) {
    try {
      const rolls = await inventoryService.getMaterialRolls(req.params.id)
      res.json({ data: rolls })
    } catch (error) {
      sendError(res, error, 'inventory.getMaterialRolls')
    }
  },

  async getCoreStock(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await inventoryService.getCoreStock()
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'inventory.getCoreStock')
    }
  },

  async getPackingBagStock(req: Request, res: Response, next: NextFunction) {
    try {
      const days = parseInt(req.query.days as string) || 60
      const result = await inventoryService.getPackingBagStock(days)
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'inventory.getPackingBagStock')
    }
  },

  async initializeStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { materials, date } = req.body
      const userId = req.user?.id

      if (!materials || !Array.isArray(materials) || materials.length === 0) {
        throw new AppError(400, 'INVALID', 'Materials array is required')
      }

      const result = await inventoryService.initializeStock(materials, date || dateFromInput(), userId)
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'inventory.initializeStock')
    }
  },

  async getInitialStockMovements(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 100
      const movements = await inventoryService.getInitialStockMovements(limit)
      res.json({ data: movements })
    } catch (error) {
      sendError(res, error, 'inventory.getInitialStockMovements')
    }
  }
}
