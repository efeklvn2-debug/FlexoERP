import { Router } from 'express'
import { productionController } from './controller'

export const productionRouter = Router()

productionRouter.get('/', productionController.getJobs)
productionRouter.get('/rolls', productionController.getAvailableRolls)
productionRouter.get('/roll-types', productionController.getRollTypes)
productionRouter.get('/printed-rolls', productionController.getPrintedRolls)
productionRouter.get('/:id', productionController.getJobById)
productionRouter.post('/', productionController.createJob)
productionRouter.put('/:id', productionController.updateJob)
productionRouter.post('/:id/printed-rolls', productionController.addPrintedRolls)
productionRouter.post('/:id/complete', productionController.completeJob)
productionRouter.delete('/:id', productionController.deleteJob)
