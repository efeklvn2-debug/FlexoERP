import { Router } from 'express'
import { productionController } from './controller'
import { authenticate, loadUser, requirePermission } from '../../middleware/auth'
import { mutationLimiter } from '../../middleware/rateLimiters'

export const productionRouter = Router()

productionRouter.use(authenticate, loadUser)

productionRouter.get('/', requirePermission('production:read'), productionController.getJobs)
productionRouter.get('/rolls', requirePermission('inventory:read'), productionController.getAvailableRolls)
productionRouter.get('/roll-types', requirePermission('production:read'), productionController.getRollTypes)
productionRouter.get('/printed-rolls', requirePermission('production:read'), productionController.getPrintedRolls)
productionRouter.get('/parent-roll/:parentRollId/printed-rolls', requirePermission('production:read'), productionController.getPrintedRollsByParentRoll)
productionRouter.get('/:id', requirePermission('production:read'), productionController.getJobById)
productionRouter.post('/', mutationLimiter, requirePermission('production:create'), productionController.createJob)
productionRouter.patch('/:id', requirePermission('production:edit'), productionController.updateJob)
productionRouter.post('/:id/printed-rolls', requirePermission('production:create'), productionController.addPrintedRolls)
productionRouter.post('/:id/complete', mutationLimiter, requirePermission('production:complete'), productionController.completeJob)
productionRouter.delete('/:id', requirePermission('production:delete'), productionController.deleteJob)

productionRouter.post('/parent-roll/:id/dispose', authenticate, loadUser, requirePermission('inventory:dispose'), productionController.disposeRoll)
productionRouter.post('/parent-roll/:id/return', authenticate, loadUser, requirePermission('inventory:adjust'), productionController.returnRoll)
productionRouter.post('/parent-roll/:id/consume', authenticate, loadUser, requirePermission('inventory:dispose'), productionController.markRollConsumed)
productionRouter.post('/parent-roll/:id/receive-replacement', authenticate, loadUser, requirePermission('inventory:adjust'), productionController.receiveReplacement)
productionRouter.post('/printed-roll/:id/customer-return', authenticate, loadUser, requirePermission('sales_order:pickup'), productionController.customerReturnRoll)
productionRouter.post('/printed-rolls/archive', authenticate, loadUser, requirePermission('production:delete'), productionController.archiveOldPrintedRolls)
