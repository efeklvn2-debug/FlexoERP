import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotification } from '../contexts/NotificationContext'
import { Layout } from '../components/Layout'
import { financeApi, FinanceDashboard } from '../api/finance'
import { salesOrderApi, SalesOrder, ORDER_STATUS_LABELS } from '../api/salesOrders'
import { productionApi, ProductionJob } from '../api/production'
import { inventoryApi, MaterialWithStock } from '../api/inventory'


function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

const statusColors: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  IN_PRODUCTION: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-slate-100 text-slate-800',
  READY: 'bg-purple-100 text-purple-800',
  PICKED_UP: 'bg-teal-100 text-teal-800',
  CANCELLED: 'bg-red-100 text-red-800',
  MRP_PENDING: 'bg-orange-100 text-orange-800'
}

type DashboardPeriod = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'last-3-months'

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' },
  { value: 'last-week', label: 'Last Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-3-months', label: 'Last 3 Months' },
]

function periodToMonth(p: DashboardPeriod): string | undefined {
  const now = new Date()
  switch (p) {
    case 'last-month': {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    case 'last-3-months':
      return undefined
    default:
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
}

function periodDateRange(p: DashboardPeriod): { from: string; to: string } {
  const now = new Date()
  const y = (d: Date) => d.toISOString().split('T')[0]
  const startOfWeek = (d: Date) => {
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const m = new Date(d)
    m.setDate(diff)
    return m
  }
  switch (p) {
    case 'today':
      return { from: y(now), to: y(now) }
    case 'yesterday': {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return { from: y(d), to: y(d) }
    }
    case 'this-week': {
      const mon = startOfWeek(now)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { from: y(mon), to: y(sun) }
    }
    case 'last-week': {
      const mon = startOfWeek(now)
      mon.setDate(mon.getDate() - 7)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { from: y(mon), to: y(sun) }
    }
    case 'this-month':
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: y(now) }
    case 'last-month': {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return { from: first, to: y(last) }
    }
    case 'last-3-months': {
      const d = new Date()
      d.setMonth(d.getMonth() - 3)
      return { from: y(d), to: y(now) }
    }
  }
}

function periodLabel(p: DashboardPeriod): string {
  return PERIOD_OPTIONS.find(o => o.value === p)?.label || 'This Month'
}

function DashboardPage() {
  const navigate = useNavigate()
  const notify = useNotification()
  const userJson = localStorage.getItem('user')
  const currentUser = userJson ? JSON.parse(userJson) : null
  const canViewFinance = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER'

  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<DashboardPeriod>('today')

  const [dashboard, setDashboard] = useState<FinanceDashboard | null>(null)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [jobs, setJobs] = useState<ProductionJob[]>([])
  const [materials, setMaterials] = useState<MaterialWithStock[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])

  const loadDashboard = async (p: DashboardPeriod) => {
    setLoading(true)
    const month = periodToMonth(p)
    try {
      const [dashRes, ordersRes, jobsRes, matRes, custRes] = await Promise.all([
        financeApi.getDashboard(month),
        salesOrderApi.getOrders(),
        productionApi.getJobs(),
        inventoryApi.getMaterials(),
        salesOrderApi.getCustomers()
      ])
      if ((dashRes.data as any)?.data) setDashboard((dashRes.data as any).data)
      if (ordersRes.data) setOrders((ordersRes.data as any)?.data || [])
      else notify.error('Failed to load orders')
      if (jobsRes.data) setJobs((jobsRes.data as any)?.data || [])
      else notify.error('Failed to load production jobs')
      if (matRes.data) setMaterials((matRes.data as any)?.data || [])
      else notify.error('Failed to load materials')
      if (custRes.data) setCustomers((custRes.data as any)?.data || [])
      else notify.error('Failed to load customers')
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load dashboard')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadDashboard(period)
  }, [])

  const handlePeriodChange = (p: DashboardPeriod) => {
    setPeriod(p)
    loadDashboard(p)
  }

  const pendingOrders = orders.filter(o => o.status === 'PENDING')
  const pendingPickups = orders.filter(o => o.status === 'READY')
  const activeJobs = jobs.filter(j => j.status !== 'COMPLETED' && j.status !== 'CANCELLED')
  const materialsInStock = materials.filter(m => m.totalStock > 0)
  const lowStockItems = materials.filter(m => m.minStock > 0 && m.totalStock < m.minStock)
  const recentOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)

  const range = periodDateRange(period)
  const periodJobs = jobs.filter(j => {
    if (!j.createdAt) return false
    const d = j.createdAt.split('T')[0]
    return d >= range.from && d <= range.to
  })
  const periodOutput = periodJobs.reduce((sum, j) => {
    const rolls = (j as any).printedRolls || []
    return sum + rolls.reduce((s: number, r: any) => s + Number(r.weightUsed || 0), 0)
  }, 0)

  const periodOrders = orders.filter(o => {
    if (!o.createdAt) return false
    const d = o.createdAt.split('T')[0]
    return d >= range.from && d <= range.to
  })
  const allInvoices = orders.flatMap(o => o.invoices || [])
  const invDate = (inv: any) => (inv.issuedAt || inv.createdAt || '').split('T')[0]
  const periodInvoices = allInvoices.filter(inv => {
    const d = invDate(inv)
    return d >= range.from && d <= range.to
  })
  const invoicedRolls = periodInvoices.reduce((s, inv) => s + Number(inv.quantityDelivered || 0), 0)
  const invoicedBags = periodInvoices.reduce((s, inv) => s + Number(inv.packingBagsQuantity || 0), 0)
  const uninvoicedOrders = periodOrders.filter(o => !o.invoices || o.invoices.length === 0)
  const uninvoicedBags = uninvoicedOrders.reduce((s, o) => s + Number(o.packingBagsQuantity || 0), 0)
  const rollsSold = invoicedRolls
  const bagsSold = invoicedBags + uninvoicedBags

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">Overview of your operations</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={period} onChange={e => handlePeriodChange(e.target.value as DashboardPeriod)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              {PERIOD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button onClick={() => loadDashboard(period)} disabled={loading} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors">
              {loading ? 'Loading...' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
                  <div className="h-8 bg-slate-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-1/3" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
                  <div className="h-8 bg-slate-200 rounded w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/sales-orders')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Pending Pickups</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{pendingPickups.length}</p>
                    {pendingPickups.length > 0 && (
                      <p className="text-sm font-medium text-amber-600 mt-2">
                        {pendingPickups.reduce((s, o) => s + Number(o.quantityOrdered || 0), 0).toLocaleString()} kg to pick up
                      </p>
                    )}
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/sales-orders')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Items Sold ({periodLabel(period)})</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{rollsSold.toLocaleString()} kg</p>
                    <p className="text-sm text-slate-500 mt-1">+ {bagsSold.toLocaleString()} Packs</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/sales-orders')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">New Orders ({periodLabel(period)})</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{periodOrders.length}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {periodOrders.filter(o => o.status === 'PENDING').length} pending
                      {periodOrders.filter(o => o.status === 'APPROVED').length > 0 && ` · ${periodOrders.filter(o => o.status === 'APPROVED').length} approved`}
                    </p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-lg">
                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/inventory')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Low Stock Items</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{lowStockItems.length}</p>
                    {lowStockItems.length > 0 && (
                      <p className="text-sm font-medium text-red-600 mt-2">
                        {lowStockItems.filter(m => m.totalStock <= 0).length} critical
                      </p>
                    )}
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/customers')}>
                <p className="text-sm font-medium text-slate-500">Active Customers</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{customers.length}</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/production')}>
                <p className="text-sm font-medium text-slate-500">Active Jobs</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{activeJobs.length}</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/inventory')}>
                <p className="text-sm font-medium text-slate-500">Materials in Stock</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{materialsInStock.length}</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/sales-orders')}>
                <p className="text-sm font-medium text-slate-500">Pending Orders</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{pendingOrders.length}</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/production')}>
                <p className="text-sm font-medium text-slate-500">{periodLabel(period)} Output</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{periodOutput.toFixed(1)} kg</p>
              </div>
              {canViewFinance ? (
                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/finance')}>
                  <p className="text-sm font-medium text-slate-500">Net Profit</p>
                  <p className={`text-xl font-bold mt-1 ${(dashboard?.profitSnapshot?.netProfit ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {dashboard?.profitSnapshot?.netProfit != null ? formatCurrency(dashboard.profitSnapshot.netProfit) : '—'}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 opacity-60">
                  <p className="text-sm font-medium text-slate-500">Net Profit</p>
                  <p className="text-xl font-bold text-slate-400 mt-1">—</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
                  <button onClick={() => navigate('/sales-orders')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">View All</button>
                </div>
                {recentOrders.length === 0 ? (
                  <div className="px-6 py-8 text-center text-slate-500 text-sm">No orders yet</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recentOrders.map((order) => {
                      const isOverdue = order.expectedDeliveryDate && !['COMPLETED', 'PICKED_UP', 'CANCELLED'].includes(order.status) && new Date(order.expectedDeliveryDate) < new Date()
                      return (
                        <div key={order.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer" onClick={() => navigate('/sales-orders')}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900 truncate">{order.orderNumber}</p>
                              {order.expectedDeliveryDate && (
                                <span className={`text-xs font-medium shrink-0 ${isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                                  Due {new Date(order.expectedDeliveryDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 truncate">{order.customer?.name || 'Unknown'}</p>
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <p className="font-medium text-slate-900">{formatCurrency(order.totalAmount)}</p>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[order.status] || 'bg-slate-100 text-slate-800'}`}>
                              {ORDER_STATUS_LABELS[order.status] || order.status}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Inventory Alerts</h2>
                  <button onClick={() => navigate('/inventory')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">View All</button>
                </div>
                {lowStockItems.length === 0 ? (
                  <div className="px-6 py-8 text-center text-slate-500 text-sm">All items above minimum stock</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {lowStockItems.slice(0, 8).map((item) => {
                      const ratio = item.minStock > 0 ? item.totalStock / item.minStock : 1
                      const isCritical = item.totalStock <= 0 || ratio <= 0.5
                      const isWarning = ratio <= 1
                      return (
                        <div key={item.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer" onClick={() => navigate('/inventory')}>
                          <div>
                            <p className="font-medium text-slate-900">{item.name}</p>
                            <p className="text-sm text-slate-500">{item.code} — {item.totalStock} / {item.minStock} min</p>
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isCritical ? 'bg-red-100 text-red-800' : isWarning ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                            {isCritical ? 'Critical' : isWarning ? 'Low' : 'OK'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

export { DashboardPage }