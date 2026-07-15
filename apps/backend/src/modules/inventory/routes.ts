import { Router } from 'express'
import { inventoryController } from './controller'
import { validateRequest } from '../../middleware/validation'
import { materialSchema, materialUpdateSchema, stockMovementSchema } from './validation'
import { authenticate, loadUser } from '../../middleware/auth'

export const inventoryRouter = Router()

inventoryRouter.use(authenticate, loadUser)

inventoryRouter.get('/materials', inventoryController.getAllMaterials)
inventoryRouter.get('/materials/sub-categories', inventoryController.getSubCategories)
inventoryRouter.get('/materials/:id', inventoryController.getMaterialById)
inventoryRouter.post('/materials', validateRequest(materialSchema), inventoryController.createMaterial)
inventoryRouter.patch('/materials/:id', validateRequest(materialUpdateSchema), inventoryController.updateMaterial)
inventoryRouter.patch('/materials/:id/archive', inventoryController.archiveMaterial)
inventoryRouter.patch('/materials/:id/restore', inventoryController.restoreMaterial)
inventoryRouter.get('/materials/:id/rolls', inventoryController.getMaterialRolls)
inventoryRouter.delete('/materials/:id', inventoryController.deleteMaterial)
inventoryRouter.patch('/materials/:id/adjust-stock', inventoryController.adjustStock)
inventoryRouter.post('/movements', validateRequest(stockMovementSchema), inventoryController.recordStockMovement)
inventoryRouter.get('/movements', inventoryController.getStockMovements)
inventoryRouter.get('/core-stock', inventoryController.getCoreStock)
inventoryRouter.get('/packing-bag-stock', inventoryController.getPackingBagStock)
inventoryRouter.post('/initialize-stock', inventoryController.initializeStock)
inventoryRouter.get('/initial-stock-movements', inventoryController.getInitialStockMovements)
