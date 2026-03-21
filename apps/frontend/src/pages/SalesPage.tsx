import { useState, useEffect, useMemo } from 'react'
import { salesApi, Customer, Order, OrderStatus } from '../api/sales'
import { transactionApi, TransactionInput } from '../api/transactions'
import { pricingApi } from '../api/pricing'
import { settingsApi } from '../api/settings'
import { Layout } from '../components/Layout'

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-800',
  CONFIRMED: 'bg-yellow-100 text-yellow-800',
  IN_PRODUCTION: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800'
}

type SalesTab = 'transactions' | 'orders'

const ROLL_WEIGHT_KG = 15

export function SalesPage() {
  const [activeTab, setActiveTab] = useState<SalesTab>('transactions')
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [rollTypes, setRollTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null)
  const [availableRolls, setAvailableRolls] = useState<any[]>([])
  const [materialPrices, setMaterialPrices] = useState<Record<string, number>>({})

  const [orderForm, setOrderForm] = useState({
    customerId: '',
    dueDate: '',
    materialTypeId: '',
    materialCategory: '',
    quantityType: 'rolls' as 'rolls' | 'kg',
    quantity: 0,
    unitPrice: 0,
    notes: ''
  })

  const [transactionForm, setTransactionForm] = useState({
    customerId: '',
    type: 'PICKUP' as 'PICKUP' | 'PAYMENT' | 'CORE_DEPOSIT',
    amount: 0,
    notes: '',
    selectedRollIds: [] as string[],
    coreQuantity: 0,
    corePricePerUnit: 150,
    packingBags: 0,
    packingBagPrice: 50,
    amountPaid: 0
  })

  const [filters, setFilters] = useState({
    customerId: '',
    type: '',
    dateFrom: '',
    dateTo: ''
  })

  useEffect(() => {
    loadData()
    loadSettings()
  }, [activeTab])

  const loadSettings = async () => {
    try {
      const res = await settingsApi.getConsumptionRates()
      const data = res.data || (res as any)?.data
      if (data && data.coreDepositValue) {
        setTransactionForm(prev => ({ ...prev, corePricePerUnit: Number(data.coreDepositValue) }))
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const loadPackingBagPrice = () => {
    pricingApi.getMaterialsWithPrices().then(res => {
      const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      const pbag = data.find((m: any) => m.code === 'PBAG')
      if (pbag && pbag.pricePerPack) {
        setTransactionForm(prev => ({ ...prev, packingBagPrice: Number(pbag.pricePerPack) }))
      }
    }).catch(err => console.error('Failed to load packing bag price:', err))
  }

  useEffect(() => {
    if (Object.keys(materialPrices).length === 0) {
      pricingApi.getMaterialsWithPrices().then(res => {
        const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
        const priceMap: Record<string, number> = {}
        // Include all materials, not just those with prices
        data.forEach((m: any) => {
          priceMap[m.name] = m.pricePerKg || 0
        })
        console.log('All materials loaded for pricing:', Object.keys(priceMap))
        setMaterialPrices(priceMap)
      }).catch(err => console.error('Failed to load prices:', err))
    }
  }, [])

  useEffect(() => {
    if (showOrderModal && rollTypes.length === 0) {
      pricingApi.getMaterialsWithPrices().then(res => {
        const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
        setRollTypes(data.filter((m: any) => m.category === 'PLAIN_ROLLS'))
      })
    }
  }, [showOrderModal])

  useEffect(() => {
    if (showTransactionModal) {
      if (customers.length === 0) {
        salesApi.getCustomers().then(res => {
          const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
          setCustomers(data)
        })
      }
      if (Object.keys(materialPrices).length === 0) {
        pricingApi.getMaterialsWithPrices().then(res => {
          const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
          const priceMap: Record<string, number> = {}
          data.forEach((m: any) => {
            priceMap[m.name] = m.pricePerKg || 0
          })
          setMaterialPrices(priceMap)
        })
      }
      loadPackingBagPrice()
    }
  }, [showTransactionModal])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      if (activeTab === 'transactions') {
        const res = await transactionApi.getTransactions()
        setTransactions(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
      } else if (activeTab === 'orders') {
        const [ordersRes, customersRes, rollTypesRes] = await Promise.all([
          salesApi.getOrders(),
          salesApi.getCustomers(),
          pricingApi.getMaterialsWithPrices()
        ])
        setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data as any)?.data || [])
        setCustomers(Array.isArray(customersRes.data) ? customersRes.data : (customersRes.data as any)?.data || [])
        setRollTypes((Array.isArray(rollTypesRes.data) ? rollTypesRes.data : (rollTypesRes.data as any)?.data || []).filter((m: any) => m.category === 'PLAIN_ROLLS'))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    }
    setLoading(false)
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    console.log('Create Order clicked, form data:', orderForm)

    if (!orderForm.customerId) {
      setError('Customer is required')
      return
    }
    if (!orderForm.materialTypeId) {
      setError('Material type is required')
      return
    }
    if (!orderForm.quantity || orderForm.quantity <= 0) {
      setError('Quantity is required')
      return
    }

    const quantityKg = orderForm.quantityType === 'rolls' 
      ? orderForm.quantity * ROLL_WEIGHT_KG 
      : orderForm.quantity

    const res = await salesApi.createOrder({
      customerId: orderForm.customerId,
      dueDate: orderForm.dueDate || undefined,
      notes: orderForm.notes || undefined,
      items: [{
        description: orderForm.materialTypeId,
        quantity: Math.round(quantityKg),
        unitPrice: orderForm.unitPrice || 0
      }]
    })
    console.log('Create order response:', res)
    if (res.error) {
      setError(res.error.message)
      return
    }
    setShowOrderModal(false)
    setOrderForm({ customerId: '', dueDate: '', materialTypeId: '', materialCategory: '', quantityType: 'rolls', quantity: 0, unitPrice: 0, notes: '' })
    loadData()
  }

  const handleCustomerChange = async (customerId: string) => {
    setTransactionForm({ ...transactionForm, customerId, selectedRollIds: [] })
    if (customerId) {
      const res = await transactionApi.getAvailableRolls(customerId)
      setAvailableRolls(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
    } else {
      setAvailableRolls([])
    }
  }

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    console.log('Create transaction called:', transactionForm)

    if (!transactionForm.customerId) {
      setError('Customer is required')
      return
    }

    const input: TransactionInput = {
      customerId: transactionForm.customerId,
      type: transactionForm.type,
      notes: transactionForm.notes || undefined
    }

    if (transactionForm.type === 'PICKUP') {
      if (transactionForm.selectedRollIds.length === 0) {
        setError('Select at least one roll for pickup')
        return
      }
      input.printedRollIds = transactionForm.selectedRollIds
      input.packingBags = transactionForm.packingBags || undefined
      input.amountPaid = transactionForm.amountPaid || undefined
    } else if (transactionForm.type === 'PAYMENT') {
      if (!transactionForm.amount || transactionForm.amount <= 0) {
        setError('Amount is required for payment')
        return
      }
      input.amount = transactionForm.amount
    } else if (transactionForm.type === 'CORE_DEPOSIT') {
      if (transactionForm.coreQuantity <= 0) {
        setError('Core quantity is required')
        return
      }
      input.amount = transactionForm.coreQuantity * transactionForm.corePricePerUnit
    }

    console.log('Creating transaction with input:', input)
    const res = await transactionApi.createTransaction(input)
    console.log('Transaction response:', res)
    if (res.error) {
      setError(res.error.message)
      return
    }
    setShowTransactionModal(false)
    setTransactionForm({ customerId: '', type: 'PICKUP', amount: 0, notes: '', selectedRollIds: [], coreQuantity: 0, corePricePerUnit: 150, packingBags: 0, packingBagPrice: 50, amountPaid: 0 })
    setAvailableRolls([])
    loadData()
  }

  const toggleRollSelection = (rollId: string) => {
    const current = transactionForm.selectedRollIds
    const newSelection = current.includes(rollId)
      ? current.filter(id => id !== rollId)
      : [...current, rollId]
    setTransactionForm({ ...transactionForm, selectedRollIds: newSelection })
  }

  const calculateOrderTotal = () => {
    if (!orderForm.quantity || !orderForm.unitPrice) return 0
    
    // For PLAIN_ROLLS: quantity in rolls * 15kg * pricePerKg, or quantity in kg * pricePerKg
    // For PACKAGING: quantity (bundles) * pricePerBundle
    if (orderForm.materialCategory === 'PACKAGING') {
      return orderForm.quantity * orderForm.unitPrice
    }
    // For rolls: convert to kg then multiply by price
    const weightKg = orderForm.quantityType === 'rolls' 
      ? orderForm.quantity * ROLL_WEIGHT_KG 
      : orderForm.quantity
    return weightKg * orderForm.unitPrice
  }

  const selectedRollsTotal = useMemo(() => {
    return availableRolls
      .filter(r => transactionForm.selectedRollIds.includes(r.id))
      .reduce((sum, r) => sum + (r.weightUsed || 0), 0)
  }, [availableRolls, transactionForm.selectedRollIds])

  const selectedRollsValue = useMemo(() => {
    const value = availableRolls
      .filter(r => transactionForm.selectedRollIds.includes(r.id))
      .reduce((sum, r) => {
        const rollMaterialName = (r.materialName || '').trim().toLowerCase()
        let pricePerKg = 0
        for (const [matName, price] of Object.entries(materialPrices)) {
          if ((matName || '').trim().toLowerCase() === rollMaterialName) {
            pricePerKg = price
            break
          }
        }
        return sum + (r.weightUsed || 0) * pricePerKg
      }, 0)
    return value
  }, [availableRolls, transactionForm.selectedRollIds, materialPrices])

  const totalTransactionValue = useMemo(() => {
    return selectedRollsValue + (transactionForm.packingBags * transactionForm.packingBagPrice)
  }, [selectedRollsValue, transactionForm.packingBags, transactionForm.packingBagPrice])

  const filteredTransactions = useMemo(() => {
    let result = [...transactions]
    if (filters.customerId) {
      result = result.filter(t => t.customerId === filters.customerId)
    }
    if (filters.type) {
      result = result.filter(t => t.type === filters.type)
    }
    if (filters.dateFrom) {
      result = result.filter(t => new Date(t.date) >= new Date(filters.dateFrom))
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo)
      to.setHours(23, 59, 59)
      result = result.filter(t => new Date(t.date) <= to)
    }
    return result
  }, [transactions, filters])

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
            <p className="text-slate-500 mt-1">Manage transactions and orders</p>
          </div>
          <div className="flex space-x-3">
            {activeTab === 'transactions' && (
              <button onClick={() => setShowTransactionModal(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                New Transaction
              </button>
            )}
            <button onClick={() => setActiveTab('transactions')} className={`px-4 py-2 rounded-lg ${activeTab === 'transactions' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              Transactions
            </button>
            <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded-lg ${activeTab === 'orders' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              Orders
            </button>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>}

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : activeTab === 'transactions' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex gap-4 flex-wrap">
                <select
                  value={filters.customerId}
                  onChange={e => setFilters({ ...filters, customerId: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">All Customers</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                  value={filters.type}
                  onChange={e => setFilters({ ...filters, type: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">All Types</option>
                  <option value="PICKUP">Pickup</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="CORE_DEPOSIT">Core Deposit</option>
                </select>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="From Date"
                />
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="To Date"
                />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Weight</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Bags</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">No transactions found</td>
                    </tr>
                  ) : (
                    filteredTransactions.map(t => (
                      <tr 
                        key={t.id} 
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => setSelectedTransaction(t)}
                      >
                        <td className="px-6 py-4 text-sm text-slate-600">{new Date(t.date || t.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{t.customer?.name || '-'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            t.type === 'PICKUP' ? 'bg-blue-100 text-blue-800' :
                            t.type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {t.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 text-right">
                          {t.printedRollDetails && t.printedRollDetails.length > 0
                            ? `${t.printedRollDetails.reduce((sum: number, r: any) => sum + r.weightUsed, 0)}kg`
                            : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 text-right">
                          {t.packingBags > 0 ? t.packingBags : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-900 text-right">
                          {t.type === 'PICKUP' && t.amountPaid 
                            ? `₦${Number(t.amountPaid).toLocaleString()}` 
                            : t.amount 
                              ? `₦${Number(t.amount).toLocaleString()}` 
                              : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{t.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="font-semibold">Orders</h2>
              <button onClick={() => setShowOrderModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                New Order
              </button>
            </div>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Order #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{o.orderNumber}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{o.customer?.name || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.status]}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">₦{Number(o.totalAmount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Transaction Modal */}
        {showTransactionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">New Transaction</h2>
              <form onSubmit={handleCreateTransaction} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                  <select
                    value={transactionForm.customerId}
                    onChange={e => handleCustomerChange(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  >
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Transaction Type</label>
                  <select
                    value={transactionForm.type}
                    onChange={e => setTransactionForm({...transactionForm, type: e.target.value as any, selectedRollIds: [], amount: 0, coreQuantity: 0})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="PICKUP">Roll Pickup</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="CORE_DEPOSIT">Core Deposit</option>
                  </select>
                </div>

                {transactionForm.type === 'PICKUP' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Rolls (FIFO - Oldest First)</label>
                    {availableRolls.length === 0 ? (
                      <p className="text-sm text-slate-500 p-2">No rolls available for this customer</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                        {availableRolls.map((roll: any) => (
                          <label key={roll.id} className="flex items-center space-x-2 text-sm p-2 hover:bg-slate-50 rounded">
                            <input
                              type="checkbox"
                              checked={transactionForm.selectedRollIds.includes(roll.id)}
                              onChange={() => toggleRollSelection(roll.id)}
                              className="rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-slate-600">
                              {roll.jobNumber} - {roll.rollNumber} - {roll.materialName} ({roll.weightUsed}kg) - {new Date(roll.createdAt).toLocaleDateString()}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    {transactionForm.selectedRollIds.length > 0 && (
                      <p className="text-sm text-blue-600 mt-1">{transactionForm.selectedRollIds.length} roll(s) selected</p>
                    )}

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Packing Bags (Qty)</label>
                        <input
                          type="number"
                          min="0"
                          value={transactionForm.packingBags}
                          onChange={e => setTransactionForm({...transactionForm, packingBags: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Price per Bag (₦)</label>
                        <input
                          type="number"
                          min="0"
                          value={transactionForm.packingBagPrice}
                          onChange={e => setTransactionForm({...transactionForm, packingBagPrice: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                          placeholder="50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Amount Paid (₦)</label>
                        <input
                          type="number"
                          min="0"
                          value={transactionForm.amountPaid}
                          onChange={e => setTransactionForm({...transactionForm, amountPaid: parseFloat(e.target.value) || 0})}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {transactionForm.selectedRollIds.length > 0 && (
                      <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Total Rolls:</span>
                          <span className="font-medium">{transactionForm.selectedRollIds.length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Total Weight:</span>
                          <span className="font-medium">{selectedRollsTotal} kg</span>
                        </div>
                        {transactionForm.packingBags > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Packing Bags ({transactionForm.packingBags} x ₦{transactionForm.packingBagPrice}):</span>
                            <span className="font-medium">₦{(transactionForm.packingBags * transactionForm.packingBagPrice).toLocaleString()}</span>
                          </div>
                        )}
                        {transactionForm.amountPaid > 0 && (
                          <div className="flex justify-between text-sm mt-2 pt-2 border-t border-slate-200">
                            <span className="text-slate-700 font-medium">Amount Paid:</span>
                            <span className="font-bold text-green-600">₦{transactionForm.amountPaid.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm mt-2 pt-2 border-t border-slate-200">
                          <span className="text-slate-700 font-medium">Total Value:</span>
                          <span className={`font-bold ${totalTransactionValue > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                            {totalTransactionValue > 0 ? `₦${totalTransactionValue.toLocaleString()}` : '₦0'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {transactionForm.type === 'PAYMENT' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦)</label>
                    <input
                      type="number"
                      value={transactionForm.amount}
                      onChange={e => setTransactionForm({...transactionForm, amount: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      min="1"
                      required
                    />
                  </div>
                )}

                {transactionForm.type === 'CORE_DEPOSIT' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Core Quantity</label>
                      <input
                        type="number"
                        value={transactionForm.coreQuantity}
                        onChange={e => setTransactionForm({...transactionForm, coreQuantity: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        min="1"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Price per Core (₦)</label>
                      <input
                        type="number"
                        value={transactionForm.corePricePerUnit}
                        onChange={e => setTransactionForm({...transactionForm, corePricePerUnit: parseFloat(e.target.value) || 0})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        min="1"
                      />
                    </div>
                    {transactionForm.coreQuantity > 0 && (
                      <p className="text-sm font-medium text-slate-700">Total: ₦{(transactionForm.coreQuantity * transactionForm.corePricePerUnit).toLocaleString()}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={transactionForm.notes}
                    onChange={e => setTransactionForm({...transactionForm, notes: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowTransactionModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg">Create Transaction</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Order Modal */}
        {showOrderModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">New Order</h2>
              <form onSubmit={handleCreateOrder} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                  <select value={orderForm.customerId} onChange={e => setOrderForm({...orderForm, customerId: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required>
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                  <input type="date" value={orderForm.dueDate} onChange={e => setOrderForm({...orderForm, dueDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Material Type <span className="text-red-500">*</span></label>
                  <select 
                    value={orderForm.materialTypeId} 
                    onChange={e => {
                      const selected = rollTypes.find(m => m.name === e.target.value)
                      let unitPrice = 0
                      if (selected) {
                    // Auto-populate price: pricePerKg for rolls, pricePerPack for packaging
                        if (selected.category === 'PACKAGING') {
                          unitPrice = selected.pricePerPack || 0
                        } else {
                          unitPrice = selected.pricePerKg || 0
                        }
                      }
                      setOrderForm({
                        ...orderForm, 
                        materialTypeId: e.target.value,
                        materialCategory: selected?.category || '',
                        unitPrice,
                        quantity: 0
                      })
                    }} 
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg" 
                    required
                  >
                    <option value="">Select material type</option>
                    {rollTypes.map(m => (
                      <option key={m.id} value={m.name}>
                        {m.name} {m.subCategory ? `(${m.subCategory})` : ''} - {m.code} {m.pricePerKg ? `(₦${m.pricePerKg}/kg)` : m.pricePerPack ? `(₦${m.pricePerPack}/pack)` : '(No price)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOrderForm({...orderForm, quantityType: 'rolls'})}
                        className={`px-3 py-2 text-sm ${orderForm.quantityType === 'rolls' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        Rolls
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderForm({...orderForm, quantityType: 'kg'})}
                        className={`px-3 py-2 text-sm ${orderForm.quantityType === 'kg' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        kg
                      </button>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={orderForm.quantity || ''}
                      onChange={e => setOrderForm({...orderForm, quantity: parseInt(e.target.value) || 0})}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg"
                      placeholder={orderForm.quantityType === 'rolls' ? 'Number of rolls' : 'Weight in kg'}
                      required
                    />
                  </div>
                  {orderForm.quantity > 0 && (
                    <p className="text-sm text-slate-500 mt-1">
                      = {orderForm.quantityType === 'rolls' 
                        ? `${orderForm.quantity} rolls ≈ ${orderForm.quantity * ROLL_WEIGHT_KG} kg`
                        : `${orderForm.quantity} kg ≈ ${Math.ceil(orderForm.quantity / ROLL_WEIGHT_KG)} rolls`
                      }
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Unit Price (₦) 
                    <span className="text-slate-400 text-xs ml-1">(auto-populated, can adjust)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={orderForm.unitPrice || ''}
                    onChange={e => setOrderForm({...orderForm, unitPrice: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    placeholder="Price per kg or per bundle"
                  />
                  {orderForm.quantity > 0 && orderForm.unitPrice > 0 && (
                    <p className="text-sm font-medium text-green-600 mt-1">
                      Total: ₦{calculateOrderTotal().toLocaleString()}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={2} />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setShowOrderModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create Order</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Transaction Details Modal */}
        {selectedTransaction && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedTransaction(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Transaction Details</h2>
                <button onClick={() => setSelectedTransaction(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Date</p>
                    <p className="text-sm font-medium">{new Date(selectedTransaction.date || selectedTransaction.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Type</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      selectedTransaction.type === 'PICKUP' ? 'bg-blue-100 text-blue-800' :
                      selectedTransaction.type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {selectedTransaction.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                
                <div>
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="text-sm font-medium">{selectedTransaction.customer?.name || '-'}</p>
                </div>

                {selectedTransaction.type === 'PICKUP' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Rolls Picked</p>
                        <p className="text-sm font-medium">{selectedTransaction.printedRollIds?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Packing Bags</p>
                        <p className="text-sm font-medium">{selectedTransaction.packingBags || 0}</p>
                      </div>
                    </div>
                    
                    {selectedTransaction.printedRollDetails && selectedTransaction.printedRollDetails.length > 0 && (
                      <>
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Roll Details</p>
                          <div className="bg-slate-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500">
                                  <th className="text-left pb-1">Roll #</th>
                                  <th className="text-left pb-1">Material</th>
                                  <th className="text-right pb-1">Weight</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedTransaction.printedRollDetails.map((roll: any, idx: number) => (
                                  <tr key={idx} className="border-t border-slate-200">
                                    <td className="py-1">{roll.rollNumber}</td>
                                    <td className="py-1">{roll.materialName}</td>
                                    <td className="py-1 text-right">{roll.weightUsed}kg</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-slate-300 font-medium bg-slate-100">
                                  <td className="py-1" colSpan={2}>Total</td>
                                  <td className="py-1 text-right">{selectedTransaction.printedRollDetails.reduce((sum: number, r: any) => sum + r.weightUsed, 0)}kg</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                        
                        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-blue-900">Total Order Value</span>
                            <span className="text-lg font-bold text-blue-700">
                              ₦{((selectedTransaction.printedRollDetails.reduce((sum: number, r: any) => sum + r.weightUsed, 0) * 3000) + (selectedTransaction.packingBags * 50)).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-blue-600 mt-1">Includes rolls + packing bags</p>
                        </div>
                      </>
                    )}
                    
                    <div>
                      <p className="text-xs text-slate-500">Amount Paid</p>
                      <p className="text-sm font-bold text-green-600">₦{Number(selectedTransaction.amountPaid || 0).toLocaleString()}</p>
                    </div>
                  </>
                )}

                {selectedTransaction.type === 'PAYMENT' && (
                  <div>
                    <p className="text-xs text-slate-500">Amount</p>
                    <p className="text-sm font-bold text-green-600">₦{Number(selectedTransaction.amount || 0).toLocaleString()}</p>
                  </div>
                )}

                {selectedTransaction.type === 'CORE_DEPOSIT' && (
                  <div>
                    <p className="text-xs text-slate-500">Core Deposit Amount</p>
                    <p className="text-sm font-bold text-green-600">₦{Number(selectedTransaction.amount || 0).toLocaleString()}</p>
                  </div>
                )}

                {selectedTransaction.notes && (
                  <div>
                    <p className="text-xs text-slate-500">Notes</p>
                    <p className="text-sm text-slate-600">{selectedTransaction.notes}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200">
                <button onClick={() => setSelectedTransaction(null)} className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
