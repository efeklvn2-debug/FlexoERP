import { supplierRepository } from './repository'
import { Supplier } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('suppliers:service')

function generateCode(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase().slice(0, 15)
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `SUP-${base}-${suffix}`
}

export const supplierService = {
  async getAll(): Promise<Supplier[]> {
    return supplierRepository.findAll()
  },

  async getById(id: string): Promise<Supplier> {
    const supplier = await supplierRepository.findById(id)
    if (!supplier) throw new AppError(404, 'NOT_FOUND', 'Supplier not found')
    return supplier
  },

  async findOrCreateByName(name: string): Promise<Supplier> {
    let supplier = await supplierRepository.findByName(name)
    if (!supplier) {
      const code = generateCode(name)
      supplier = await supplierRepository.create({ name, code })
      logger.info({ name, code }, 'Auto-created supplier')
    }
    return supplier
  },

  async create(input: { name: string; email?: string; phone?: string; address?: string; notes?: string }): Promise<Supplier> {
    const existing = await supplierRepository.findByName(input.name)
    if (existing) throw new AppError(400, 'DUPLICATE', 'Supplier with this name already exists')

    const code = generateCode(input.name)
    logger.info({ ...input, code }, 'Creating supplier')
    return supplierRepository.create({ ...input, code })
  },

  async update(id: string, input: { name?: string; email?: string; phone?: string; address?: string; notes?: string; isActive?: boolean }): Promise<Supplier> {
    await this.getById(id)
    return supplierRepository.update(id, input)
  },

  async deactivate(id: string): Promise<Supplier> {
    await this.getById(id)
    return supplierRepository.deactivate(id)
  }
}
