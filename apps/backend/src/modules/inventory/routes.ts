import { Router } from 'express'
import { inventoryController } from './controller'
import { validateRequest } from '../../middleware/validation'
import { materialSchema, stockMovementSchema } from './validation'
import { authenticate, loadUser } from '../../middleware/auth'

export const inventoryRouter = Router()

inventoryRouter.get(
  '/materials',
  authenticate,
  loadUser,
  inventoryController.getAllMaterials
)

inventoryRouter.get(
  '/materials/:id',
  authenticate,
  loadUser,
  inventoryController.getMaterialById
)

inventoryRouter.post(
  '/materials',
  authenticate,
  loadUser,
  validateRequest(materialSchema),
  inventoryController.createMaterial
)

inventoryRouter.patch(
  '/materials/:id',
  authenticate,
  loadUser,
  inventoryController.updateMaterial
)

inventoryRouter.patch(
  '/materials/:id/archive',
  authenticate,
  loadUser,
  inventoryController.archiveMaterial
)

inventoryRouter.patch(
  '/materials/:id/restore',
  authenticate,
  loadUser,
  inventoryController.restoreMaterial
)

inventoryRouter.get(
  '/materials/:id/rolls',
  authenticate,
  loadUser,
  inventoryController.getMaterialRolls
)

inventoryRouter.delete(
  '/materials/:id',
  authenticate,
  loadUser,
  inventoryController.deleteMaterial
)

inventoryRouter.post(
  '/movements',
  authenticate,
  loadUser,
  validateRequest(stockMovementSchema),
  inventoryController.recordStockMovement
)

inventoryRouter.get(
  '/movements',
  authenticate,
  loadUser,
  inventoryController.getStockMovements
)
