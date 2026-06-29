import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { salesOrderApi, Customer, CustomerBalance, CustomerTransaction } from '../api/salesOrders'
import { Layout } from '../components/Layout'

const TRANSACTION_LABELS: Record<string, string> = {
  ORDER: 'Order',
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  CORE_BUYBACK: 'Core Buyback'
}

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  IN_PRODUCTION: 'bg-purple-100 text-purple-700',
  READY: 'bg-green-100 text-green-700',
  PICKED_UP: 'bg-teal-100 text-teal-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  PAID: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  DRAFT: 'bg-slate-100 text-slate-600',
  OVERDUE: 'bg-red-100 text-red-700',
  DEPOSIT: 'bg-blue-100 text-blue-700',
  PAYMENT: 'bg-green-100 text-green-700',
  CORE_BUYBACK: 'bg-orange-100 text-orange-700',
  REFUND: 'bg-red-100 text-red-700',
  DEPOSIT_APPLIED: 'bg-indigo-100 text-indigo-700'
}

function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_BADGES[status] || 'bg-slate-100 text-slate-600'
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${classes}`}>{status.replace(/_/g, ' ')}</span>
}

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [balance, setBalance] = useState<CustomerBalance | null>(null)
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState<string>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!customerId) return
    loadData()
  }, [customerId])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [custRes, balRes, txRes] = await Promise.all([
        salesOrderApi.getCustomer(customerId!),
        salesOrderApi.getCustomerBalance(customerId!),
        salesOrderApi.getCustomerTransactions(customerId!)
      ])
      setCustomer(Array.isArray(custRes.data) ? (custRes.data as any)[0] : (custRes.data as any)?.data || custRes.data as any)
      setBalance((balRes.data as any)?.data || balRes.data as any)
      setTransactions(Array.isArray(txRes.data) ? txRes.data : (txRes.data as any)?.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load customer data')
    }
    setLoading(false)
  }

  const filteredTransactions = transactions.filter(t => {
    if (filterType !== 'ALL' && t.type !== filterType) return false
    if (dateFrom && new Date(t.date) < new Date(dateFrom)) return false
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      if (new Date(t.date) > end) return false
    }
    return true
  })

  const totalRollsValue = balance?.availableRollsCount || 0
  const outstandingValue = balance?.totalOutstanding || 0
  const depositValue = balance?.depositHeld || 0
  const ordersCount = balance?.ordersCount || 0

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout>
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">{error}</div>
      </Layout>
    )
  }

  if (!customer) {
    return (
      <Layout>
        <div className="text-center py-12 text-slate-500">Customer not found</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/customers')} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-6 text-sm">
          {customer.email && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="text-slate-600">{customer.email}</span>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              <span className="text-slate-600">{customer.phone}</span>
            </div>
          )}
          {customer.colors && customer.colors.length > 0 && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
              <div className="flex gap-1">
                {customer.colors.map(color => (
                  <span key={color} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{color}</span>
                ))}
              </div>
            </div>
          )}
          {!customer.email && !customer.phone && (!customer.colors || customer.colors.length === 0) && (
            <span className="text-slate-400">No contact information</span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Available Rolls</p>
            <p className={`text-2xl font-bold mt-1 ${totalRollsValue > 0 ? 'text-green-600' : 'text-slate-400'}`}>{totalRollsValue}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Outstanding</p>
            <p className={`text-2xl font-bold mt-1 ${outstandingValue > 0 ? 'text-red-600' : 'text-green-600'}`}>
              ₦{outstandingValue.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Deposit Held</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">₦{depositValue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Orders</p>
            <p className="text-2xl font-bold mt-1 text-slate-700">{ordersCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Transaction History</span>
            <div className="flex gap-1 ml-4">
              {['ALL', 'ORDER', 'INVOICE', 'PAYMENT', 'CORE_BUYBACK'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium ${filterType === type ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {type === 'ALL' ? 'All' : TRANSACTION_LABELS[type] || type}
                </button>
              ))}
            </div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="ml-auto px-2 py-1 text-xs border border-slate-300 rounded-lg" />
            <span className="text-xs text-slate-400">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1 text-xs border border-slate-300 rounded-lg" />
            {(dateFrom || dateTo || filterType !== 'ALL') && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setFilterType('ALL') }} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                Clear
              </button>
            )}
            <span className="text-xs text-slate-400 ml-1">{filteredTransactions.length} transactions</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No transactions found</div>
            ) : (
              filteredTransactions.map(tx => (
                <div key={`${tx.type}-${tx.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                      ${tx.type === 'ORDER' ? 'bg-blue-100 text-blue-700' : ''}
                      ${tx.type === 'INVOICE' ? 'bg-purple-100 text-purple-700' : ''}
                      ${tx.type === 'PAYMENT' ? 'bg-green-100 text-green-700' : ''}
                      ${tx.type === 'CORE_BUYBACK' ? 'bg-orange-100 text-orange-700' : ''}
                    `}>
                      {tx.type === 'ORDER' ? 'O' : tx.type === 'INVOICE' ? 'I' : tx.type === 'PAYMENT' ? 'P' : 'C'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {tx.reference !== '-' ? tx.reference : ''}
                        <span className="text-slate-500 font-normal ml-1">{tx.description}</span>
                      </div>
                      <div className="text-xs text-slate-400">{new Date(tx.date).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">₦{tx.amount.toLocaleString()}</span>
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}