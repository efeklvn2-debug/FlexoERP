import { useState, useEffect, useCallback, useMemo, useRef, Fragment, createContext, useContext } from 'react'
import { Layout } from '../components/Layout'
import { useNotification } from '../contexts/NotificationContext'
import { financeApi, type TrialBalance, type AccountBalance } from '../api/finance'
import { reportsApi, type AgingReport, type SalesByCustomerReport, type SalesByProductReport, type InventoryMovementReport, type ProfitRangeReport } from '../api/reports'
import { productionApi, type ProductionJob } from '../api/production'
import { inventoryApi, type MaterialWithStock } from '../api/inventory'
import { procurementApi, type PurchaseOrder } from '../api/procurement'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Area, Line } from 'recharts'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatKg(n: number): string {
  return new Intl.NumberFormat('en-NG', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + ' kg'
}

type ReportPeriod = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'last-3-months' | 'this-year' | 'custom'

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' },
  { value: 'last-week', label: 'Last Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-3-months', label: 'Last 3 Months' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
]

function periodDateRange(p: ReportPeriod): { from: string; to: string } {
  const now = new Date()
  const y = (d: Date) => d.toISOString().split('T')[0]
  const startOfWeek = (d: Date) => {
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const m = new Date(d); m.setDate(diff); return m
  }
  switch (p) {
    case 'today': return { from: y(now), to: y(now) }
    case 'yesterday': { const d = new Date(); d.setDate(d.getDate() - 1); return { from: y(d), to: y(d) } }
    case 'this-week': { const mon = startOfWeek(now); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { from: y(mon), to: y(sun) } }
    case 'last-week': { const mon = startOfWeek(now); mon.setDate(mon.getDate() - 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { from: y(mon), to: y(sun) } }
    case 'this-month': return { from: y(new Date(now.getFullYear(), now.getMonth(), 1)), to: y(now) }
    case 'last-month': { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { from: y(d), to: y(e) } }
    case 'last-3-months': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return { from: y(d), to: y(now) } }
    case 'this-year': return { from: y(new Date(now.getFullYear(), 0, 1)), to: y(now) }
    default: return { from: y(new Date(now.getFullYear(), now.getMonth(), 1)), to: y(now) }
  }
}

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function handlePrint() {
  window.print()
}

const ExportContext = createContext<((item: { exec: (() => void) } | null) => void) | null>(null)

const PIECE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

interface ReportDef {
  id: string
  name: string
}

interface ReportCategory {
  name: string
  reports: ReportDef[]
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    name: 'Financial',
    reports: [
      { id: 'profit-loss', name: 'Profit & Loss' },
      { id: 'trial-balance', name: 'Trial Balance' },
      { id: 'ar-aging', name: 'A/R Aging' },
      { id: 'ap-aging', name: 'A/P Aging' },
    ],
  },
  {
    name: 'Sales',
    reports: [
      { id: 'sales-by-customer', name: 'Sales by Customer' },
      { id: 'sales-by-product', name: 'Sales by Product' },
    ],
  },
  {
    name: 'Production',
    reports: [
      { id: 'production-output', name: 'Production Output' },
      { id: 'waste-analysis', name: 'Waste Analysis' },
    ],
  },
  {
    name: 'Inventory',
    reports: [
      { id: 'stock-valuation', name: 'Stock Valuation' },
      { id: 'inventory-movements', name: 'Inventory Movements' },
      { id: 'low-stock', name: 'Low Stock Report' },
    ],
  },
  {
    name: 'Procurement',
    reports: [
      { id: 'po-summary', name: 'PO Summary' },
    ],
  },
]

function Card({ title, value, subtitle, color }: { title: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-sm text-slate-500 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${color || 'text-slate-900'}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}

export function ReportsPage() {
  const notify = useNotification()
  const [activeReport, setActiveReport] = useState('profit-loss')
  const [period, setPeriod] = useState<ReportPeriod>('this-month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Financial: false, Sales: false, Production: false, Inventory: false, Procurement: false,
  })
  const printRef = useRef<HTMLDivElement>(null)

  const dateRange = period === 'custom' ? { from: customFrom, to: customTo } : periodDateRange(period)
  const { from, to } = dateRange

  // Data states
  const [profitData, setProfitData] = useState<ProfitRangeReport | null>(null)
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null)
  const [arAging, setArAging] = useState<AgingReport | null>(null)
  const [apAging, setApAging] = useState<AgingReport | null>(null)
  const [salesByCust, setSalesByCust] = useState<SalesByCustomerReport | null>(null)
  const [salesByProd, setSalesByProd] = useState<SalesByProductReport | null>(null)
  const [allJobs, setAllJobs] = useState<ProductionJob[]>([])
  const [materials, setMaterials] = useState<MaterialWithStock[]>([])
  const [invMovements, setInvMovements] = useState<InventoryMovementReport | null>(null)
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [exportItem, setExportItem] = useState<{ exec: () => void } | null>(null)

  function unwrap<T>(res: { data?: any }): T | null {
    if (!res.data) return null
    return (res.data.data ?? res.data) as T
  }

  const fetchReport = useCallback(async () => {
    if (period === 'custom' && customFrom && customTo && customFrom > customTo) {
      notify.error('Start date must be before or equal to end date')
      return
    }
    setLoading(true)
    try {
      switch (activeReport) {
        case 'profit-loss': {
          const d = unwrap<ProfitRangeReport>(await reportsApi.getProfitRange(from, to))
          if (d) setProfitData(d)
          break
        }
        case 'trial-balance': {
          const d = unwrap<TrialBalance>(await financeApi.getTrialBalance(to))
          if (d) setTrialBalance(d)
          break
        }
        case 'ar-aging': {
          const d = unwrap<AgingReport>(await reportsApi.getAgingReceivables(to))
          if (d) setArAging(d)
          break
        }
        case 'ap-aging': {
          const d = unwrap<AgingReport>(await reportsApi.getAgingPayables(to))
          if (d) setApAging(d)
          break
        }
        case 'sales-by-customer': {
          const d = unwrap<SalesByCustomerReport>(await reportsApi.getSalesByCustomer(from, to))
          if (d) setSalesByCust(d)
          break
        }
        case 'sales-by-product': {
          const d = unwrap<SalesByProductReport>(await reportsApi.getSalesByProduct(from, to))
          if (d) setSalesByProd(d)
          break
        }
        case 'production-output':
        case 'waste-analysis': {
          const d = unwrap<ProductionJob[]>(await productionApi.getJobs())
          if (d) setAllJobs(d)
          break
        }
        case 'stock-valuation':
        case 'low-stock': {
          const d = unwrap<MaterialWithStock[]>(await inventoryApi.getMaterials())
          if (d) setMaterials(d)
          break
        }
        case 'inventory-movements': {
          const d = unwrap<InventoryMovementReport>(await reportsApi.getInventoryMovements(from, to))
          if (d) setInvMovements(d)
          break
        }
        case 'po-summary': {
          const d = unwrap<PurchaseOrder[]>(await procurementApi.getPOs())
          if (d) setPurchaseOrders(d)
          break
        }
      }
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [activeReport, from, to, notify])

  useEffect(() => { fetchReport() }, [fetchReport])

  const toggleCategory = (name: string) => {
    setCollapsed(prev => ({ ...prev, [name]: !prev[name] }))
  }

  // Derived data for production reports
  const jobsInRange = useMemo(() => allJobs.filter(j => {
    const d = (j.endDate || j.createdAt).substring(0, 10)
    return d >= from && d <= to
  }), [allJobs, from, to])
  const totalOutput = useMemo(() => jobsInRange.reduce((s, j) => {
    const rollWeight = (j.printedRolls || []).reduce((r, p) => r + Number(p.weightUsed || 0), 0)
    return s + rollWeight
  }, 0), [jobsInRange])
  function sumWaste(j: ProductionJob): number {
    const direct = Number(j.wasteWeight || 0)
    const fromRollWaste = j.rollWaste
      ? Object.values(j.rollWaste).reduce((s, v) => s + Number(v || 0), 0)
      : 0
    return direct + fromRollWaste
  }
  const totalWaste = useMemo(() => jobsInRange.reduce((s, j) => s + sumWaste(j), 0), [jobsInRange])
  function formatShort(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })
  }
  const outputChartData = useMemo(() => {
    const outputByDay: Record<string, number> = {}
    jobsInRange.forEach(j => {
      const d = (j.endDate || j.createdAt).substring(0, 10)
      outputByDay[d] = (outputByDay[d] || 0) + (j.printedRolls || []).reduce((r, p) => r + Number(p.weightUsed || 0), 0)
    })
    return Object.entries(outputByDay).sort().map(([dateStr, kg]) => ({ period: formatShort(dateStr), kg: Math.round(kg * 10) / 10 }))
  }, [jobsInRange])
  const wasteChartData = useMemo(() => {
    const wasteByDay: Record<string, number> = {}
    jobsInRange.forEach(j => {
      const d = (j.endDate || j.createdAt).substring(0, 10)
      wasteByDay[d] = (wasteByDay[d] || 0) + sumWaste(j)
    })
    return Object.entries(wasteByDay).sort().map(([dateStr, kg]) => ({ period: formatShort(dateStr), kg: Math.round(kg * 10) / 10 }))
  }, [jobsInRange])

  // Waste data
  const wasteByJob = useMemo(() => jobsInRange.filter(j => sumWaste(j) > 0).map(j => ({
    job: j.jobNumber,
    waste: sumWaste(j),
  })).sort((a, b) => b.waste - a.waste), [jobsInRange])

  // Stock valuation
  const stockValue = useMemo(() => materials.reduce((s, m) => s + (m.totalStock || 0) * (m.costPrice || 0), 0), [materials])
  const stockPieData = useMemo(() => {
    const stockByCategory = materials.reduce<Record<string, number>>((acc, m) => {
      const cat = m.category || 'Other'
      acc[cat] = (acc[cat] || 0) + (m.totalStock || 0) * (m.costPrice || 0)
      return acc
    }, {})
    return Object.entries(stockByCategory).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value: Math.round(value) }))
  }, [materials])

  // Low stock
  const lowStockItems = useMemo(() => materials.filter(m => m.minStock > 0 && m.totalStock < m.minStock).sort((a, b) => (a.totalStock / a.minStock) - (b.totalStock / b.minStock)), [materials])

  // PO summary
  const poInRange = useMemo(() => purchaseOrders.filter(po => {
    const d = (po.issuedDate || po.createdAt || '').substring(0, 10)
    return d >= from && d <= to
  }), [purchaseOrders, from, to])
  const poTotalAmount = useMemo(() => poInRange.reduce((s, p) => s + Number(p.totalAmount || 0), 0), [poInRange])
  const poByStatus = useMemo(() => {
    const byStatus: Record<string, number> = {}
    poInRange.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1 })
    return byStatus
  }, [poInRange])
  const poBySupplierQty = useMemo(() => {
    const map: Record<string, number> = {}
    poInRange.forEach(po => {
      const qty = (po.items || []).reduce((s, item) => s + Number(item.totalWeight || 0), 0)
      map[po.supplier] = (map[po.supplier] || 0) + qty
    })
    return Object.entries(map).map(([supplier, qty]) => ({ supplier, qty: Math.round(qty * 100) / 100 })).sort((a, b) => b.qty - a.qty)
  }, [poInRange])
  const poBySupplierAmount = useMemo(() => {
    const map: Record<string, number> = {}
    poInRange.forEach(po => { map[po.supplier] = (map[po.supplier] || 0) + Number(po.totalAmount || 0) })
    return Object.entries(map).map(([supplier, amount]) => ({ supplier, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount)
  }, [poInRange])

  return (
    <Layout>
      <div className="flex gap-6" ref={printRef}>
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 print:hidden">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-24">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Reports</h2>
            {REPORT_CATEGORIES.map(cat => (
              <div key={cat.name} className="mb-2">
                <button
                  onClick={() => toggleCategory(cat.name)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-50"
                >
                  {cat.name}
                  <svg className={`w-4 h-4 transition-transform ${collapsed[cat.name] ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {!collapsed[cat.name] && (
                  <div className="ml-2 space-y-0.5 mt-0.5">
                    {cat.reports.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setActiveReport(r.id)}
                        className={`block w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          activeReport === r.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 print:hidden">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  {REPORT_CATEGORIES.flatMap(c => c.reports).find(r => r.id === activeReport)?.name || 'Report'}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {formatDate(from)} – {formatDate(to)}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={period}
                  onChange={e => setPeriod(e.target.value as ReportPeriod)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PERIOD_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {period === 'custom' && (
                  <>
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <span className="text-slate-400">–</span>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </>
                )}
                <button
                  onClick={fetchReport}
                  disabled={loading}
                  className="px-4 py-2 border border-blue-600 text-blue-700 bg-white text-sm font-medium rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Loading...' : 'Run Report'}
                </button>

                <button
                  onClick={() => exportItem?.exec()}
                  disabled={!exportItem}
                  className="px-3 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  title="Export CSV"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV
                </button>

                <button
                  onClick={handlePrint}
                  className="px-3 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50 transition-colors"
                  title="Print"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
              </div>
            </div>
          </div>

          {/* Report Content */}
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-slate-500">Loading report...</p>
            </div>
          ) : (
            <ExportContext.Provider value={setExportItem}>
              {activeReport === 'profit-loss' && <ProfitLossReport data={profitData} from={from} to={to} />}
              {activeReport === 'trial-balance' && <TrialBalanceReport data={trialBalance} asOfDate={to} />}
              {activeReport === 'ar-aging' && <AgingReportView data={arAging} title="Accounts Receivable Aging" />}
              {activeReport === 'ap-aging' && <AgingReportView data={apAging} title="Accounts Payable Aging" />}
              {activeReport === 'sales-by-customer' && <SalesByCustomerView data={salesByCust} />}
              {activeReport === 'sales-by-product' && <SalesByProductView data={salesByProd} />}
              {activeReport === 'production-output' && <ProductionOutputView jobs={jobsInRange} totalOutput={totalOutput} chartData={outputChartData} allJobs={allJobs} from={from} to={to} />}
              {activeReport === 'waste-analysis' && <WasteAnalysisView jobs={jobsInRange} totalWaste={totalWaste} wasteByJob={wasteByJob} totalOutput={totalOutput} wasteChartData={wasteChartData} from={from} to={to} />}
              {activeReport === 'stock-valuation' && <StockValuationView materials={materials} stockValue={stockValue} pieData={stockPieData} />}
              {activeReport === 'inventory-movements' && <InventoryMovementsView data={invMovements} />}
              {activeReport === 'low-stock' && <LowStockView items={lowStockItems} />}
              {activeReport === 'po-summary' && <POSummaryView orders={poInRange} totalAmount={poTotalAmount} byStatus={poByStatus} supplierQty={poBySupplierQty} supplierAmount={poBySupplierAmount} />}

              <div className="text-xs text-slate-400 mt-4 text-right print:block">
                Generated: {new Date().toLocaleString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </ExportContext.Provider>
          )}
        </div>
      </div>
    </Layout>
  )
}

// ─── Profit & Loss ─────────────────────────────────
function ProfitLossReport({ data: rawData, from, to }: { data: ProfitRangeReport | null; from: string; to: string }) {
  if (!rawData) return <EmptyReport />
  const data = rawData
  const chartData = [
    { name: 'Revenue', amount: data.breakdown.salesRevenue + data.breakdown.packingRevenue + data.breakdown.otherIncome },
    { name: 'COGS', amount: data.costOfGoodsSold },
    { name: 'Expenses', amount: data.expenses },
    { name: 'Net Profit', amount: data.netProfit },
  ]

  const doExport = useCallback(() => {
    exportCSV(`profit_loss_${from}_${to}.csv`,
      ['Category', 'Amount'],
      [
        ['Sales Revenue', String(data.breakdown.salesRevenue)],
        ['Packing Revenue', String(data.breakdown.packingRevenue)],
        ['Other Income', String(data.breakdown.otherIncome)],
        ['Total Revenue', String(data.revenue)],
        ['Cost of Goods Sold', String(data.costOfGoodsSold)],
        ['Gross Profit', String(data.revenue - data.costOfGoodsSold)],
        ['Expenses', String(data.expenses)],
        ['Net Profit', String(data.netProfit)],
      ]
    )
  }, [data, from, to])

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card title="Total Revenue" value={formatCurrency(data.revenue)} color="text-green-600" />
        <Card title="Cost of Goods Sold" value={formatCurrency(data.costOfGoodsSold)} color="text-red-600" />
        <Card title="Gross Profit" value={formatCurrency(data.revenue - data.costOfGoodsSold)} color={data.revenue - data.costOfGoodsSold >= 0 ? 'text-blue-600' : 'text-red-600'} />
        <Card title="Net Profit" value={formatCurrency(data.netProfit)} color={data.netProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Revenue Breakdown</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 font-medium">Category</th>
                <th className="text-right py-2 font-medium">Amount</th>
                <th className="text-right py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Sales Revenue', amount: data.breakdown.salesRevenue },
                { label: 'Packing Revenue', amount: data.breakdown.packingRevenue },
                { label: 'Other Income', amount: data.breakdown.otherIncome },
              ].map(item => (
                <tr key={item.label} className="border-b border-slate-100">
                  <td className="py-2">{item.label}</td>
                  <td className="text-right py-2 font-medium">{formatCurrency(item.amount)}</td>
                  <td className="text-right py-2 text-slate-500">{data.revenue > 0 ? Math.round(item.amount / data.revenue * 100) : 0}%</td>
                </tr>
              ))}
              <tr className="font-semibold bg-slate-100">
                <td className="py-2">Total Revenue</td>
                <td className="text-right py-2">{formatCurrency(data.revenue)}</td>
                <td className="text-right py-2">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Expense Breakdown</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 font-medium">Category</th>
                <th className="text-right py-2 font-medium">Amount</th>
                <th className="text-right py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.expenseBreakdown || {}).filter(([, v]) => v > 0).map(([key, amount]) => (
                <tr key={key} className="border-b border-slate-100">
                  <td className="py-2">{key.replace(/([A-Z])/g, ' $1').trim()}</td>
                  <td className="text-right py-2 font-medium">{formatCurrency(amount)}</td>
                  <td className="text-right py-2 text-slate-500">{data.revenue > 0 ? Math.round(amount / data.revenue * 100) : 0}%</td>
                </tr>
              ))}
              <tr className="font-semibold bg-slate-100">
                <td className="py-2">Total Expenses</td>
                <td className="text-right py-2">{formatCurrency(data.expenses)}</td>
                <td className="text-right py-2">{data.revenue > 0 ? Math.round(data.expenses / data.revenue * 100) : 0}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">Revenue vs COGS vs Expenses</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
            <Tooltip formatter={(value: any) => formatCurrency(value)} />
            <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 bg-slate-50 rounded-lg p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 border-b border-slate-200">
              <th className="text-left py-2 font-medium">Line Item</th>
              <th className="text-right py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100"><td className="py-2 font-medium text-slate-700">Sales Revenue</td><td className="text-right py-2">{formatCurrency(data.breakdown.salesRevenue)}</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 font-medium text-slate-700">Packing Revenue</td><td className="text-right py-2">{formatCurrency(data.breakdown.packingRevenue)}</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 font-medium text-slate-700">Other Income</td><td className="text-right py-2">{formatCurrency(data.breakdown.otherIncome)}</td></tr>
            <tr className="border-b border-slate-100 bg-white"><td className="py-2 font-semibold">Total Revenue</td><td className="text-right py-2 font-semibold">{formatCurrency(data.revenue)}</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 font-medium text-red-600">Cost of Goods Sold</td><td className="text-right py-2 text-red-600">({formatCurrency(data.costOfGoodsSold)})</td></tr>
            <tr className="border-b border-slate-100 bg-white"><td className="py-2 font-semibold">Gross Profit</td><td className="text-right py-2 font-semibold">{formatCurrency(data.revenue - data.costOfGoodsSold)}</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 font-medium text-red-600">Expenses</td><td className="text-right py-2 text-red-600">({formatCurrency(data.expenses)})</td></tr>
            <tr className="bg-blue-50"><td className="py-2 font-bold text-lg">Net Profit</td><td className="text-right py-2 font-bold text-lg">{formatCurrency(data.netProfit)}</td></tr>
          </tbody>
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Trial Balance ────────────────────────────────
function TrialBalanceReport({ data: rawData }: { data: TrialBalance | null; asOfDate: string }) {
  if (!rawData) return <EmptyReport />
  const data = rawData
  const grouped = data.accounts.reduce<Record<string, AccountBalance[]>>((acc, a) => {
    const type = a.accountType || 'Other'
    if (!acc[type]) acc[type] = []
    acc[type].push(a)
    return acc
  }, {})
  const typeOrder = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE']

  const doExport = useCallback(() => {
    exportCSV('trial_balance.csv',
      ['Account Code', 'Account Name', 'Type', 'Debit', 'Credit'],
      data.accounts.map(a => [a.accountCode, a.accountName, a.accountType, String(a.totalDebit), String(a.totalCredit)])
    )
  }, [data])

  return (
    <ReportWrapper onExport={doExport}>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card title="Total Debits" value={formatCurrency(data.totals?.totalDebit || 0)} />
        <Card title="Total Credits" value={formatCurrency(data.totals?.totalCredit || 0)} />
        <Card title="Balance" value={formatCurrency(data.totals?.totalBalance || 0)} color={data.totals?.totalBalance === 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Code</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Account</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Debit</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Credit</th>
            </tr>
          </thead>
          <tbody>
            {typeOrder.map(type => {
              const accounts = grouped[type]
              if (!accounts?.length) return null
              const typeLabel = type.charAt(0) + type.slice(1).toLowerCase()
              const typeDebit = accounts.reduce((s, a) => s + a.totalDebit, 0)
              const typeCredit = accounts.reduce((s, a) => s + a.totalCredit, 0)
              return (
                <Fragment key={type}>
                  <tr className="bg-slate-100">
                    <td colSpan={4} className="py-2 px-4 font-semibold text-slate-700">{typeLabel}</td>
                  </tr>
                  {accounts.map(a => (
                    <tr key={a.accountId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-4 text-slate-500">{a.accountCode}</td>
                      <td className="py-2 px-4">{a.accountName}</td>
                      <td className="py-2 px-4 text-right">{a.totalDebit > 0 ? formatCurrency(a.totalDebit) : ''}</td>
                      <td className="py-2 px-4 text-right">{a.totalCredit > 0 ? formatCurrency(a.totalCredit) : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-medium border-b border-slate-200">
                    <td colSpan={2} className="py-2 px-4 text-slate-600">Total {typeLabel}</td>
                    <td className="py-2 px-4 text-right">{formatCurrency(typeDebit)}</td>
                    <td className="py-2 px-4 text-right">{formatCurrency(typeCredit)}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-base">
              <td colSpan={2} className="py-3 px-4">Totals</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.totals?.totalDebit || 0)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.totals?.totalCredit || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── A/R & A/P Aging ──────────────────────────────
function AgingReportView({ data: rawData, title }: { data: AgingReport | null; title: string }) {
  if (!rawData) return <EmptyReport />
  const data = rawData

  const doExport = useCallback(() => {
    exportCSV(`${title.replace(/\s+/g, '_')}.csv`,
      ['Name', 'Current', '31-60 Days', '61-90 Days', '90+ Days', 'Total'],
      data.entries.map(e => [e.name, String(e.current), String(e.age31to60), String(e.age61to90), String(e.age90plus), String(e.total)])
    )
  }, [data, title])

  const chartData = data.buckets.map(b => ({ name: b.label, amount: b.total }))
  const topEntries = [...data.entries].sort((a, b) => b.total - a.total).slice(0, 10)

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total Outstanding" value={formatCurrency(data.totalOutstanding)} color="text-blue-600" />
        {data.buckets.map(b => (
          <Card key={b.label} title={b.label} value={formatCurrency(b.total)} subtitle={`${b.count} ${b.label.includes('Current') ? 'customers' : 'items'}`} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Aging Buckets</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Top 10 {title.includes('Receivable') ? 'Customers' : 'Suppliers'}</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topEntries} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">{title.includes('Receivable') ? 'Customer' : 'Supplier'}</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Current</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">31-60 Days</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">61-90 Days</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">90+ Days</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map(e => (
              <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-4 font-medium">{e.name}</td>
                <td className="py-2 px-4 text-right">{e.current > 0 ? formatCurrency(e.current) : '-'}</td>
                <td className="py-2 px-4 text-right">{e.age31to60 > 0 ? formatCurrency(e.age31to60) : '-'}</td>
                <td className="py-2 px-4 text-right">{e.age61to90 > 0 ? formatCurrency(e.age61to90) : '-'}</td>
                <td className="py-2 px-4 text-right">{e.age90plus > 0 ? formatCurrency(e.age90plus) : '-'}</td>
                <td className="py-2 px-4 text-right font-semibold">{formatCurrency(e.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td className="py-3 px-4">Total</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.buckets[0]?.total || 0)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.buckets[1]?.total || 0)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.buckets[2]?.total || 0)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.buckets[3]?.total || 0)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.totalOutstanding)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Sales by Customer ────────────────────────────
function SalesByCustomerView({ data: rawData }: { data: SalesByCustomerReport | null }) {
  if (!rawData) return <EmptyReport />
  const data = rawData
  const top10 = [...data.customers].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  const doExport = useCallback(() => {
    exportCSV('sales_by_customer.csv',
      ['Customer', 'Invoices', 'Quantity', 'Revenue', 'VAT', 'Total'],
      data.customers.map(c => [c.customerName, String(c.invoiceCount), String(c.quantityDelivered), String(c.revenue), String(c.vatAmount), String(c.totalAmount)])
    )
  }, [data])

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total Revenue" value={formatCurrency(data.totalRevenue)} color="text-green-600" />
        <Card title="Total Invoices" value={String(data.totalInvoices)} />
        <Card title="Active Customers" value={String(data.customers.length)} />
        <Card title="Average per Customer" value={formatCurrency(data.customers.length > 0 ? data.totalRevenue / data.customers.length : 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Top 10 Customers by Revenue</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
              <YAxis type="category" dataKey="customerName" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Revenue vs VAT</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={top10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="customerName" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="vatAmount" name="VAT" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Customer</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Invoices</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Quantity (kg)</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Revenue</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">VAT</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map(c => (
              <tr key={c.customerId} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-4 font-medium">{c.customerName}</td>
                <td className="py-2 px-4 text-right">{c.invoiceCount}</td>
                <td className="py-2 px-4 text-right">{formatNumber(c.quantityDelivered)}</td>
                <td className="py-2 px-4 text-right">{formatCurrency(c.revenue)}</td>
                <td className="py-2 px-4 text-right">{formatCurrency(c.vatAmount)}</td>
                <td className="py-2 px-4 text-right font-semibold">{formatCurrency(c.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td className="py-3 px-4">{data.customers.length} customers</td>
              <td className="py-3 px-4 text-right">{data.totalInvoices}</td>
              <td className="py-3 px-4 text-right">{formatNumber(data.customers.reduce((s, c) => s + c.quantityDelivered, 0))}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.totalRevenue)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.totalVat)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Sales by Product ────────────────────────────
function SalesByProductView({ data: rawData }: { data: SalesByProductReport | null }) {
  if (!rawData) return <EmptyReport />
  const data = rawData

  const doExport = useCallback(() => {
    exportCSV('sales_by_product.csv',
      ['Product', 'Invoices', 'Quantity', 'Revenue', '%'],
      data.products.map(p => [p.product, String(p.invoiceCount), String(p.quantityDelivered), String(p.revenue), String(p.percentage)])
    )
  }, [data])

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total Revenue" value={formatCurrency(data.totalRevenue)} color="text-green-600" />
        <Card title="Total Quantity" value={formatKg(data.totalQuantity)} />
        <Card title="Product Types" value={String(data.products.length)} />
        <Card title="Avg Price/kg" value={formatCurrency(data.totalQuantity > 0 ? data.totalRevenue / data.totalQuantity : 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Revenue by Product</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.products} dataKey="revenue" nameKey="product" cx="50%" cy="50%" outerRadius={100} label={({ product, percent }: any) => `${product} (${(percent * 100).toFixed(0)}%)`}>
                {data.products.map((_, i) => <Cell key={i} fill={PIECE_COLORS[i % PIECE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Product Comparison</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.products} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
              <YAxis type="category" dataKey="product" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Product</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Invoices</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Quantity (kg)</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Revenue</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">%</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map(p => (
              <tr key={p.product} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-4 font-medium">{p.product}</td>
                <td className="py-2 px-4 text-right">{p.invoiceCount}</td>
                <td className="py-2 px-4 text-right">{formatNumber(p.quantityDelivered)}</td>
                <td className="py-2 px-4 text-right">{formatCurrency(p.revenue)}</td>
                <td className="py-2 px-4 text-right">{p.percentage}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td className="py-3 px-4">{data.products.length} products</td>
              <td className="py-3 px-4 text-right">{data.products.reduce((s, p) => s + p.invoiceCount, 0)}</td>
              <td className="py-3 px-4 text-right">{formatNumber(data.totalQuantity)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(data.totalRevenue)}</td>
              <td className="py-3 px-4 text-right">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Production Output ───────────────────────────
function ProductionOutputView({ jobs, totalOutput, chartData, allJobs, from, to }: { jobs: ProductionJob[]; totalOutput: number; chartData: { period: string; kg: number }[]; allJobs: ProductionJob[]; from: string; to: string }) {
  const completedJobs = jobs.filter(j => j.status === 'COMPLETED' || j.status === 'PICKED_UP' || j.status === 'READY')
  const runningJobs = jobs.filter(j => j.status === 'IN_PRODUCTION').length
  const queuedJobs = jobs.filter(j => j.status === 'PENDING' || j.status === 'APPROVED').length
  const activeList: string[] = []
  if (runningJobs > 0) activeList.push(`${runningJobs} Running`)
  if (queuedJobs > 0) activeList.push(`${queuedJobs} Queued`)

  // Previous period variance
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const rangeMs = toMs - fromMs
  const prevFrom = new Date(fromMs - rangeMs).toISOString().split('T')[0]
  const prevTo = new Date(fromMs - 1).toISOString().split('T')[0]
  const prevJobs = allJobs.filter(j => {
    const d = (j.endDate || j.createdAt).substring(0, 10)
    return d >= prevFrom && d <= prevTo
  })
  const prevOutput = prevJobs.reduce((s, j) => s + (j.printedRolls || []).reduce((r, p) => r + Number(p.weightUsed || 0), 0), 0)
  const variance = prevOutput > 0 ? ((totalOutput - prevOutput) / prevOutput) * 100 : null

  // Material type breakdown
  const materialMap: Record<string, number> = {}
  jobs.forEach(j => (j.printedRolls || []).forEach(p => {
    const matName = p.roll?.material?.name || 'Unknown'
    materialMap[matName] = (materialMap[matName] || 0) + Number(p.weightUsed || 0)
  }))
  const materialBreakdown = Object.entries(materialMap).sort(([, a], [, b]) => b - a)

  const doExport = useCallback(() => {
    exportCSV('production_output.csv',
      ['Period', 'Output (kg)'],
      chartData.map(d => [d.period, String(d.kg)])
    )
  }, [chartData])

  return (
    <ReportWrapper onExport={doExport}>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total Output" value={formatKg(totalOutput)} color="text-blue-600" 
          subtitle={variance !== null ? `${variance >= 0 ? '↑' : '↓'}${Math.abs(variance).toFixed(1)}% vs previous period` : undefined} />
        <Card title="Jobs Completed" value={String(completedJobs.length)} subtitle={`of ${jobs.length} total`} />
        <Card title="Avg per Job" value={formatKg(completedJobs.length > 0 ? totalOutput / completedJobs.length : 0)} subtitle="per completed job" />
        <Card title="Active Jobs" value={activeList.length > 0 ? activeList.join(' | ') : '0'} subtitle={`${jobs.length} total in period`} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">Output Trend</h4>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} angle={-60} textAnchor="end" height={80} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatKg(v)} />
              <Tooltip formatter={(value: any) => formatKg(value)} />
              <Area type="monotone" dataKey="kg" stroke="none" fill="url(#outputGradient)" isAnimationActive={false} />
              <Line type="monotone" dataKey="kg" stroke="#2563eb" strokeWidth={2.5} dot={{ fill: '#2563eb', r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-400 text-center py-8">No production data in this period</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Output by Material Type</h4>
          {materialBreakdown.length > 0 ? (
            <div className="space-y-2">
              {materialBreakdown.map(([name, kg]) => {
                const pct = totalOutput > 0 ? (kg / totalOutput) * 100 : 0
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-28 truncate flex-shrink-0" title={name}>{name}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-slate-700 w-24 text-right">{formatKg(kg)}</span>
                    <span className="text-xs text-slate-400 w-12 text-right">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">No material data</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Job #</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Customer</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Status</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Output (kg)</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Waste (kg)</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.slice(0, 50).map(j => {
              const output = (j.printedRolls || []).reduce((s, r) => s + Number(r.weightUsed || 0), 0)
              return (
                <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-medium">{j.jobNumber}</td>
                  <td className="py-2 px-4">{j.customerName || '-'}</td>
                  <td className="py-2 px-4">{j.status}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(output)}</td>
                  <td className="py-2 px-4 text-right">{Number(j.wasteWeight || 0) > 0 ? formatNumber(Number(j.wasteWeight)) : '-'}</td>
                  <td className="py-2 px-4 text-right text-slate-500">{j.endDate ? formatDate(j.endDate) : formatDate(j.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
          {jobs.length > 50 && (
            <tfoot>
              <tr><td colSpan={6} className="py-3 px-4 text-center text-slate-400">Showing 50 of {jobs.length} jobs</td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Waste Analysis ──────────────────────────────
function WasteAnalysisView({ jobs, totalWaste, wasteByJob, totalOutput, wasteChartData }: { jobs: ProductionJob[]; totalWaste: number; wasteByJob: { job: string; waste: number }[]; totalOutput: number; wasteChartData: { period: string; kg: number }[]; from: string; to: string }) {
  const wasteRate = totalOutput > 0 ? (totalWaste / totalOutput) * 100 : 0

  const doExport = useCallback(() => {
    exportCSV('waste_analysis.csv',
      ['Period', 'Waste (kg)'],
      wasteChartData.map(w => [w.period, String(w.kg)])
    )
  }, [wasteChartData])

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total Waste" value={formatKg(totalWaste)} color="text-red-600" />
        <Card title="Waste Rate" value={`${wasteRate.toFixed(1)}%`} subtitle={`of ${formatKg(totalOutput)} output`} />
        <Card title="Jobs with Waste" value={String(wasteByJob.length)} />
        <Card title="Avg Waste per Job" value={formatKg(wasteByJob.length > 0 ? totalWaste / wasteByJob.length : 0)} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">Waste Trend (per day)</h4>
        {wasteChartData.length > 0 ? (
          <ResponsiveContainer key={'waste-chart-' + wasteChartData.length} width="100%" height={300}>
            <ComposedChart data={wasteChartData}>
              <defs>
                <linearGradient id="wasteGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} angle={-60} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatKg(v)} />
              <Tooltip formatter={(value: any) => formatKg(value)} />
              <Area type="monotone" dataKey="kg" stroke="none" fill="url(#wasteGradient)" isAnimationActive={false} />
              <Line type="monotone" dataKey="kg" stroke="#ef4444" strokeWidth={2.5} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-400 text-center py-8">No waste data in this period</p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Job #</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Customer</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Waste (kg)</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Waste Rate</th>
            </tr>
          </thead>
          <tbody>
            {wasteByJob.map(w => {
              const job = jobs.find(j => j.jobNumber === w.job)
              return (
                <tr key={w.job} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-medium">{w.job}</td>
                  <td className="py-2 px-4">{job?.customerName || '-'}</td>
                  <td className="py-2 px-4 text-right text-red-600 font-medium">{formatKg(w.waste)}</td>
                  <td className="py-2 px-4 text-right">{(totalOutput > 0 ? (w.waste / totalOutput) * 100 : 0).toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
          {wasteByJob.length === 0 && (
            <tbody><tr><td colSpan={4} className="py-8 text-center text-slate-400">No waste recorded</td></tr></tbody>
          )}
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Stock Valuation ────────────────────────────
function StockValuationView({ materials, stockValue, pieData }: { materials: MaterialWithStock[]; stockValue: number; pieData: { name: string; value: number }[] }) {
  const withStock = materials.filter(m => (m.totalStock || 0) > 0)

  const doExport = useCallback(() => {
    exportCSV('stock_valuation.csv',
      ['Material', 'Code', 'Category', 'Stock Qty', 'Cost Price', 'Value'],
      withStock.map(m => [m.name, m.code, m.category, String(m.totalStock), String(m.costPrice || 0), String((m.totalStock || 0) * (m.costPrice || 0))])
    )
  }, [withStock])

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card title="Total Stock Value" value={formatCurrency(stockValue)} color="text-blue-600" />
        <Card title="Materials in Stock" value={String(withStock.length)} />
        <Card title="Material Types" value={String(materials.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Value by Category</h4>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIECE_COLORS[i % PIECE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-center py-8">No stock data</p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Category Comparison</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pieData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {pieData.map((_, i) => <Cell key={i} fill={PIECE_COLORS[i % PIECE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Material</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Code</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Category</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Stock Qty</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Cost Price</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Value</th>
            </tr>
          </thead>
          <tbody>
            {withStock.sort((a, b) => ((b.totalStock || 0) * (b.costPrice || 0)) - ((a.totalStock || 0) * (a.costPrice || 0))).map(m => {
              const value = (m.totalStock || 0) * (m.costPrice || 0)
              return (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-medium">{m.name}</td>
                  <td className="py-2 px-4 text-slate-500">{m.code}</td>
                  <td className="py-2 px-4">{m.category?.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(m.totalStock || 0)}</td>
                  <td className="py-2 px-4 text-right">{m.costPrice ? formatCurrency(m.costPrice) : '-'}</td>
                  <td className="py-2 px-4 text-right font-medium">{formatCurrency(value)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td colSpan={5} className="py-3 px-4">Total Stock Value</td>
              <td className="py-3 px-4 text-right">{formatCurrency(stockValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Inventory Movements ─────────────────────────
function InventoryMovementsView({ data: rawData }: { data: InventoryMovementReport | null }) {
  if (!rawData) return <EmptyReport />
  const data = rawData

  const doExport = useCallback(() => {
    exportCSV('inventory_movements.csv',
      ['Type', 'Quantity', 'Count'],
      data.byType.map(t => [t.type, String(t.totalQuantity), String(t.count)])
    )
  }, [data])

  const chartData = data.byType.map(t => ({ name: t.type, in: t.type === 'IN' || t.type === 'INITIAL' ? t.totalQuantity : 0, out: t.type === 'OUT' || t.type === 'ADJUSTMENT' ? t.totalQuantity : 0 }))

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total In" value={formatNumber(data.totalIn)} color="text-green-600" />
        <Card title="Total Out" value={formatNumber(data.totalOut)} color="text-red-600" />
        <Card title="Net Change" value={formatNumber(data.netChange)} color={data.netChange >= 0 ? 'text-green-600' : 'text-red-600'} />
        <Card title="Movement Types" value={String(data.byType.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Movements by Type</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="in" name="In" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" name="Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Net Change by Material (Top 15)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[...data.byMaterial].sort((a, b) => Math.abs(b.netChange) - Math.abs(a.netChange)).slice(0, 15)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="materialName" tick={{ fontSize: 9 }} width={100} />
              <Tooltip />
              <Bar dataKey="netChange" fill="#6366f1" radius={[0, 4, 4, 0]}>
                {data.byMaterial.slice(0, 15).map((_, i) => <Cell key={i} fill={data.byMaterial[i]?.netChange >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Type</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Total Quantity</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {data.byType.map(t => (
              <tr key={t.type} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-4 font-medium">{t.type}</td>
                <td className="py-2 px-4 text-right">{formatNumber(t.totalQuantity)}</td>
                <td className="py-2 px-4 text-right">{t.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.byMaterial.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mt-6">
          <h4 className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100">By Material</h4>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium text-slate-600">Material</th>
                <th className="text-left py-2.5 px-4 font-medium text-slate-600">Category</th>
                <th className="text-right py-2.5 px-4 font-medium text-slate-600">In</th>
                <th className="text-right py-2.5 px-4 font-medium text-slate-600">Out</th>
                <th className="text-right py-2.5 px-4 font-medium text-slate-600">Net Change</th>
              </tr>
            </thead>
            <tbody>
              {data.byMaterial.sort((a, b) => Math.abs(b.netChange) - Math.abs(a.netChange)).slice(0, 30).map(m => (
                <tr key={m.materialId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-medium">{m.materialName}</td>
                  <td className="py-2 px-4">{m.category.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-4 text-right text-green-600">{m.inQuantity > 0 ? formatNumber(m.inQuantity) : '-'}</td>
                  <td className="py-2 px-4 text-right text-red-600">{m.outQuantity > 0 ? formatNumber(m.outQuantity) : '-'}</td>
                  <td className="py-2 px-4 text-right font-medium">{m.netChange !== 0 ? formatNumber(m.netChange) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportWrapper>
  )
}

// ─── Low Stock Report ────────────────────────────
function LowStockView({ items }: { items: MaterialWithStock[] }) {
  const critical = items.filter(m => m.totalStock <= 0 || (m.minStock > 0 && m.totalStock / m.minStock <= 0.5))
  const low = items.filter(m => !critical.includes(m) && m.totalStock < m.minStock)

  const doExport = useCallback(() => {
    exportCSV('low_stock_report.csv',
      ['Material', 'Code', 'Category', 'Current Stock', 'Min Stock', 'Status'],
      items.map(m => [m.name, m.code, m.category, String(m.totalStock), String(m.minStock), critical.includes(m) ? 'Critical' : 'Low'])
    )
  }, [items, critical])

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card title="Critical Items" value={String(critical.length)} color="text-red-600" subtitle="At or below 50% of min stock" />
        <Card title="Low Items" value={String(low.length)} color="text-amber-600" subtitle="Below minimum stock level" />
        <Card title="Total Alerts" value={String(items.length)} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Material</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Code</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Category</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Current Stock</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Min Stock</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Fill Rate</th>
              <th className="text-center py-2.5 px-4 font-medium text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {critical.concat(low).map(m => {
              const fillRate = m.minStock > 0 ? (m.totalStock / m.minStock) * 100 : 0
              const isCritical = critical.includes(m)
              return (
                <tr key={m.id} className={`border-b border-slate-100 hover:bg-slate-50 ${isCritical ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <td className="py-2 px-4 font-medium">{m.name}</td>
                  <td className="py-2 px-4 text-slate-500">{m.code}</td>
                  <td className="py-2 px-4">{m.category?.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-4 text-right font-medium">{formatNumber(m.totalStock || 0)}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(m.minStock)}</td>
                  <td className="py-2 px-4 text-right">{fillRate.toFixed(0)}%</td>
                  <td className="py-2 px-4 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isCritical ? 'Critical' : 'Low'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {items.length === 0 && (
            <tbody><tr><td colSpan={7} className="py-8 text-center text-slate-400">All materials are adequately stocked</td></tr></tbody>
          )}
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── PO Summary ──────────────────────────────────
function POSummaryView({ orders, totalAmount, byStatus, supplierQty, supplierAmount }: {
  orders: PurchaseOrder[]; totalAmount: number; byStatus: Record<string, number>;
  supplierQty: { supplier: string; qty: number }[]; supplierAmount: { supplier: string; amount: number }[];
}) {
  const statusLabels: Record<string, string> = { PENDING: 'Pending', RECEIVED: 'Received', PARTIALLY_RECEIVED: 'Partial', CANCELLED: 'Cancelled' }

  const doExport = useCallback(() => {
    exportCSV('po_summary.csv',
      ['PO #', 'Supplier', 'Status', 'Amount'],
      orders.map(o => [o.poNumber, o.supplier, o.status, String(o.totalAmount || 0)])
    )
  }, [orders])

  return (
    <ReportWrapper onExport={doExport}>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total Orders" value={String(orders.length)} />
        <Card title="Total Amount" value={formatCurrency(totalAmount)} color="text-blue-600" />
        <Card title="Pending" value={String(byStatus['PENDING'] || 0)} />
        <Card title="Received" value={String((byStatus['RECEIVED'] || 0) + (byStatus['PARTIALLY_RECEIVED'] || 0))} color="text-green-600" />
      </div>

      {supplierQty.length > 0 && supplierAmount.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">Quantity by Supplier (kg)</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={supplierQty} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatKg(v)} />
                <YAxis type="category" dataKey="supplier" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(value: any) => formatKg(value)} />
                <Bar dataKey="qty" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">Monies by Supplier</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={supplierAmount} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: any) => formatCurrency(v)} />
                <YAxis type="category" dataKey="supplier" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(value: any) => formatCurrency(value)} />
                <Bar dataKey="amount" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">PO #</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Supplier</th>
              <th className="text-left py-2.5 px-4 font-medium text-slate-600">Status</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(po => (
              <tr key={po.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-4 font-medium">{po.poNumber}</td>
                <td className="py-2 px-4">{po.supplier}</td>
                <td className="py-2 px-4">{statusLabels[po.status] || po.status}</td>
                <td className="py-2 px-4 text-right">{po.totalAmount ? formatCurrency(Number(po.totalAmount)) : '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td colSpan={3} className="py-3 px-4">{orders.length} orders</td>
              <td className="py-3 px-4 text-right">{formatCurrency(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportWrapper>
  )
}

// ─── Helpers ─────────────────────────────────────
function EmptyReport() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-slate-500">No data available for this report</p>
    </div>
  )
}

function ReportWrapper({ children, onExport }: { children: React.ReactNode; onExport?: () => void }) {
  const registerExport = useContext(ExportContext)
  useEffect(() => {
    if (onExport && registerExport) registerExport({ exec: onExport })
    return () => { if (registerExport) registerExport(null) }
  }, [onExport, registerExport])
  return <div className="space-y-6">{children}</div>
}


