import { useState, useEffect } from 'react'
import { settingsApi, ConsumptionRates } from '../api/settings'
import { pricingApi, MaterialWithPrice } from '../api/pricing'
import { inventoryApi, MaterialCategory } from '../api/inventory'
import { Layout } from '../components/Layout'

type SettingsTab = 'consumption' | 'core-deposits' | 'products'

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('products')
  const [rates, setRates] = useState<ConsumptionRates>({
    coreWeight: 0.7,
    inkConsumptionRate: 0.7,
    ipaConsumptionRate: 0.1,
    butanolConsumptionRate: 0.1,
    coreDepositValue: 150
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Products & Pricing state
  const [materials, setMaterials] = useState<MaterialWithPrice[]>([])
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithPrice | null>(null)

  const [materialForm, setMaterialForm] = useState({
    name: '',
    code: '',
    category: 'PLAIN_ROLLS' as MaterialCategory,
    subCategory: '',
    costPrice: 0,
    packSize: 1
  })

  const [priceForm, setPriceForm] = useState({
    costPrice: 0,
    pricePerKg: 0,
    pricePerPack: 0
  })

  useEffect(() => {
    loadSettings()
    loadMaterials()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await settingsApi.getConsumptionRates()
      const data = res.data || (res as any)?.data
      if (!res.error && data) {
        setRates({
          coreWeight: data.coreWeight ?? 0.7,
          inkConsumptionRate: data.inkConsumptionRate ?? 0.7,
          ipaConsumptionRate: data.ipaConsumptionRate ?? 0.1,
          butanolConsumptionRate: data.butanolConsumptionRate ?? 0.1,
          coreDepositValue: data.coreDepositValue ?? 150
        })
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMaterials = async () => {
    try {
      const res = await pricingApi.getMaterialsWithPrices()
      const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      setMaterials(data)
    } catch (err: any) {
      console.error('Failed to load materials:', err)
    }
  }

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    console.log('Saving rates:', rates)

    const res = await settingsApi.updateConsumptionRates(rates)
    console.log('Save response:', res)
    
    if (res.error) {
      setError(res.error.message)
    } else {
      setSuccess('Settings saved successfully')
      setTimeout(() => setSuccess(''), 3000)
      // Reload to confirm saved values
      await loadSettings()
    }
    setSaving(false)
  }

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await inventoryApi.createMaterial({
        name: materialForm.name,
        code: materialForm.code,
        category: materialForm.category,
        subCategory: materialForm.subCategory || undefined,
        costPrice: materialForm.costPrice || undefined,
        packSize: materialForm.packSize || 1,
        unitOfMeasure: materialForm.category === 'PACKAGING' ? 'bundle' : 'pcs',
        minStock: 0
      })
      
      if (res.error) {
        setError(res.error.message)
      } else {
        setShowMaterialModal(false)
        setMaterialForm({ name: '', code: '', category: 'PLAIN_ROLLS', subCategory: '', costPrice: 0, packSize: 1 })
        loadMaterials()
        setSuccess('Material created successfully')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      // Save cost price using inventoryApi
      await inventoryApi.updateMaterial(selectedMaterial!.id, {
        costPrice: priceForm.costPrice || undefined
      })

      // Save selling prices using pricingApi
      if (selectedMaterial?.priceListId) {
        await pricingApi.updatePriceList(selectedMaterial.priceListId, {
          pricePerKg: priceForm.pricePerKg || undefined,
          pricePerPack: priceForm.pricePerPack || undefined
        })
      } else {
        await pricingApi.createPriceList({
          materialId: selectedMaterial!.id,
          pricePerKg: priceForm.pricePerKg || undefined,
          pricePerPack: priceForm.pricePerPack || undefined
        })
      }
      
      setShowPriceModal(false)
      loadMaterials()
      setSuccess('Prices updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  const openPriceModal = (material: MaterialWithPrice) => {
    setSelectedMaterial(material)
    setPriceForm({
      costPrice: material.costPrice || 0,
      pricePerKg: material.pricePerKg || 0,
      pricePerPack: material.pricePerPack || 0
    })
    setShowPriceModal(true)
  }

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">Configure system settings, products and pricing</p>
        </div>

        <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'products' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Products & Pricing
          </button>
          <button
            onClick={() => setActiveTab('consumption')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'consumption' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Consumption Rates
          </button>
          <button
            onClick={() => setActiveTab('core-deposits')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'core-deposits' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Core Deposits
          </button>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>}
        {success && <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-600">{success}</div>}

        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Materials & Prices</h2>
              <button
                onClick={() => setShowMaterialModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Material
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Cost Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Selling Price (/kg)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Selling Price (bundle)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {materials.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{m.code}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{m.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          m.category === 'PLAIN_ROLLS' ? 'bg-blue-100 text-blue-800' :
                          m.category === 'PACKAGING' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {m.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-right">
                        {m.costPrice ? `₦${m.costPrice.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-right">
                        {m.pricePerKg ? `₦${m.pricePerKg.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-right">
                        {m.pricePerPack ? `₦${m.pricePerPack.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openPriceModal(m)}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          {m.pricePerKg || m.pricePerPack ? 'Update Price' : 'Set Price'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {materials.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No materials found. Click "Add Material" to create one.
                      </td>
                    </tr>
                  )}
                  </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'consumption' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Consumption Rates</h2>
            <p className="text-sm text-slate-500 mb-6">
              These rates are used to calculate ink and solvent consumption when completing production jobs.
            </p>

            <form onSubmit={handleSaveRates} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Core Weight (kg per plastic core)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rates.coreWeight}
                  onChange={e => setRates({ ...rates, coreWeight: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">Weight of each plastic core (default: 0.7 kg)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Ink Consumption Rate (kg per kg of printed roll)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rates.inkConsumptionRate}
                  onChange={e => setRates({ ...rates, inkConsumptionRate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">Default: 0.7 kg</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  IPA Consumption Rate (L per kg of printed roll)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rates.ipaConsumptionRate}
                  onChange={e => setRates({ ...rates, ipaConsumptionRate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">Default: 0.1 L</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Butanol Consumption Rate (L per kg of printed roll)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rates.butanolConsumptionRate}
                  onChange={e => setRates({ ...rates, butanolConsumptionRate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">Default: 0.1 L</p>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'core-deposits' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Core Deposits</h2>
            <p className="text-sm text-slate-500 mb-6">
              Default deposit value charged for cores when customers pick up their printed rolls.
            </p>

            <form onSubmit={handleSaveRates} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Core Deposit Value (₦ per core)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={rates.coreDepositValue}
                  onChange={e => setRates({ ...rates, coreDepositValue: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">Default: ₦150 per core</p>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Add Material Modal */}
        {showMaterialModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Add Material</h2>
              <form onSubmit={handleSaveMaterial} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={materialForm.name}
                    onChange={e => setMaterialForm({...materialForm, name: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Code <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={materialForm.code}
                    onChange={e => setMaterialForm({...materialForm, code: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category <span className="text-red-500">*</span></label>
                  <select
                    value={materialForm.category}
                    onChange={e => setMaterialForm({...materialForm, category: e.target.value as MaterialCategory})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  >
                    <option value="PLAIN_ROLLS">Plain Rolls</option>
                    <option value="INK_SOLVENTS">Ink & Solvents</option>
                    <option value="PACKAGING">Packaging</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sub Category</label>
                  <input
                    type="text"
                    value={materialForm.subCategory}
                    onChange={e => setMaterialForm({...materialForm, subCategory: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="e.g., 25microns, Premium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₦)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={materialForm.costPrice}
                    onChange={e => setMaterialForm({...materialForm, costPrice: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                {materialForm.category === 'PACKAGING' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Pack Size (pcs per bundle)</label>
                    <input
                      type="number"
                      min="1"
                      value={materialForm.packSize}
                      onChange={e => setMaterialForm({...materialForm, packSize: parseInt(e.target.value) || 1})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowMaterialModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{saving ? 'Saving...' : 'Add'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Price Modal */}
        {showPriceModal && selectedMaterial && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Set Prices - {selectedMaterial.name}</h2>
              <form onSubmit={handleSavePrice} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₦)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={priceForm.costPrice}
                    onChange={e => setPriceForm({...priceForm, costPrice: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  />
                  <p className="text-xs text-slate-500 mt-1">Your purchase cost for this material</p>
                </div>
                {selectedMaterial.category === 'PLAIN_ROLLS' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price per kg (₦)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={priceForm.pricePerKg}
                      onChange={e => setPriceForm({...priceForm, pricePerKg: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
                {selectedMaterial.category === 'PACKAGING' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price per pack (₦)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={priceForm.pricePerPack}
                      onChange={e => setPriceForm({...priceForm, pricePerPack: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowPriceModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{saving ? 'Saving...' : 'Save Prices'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
