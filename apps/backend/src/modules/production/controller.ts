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
      const { status } = req.query
      const rolls = await productionService.getPrintedRolls(status as string)
      res.json({ data: rolls })
    } catch (error) {
      logger.error(error, 'Error fetching printed rolls')
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
      const job = await productionService.completeJob(id)
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
  }
}
