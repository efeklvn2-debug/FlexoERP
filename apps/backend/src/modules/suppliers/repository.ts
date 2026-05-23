import { prisma } from '../../database'
import { Supplier } from './types'

export const supplierRepository = {
  async findAll(): Promise<Supplier[]> {
    return prisma.supplier.findMany({
      orderBy: { name: 'asc' }
    })
  },

  async findById(id: string): Promise<Supplier | null> {
    return prisma.supplier.findUnique({ where: { id } })
  },

  async findByCode(code: string): Promise<Supplier | null> {
    return prisma.supplier.findUnique({ where: { code } })
  },

  async findByName(name: string): Promise<Supplier | null> {
    return prisma.supplier.findFirst({ where: { name } })
  },

  async create(data: { name: string; code: string; email?: string; phone?: string; address?: string; notes?: string }): Promise<Supplier> {
    return prisma.supplier.create({ data })
  },

  async update(id: string, data: { name?: string; email?: string; phone?: string; address?: string; notes?: string; isActive?: boolean }): Promise<Supplier> {
    return prisma.supplier.update({ where: { id }, data })
  },

  async deactivate(id: string): Promise<Supplier> {
    return prisma.supplier.update({ where: { id }, data: { isActive: false } })
  }
}
