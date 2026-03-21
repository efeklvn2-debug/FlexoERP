import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { inventoryApi, MaterialWithStock, MaterialCategory, MovementType } from '../api/inventory'
import { procurementApi, Roll } from '../api/procurement'
import { productionApi, PrintedRollDisplay } from '../api/production'
import { Layout } from '../components/Layout'

type TabType = 'plain-rolls' | 'ink-solvents' | 'packaging' | 'printed-rolls'

export function InventoryPage() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as TabType | null
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'printed-rolls')
  const [materials, setMaterials] = useState<MaterialWithStock[]>([])
  const [rolls, setRolls] = useState<Roll[]>([])
  const [printedRolls, setPrintedRolls] = useState<PrintedRollDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    dateFrom: '',
    dateTo: '',
    combination: ''
  })
  const [printedRollSort, setPrintedRollSort] = useState<'createdAt' | 'weight' | 'rollNumber'>('createdAt')
  const [printedRollSortOrder, setPrintedRollSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      if (activeTab === 'plain-rolls') {
        const res = await procurementApi.getRolls()
        setRolls(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      } else if (activeTab === 'ink-solvents' || activeTab === 'packaging') {
        const res = await inventoryApi.getMaterials()
        setMaterials(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      } else if (activeTab === 'printed-rolls') {
        const res = await productionApi.getPrintedRolls({ status: 'IN_STOCK' })
        setPrintedRolls(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    }
    setLoading(false)
  }

  const plainRolls = rolls.filter(r => r.status !== 'CONSUMED')
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

  const packaging = materials.filter(m => m.category === 'PACKAGING')
  const filteredPackaging = useMemo(() => {
    let result = [...packaging]
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
  }, [packaging, materialsFilter, materialsSort, materialsSortOrder])

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
            <button onClick={() => setActiveTab('packaging')} className={`px-4 py-2 rounded-lg ${activeTab === 'packaging' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Packaging</button>
            <button onClick={() => setActiveTab('printed-rolls')} className={`px-4 py-2 rounded-lg ${activeTab === 'printed-rolls' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Printed Rolls</button>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>}
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
              />
            )}
            {activeTab === 'packaging' && (
              <MaterialsTab
                materials={filteredPackaging}
                filter={materialsFilter}
                setFilter={setMaterialsFilter}
                sort={materialsSort}
                setSort={setMaterialsSort}
                sortOrder={materialsSortOrder}
                setSortOrder={setMaterialsSortOrder}
                total={packaging.length}
                title="Packaging"
              />
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
              />
            )}
          </>
        )}
      </div>
    </Layout>
  )
}

function PlainRollsTab({ rolls, filter, setFilter, sort, setSort, sortOrder, setSortOrder, total }: {
  rolls: Roll[]
  filter: { search: string; status: string; materialSubCategory: string }
  setFilter: React.Dispatch<React.SetStateAction<{ search: string; status: string; materialSubCategory: string }>>
  sort: string
  setSort: React.Dispatch<React.SetStateAction<any>>
  sortOrder: 'asc' | 'desc'
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  total: number
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <input type="text" placeholder="Roll number..." value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              <option value="AVAILABLE">Available</option>
              <option value="IN_PRODUCTION">In Production</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Material</label>
            <select value={filter.materialSubCategory} onChange={e => setFilter({ ...filter, materialSubCategory: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              <option value="25microns">25 Microns</option>
              <option value="27microns">27 Microns</option>
              <option value="28microns">28 Microns</option>
              <option value="30microns">30 Microns</option>
              <option value="Premium">Premium</option>
              <option value="SuPremium">SuPremium</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => setFilter({ search: '', status: '', materialSubCategory: '' })} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">Clear</button>
            <span className="text-xs text-slate-500 ml-auto">{rolls.length} of {total} rolls</span>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{r.rollNumber}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{(r.material as any)?.subCategory || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{Number(r.weight).toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{Number(r.remainingWeight).toFixed(2)}</td>
                <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{r.status}</span></td>
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

function MaterialsTab({ materials, filter, setFilter, sort, setSort, sortOrder, setSortOrder, total, title }: {
  materials: MaterialWithStock[]
  filter: { search: string }
  setFilter: React.Dispatch<React.SetStateAction<{ search: string }>>
  sort: string
  setSort: React.Dispatch<React.SetStateAction<any>>
  sortOrder: 'asc' | 'desc'
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  total: number
  title: string
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
            <button onClick={() => setFilter({ search: '' })} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">Clear</button>
            <span className="text-xs text-slate-500 ml-auto">{materials.length} of {total} items</span>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Unit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
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
              </tr>
            ))}
            {materials.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No {title.toLowerCase()} found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PrintedRollsTab({ rolls, filter, setFilter, sort, setSort, sortOrder, setSortOrder, total }: {
  rolls: PrintedRollDisplay[]
  filter: { search: string; customer: string; material: string; dateFrom: string; dateTo: string; combination: string }
  setFilter: React.Dispatch<React.SetStateAction<{ search: string; customer: string; material: string; dateFrom: string; dateTo: string; combination: string }>>
  sort: string
  setSort: React.Dispatch<React.SetStateAction<any>>
  sortOrder: 'asc' | 'desc'
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  total: number
}) {
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
            <label className="block text-xs font-medium text-slate-500 mb-1">Material</label>
            <select value={filter.material} onChange={e => setFilter({ ...filter, material: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              <option value="25microns">25 Microns</option>
              <option value="27microns">27 Microns</option>
              <option value="28microns">28 Microns</option>
              <option value="30microns">30 Microns</option>
              <option value="Premium">Premium</option>
              <option value="SuPremium">SuPremium</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From Date</label>
            <input type="date" value={filter.dateFrom} onChange={e => setFilter({ ...filter, dateFrom: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
            <input type="date" value={filter.dateTo} onChange={e => setFilter({ ...filter, dateTo: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
            <select value={filter.combination} onChange={e => setFilter({ ...filter, combination: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="">All</option>
              <option value="combo">Combo Only</option>
              <option value="single">Single Only</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-200">
          <button onClick={() => setFilter({ search: '', customer: '', material: '', dateFrom: '', dateTo: '', combination: '' })} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">Clear Filters</button>
          <span className="text-xs text-slate-500 ml-auto">{rolls.length} of {total} rolls</span>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Roll #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Weight</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Film Wt</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Parent Roll</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Job #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rolls.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{r.rollNumber || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{Number(r.weight).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{(Number(r.weight) - 0.7).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{r.material || '-'}</td>
                <td className="px-4 py-3">
                  {r.isCombination ? (
                    <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">Combo</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">Single</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {r.parentRolls && r.parentRolls.length > 0 
                    ? r.parentRolls.join(', ') 
                    : '-'}
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
    </div>
  )
}
