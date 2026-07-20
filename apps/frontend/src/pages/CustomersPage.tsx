import { useState, useEffect } from 'react'
import { salesOrderApi, Customer, CustomerBalance } from '../api/salesOrders'
import { settingsApi } from '../api/settings'
import { Layout } from '../components/Layout'
import { useNotification } from '../contexts/NotificationContext'
import { hasPermission } from '../stores/authStore'

const DEFAULT_COLORS = ['RoyalBlue', 'VioletBlue', 'SkyBlue']

export function CustomersPage() {
  const notify = useNotification()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  const [customerBalances, setCustomerBalances] = useState<Record<string, CustomerBalance>>({})
  const [depositModalCustomer, setDepositModalCustomer] = useState<Customer | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositError, setDepositError] = useState('')
  const [showOutstandingOnly, setShowOutstandingOnly] = useState(false)
  const [showHasRollsOnly, setShowHasRollsOnly] = useState(false)

  const canAdjustDeposit = hasPermission('customer:payment')

  const [inkColors, setInkColors] = useState<any[]>([])
  const [form, setForm] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
    address: '',
    colors: [] as string[]
  })

  useEffect(() => {
    loadCustomers()
    loadBalances()
    loadInkColors()
  }, [])

  const loadInkColors = async () => {
    try {
      const res = await settingsApi.getInkColors()
      setInkColors(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
    } catch { /* ignore */ }
  }

  const loadBalances = async () => {
    try {
      const res = await salesOrderApi.getAllCustomerBalances()
      const balances: CustomerBalance[] = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      const map: Record<string, CustomerBalance> = {}
      for (const b of balances) {
        map[b.customerId] = b
      }
      setCustomerBalances(map)
    } catch { /* ignore */ }
  }

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const res = await salesOrderApi.getCustomers()
      setCustomers(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
    } catch (err: any) {
      notify.error(err.message || 'Failed to load customers')
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      notify.error('Name is required')
      return
    }

    if (form.colors.length === 0) {
      notify.error('Please select at least one ink color')
      return
    }

    let res
    if (editingCustomer) {
      res = await salesOrderApi.updateCustomer(editingCustomer.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        colors: form.colors
      })
    } else {
      const code = 'CUST-' + form.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8) + '-' + Date.now().toString(36).toUpperCase()
      res = await salesOrderApi.createCustomer({ 
        name: form.name,
        code,
        email: form.email,
        phone: form.phone,
        address: form.address,
        colors: form.colors,
        paymentType: 'CASH',
        creditLimit: 0,
        depositPercentDefault: 0,
        paymentTermsDays: 0,
        notifyEmail: true,
        notifyWhatsApp: true
      })
    }
    if (res.error) {
      notify.error(res.error.message)
      return
    }
    notify.success(editingCustomer ? 'Customer updated successfully' : 'Customer created successfully')
    setShowModal(false)
    setForm({ name: '', code: '', email: '', phone: '', address: '', colors: [] })
    setEditingCustomer(null)
    loadCustomers()
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      name: customer.name,
      code: customer.code || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      colors: customer.colors || []
    })
    setShowModal(true)
  }

  const filteredCustomers = customers.filter(c =>
    (c.name.toLowerCase().includes(search.toLowerCase()) ||
     (c.code && c.code.toLowerCase().includes(search.toLowerCase()))) &&
    (!showOutstandingOnly || (customerBalances[c.id]?.totalOutstanding || 0) > 0) &&
    (!showHasRollsOnly || (customerBalances[c.id]?.availableRollsCount || 0) > 0)
  )

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
            <p className="text-slate-500 mt-1">Manage customer information and ink color preferences</p>
          </div>
          <button onClick={() => { setForm({ name: '', code: '', email: '', phone: '', address: '', colors: [...DEFAULT_COLORS] }); setShowModal(true) }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Add Customer
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-slate-300 rounded-lg"
            />
            <button
              onClick={() => setShowOutstandingOnly(!showOutstandingOnly)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium border ${showOutstandingOnly ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              Outstanding only
            </button>
            <button
              onClick={() => setShowHasRollsOnly(!showHasRollsOnly)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium border ${showHasRollsOnly ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              Has Rolls
            </button>
            {(showOutstandingOnly || showHasRollsOnly || search) && (
              <button onClick={() => { setShowOutstandingOnly(false); setShowHasRollsOnly(false); setSearch('') }} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                Clear Filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No customers found</div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Rolls</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Outstanding</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Deposit</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Orders</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Activity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Colors</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <a href={`/customers/${c.id}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                        {c.name}
                      </a>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {customerBalances[c.id] !== undefined ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${(customerBalances[c.id] as any).availableRollsCount > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {(customerBalances[c.id] as any).availableRollsCount ?? 0}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-right">
                      {customerBalances[c.id] !== undefined ? (
                        <span className={customerBalances[c.id].totalOutstanding > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                          ₦{customerBalances[c.id].totalOutstanding.toLocaleString()}
                        </span>
                      ) : <span className="text-slate-400 text-xs">-</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-right text-blue-600 font-medium">
                      {customerBalances[c.id] !== undefined ? `₦${customerBalances[c.id].depositHeld.toLocaleString()}` : <span className="text-slate-400 text-xs">-</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-slate-600">{(customerBalances[c.id] as any)?.ordersCount ?? 0}</span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500">
                      {(customerBalances[c.id] as any)?.lastTransactionDate
                        ? new Date((customerBalances[c.id] as any).lastTransactionDate).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.colors?.map((color: string) => (
                          <span key={color} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                            {color}
                          </span>
                        )) || <span className="text-slate-400 text-xs">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button onClick={() => handleEdit(c)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add/Edit Customer Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({...form, phone: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => setForm({...form, address: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                {editingCustomer && canAdjustDeposit && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Deposit Balance</span>
                      <span className="text-lg font-bold text-blue-700">₦{(customerBalances[editingCustomer.id]?.depositHeld || 0).toLocaleString()}</span>
                    </div>
                    {!depositModalCustomer ? (
                      <button
                        type="button"
                        onClick={() => { setDepositModalCustomer(editingCustomer); setDepositAmount(''); setDepositError('') }}
                        className="w-full px-3 py-2 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100"
                        title="Admin/Manager only. Adjusts deposit balance via journal entry through Other Income — use for corrections, goodwill, or forfeitures only."
                      >
                        Credit Adjustment
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount (+/-)" className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                          <span className="text-xs text-slate-500 whitespace-nowrap">→ ₦{((customerBalances[editingCustomer.id]?.depositHeld || 0) + (parseFloat(depositAmount) || 0)).toLocaleString()}</span>
                        </div>
                        <div className="flex space-x-2">
                          <button type="button" onClick={async () => {
                            const amount = parseFloat(depositAmount)
                            if (isNaN(amount) || amount === 0) { setDepositError('Enter a non-zero amount'); return }
                            setDepositError('')
                            const res = await salesOrderApi.adjustDeposit(editingCustomer.id, amount)
                            if (res.error) { setDepositError(res.error.message); return }
                            notify.success('Deposit adjusted successfully')
                            setDepositModalCustomer(null)
                            setDepositAmount('')
                            loadBalances()
                          }} className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg">Apply</button>
                          <button type="button" onClick={() => { setDepositModalCustomer(null); setDepositError('') }} className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg">Cancel</button>
                        </div>
                        {depositError && <p className="text-xs text-red-500">{depositError}</p>}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Ink Colors <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-3 gap-2">
                    {inkColors.map(ic => (
                      <label key={ic.id} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.colors.includes(ic.name)}
                          onChange={e => {
                            if (e.target.checked) {
                              setForm({...form, colors: [...form.colors, ic.name]})
                            } else {
                              setForm({...form, colors: form.colors.filter((c: string) => c !== ic.name)})
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-600">{ic.name.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </label>
                    ))}
                  </div>
                  {form.colors.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">Please select at least one color</p>
                  )}
                </div>
                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                  <button type="button" onClick={() => { setShowModal(false); setEditingCustomer(null); setDepositModalCustomer(null); setDepositError(''); setForm({ name: '', code: '', email: '', phone: '', address: '', colors: [] }) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editingCustomer ? 'Update Customer' : 'Add Customer'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
