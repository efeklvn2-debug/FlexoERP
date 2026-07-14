import { Request, Response } from 'express'
import { productionService, productionJobSchema } from './service'
import { logger } from '../../logger'
import { sendError } from '../../middleware/errorHandler'

export const productionController = {
  async getJobs(req: Request, res: Response) {
    try {
      const { status } = req.query
      const jobs = await productionService.getJobs(status as string)
      res.json({ data: jobs })
    } catch (error) {
      sendError(res, error, 'production.getJobs')
    }
  },

  async getAvailableRolls(req: Request, res: Response) {
    try {
      const { category } = req.query
      const rolls = await productionService.getAvailableRolls(category as string)
      res.json({ data: rolls })
    } catch (error) {
      sendError(res, error, 'production.getAvailableRolls')
    }
  },

  async getPrintedRolls(req: Request, res: Response) {
    try {
      const { status, includeArchived } = req.query
      const rolls = await productionService.getPrintedRolls(status as string, includeArchived === 'true')
      res.json({ data: rolls })
    } catch (error) {
      sendError(res, error, 'production.getPrintedRolls')
    }
  },

  async archiveOldPrintedRolls(req: Request, res: Response) {
    try {
      const result = await productionService.archiveOldPrintedRolls((req as any).user?.id)
      res.json(result)
    } catch (error: any) {
      sendError(res, error, 'production.archiveOldPrintedRolls')
    }
  },

  async getPrintedRollsByParentRoll(req: Request, res: Response) {
    try {
      const { parentRollId } = req.params
      const rolls = await productionService.getPrintedRollsByParentRoll(parentRollId)
      res.json({ data: rolls })
    } catch (error) {
      sendError(res, error, 'production.getPrintedRollsByParentRoll')
    }
  },

  async getRollTypes(req: Request, res: Response) {
    try {
      const rollTypes = await productionService.getRollTypes()
      res.json({ data: rollTypes })
    } catch (error) {
      sendError(res, error, 'production.getRollTypes')
    }
  },

  async getJobById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const job = await productionService.getJobById(id)
      res.json({ data: job })
    } catch (error: any) {
      sendError(res, error, 'production.getJobById')
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
      sendError(res, error, 'production.createJob')
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
      sendError(res, error, 'production.updateJob')
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
      sendError(res, error, 'production.addPrintedRolls')
    }
  },

  async completeJob(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date, consumedRollIds } = req.body
      const job = await productionService.completeJob(id, date, consumedRollIds)
      res.json({ data: job })
    } catch (error: any) {
      sendError(res, error, 'production.completeJob')
    }
  },

  async markRollConsumed(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const userId = (req as any).user?.id
      const result = await productionService.markRollConsumed(id, userId, date)
      res.json(result)
    } catch (error: any) {
      sendError(res, error, 'production.markRollConsumed')
    }
  },

  async deleteJob(req: Request, res: Response) {
    try {
      const { id } = req.params
      await productionService.deleteJob(id)
      res.json({ success: true })
    } catch (error: any) {
      sendError(res, error, 'production.deleteJob')
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
      sendError(res, error, 'production.disposeRoll')
    }
  },

  async returnRoll(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const result = await productionService.returnRoll(id, (req as any).user?.id, date)
      res.json(result)
    } catch (error: any) {
      sendError(res, error, 'production.returnRoll')
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
      sendError(res, error, 'production.customerReturnRoll')
    }
  },

  async receiveReplacement(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { date } = req.body
      const result = await productionService.receiveReplacement(id, (req as any).user?.id, date)
      res.json(result)
    } catch (error: any) {
      sendError(res, error, 'production.receiveReplacement')
    }
  }
}
