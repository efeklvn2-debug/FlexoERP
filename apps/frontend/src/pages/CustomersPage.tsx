import { useState, useEffect } from 'react'
import { salesOrderApi, Customer } from '../api/salesOrders'
import { Layout } from '../components/Layout'

const INK_COLORS = ['Red', 'Yellow', 'White', 'RoyalBlue', 'VioletBlue', 'SkyBlue']

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

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
  }, [])

  const loadCustomers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await salesOrderApi.getCustomers()
      setCustomers(Array.isArray(res.data) ? res.data : (res.data as any)?.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load customers')
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) {
      setError('Name is required')
      return
    }

    if (form.colors.length === 0) {
      setError('Please select at least one ink color')
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
      setError(res.error.message)
      return
    }
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
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.code && c.code.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
            <p className="text-slate-500 mt-1">Manage customer information and ink color preferences</p>
          </div>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Add Customer
          </button>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200">
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No customers found</div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ink Colors</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{c.code}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{c.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{c.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{c.phone || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.colors?.map((color: string) => (
                          <span key={color} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                            {color}
                          </span>
                        )) || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => handleEdit(c)} className="text-blue-600 hover:text-blue-800 text-sm">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Customer Modal */}
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Ink Colors <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-3 gap-2">
                    {INK_COLORS.map(color => (
                      <label key={color} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.colors.includes(color)}
                          onChange={e => {
                            if (e.target.checked) {
                              setForm({...form, colors: [...form.colors, color]})
                            } else {
                              setForm({...form, colors: form.colors.filter(c => c !== color)})
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-600">{color.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </label>
                    ))}
                  </div>
                  {form.colors.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">Please select at least one color</p>
                  )}
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => { setShowModal(false); setEditingCustomer(null); setForm({ name: '', code: '', email: '', phone: '', address: '', colors: [] }) }} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editingCustomer ? 'Update' : 'Add'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
