import { Request, Response } from 'express'
import { pricingService, priceListSchema } from './service'
import { logger } from '../../logger'

export const pricingController = {
  async getMaterialsWithPrices(req: Request, res: Response) {
    try {
      const materials = await pricingService.getMaterialsWithPrices()
      res.json({ data: materials })
    } catch (error: any) {
      logger.error(error, 'Error fetching materials with prices')
      res.status(500).json({ error: 'Failed to fetch materials' })
    }
  },

  async getPriceLists(req: Request, res: Response) {
    try {
      const priceLists = await pricingService.getPriceLists()
      res.json({ data: priceLists })
    } catch (error: any) {
      logger.error(error, 'Error fetching price lists')
      res.status(500).json({ error: 'Failed to fetch price lists' })
    }
  },

  async createPriceList(req: Request, res: Response) {
    try {
      const parseResult = priceListSchema.safeParse(req.body)
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues })
      }
      
      const priceList = await pricingService.createPriceList(parseResult.data)
      res.status(201).json({ data: priceList })
    } catch (error: any) {
      logger.error(error, 'Error creating price list')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create price list' })
    }
  },

  async updatePriceList(req: Request, res: Response) {
    try {
      const { id } = req.params
      const parseResult = priceListSchema.partial().safeParse(req.body)
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues })
      }
      
      const priceList = await pricingService.updatePriceList(id, parseResult.data)
      res.json({ data: priceList })
    } catch (error: any) {
      logger.error(error, 'Error updating price list')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update price list' })
    }
  },

  async deletePriceList(req: Request, res: Response) {
    try {
      const { id } = req.params
      await pricingService.deletePriceList(id)
      res.json({ success: true })
    } catch (error: any) {
      logger.error(error, 'Error deleting price list')
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete price list' })
    }
  }
}
