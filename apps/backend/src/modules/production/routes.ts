import { Router } from 'express'
import { productionController } from './controller'
import { authenticate, loadUser, authorize } from '../../middleware/auth'
import { Role } from '@flexoprint/types'

export const productionRouter = Router()

productionRouter.use(authenticate, loadUser)

productionRouter.get('/', productionController.getJobs)
productionRouter.get('/rolls', productionController.getAvailableRolls)
productionRouter.get('/roll-types', productionController.getRollTypes)
productionRouter.get('/printed-rolls', productionController.getPrintedRolls)
productionRouter.get('/parent-roll/:parentRollId/printed-rolls', productionController.getPrintedRollsByParentRoll)
productionRouter.get('/:id', productionController.getJobById)
productionRouter.post('/', productionController.createJob)
productionRouter.patch('/:id', productionController.updateJob)
productionRouter.post('/:id/printed-rolls', productionController.addPrintedRolls)
productionRouter.post('/:id/complete', productionController.completeJob)
productionRouter.delete('/:id', productionController.deleteJob)

productionRouter.post('/parent-roll/:id/dispose', authenticate, loadUser, productionController.disposeRoll)
productionRouter.post('/parent-roll/:id/return', authenticate, loadUser, productionController.returnRoll)
productionRouter.post('/parent-roll/:id/consume', authenticate, loadUser, productionController.markRollConsumed)
productionRouter.post('/parent-roll/:id/receive-replacement', authenticate, loadUser, productionController.receiveReplacement)
productionRouter.post('/printed-roll/:id/customer-return', authenticate, loadUser, productionController.customerReturnRoll)
productionRouter.post('/printed-rolls/archive', authenticate, loadUser, authorize(Role.ADMIN, Role.MANAGER), productionController.archiveOldPrintedRolls)
