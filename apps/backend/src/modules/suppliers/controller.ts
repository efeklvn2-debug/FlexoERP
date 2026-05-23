import { Request, Response, NextFunction } from 'express'
import { supplierService } from './service'

export const supplierController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const suppliers = await supplierService.getAll()
      res.json({ data: suppliers })
    } catch (error) { next(error) }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.getById(req.params.id)
      res.json({ data: supplier })
    } catch (error) { next(error) }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, address, notes } = req.body
      const supplier = await supplierService.create({ name, email, phone, address, notes })
      res.status(201).json({ data: supplier })
    } catch (error) { next(error) }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, address, notes, isActive } = req.body
      const supplier = await supplierService.update(req.params.id, { name, email, phone, address, notes, isActive })
      res.json({ data: supplier })
    } catch (error) { next(error) }
  },

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.deactivate(req.params.id)
      res.json({ data: supplier })
    } catch (error) { next(error) }
  }
}
