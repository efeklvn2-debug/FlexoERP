import { Router } from 'express'
import { inventoryController } from './controller'
import { validateRequest } from '../../middleware/validation'
import { materialSchema, materialUpdateSchema, stockMovementSchema } from './validation'
import { heavyLimiter, mutationLimiter } from '../../middleware/rateLimiters'
import { authenticate, loadUser, requirePermission } from '../../middleware/auth'
import { tenantMiddleware } from '../../middleware/tenant'

export const inventoryRouter = Router()

inventoryRouter.use(authenticate, loadUser, tenantMiddleware)

inventoryRouter.get('/materials', requirePermission('inventory:read'), inventoryController.getAllMaterials)
inventoryRouter.get('/materials/sub-categories', requirePermission('inventory:read'), inventoryController.getSubCategories)
inventoryRouter.get('/materials/:id', requirePermission('inventory:read'), inventoryController.getMaterialById)
inventoryRouter.post('/materials', requirePermission('inventory:create'), validateRequest(materialSchema), inventoryController.createMaterial)
inventoryRouter.patch('/materials/:id', requirePermission('inventory:edit'), validateRequest(materialUpdateSchema), inventoryController.updateMaterial)
inventoryRouter.patch('/materials/:id/archive', requirePermission('inventory:edit'), inventoryController.archiveMaterial)
inventoryRouter.patch('/materials/:id/restore', requirePermission('inventory:edit'), inventoryController.restoreMaterial)
inventoryRouter.get('/materials/:id/rolls', requirePermission('inventory:read'), inventoryController.getMaterialRolls)
inventoryRouter.delete('/materials/:id', requirePermission('inventory:edit'), inventoryController.deleteMaterial)
inventoryRouter.patch('/materials/:id/adjust-stock', mutationLimiter, requirePermission('inventory:adjust'), inventoryController.adjustStock)
inventoryRouter.post('/movements', requirePermission('inventory:adjust'), validateRequest(stockMovementSchema), inventoryController.recordStockMovement)
inventoryRouter.get('/movements', requirePermission('inventory:read'), inventoryController.getStockMovements)
inventoryRouter.get('/core-stock', requirePermission('inventory:read'), inventoryController.getCoreStock)
inventoryRouter.get('/packing-bag-stock', requirePermission('inventory:read'), inventoryController.getPackingBagStock)
inventoryRouter.post('/initialize-stock', heavyLimiter, requirePermission('inventory:adjust'), inventoryController.initializeStock)
inventoryRouter.get('/initial-stock-movements', requirePermission('inventory:read'), inventoryController.getInitialStockMovements)
