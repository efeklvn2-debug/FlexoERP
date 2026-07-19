import { useState, useEffect, useMemo } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import { useSearchParams } from 'react-router-dom'
import { inventoryApi, MaterialWithStock, MaterialCategory, MovementType } from '../api/inventory'
import { procurementApi, Roll } from '../api/procurement'
import { productionApi, PrintedRollDisplay } from '../api/production'
import { Layout } from '../components/Layout'
import { DateInput } from '../components/DateInput'

type TabType = 'plain-rolls' | 'ink-solvents' | 'cores' | 'packing-bags' | 'printed-rolls' | 'initial-stock'

interface InitialStockItem {
  materialId: string
  name: string
  code: string
  unit: string
  currentStock: number
  newStock: number
}

export function InventoryPage() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as TabType | null
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'printed-rolls')
  const [materials, setMaterials] = useState<MaterialWithStock[]>([])
  const [rolls, setRolls] = useState<Roll[]>([])
  const [printedRolls, setPrintedRolls] = useState<PrintedRollDisplay[]>([])
  const [initialStockMovements, setInitialStockMovements] = useState<any[]>([])
  const [subCategories, setSubCategories] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const notify = useNotification()
  const [showInitializeModal, setShowInitializeModal] = useState(false)
  
  const userStr = localStorage.getItem('user')
  const user = userStr ? JSON.parse(userStr) : null
  const isAdmin = user?.role === 'ADMIN'
  const [initialStockItems, setInitialStockItems] = useState<InitialStockItem[]>([])
  const [saving, setSaving] = useState(false)
  const [adjustMaterial, setAdjustMaterial] = useState<MaterialWithStock | null>(null)
  const [adjustValue, setAdjustValue] = useState('')
  const [adjustType, setAdjustType] = useState<'ADD' | 'REMOVE'>('ADD')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [selectedParentRoll, setSelectedParentRoll] = useState<Roll | null>(null)
  const [printedFromRoll, setPrintedFromRoll] = useState<any[] | null>(null)
  const [loadingPrintedFromRoll, setLoadingPrintedFromRoll] = useState(false)
  const [disposeRoll, setDisposeRoll] = useState<Roll | null>(null)
  const [disposeDate, setDisposeDate] = useState('')
  const [consumeRoll, setConsumeRoll] = useState<Roll | null>(null)
  const [consumeDate, setConsumeDate] = useState('')
  const [consuming, setConsuming] = useState(false)
  const [returnRoll, setReturnRoll] = useState<Roll | null>(null)
  const [returnDate, setReturnDate] = useState('')
  const [disposalReason, setDisposalReason] = useState('Manufacturing defect')
  const [disposing, setDisposing] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  const ADJUSTMENT_REASONS = [
    'Opening Balance',
    'Physical Count Variance',
    'Damaged Goods',
    'Theft/Loss',
    'Internal Use',
    'Return to Supplier',
    'Audit Adjustment',
    'Other'
  ]

  // Filters for each tab
  const [plainRollsFilter, setPlainRollsFilter] = useState({
    search: '',
    status: '',
    materialSubCategory: ''
  })
  const [plainRollsSort, setPlainRollsSort] = useState<'rollNumber' | 'weight' | 'remainingWeight' | 'createdAt'>('createdAt')
  const [plainRollsSortOrder, setPlainRollsSortOrder] = useState<'asc' | 'desc'>('desc')

  const [materialsFilter, setMaterialsFilter] = useState({ search: '' })
  const [materialsSort, setMaterialsSort] = useState<'name' | 'totalStock' | 'code'>('name')
  const [materialsSortOrder, setMaterialsSortOrder] = useState<'asc' | 'desc'>('asc')

  const [printedRollFilter, setPrintedRollFilter] = useState({
    search: '',
    customer: '',
    material: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    combination: ''
  })
  const [printedRollSort, setPrintedRollSort] = useState<'createdAt' | 'weight' | 'rollNumber'>('createdAt')
  const [printedRollSortOrder, setPrintedRollSortOrder] = useState<'asc' | 'desc'>('desc')
  const [includeArchived, setIncludeArchived] = useState(false)

  useEffect(() => {
    loadData()
  }, [activeTab, includeArchived])

  useEffect(() => {
    inventoryApi.getSubCategories().then(res => {
      setSubCategories((res.data as any)?.data || {})
    }).catch(() => {})
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'plain-rolls') {
        const res = await procurementApi.getRolls()
        setRolls(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      } else if (activeTab === 'ink-solvents') {
        const res = await inventoryApi.getMaterials()
        setMaterials(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      } else if (activeTab === 'printed-rolls') {
        const res = await productionApi.getPrintedRolls(undefined, includeArchived)
        setPrintedRolls(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      } else if (activeTab === 'initial-stock') {
        const res = await inventoryApi.getInitialStockMovements()
        setInitialStockMovements(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      }
    } catch (err: any) {
      notify.error(err.message || 'Failed to load data')
    }
    setLoading(false)
  }

  const plainRolls = rolls
  const filteredPlainRolls = useMemo(() => {
    let result = [...plainRolls]
    if (plainRollsFilter.search) {
      const term = plainRollsFilter.search.toLowerCase()
      result = result.filter(r => (r.rollNumber || '').toLowerCase().includes(term))
    }
    if (plainRollsFilter.status) {
      result = result.filter(r => r.status === plainRollsFilter.status)
    }
    if (plainRollsFilter.materialSubCategory) {
      result = result.filter(r => (r.material as any)?.subCategory === plainRollsFilter.materialSubCategory)
    }
    result.sort((a, b) => {
      let comparison = 0
      if (plainRollsSort === 'rollNumber') comparison = (a.rollNumber || '').localeCompare(b.rollNumber || '')
      else if (plainRollsSort === 'weight') comparison = Number(a.weight) - Number(b.weight)
      else if (plainRollsSort === 'remainingWeight') comparison = Number(a.remainingWeight) - Number(b.remainingWeight)
      else comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return plainRollsSortOrder === 'desc' ? -comparison : comparison
    })
    return result
  }, [plainRolls, plainRollsFilter, plainRollsSort, plainRollsSortOrder])

  const inkSolvents = materials.filter(m => m.category === 'INK_SOLVENTS')
  const filteredInkSolvents = useMemo(() => {
    let result = [...inkSolvents]
    if (materialsFilter.search) {
      const term = materialsFilter.search.toLowerCase()
      result = result.filter(m => (m.name || '').toLowerCase().includes(term) || (m.code || '').toLowerCase().includes(term))
    }
    result.sort((a, b) => {
      let comparison = 0
      if (materialsSort === 'name') comparison = (a.name || '').localeCompare(b.name || '')
      else if (materialsSort === 'code') comparison = (a.code || '').localeCompare(b.code || '')
      else comparison = Number(a.totalStock) - Number(b.totalStock)
      return materialsSortOrder === 'desc' ? -comparison : comparison
    })
    return result
  }, [inkSolvents, materialsFilter, materialsSort, materialsSortOrder])

  const filteredPrintedRolls = useMemo(() => {
    let result = [...printedRolls]
    if (printedRollFilter.search) {
      const term = printedRollFilter.search.toLowerCase()
      result = result.filter(r => (r.rollNumber || '').toLowerCase().includes(term) || (r.jobNumber || '').toLowerCase().includes(term))
    }
    if (printedRollFilter.customer) {
      result = result.filter(r => (r.customerName || '').toLowerCase().includes(printedRollFilter.customer.toLowerCase()))
    }
    if (printedRollFilter.material) {
      result = result.filter(r => r.material === printedRollFilter.material)
    }
    if (printedRollFilter.dateFrom) {
      result = result.filter(r => new Date(r.createdAt) >= new Date(printedRollFilter.dateFrom))
    }
    if (printedRollFilter.dateTo) {
      const to = new Date(printedRollFilter.dateTo)
      to.setHours(23, 59, 59)
      result = result.filter(r => new Date(r.createdAt) <= to)
    }
    if (printedRollFilter.combination === 'combo') {
      result = result.filter(r => r.isCombination === true)
    } else if (printedRollFilter.combination === 'single') {
      result = result.filter(r => !r.isCombination)
    }
    if (printedRollFilter.status) {
      result = result.filter(r => r.status === printedRollFilter.status)
    }
    result.sort((a, b) => {
      let comparison = 0
      if (printedRollSort === 'rollNumber') comparison = (a.rollNumber || '').localeCompare(b.rollNumber || '')
      else if (printedRollSort === 'weight') comparison = Number(a.weight) - Number(b.weight)
      else comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return printedRollSortOrder === 'desc' ? -comparison : comparison
    })
    return result
  }, [printedRolls, printedRollFilter, printedRollSort, printedRollSortOrder])

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
            <p className="text-slate-500 mt-1">Manage materials and stock</p>
          </div>
          <div className="flex space-x-2">
            <button onClick={() => setActiveTab('plain-rolls')} className={`px-4 py-2 rounded-lg ${activeTab === 'plain-rolls' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Plain Rolls</button>
            <button onClick={() => setActiveTab('ink-solvents')} className={`px-4 py-2 rounded-lg ${activeTab === 'ink-solvents' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Inks / Solvents</button>
            <button onClick={() => setActiveTab('cores')} className={`px-4 py-2 rounded-lg ${activeTab === 'cores' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Cores</button>
            <button onClick={() => setActiveTab('packing-bags')} className={`px-4 py-2 rounded-lg ${activeTab === 'packing-bags' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Packing Bags</button>
            <button onClick={() => setActiveTab('printed-rolls')} className={`px-4 py-2 rounded-lg ${activeTab === 'printed-rolls' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Printed Rolls</button>
            <button onClick={() => setActiveTab('initial-stock')} className={`px-4 py-2 rounded-lg ${activeTab === 'initial-stock' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 border border-purple-200'}`}>Initial Stock</button>
          </div>
        </div>

        {loading ? <div className="text-center py-12">Loading...</div> : (
          <>
            {activeTab === 'plain-rolls' && (
              <PlainRollsTab
                rolls={filteredPlainRolls}
                filter={plainRollsFilter}
                setFilter={setPlainRollsFilter}
                sort={plainRollsSort}
                setSort={setPlainRollsSort}
                sortOrder={plainRollsSortOrder}
                setSortOrder={setPlainRollsSortOrder}
                total={plainRolls.length}
                subCategories={subCategories.PLAIN_ROLLS || []}
                onRollClick={async (roll) => {
                  setSelectedParentRoll(roll)
                  setPrintedFromRoll(null)
                  setLoadingPrintedFromRoll(true)
                  try {
                    const res = await productionApi.getPrintedRollsByParentRoll(roll.id)
                    if (res.data) setPrintedFromRoll((res.data as any).data || [])
                    else setPrintedFromRoll([])
                  } catch {
                    setPrintedFromRoll([])
                  }
                  setLoadingPrintedFromRoll(false)
                }}
              />
            )}
            {activeTab === 'ink-solvents' && (
              <MaterialsTab
                materials={filteredInkSolvents}
                filter={materialsFilter}
                setFilter={setMaterialsFilter}
                sort={materialsSort}
                setSort={setMaterialsSort}
                sortOrder={materialsSortOrder}
                setSortOrder={setMaterialsSortOrder}
                total={inkSolvents.length}
                title="Inks / Solvents"
                onAdjust={isAdmin ? setAdjustMaterial : undefined}
                isAdmin={isAdmin}
              />
            )}
            {activeTab === 'cores' && (
              <CoresTab />
            )}
            {activeTab === 'packing-bags' && (
              <PackingBagsTab onAdjust={isAdmin ? setAdjustMaterial : undefined} />
            )}
            {activeTab === 'printed-rolls' && (
              <PrintedRollsTab
                rolls={filteredPrintedRolls}
                filter={printedRollFilter}
                setFilter={setPrintedRollFilter}
                sort={printedRollSort}
                setSort={setPrintedRollSort}
                sortOrder={printedRollSortOrder}
                setSortOrder={setPrintedRollSortOrder}
                total={printedRolls.length}
                subCategories={subCategories.PLAIN_ROLLS || []}
                onRefresh={loadData}
                isAdmin={isAdmin}
                includeArchived={includeArchived}
                onToggleArchived={() => setIncludeArchived(!includeArchived)}
              />
            )}
            {activeTab === 'initial-stock' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Initial Stock Records</h3>
                    <button
                      onClick={async () => {
                        try {
                          const res = await inventoryApi.getMaterials()
                          const materials = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
                          setInitialStockItems(materials.map((m: any) => ({
                            materialId: m.id,
                            name: m.name,
                            code: m.code,
                            unit: m.unitOfMeasure,
                            currentStock: Number(m.totalStock || 0),
                            newStock: Number(m.totalStock || 0)
                          })))
                          setShowInitializeModal(true)
                        } catch (err: any) {
                          notify.error(err.message || 'Failed to load materials')
                        }
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Initialize Stock
                    </button>
                  </div>
                  {initialStockMovements.length > 0 ? (
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Material</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Qty</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {initialStockMovements.map((m: any) => (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-sm text-slate-600">{new Date(m.createdAt).toLocaleDateString()}</td>
                            <td className="px-4 py-2 text-sm text-slate-900">{m.material?.name || '-'}</td>
                            <td className="px-4 py-2 text-sm text-slate-600">{m.material?.code || '-'}</td>
                            <td className={`px-4 py-2 text-sm text-right font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {m.quantity > 0 ? '+' : ''}{m.quantity}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-500">{m.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-center text-slate-500 py-8">No initial stock records found</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {showInitializeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Initialize Stock</h2>
                <button onClick={() => setShowInitializeModal(false)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <p className="text-sm text-slate-600 mb-4">
                Enter the current stock levels for each material. This will set the baseline stock and post a journal entry (Dr Raw Material Inventory / Cr Opening Balance Equity).
              </p>

              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Material</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Current</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">New Stock</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {initialStockItems.map((item) => (
                      <tr key={item.materialId} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-sm text-slate-900">{item.name}</td>
                        <td className="px-4 py-2 text-sm text-slate-600">{item.code}</td>
                        <td className="px-4 py-2 text-sm text-right text-slate-600">{item.currentStock}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            value={item.newStock}
                            onChange={(e) => {
                              setInitialStockItems(items =>
                                items.map(i =>
                                  i.materialId === item.materialId
                                    ? { ...i, newStock: parseFloat(e.target.value) || 0 }
                                    : i
                                )
                              )
                            }}
                            className="w-24 px-2 py-1 text-sm text-right border border-slate-300 rounded"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm text-center text-slate-500">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end space-x-3 pt-4 mt-4 border-t">
                <button
                  onClick={() => setShowInitializeModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const itemsToUpdate = initialStockItems.filter(i => i.newStock !== i.currentStock)
                    if (itemsToUpdate.length === 0) {
                      notify.error('No changes to save')
                      return
                    }
                    setSaving(true)
                    try {
                      const res = await inventoryApi.initializeStock(
                        itemsToUpdate.map(i => ({ materialId: i.materialId, quantity: i.newStock })),
                        new Date().toISOString().split('T')[0]
                      )
                      if (res.error) {
                        notify.error(res.error.message)
                      } else {
                        notify.success('Stock initialized successfully')
                        setShowInitializeModal(false)
                        loadData()
                      }
                    } catch (err: any) {
                      notify.error(err.message || 'Failed to initialize stock')
                    }
                    setSaving(false)
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Initial Stock'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Adjust Stock Modal */}
        {adjustMaterial && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Adjust Stock</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500">Material</p>
                  <p className="font-medium">{adjustMaterial.name}</p>
                  <p className="text-xs text-slate-400">{adjustMaterial.code}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Current Stock</p>
                  <p className="font-medium">{Number(adjustMaterial.totalStock).toFixed(2)} {adjustMaterial.unitOfMeasure}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Adjustment Type</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input type="radio" checked={adjustType === 'ADD'} onChange={() => setAdjustType('ADD')} className="mr-2" />
                      <span className="text-green-600 font-medium">Add (+)</span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" checked={adjustType === 'REMOVE'} onChange={() => setAdjustType('REMOVE')} className="mr-2" />
                      <span className="text-red-600 font-medium">Remove (-)</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity ({adjustMaterial.unitOfMeasure})</label>
                  <input
                    type="number"
                    value={adjustValue}
                    onChange={e => setAdjustValue(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="Enter quantity"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reason <span className="text-red-500">*</span></label>
                  <select
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="">Select reason</option>
                    {ADJUSTMENT_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-sm text-slate-500">New Stock</p>
                  <p className="text-lg font-bold text-slate-900">
                    {adjustType === 'ADD' 
                      ? (Number(adjustMaterial.totalStock || 0) + Number(adjustValue || 0)).toFixed(2)
                      : Math.max(0, Number(adjustMaterial.totalStock || 0) - Number(adjustValue || 0)).toFixed(2)
                    } {adjustMaterial.unitOfMeasure}
                  </p>
                </div>
                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                  <button onClick={() => { setAdjustMaterial(null); setAdjustValue(''); setAdjustType('ADD'); setAdjustReason(''); }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button
                    onClick={async () => {
                      if (!adjustValue || Number(adjustValue) <= 0) {
                        notify.error('Please enter a valid quantity')
                        return
                      }
                      if (!adjustReason) {
                        notify.error('Please select a reason')
                        return
                      }
                      setAdjusting(true)
                      try {
                        const qty = Number(adjustValue)
                        const newQty = adjustType === 'ADD' 
                          ? Number(adjustMaterial.totalStock || 0) + qty
                          : Math.max(0, Number(adjustMaterial.totalStock || 0) - qty)
                        
                        await inventoryApi.adjustStock(adjustMaterial.id, newQty, adjustReason)
                        notify.success('Stock adjusted successfully')
                        setAdjustMaterial(null)
                        setAdjustValue('')
                        setAdjustType('ADD')
                        setAdjustReason('')
                        loadData()
                      } catch (err: any) {
                        notify.error(err.message || 'Failed to adjust stock')
                      }
                      setAdjusting(false)
                    }}
                    disabled={adjusting || !adjustValue || !adjustReason}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {adjusting ? 'Saving...' : 'Save Adjustment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Parent Roll Details Modal */}
        {selectedParentRoll && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Roll {selectedParentRoll.rollNumber}</h2>
                <button onClick={() => { setSelectedParentRoll(null); setPrintedFromRoll(null) }} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500">Material</p>
                  <p className="font-medium">{(selectedParentRoll.material as any)?.subCategory || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Weight</p>
                  <p className="font-medium">{Number(selectedParentRoll.weight).toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Remaining</p>
                  <p className="font-medium">{Number(selectedParentRoll.remainingWeight).toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="font-medium">{selectedParentRoll.status}</p>
                </div>
              </div>
              {selectedParentRoll.status === 'AVAILABLE' && (
                <div className="flex gap-3 mb-6">
                  <button onClick={() => { setConsumeRoll(selectedParentRoll); setConsumeDate(today) }} className="px-4 py-2 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700">
                    Mark Consumed
                  </button>
                  <button onClick={() => { setDisposeRoll(selectedParentRoll); setDisposeDate(today); setDisposalReason('Manufacturing defect') }} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                    Mark as Waste
                  </button>
                  <button onClick={() => { setReturnRoll(selectedParentRoll); setReturnDate(today) }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                    Return to Supplier
                  </button>
                </div>
              )}
              {selectedParentRoll.status === 'RETURNED' && !selectedParentRoll.replacementReceived && (
                <div className="flex gap-3 mb-6">
                  <button onClick={async () => {
                    if (!confirm('Receive replacement for this returned roll?')) return
                    try {
                      await productionApi.receiveReplacement(selectedParentRoll.id)
                      notify.success('Replacement received')
                      setSelectedParentRoll(null)
                      setPrintedFromRoll(null)
                      loadData()
                    } catch (e: any) {
                      notify.error(e?.response?.data?.error || 'Failed to receive replacement')
                    }
                  }} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
                    Receive Replacement
                  </button>
                </div>
              )}
              <h3 className="text-lg font-semibold mb-3">Printed Rolls Produced From This Roll</h3>
              {loadingPrintedFromRoll ? (
                <div className="text-center py-8 text-slate-500">Loading...</div>
              ) : printedFromRoll === null ? (
                <div className="text-center py-8 text-slate-500">Click load to view printed rolls</div>
              ) : printedFromRoll.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No printed rolls found for this parent roll</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-3 py-2">Roll #</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-3 py-2">Weight</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-3 py-2">Customer</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-3 py-2">Date</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase px-3 py-2">Job</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printedFromRoll.map((pr: any, idx: number) => {
                      if (pr.isWaste) {
                        return (
                          <tr key={`waste-${idx}`} className="bg-amber-50">
                            <td className="px-3 py-3 text-sm font-mono text-amber-700">Waste</td>
                            <td className="px-3 py-3 text-sm text-amber-700 font-medium">{Number(pr.wasteWeight).toFixed(2)} kg</td>
                            <td className="px-3 py-3 text-sm text-amber-700">{pr.customerName}</td>
                            <td className="px-3 py-3 text-sm text-amber-700">{new Date(pr.createdAt).toLocaleDateString()}</td>
                            <td className="px-3 py-3 text-sm text-amber-700">{pr.jobNumber}</td>
                          </tr>
                        )
                      }
                      const isPartial = pr.contributedWeight && pr.contributedWeight < Number(pr.weightUsed)
                      return (
                        <tr key={pr.id || idx} className={'hover:bg-slate-50' + (isPartial ? ' bg-amber-50' : '')}>
                          <td className="px-3 py-3 text-sm font-mono">
                            {pr.rollNumber}
                            {isPartial && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-500" title="Partial contribution" />}
                          </td>
                          <td className="px-3 py-3 text-sm">
                            {isPartial ? (
                              <span>{Number(pr.contributedWeight).toFixed(2)} kg <span className="text-xs text-slate-400">of {Number(pr.weightUsed).toFixed(2)} kg</span></span>
                            ) : (
                              <span>{Number(pr.weightUsed).toFixed(2)} kg</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm">{pr.customerName}</td>
                          <td className="px-3 py-3 text-sm">{new Date(pr.createdAt).toLocaleDateString()}</td>
                          <td className="px-3 py-3 text-sm text-slate-500">{pr.jobNumber}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Mark Consumed Confirmation Modal */}
        {consumeRoll && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-2">Mark Roll as Consumed</h3>
              <p className="text-sm text-slate-600 mb-4">
                Mark roll <strong>{consumeRoll.rollNumber}</strong> ({Number(consumeRoll.remainingWeight).toFixed(2)} kg remaining) as fully consumed.
                A core will be recovered to inventory.
              </p>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <DateInput value={consumeDate} onChange={e => setConsumeDate(e.target.value)} max={today} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setConsumeRoll(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    setConsuming(true)
                    try {
                      await productionApi.markRollConsumed(consumeRoll.id, consumeDate || undefined)
                      notify.success('Roll marked as consumed')
                      setConsumeRoll(null)
                      setSelectedParentRoll(null)
                      setPrintedFromRoll(null)
                      loadData()
                    } catch (e: any) {
                      notify.error(e?.response?.data?.error || 'Failed to mark roll as consumed')
                    }
                    setConsuming(false)
                  }}
                  disabled={consuming}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
                >
                  {consuming ? 'Processing...' : 'Mark Consumed'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dispose Confirmation Modal */}
        {disposeRoll && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-2">Mark Roll as Waste</h3>
              <p className="text-sm text-slate-600 mb-4">
                This will dispose roll <strong>{disposeRoll.rollNumber}</strong> ({Number(disposeRoll.remainingWeight).toFixed(2)} kg remaining) and post a journal entry.
              </p>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <DateInput value={disposeDate} onChange={e => setDisposeDate(e.target.value)} max={today} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">Reason</label>
                <select value={disposalReason} onChange={e => setDisposalReason(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  <option value="Manufacturing defect">Manufacturing defect</option>
                  <option value="Damaged during handling">Damaged during handling</option>
                  <option value="Contamination">Contamination</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDisposeRoll(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    setDisposing(true)
                    try {
                      await productionApi.disposeRoll(disposeRoll.id, disposalReason, disposeDate || undefined)
                      notify.success('Roll disposed')
                      setDisposeRoll(null)
                      setSelectedParentRoll(null)
                      setPrintedFromRoll(null)
                      loadData()
                    } catch (e: any) {
                      notify.error(e?.response?.data?.error || 'Failed to dispose roll')
                    }
                    setDisposing(false)
                  }}
                  disabled={disposing}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {disposing ? 'Processing...' : 'Confirm Dispose'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Return Confirmation Modal */}
        {returnRoll && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-2">Return Roll to Supplier</h3>
              <p className="text-sm text-slate-600 mb-4">
                This will return roll <strong>{returnRoll.rollNumber}</strong> ({Number(returnRoll.remainingWeight).toFixed(2)} kg remaining) to the supplier and post a journal entry.
              </p>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <DateInput value={returnDate} onChange={e => setReturnDate(e.target.value)} max={today} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setReturnRoll(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    setDisposing(true)
                    try {
                      await productionApi.returnRoll(returnRoll.id, returnDate || undefined)
                      setReturnRoll(null)
                      setSelectedParentRoll(null)
                      setPrintedFromRoll(null)
                      loadData()
                    } catch (e: any) {
                      notify.error(e?.response?.data?.error || 'Failed to return roll')
                    }
                    setDisposing(false)
                  }}
                  disabled={disposing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {disposing ? 'Processing...' : 'Confirm Return'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function PlainRollsTab({ rolls, filter, setFilter, sort, setSort, sortOrder, setSortOrder, total, subCategories, onRollClick }: {
  rolls: Roll[]
  filter: { search: string; status: string; materialSubCategory: string }
  setFilter: React.Dispatch<React.SetStateAction<{ search: string; status: string; materialSubCategory: string }>>
  sort: string
  setSort: React.Dispatch<React.SetStateAction<any>>
  sortOrder: 'asc' | 'desc'
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  total: number
  subCategories: string[]
  onRollClick?: (roll: Roll) => void
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Material</label>
            <select value={filter.materialSubCategory} onChange={e => setFilter({ ...filter, materialSubCategory: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              {subCategories.map(sc => (
                <option key={sc} value={sc}>
                  {sc.endsWith('microns') ? sc.charAt(0).toUpperCase() + sc.slice(1) : sc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              <option value="AVAILABLE">Available</option>
              <option value="IN_PRODUCTION">In Production</option>
              <option value="CONSUMED">Consumed</option>
              <option value="RETURNED">Returned</option>
              <option value="WASTED">Wasted</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <input type="text" placeholder="Roll number..." value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => setFilter({ search: '', status: '', materialSubCategory: '' })} className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">Clear</button>
            <span className="text-xs text-slate-500">{rolls.length} of {total} rolls</span>
          </div>
        </div>
      </div>
      {rolls.length > 0 && (() => {
        const totalRemaining = rolls.reduce((sum, r) => sum + Number(r.remainingWeight), 0)
        const avgWeight = totalRemaining / rolls.length
        return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-6 py-3">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Rolls</span>
                <span className="font-semibold text-slate-900">{rolls.length}</span>
              </div>
              <div className="w-px h-5 bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Remaining</span>
                <span className="font-semibold text-slate-900">{totalRemaining.toFixed(2)} kg</span>
              </div>
              <div className="w-px h-5 bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Avg / roll</span>
                <span className="font-semibold text-slate-900">{avgWeight.toFixed(2)} kg</span>
              </div>
            </div>
          </div>
        )
      })()}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Roll #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Material</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Weight (kg)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Remaining (kg)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rolls.map(r => (
              <tr key={r.id} className={`hover:bg-slate-50 ${onRollClick ? 'cursor-pointer' : ''}`} onClick={() => onRollClick?.(r)}>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{r.rollNumber}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{(r.material as any)?.subCategory || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{Number(r.weight).toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{Number(r.remainingWeight).toFixed(2)}</td>
                <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : r.status === 'IN_PRODUCTION' ? 'bg-yellow-100 text-yellow-800' : r.status === 'CONSUMED' ? 'bg-slate-100 text-slate-600' : r.status === 'RETURNED' ? 'bg-blue-100 text-blue-800' : r.status === 'WASTED' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span></td>
                <td className="px-6 py-4 text-sm text-slate-500">{r.receivedDate ? new Date(r.receivedDate).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {rolls.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No plain rolls found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MaterialsTab({ materials, filter, setFilter, sort, setSort, sortOrder, setSortOrder, total, title, onAdjust, isAdmin }: {
  materials: MaterialWithStock[]
  filter: { search: string }
  setFilter: React.Dispatch<React.SetStateAction<{ search: string }>>
  sort: string
  setSort: React.Dispatch<React.SetStateAction<any>>
  sortOrder: 'asc' | 'desc'
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  total: number
  title: string
  onAdjust?: (material: MaterialWithStock) => void
  isAdmin?: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <input type="text" placeholder="Name or code..." value={filter.search} onChange={e => setFilter({ search: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div className="flex items-end">
            <button onClick={() => setFilter({ search: '' })} className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">Clear</button>
            <span className="text-xs text-slate-500 ml-auto">{materials.length} of {total} items</span>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Unit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Adjust</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {materials.map(m => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{m.code}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{m.name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{Number(m.totalStock).toFixed(2)} {m.unitOfMeasure}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{m.unitOfMeasure}</td>
                <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${Number(m.totalStock) <= (m.minStock || 0) ? 'bg-red-100 text-red-800' : Number(m.totalStock) <= (m.minStock || 0) * 1.5 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{Number(m.totalStock) <= (m.minStock || 0) ? 'Low Stock' : Number(m.totalStock) <= (m.minStock || 0) * 1.5 ? 'Warning' : 'OK'}</span></td>
                <td className="px-6 py-4">
                  {isAdmin && onAdjust && (
                    <button onClick={() => onAdjust(m)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                      Adjust
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {materials.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No {title.toLowerCase()} found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PrintedRollsTab({ rolls, filter, setFilter, sort, setSort, sortOrder, setSortOrder, total, subCategories, onRefresh, isAdmin, includeArchived, onToggleArchived }: {
  rolls: PrintedRollDisplay[]
  filter: { search: string; customer: string; material: string; status: string; dateFrom: string; dateTo: string; combination: string }
  setFilter: React.Dispatch<React.SetStateAction<{ search: string; customer: string; material: string; status: string; dateFrom: string; dateTo: string; combination: string }>>
  sort: string
  setSort: React.Dispatch<React.SetStateAction<any>>
  sortOrder: 'asc' | 'desc'
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  total: number
  subCategories: string[]
  onRefresh?: () => Promise<void>
  isAdmin?: boolean
  includeArchived?: boolean
  onToggleArchived?: () => void
}) {
  const notify = useNotification()
  const [selectedRoll, setSelectedRoll] = useState<PrintedRollDisplay | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [returnForm, setReturnForm] = useState({ qty: 0, reason: '', condition: 'SCRAP', refundMethod: 'CREDIT_NOTE', date: '' })
  const [returnLoading, setReturnLoading] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveResult, setArchiveResult] = useState<number | null>(null)

  const handleCustomerReturn = async () => {
    if (!selectedRoll) return
    if (!returnForm.qty || returnForm.qty <= 0) { notify.error('Qty must be positive'); return }
    if (!returnForm.reason) { notify.error('Reason is required'); return }
    setReturnLoading(true)
    try {
      await productionApi.customerReturnRoll(selectedRoll.id, returnForm)
      setShowReturnModal(false)
      setShowDetailsModal(false)
      setSelectedRoll(null)
      onRefresh?.()
    } catch (err: any) {
      notify.error(err.response?.data?.error || err.message || 'Failed to process return')
    }
    setReturnLoading(false)
  }

  const handleArchive = async () => {
    setArchiveLoading(true)
    try {
      const res = await productionApi.archiveOldPrintedRolls()
      const count = (res.data as any)?.archived ?? 0
      setArchiveResult(count)
      setShowArchiveConfirm(false)
      onRefresh?.()
    } catch (err: any) {
      notify.error(err.response?.data?.error || err.message || 'Failed to archive')
    }
    setArchiveLoading(false)
  }

  const statusColor = (status?: string) => {
    switch (status) {
      case 'PICKED_UP': return 'bg-amber-100 text-amber-700'
      case 'IN_STOCK': return 'bg-green-100 text-green-700'
      case 'RETURNED': return 'bg-red-100 text-red-700'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'PICKED_UP': return 'Picked Up'
      case 'IN_STOCK': return 'In Stock'
      case 'RETURNED': return 'Returned'
      default: return status || 'Unknown'
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <input type="text" placeholder="Roll # or Job #..." value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Customer</label>
            <input type="text" placeholder="Customer name..." value={filter.customer} onChange={e => setFilter({ ...filter, customer: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="PICKED_UP">Picked Up</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Material</label>
            <select value={filter.material} onChange={e => setFilter({ ...filter, material: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              {subCategories.map(sc => (
                <option key={sc} value={sc}>
                  {sc.endsWith('microns') ? sc.charAt(0).toUpperCase() + sc.slice(1) : sc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From Date</label>
            <DateInput value={filter.dateFrom} onChange={e => setFilter({ ...filter, dateFrom: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
            <DateInput value={filter.dateTo} onChange={e => setFilter({ ...filter, dateTo: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-200">
          <button onClick={() => setFilter({ search: '', customer: '', material: '', status: '', dateFrom: '', dateTo: '', combination: '' })} className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">Clear Filters</button>
          <div className="flex items-center gap-3 ml-auto">
            {isAdmin && (
              <button onClick={() => setShowArchiveConfirm(true)} className="px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100">
                Archive Old Pickups
              </button>
            )}
            {archiveResult !== null && (
              <span className="text-xs text-green-600 font-medium">{archiveResult} roll{archiveResult !== 1 ? 's' : ''} archived</span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={includeArchived} onChange={onToggleArchived} className="rounded border-slate-300" />
              Show archived
            </label>
            <span className="text-xs text-slate-500">{rolls.length} of {total} rolls</span>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Roll #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Weight</th>

              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Job #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rolls.map(r => (
              <tr key={r.id} className={`hover:bg-slate-50 cursor-pointer ${r.archivedAt ? 'opacity-50' : ''}`} onClick={() => { setSelectedRoll(r); setShowDetailsModal(true) }}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{r.rollNumber || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{Number(r.weight).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{r.material || '-'}</td>
                <td className="px-4 py-3">
                  {r.isCombination ? (
                    <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">Combo</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">Single</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor(r.status)}`}>{statusLabel(r.status)}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{r.customerName || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{r.jobNumber || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {rolls.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No printed rolls found</td></tr>}
          </tbody>
        </table>
      </div>

      {showDetailsModal && selectedRoll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-slate-900">Printed Roll Details</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor(selectedRoll.status)}`}>{statusLabel(selectedRoll.status)}</span>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                  <span className="text-slate-500 block text-xs">Roll Number</span>
                  <span className="text-slate-900 font-medium">{selectedRoll.rollNumber || '-'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                  <span className="text-slate-500 block text-xs">Weight</span>
                  <span className="text-slate-900 font-medium">{Number(selectedRoll.weight).toFixed(2)} kg</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                  <span className="text-slate-500 block text-xs">Material</span>
                  <span className="text-slate-900 font-medium">{selectedRoll.material || '-'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                  <span className="text-slate-500 block text-xs">Type</span>
                  <span className="text-slate-900 font-medium">{selectedRoll.isCombination ? 'Combo' : 'Single'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                  <span className="text-slate-500 block text-xs">Customer</span>
                  <span className="text-slate-900 font-medium">{selectedRoll.customerName || '-'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                  <span className="text-slate-500 block text-xs">Job Number</span>
                  <span className="text-slate-900 font-medium">{selectedRoll.jobNumber || '-'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                  <span className="text-slate-500 block text-xs">Date Produced</span>
                  <span className="text-slate-900 font-medium">{selectedRoll.createdAt ? new Date(selectedRoll.createdAt).toLocaleDateString() : '-'}</span>
                </div>
                {selectedRoll.pickedUpAt && (
                  <div className="bg-slate-50 p-3 rounded-lg flex-1 min-w-[180px]">
                    <span className="text-slate-500 block text-xs">Picked Up At</span>
                    <span className="text-slate-900 font-medium">{new Date(selectedRoll.pickedUpAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {selectedRoll.parentRollContributions && selectedRoll.parentRollContributions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Parent Rolls Used</h3>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Roll #</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Contributed</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Total Wt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRoll.parentRollContributions.map((c, i) => (
                          <tr key={i} className={c.contributedWeight < Number(selectedRoll.weight) ? 'bg-amber-50' : ''}>
                            <td className="px-3 py-2 font-mono">{c.rollNumber}</td>
                            <td className="px-3 py-2 text-right font-medium">{c.contributedWeight.toFixed(2)} kg</td>
                            <td className="px-3 py-2 text-right text-slate-500">{c.totalWeight.toFixed(2)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-200 mt-4">
              <div>
                {selectedRoll.status === 'PICKED_UP' && (
                  <button type="button" onClick={() => { setReturnForm({ qty: Number(selectedRoll.weight), reason: '', condition: 'SCRAP', refundMethod: 'CREDIT_NOTE', date: today }); setShowReturnModal(true) }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                    Customer Return
                  </button>
                )}
              </div>
              <button type="button" onClick={() => { setShowDetailsModal(false); setSelectedRoll(null) }} className="px-4 py-2 border border-slate-300 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}

      {showReturnModal && selectedRoll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Customer Return</h2>
            <p className="text-sm text-slate-600 mb-4">Roll: {selectedRoll.rollNumber} ({Number(selectedRoll.weight).toFixed(2)} kg)</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <DateInput value={returnForm.date} onChange={e => setReturnForm({ ...returnForm, date: e.target.value })} max={today} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Return Qty (kg)</label>
                <input type="number" step="0.01" value={returnForm.qty} onChange={e => setReturnForm({ ...returnForm, qty: Math.min(Number(selectedRoll.weight), Math.max(0, Number(e.target.value))) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <select value={returnForm.reason} onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                  <option value="">Select reason...</option>
                  <option value="Defective">Defective</option>
                  <option value="Wrong spec">Wrong Spec</option>
                  <option value="Customer request">Customer Request</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Condition / Disposition</label>
                <select value={returnForm.condition} onChange={e => setReturnForm({ ...returnForm, condition: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                  <option value="SCRAP">Scrap (Dr 5300 / Cr 1300)</option>
                  <option value="RETURN_TO_SUPPLIER">Return to Supplier (Dr 2000 / Cr 1300)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Refund Method (info only)</label>
                <select value={returnForm.refundMethod} onChange={e => setReturnForm({ ...returnForm, refundMethod: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                  <option value="CREDIT_NOTE">Credit Note</option>
                  <option value="CASH_REFUND">Cash Refund</option>
                  <option value="NONE">No Refund</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button type="button" onClick={() => setShowReturnModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg" disabled={returnLoading}>Cancel</button>
              <button type="button" onClick={handleCustomerReturn} disabled={returnLoading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {returnLoading ? 'Processing...' : 'Submit Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Archive Old Pickups</h2>
            <p className="text-sm text-slate-600 mb-4">
              This will archive printed rolls that were picked up over 90 days ago. Archived rolls will be hidden from the main inventory list unless "Show archived" is checked.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowArchiveConfirm(false)} className="px-4 py-2 border border-slate-300 rounded-lg" disabled={archiveLoading}>Cancel</button>
              <button type="button" onClick={handleArchive} disabled={archiveLoading} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                {archiveLoading ? 'Archiving...' : 'Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CoresTab() {
  const [coreStock, setCoreStock] = useState<number>(0)
  const [coreMovements, setCoreMovements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await inventoryApi.getCoreStock()
        if (!res.error) {
          const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data
          if (data) {
            setCoreStock(data.stock || 0)
            setCoreMovements(data.movements || [])
          }
        }
      } catch (err) {
        console.error('Failed to load core stock:', err)
      }
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Core Stock</h3>
          <div className="text-right">
            <p className="text-xs text-slate-500">Total In Stock</p>
            <p className="text-3xl font-bold text-blue-600">{coreStock} <span className="text-lg font-normal text-slate-500">pcs</span></p>
          </div>
        </div>

        {coreMovements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[13%]" />
                <col className="w-[10%]" />
                <col className="w-[25%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date / Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Qty</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {coreMovements.slice(0, 20).map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-600">{new Date(m.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {m.type === 'IN' ? 'In' : 'Out'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium tabular-nums ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.type === 'IN' ? '+' : '-'}{m.quantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{m.reference || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{m.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">No core movements recorded yet</p>
        )}
      </div>
    </div>
  )
}

function PackingBagsTab({ onAdjust }: { onAdjust?: (m: MaterialWithStock) => void }) {
  const [packagingMaterials, setPackagingMaterials] = useState<MaterialWithStock[]>([])
  const [packingBagMovements, setPackingBagMovements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const [materialsRes, packingRes] = await Promise.all([
          inventoryApi.getMaterials(),
          inventoryApi.getPackingBagStock(60)
        ])

        if (!materialsRes.error) {
          const data = Array.isArray(materialsRes.data) ? materialsRes.data : (materialsRes.data as any)?.data
          if (data) {
            setPackagingMaterials(data.filter((m: any) => m.category === 'PACKAGING' && m.subCategory !== 'CORE'))
          }
        }

        if (!packingRes.error) {
          const data = Array.isArray(packingRes.data) ? packingRes.data : (packingRes.data as any)?.data
          if (data) {
            setPackingBagMovements(data.movements || [])
          }
        }
      } catch (err) {
        console.error('Failed to load packing bag data:', err)
      }
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Packing Bags</h3>

        {packagingMaterials.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {packagingMaterials.map(m => (
              <div key={m.id} className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 truncate">{m.name}</p>
                <p className="text-2xl font-bold text-slate-900">{m.totalStock || 0}</p>
                <p className="text-xs text-slate-400">{m.unitOfMeasure || 'pcs'}</p>
                {onAdjust && (
                  <button onClick={() => onAdjust(m)} className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Adjust
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4 mb-4">No packing bag materials configured</p>
        )}

        {packingBagMovements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[22%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date / Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Material</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Qty</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {packingBagMovements.slice(0, 20).map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-600">{new Date(m.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{m.material?.name || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {m.type === 'IN' ? 'Purchase' : 'Sale'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium tabular-nums ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.type === 'IN' ? '+' : '-'}{m.quantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{m.reference || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">No packing bag movements in the last 60 days</p>
        )}
      </div>
    </div>
  )
}
