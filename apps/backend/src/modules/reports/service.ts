import { prisma } from '../../database'
import { createChildLogger } from '../../logger'
import { dateStartOfDay, dateEndOfDay } from '../../utils/dates'
import { financeRepository } from '../finance/repository'
import type {
  AgingReport, AgingEntry, AgingBucket,
  SalesByCustomerReport, SalesByCustomerEntry,
  SalesByProductReport, SalesByProductEntry,
  InventoryMovementReport, MovementByType, MovementByMaterial
} from './types'

const logger = createChildLogger('reports:service')

function asOfDate(input?: string): Date {
  return input ? new Date(input) : new Date()
}

function calcAgeBucket(daysOverdue: number): string {
  if (daysOverdue <= 30) return 'current'
  if (daysOverdue <= 60) return '31to60'
  if (daysOverdue <= 90) return '61to90'
  return '90plus'
}

export const reportsService = {
  async getAgingReceivables(asOf?: string): Promise<AgingReport> {
    const asOfDateObj = asOfDate(asOf)
    const dateStr = asOfDateObj.toISOString().split('T')[0]

    const invoices = await prisma.invoice.findMany({
      where: {
        status: { notIn: ['PAID', 'CANCELLED'] },
        totalAmount: { gt: 0 }
      },
      include: { customer: true },
      orderBy: { customer: { name: 'asc' } }
    })

    const customerMap = new Map<string, AgingEntry>()
    for (const inv of invoices) {
      const dueDate = new Date(inv.issuedAt || inv.createdAt)
      const daysOverdue = Math.max(0, Math.floor((asOfDateObj.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      const balance = Number(inv.balanceDue)

      if (!customerMap.has(inv.customerId)) {
        customerMap.set(inv.customerId, {
          id: inv.customerId,
          name: inv.customer?.name || 'Unknown',
          current: 0,
          age31to60: 0,
          age61to90: 0,
          age90plus: 0,
          total: 0
        })
      }
      const entry = customerMap.get(inv.customerId)!

      if (daysOverdue <= 30) entry.current += balance
      else if (daysOverdue <= 60) entry.age31to60 += balance
      else if (daysOverdue <= 90) entry.age61to90 += balance
      else entry.age90plus += balance

      entry.total += balance
    }

    const entries = Array.from(customerMap.values()).filter(e => e.total > 0)

    const totalOutstanding = entries.reduce((s, e) => s + e.total, 0)

    const buckets: AgingBucket[] = [
      { label: 'Current', minDays: 0, maxDays: 30, total: entries.reduce((s, e) => s + e.current, 0), count: entries.filter(e => e.current > 0).length },
      { label: '31-60 days', minDays: 31, maxDays: 60, total: entries.reduce((s, e) => s + e.age31to60, 0), count: entries.filter(e => e.age31to60 > 0).length },
      { label: '61-90 days', minDays: 61, maxDays: 90, total: entries.reduce((s, e) => s + e.age61to90, 0), count: entries.filter(e => e.age61to90 > 0).length },
      { label: '90+ days', minDays: 91, maxDays: Infinity, total: entries.reduce((s, e) => s + e.age90plus, 0), count: entries.filter(e => e.age90plus > 0).length }
    ]

    return { asOfDate: dateStr, totalOutstanding, entries, buckets }
  },

  async getAgingPayables(asOf?: string): Promise<AgingReport> {
    const asOfDateObj = asOfDate(asOf)
    const dateStr = asOfDateObj.toISOString().split('T')[0]

    const supplierInvoices = await prisma.supplierInvoice.findMany({
      where: {
        status: { notIn: ['PAID'] },
        amount: { gt: 0 }
      },
      include: { supplier: true, po: true },
      orderBy: { supplier: { name: 'asc' } }
    })

    const supplierMap = new Map<string, AgingEntry>()
    for (const inv of supplierInvoices) {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.date || inv.createdAt)
      const daysOverdue = Math.max(0, Math.floor((asOfDateObj.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      const balance = Number(inv.amount) - Number(inv.amountPaid)

      if (!supplierMap.has(inv.supplierId)) {
        supplierMap.set(inv.supplierId, {
          id: inv.supplierId,
          name: inv.supplier?.name || 'Unknown',
          current: 0,
          age31to60: 0,
          age61to90: 0,
          age90plus: 0,
          total: 0
        })
      }
      const entry = supplierMap.get(inv.supplierId)!

      if (daysOverdue <= 30) entry.current += balance
      else if (daysOverdue <= 60) entry.age31to60 += balance
      else if (daysOverdue <= 90) entry.age61to90 += balance
      else entry.age90plus += balance

      entry.total += balance
    }

    const entries = Array.from(supplierMap.values()).filter(e => e.total > 0)
    const totalOutstanding = entries.reduce((s, e) => s + e.total, 0)

    const buckets: AgingBucket[] = [
      { label: 'Current', minDays: 0, maxDays: 30, total: entries.reduce((s, e) => s + e.current, 0), count: entries.filter(e => e.current > 0).length },
      { label: '31-60 days', minDays: 31, maxDays: 60, total: entries.reduce((s, e) => s + e.age31to60, 0), count: entries.filter(e => e.age31to60 > 0).length },
      { label: '61-90 days', minDays: 61, maxDays: 90, total: entries.reduce((s, e) => s + e.age61to90, 0), count: entries.filter(e => e.age61to90 > 0).length },
      { label: '90+ days', minDays: 91, maxDays: Infinity, total: entries.reduce((s, e) => s + e.age90plus, 0), count: entries.filter(e => e.age90plus > 0).length }
    ]

    return { asOfDate: dateStr, totalOutstanding, entries, buckets }
  },

  async getSalesByCustomer(from?: string, to?: string): Promise<SalesByCustomerReport> {
    const dateFrom = from ? dateStartOfDay(from) : new Date(new Date().getFullYear(), 0, 1)
    const dateTo = to ? dateEndOfDay(to) : new Date()

    const invoices = await prisma.invoice.findMany({
      where: {
        issuedAt: { gte: dateFrom, lte: dateTo },
        status: { notIn: ['CANCELLED', 'DRAFT'] }
      },
      include: { customer: true },
      orderBy: { customer: { name: 'asc' } }
    })

    const customerMap = new Map<string, SalesByCustomerEntry>()
    for (const inv of invoices) {
      if (!customerMap.has(inv.customerId)) {
        customerMap.set(inv.customerId, {
          customerId: inv.customerId,
          customerName: inv.customer?.name || 'Unknown',
          invoiceCount: 0,
          quantityDelivered: 0,
          revenue: 0,
          vatAmount: 0,
          totalAmount: 0
        })
      }
      const entry = customerMap.get(inv.customerId)!
      entry.invoiceCount++
      entry.quantityDelivered += Number(inv.quantityDelivered)
      entry.revenue += Number(inv.subtotal) - (Number(inv.packingBagsSubtotal) || 0)
      entry.vatAmount += Number(inv.vatAmount)
      entry.totalAmount += Number(inv.totalAmount)
    }

    const customers = Array.from(customerMap.values())
    const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0)
    const totalVat = customers.reduce((s, c) => s + c.vatAmount, 0)
    const totalAmount = customers.reduce((s, c) => s + c.totalAmount, 0)
    const totalInvoices = customers.reduce((s, c) => s + c.invoiceCount, 0)

    return {
      from: from || dateFrom.toISOString().split('T')[0],
      to: to || dateTo.toISOString().split('T')[0],
      totalRevenue, totalVat, totalAmount, totalInvoices, customers
    }
  },

  async getSalesByProduct(from?: string, to?: string): Promise<SalesByProductReport> {
    const dateFrom = from ? dateStartOfDay(from) : new Date(new Date().getFullYear(), 0, 1)
    const dateTo = to ? dateEndOfDay(to) : new Date()

    const invoices = await prisma.invoice.findMany({
      where: {
        issuedAt: { gte: dateFrom, lte: dateTo },
        status: { notIn: ['CANCELLED', 'DRAFT'] }
      },
      include: {
        salesOrder: {
          select: { specsJson: true }
        }
      }
    })

    const productMap = new Map<string, { count: number; qty: number; revenue: number }>()
    for (const inv of invoices) {
      const specs = typeof inv.salesOrder?.specsJson === 'string' ? JSON.parse(inv.salesOrder.specsJson) : inv.salesOrder?.specsJson
      const raw = (specs as any)
      const material = (raw?.materialType || raw?.material || 'Unspecified') as string
      const existing = productMap.get(material) || { count: 0, qty: 0, revenue: 0 }
      existing.count++
      existing.qty += Number(inv.quantityDelivered)
      existing.revenue += Number(inv.subtotal)
      productMap.set(material, existing)
    }

    const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0)
    const totalQuantity = Array.from(productMap.values()).reduce((s, p) => s + p.qty, 0)

    const products: SalesByProductEntry[] = Array.from(productMap.entries())
      .map(([product, data]) => ({
        product,
        invoiceCount: data.count,
        quantityDelivered: data.qty,
        revenue: data.revenue,
        percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 10000) / 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)

    return {
      from: from || dateFrom.toISOString().split('T')[0],
      to: to || dateTo.toISOString().split('T')[0],
      totalRevenue, totalQuantity, products
    }
  },

  async getInventoryMovements(from?: string, to?: string): Promise<InventoryMovementReport> {
    const dateFrom = from ? dateStartOfDay(from) : new Date(new Date().getFullYear(), 0, 1)
    const dateTo = to ? dateEndOfDay(to) : new Date()

    const movements = await prisma.stockMovement.findMany({
      where: {
        createdAt: { gte: dateFrom, lte: dateTo }
      },
      include: { material: true },
      orderBy: { createdAt: 'desc' }
    })

    const byTypeMap = new Map<string, { totalQuantity: number; count: number }>()
    const byMaterialMap = new Map<string, MovementByMaterial>()

    for (const mov of movements) {
      const type = mov.type
      const existingType = byTypeMap.get(type) || { totalQuantity: 0, count: 0 }
      existingType.totalQuantity += Number(mov.quantity)
      existingType.count++
      byTypeMap.set(type, existingType)

      if (mov.materialId) {
        const existingMat = byMaterialMap.get(mov.materialId) || {
          materialId: mov.materialId,
          materialName: mov.material?.name || 'Unknown',
          category: mov.material?.category || 'Unknown',
          inQuantity: 0,
          outQuantity: 0,
          netChange: 0
        }
        const qty = Number(mov.quantity)
        if (type === 'IN' || type === 'INITIAL') {
          existingMat.inQuantity += qty
          existingMat.netChange += qty
        } else {
          existingMat.outQuantity += qty
          existingMat.netChange -= qty
        }
        byMaterialMap.set(mov.materialId, existingMat)
      }
    }

    const adjustmentTotal = byTypeMap.get('ADJUSTMENT')?.totalQuantity || 0

    const totalIn = Array.from(byTypeMap.entries())
      .filter(([t]) => t === 'IN' || t === 'INITIAL')
      .reduce((s, [, d]) => s + d.totalQuantity, 0) + Math.max(0, adjustmentTotal)

    const totalOut = Array.from(byTypeMap.entries())
      .filter(([t]) => t === 'OUT')
      .reduce((s, [, d]) => s + d.totalQuantity, 0) + Math.abs(Math.min(0, adjustmentTotal))

    const byType: MovementByType[] = Array.from(byTypeMap.entries())
      .map(([type, data]) => ({ type, ...data }))

    const byMaterial = Array.from(byMaterialMap.values())

    return {
      from: from || dateFrom.toISOString().split('T')[0],
      to: to || dateTo.toISOString().split('T')[0],
      totalIn, totalOut, netChange: totalIn - totalOut, byType, byMaterial
    }
  },

  async getProfitRange(from?: string, to?: string) {
    const dateFrom = from ? dateStartOfDay(from) : new Date(new Date().getFullYear(), 0, 1)
    const dateTo = to ? dateEndOfDay(to) : new Date()

    const revenue = await financeRepository.getRevenueByPeriod(dateFrom, dateTo)
    const expenses = await financeRepository.getExpensesByPeriod(dateFrom, dateTo)
    const cogs = await financeRepository.getCogsByPeriod(dateFrom, dateTo)

    const totalRevenue = revenue.sales + revenue.packing + revenue.otherIncome
    const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0)

    return {
      from: from || dateFrom.toISOString().split('T')[0],
      to: to || dateTo.toISOString().split('T')[0],
      revenue: totalRevenue,
      breakdown: {
        salesRevenue: revenue.sales,
        packingRevenue: revenue.packing,
        otherIncome: revenue.otherIncome
      },
      costOfGoodsSold: cogs,
      grossProfit: totalRevenue - cogs,
      expenses: totalExpenses,
      expenseBreakdown: expenses,
      netProfit: totalRevenue - cogs - totalExpenses
    }
  }
}
