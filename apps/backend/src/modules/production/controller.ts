import { Request, Response } from 'express'
import { productionService, productionJobSchema } from './service'
import { logger } from '../../logger'

export const productionController = {
  async getJobs(req: Request, res: Response) {
    try {
      const { status } = req.query
      const jobs = await productionService.getJobs(status as string)
      res.json({ data: jobs })
    } catch (error) {
      logger.error(error, 'Error fetching production jobs')
      res.status(500).json({ error: 'Failed to fetch jobs' })
    }
  },

  async getAvailableRolls(req: Request, res: Response) {
    try {
      const { category } = req.query
      const rolls = await productionService.getAvailableRolls(category as string)
      res.json({ data: rolls })
    } catch (error) {
      logger.error(error, 'Error fetching available rolls')
      res.status(500).json({ error: 'Failed to fetch rolls' })
    }
  },

  async getPrintedRolls(req: Request, res: Response) {
    try {
      const { status, includeArchived } = req.query
      const rolls = await productionService.getPrintedRolls(status as string, includeArchived === 'true')
      res.json({ data: rolls })
    } catch (error) {
      logger.error(error, 'Error fetching printed rolls')
      res.status(500).json({ error: 'Failed to fetch printed rolls' })
    }
  },

  async archiveOldPrintedRolls(req: Request, res: Response) {
    try {
      const result = await productionService.archiveOldPrintedRolls((req as any).user?.id)
      res.json(result)
    } catch (error: any) {
      logger.error(error, 'Error archiving printed rolls')
      res.status(500).json({ error: error.message || 'Failed to archive printed rolls' })
    }
  },

  async getPrintedRollsByParentRoll(req: Request, res: Response) {
    try {
      const { parentRollId } = req.params
      const rolls = await productionService.getPrintedRollsByParentRoll(parentRollId)
      res.json({ data: rolls })
    } catch (error) {
      logger.error(error, 'Error fetching printed rolls by parent roll')
      res.status(500).json({ error: 'Failed to fetch printed rolls' })
    }
  },

  async getRollTypes(req: Request, res: Response) {
    try {
      const rollTypes = await productionService.getRollTypes()
      res.json({ data: rollTypes })
    } catch (error) {
      logger.error(error, 'Error fetching roll types')
      res.status(500).json({ error: 'Failed to fetch roll types' })
    }
  },

  async getJobById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const job = await productionService.getJobById(id)
      res.json({ data: job })
    } catch (error: any) {
      logger.error(error, 'Error fetching production job')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch job' })
    }
  },

  async createJob(req: Request, res: Response) {
    try {
      const parseResult = productionJobSchema.safeParse(req.body)
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues })
      }

      const job = await productionService.createJob(parseResult.data)
      res.status(201).json({ data: job })
    } catch (error: any) {
      logger.error(error, 'Error creating production job')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create job' })
    }
  },

  async updateJob(req: Request, res: Response) {
    try {
      const { id } = req.params
      const parseResult = productionJobSchema.partial().safeParse(req.body)
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues })
      }

      const job = await productionService.updateJob(id, parseResult.data)
      res.json({ data: job })
    } catch (error: any) {
      logger.error(error, 'Error updating production job')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update job' })
    }
  },

  async addPrintedRolls(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { weights } = req.body
      
      if (!Array.isArray(weights)) {
        return res.status(400).json({ error: 'weights must be an array' })
      }

      const job = await productionService.addPrintedRolls(id, weights)
      res.json({ data: job })
    } catch (error: any) {
      logger.error(error, 'Error adding printed rolls')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to add printed rolls' })
    }
  },

  async completeJob(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const job = await productionService.completeJob(id, date)
      res.json({ data: job })
    } catch (error: any) {
      logger.error(error, 'Error completing production job')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to complete job' })
    }
  },

  async deleteJob(req: Request, res: Response) {
    try {
      const { id } = req.params
      await productionService.deleteJob(id)
      res.json({ success: true })
    } catch (error: any) {
      logger.error(error, 'Error deleting production job')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete job' })
    }
  },

  async disposeRoll(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { reason, date } = req.body
      if (!reason) return res.status(400).json({ error: 'Reason is required' })
      const result = await productionService.disposeRoll(id, reason, (req as any).user?.id, date)
      res.json(result)
    } catch (error: any) {
      logger.error(error, 'Error disposing roll')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to dispose roll' })
    }
  },

  async returnRoll(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const result = await productionService.returnRoll(id, (req as any).user?.id, date)
      res.json(result)
    } catch (error: any) {
      logger.error(error, 'Error returning roll')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to return roll' })
    }
  },

  async customerReturnRoll(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { qty, reason, condition, refundMethod, date } = req.body
      if (!qty || !reason || !condition) {
        return res.status(400).json({ error: 'qty, reason, and condition are required' })
      }
      if (qty <= 0) return res.status(400).json({ error: 'qty must be positive' })
      const result = await productionService.customerReturnRoll(id, { qty, reason, condition, refundMethod, userId: (req as any).user?.id, date })
      res.json(result)
    } catch (error: any) {
      logger.error(error, 'Error processing customer return')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to process customer return' })
    }
  },

  async receiveReplacement(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const result = await productionService.receiveReplacement(id, (req as any).user?.id, date)
      res.json(result)
    } catch (error: any) {
      logger.error(error, 'Error receiving replacement')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to receive replacement' })
    }
  }
}
