import { useState, useEffect } from 'react'
import { Layout } from '../components/Layout'
import { DateInput } from '../components/DateInput'
import { financeApi, Account, JournalEntry, AccountBalance, FinanceDashboard, VatSummary, ProfitSummary, DeferredCogsSummary } from '../api/finance'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

type TabType = 'dashboard' | 'accounts' | 'journal' | 'balances' | 'vat' | 'profit' | 'deferred-cogs' | 'expenses'

type ExpensePeriod = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'last-3-months' | ''

export function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<FinanceDashboard | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null)
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null)
  const [deferredCogs, setDeferredCogs] = useState<DeferredCogsSummary | null>(null)
  const [accountTypeFilter, setAccountTypeFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reversing, setReversing] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)

  const initDateFrom = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] }
  const initDateTo = () => new Date().toISOString().split('T')[0]
  const [journalDateFrom, setJournalDateFrom] = useState(initDateFrom)
  const [journalDateTo, setJournalDateTo] = useState(initDateTo)
  const [journalSourceModule, setJournalSourceModule] = useState('')

  const [expenses, setExpenses] = useState<JournalEntry[]>([])
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expensePeriod, setExpensePeriod] = useState<ExpensePeriod>('this-month')
  const [expenseDateFrom, setExpenseDateFrom] = useState('')
  const [expenseDateTo, setExpenseDateTo] = useState('')
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    accountId: '',
    amount: 0,
    description: '',
    paymentMethod: 'Cash' as 'Cash' | 'Bank Transfer',
    date: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    notes: ''
  })

  const userStr = localStorage.getItem('user')
  const user = userStr ? JSON.parse(userStr) : null
  const canReverse = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const loadDashboard = async () => {
    const res = await financeApi.getDashboard()
    if ((res.data as any)?.data) setDashboard((res.data as any).data)
    else setError(res.error?.message || 'Failed to load dashboard')
  }

  const loadAccounts = async () => {
    const res = await financeApi.getAccounts()
    if (res.data) setAccounts((res.data as any).data || [])
    else setError(res.error?.message || 'Failed to load accounts')
  }

  const loadJournal = async (dateFrom?: string, dateTo?: string, sourceModule?: string) => {
    const res = await financeApi.getJournalEntries({
      dateFrom: dateFrom || journalDateFrom || undefined,
      dateTo: dateTo || journalDateTo || undefined,
      sourceModule: sourceModule || journalSourceModule || undefined,
      limit: 1000
    })
    if (res.data) setJournalEntries((res.data as any).data || [])
    else setError(res.error?.message || 'Failed to load journal')
  }

  const loadBalances = async () => {
    const res = await financeApi.getAllBalances()
    if (res.data) setBalances((res.data as any).data || [])
    else setError(res.error?.message || 'Failed to load balances')
  }

  const loadVat = async () => {
    const res = await financeApi.getVatSummary()
    if ((res.data as any)?.data) setVatSummary((res.data as any).data)
    else setError(res.error?.message || 'Failed to load VAT')
  }

  const loadProfit = async () => {
    const res = await financeApi.getProfitSummary()
    if ((res.data as any)?.data) setProfitSummary((res.data as any).data as any)
    else setError(res.error?.message || 'Failed to load profit')
  }

  const loadDeferredCogs = async () => {
    const res = await financeApi.getDeferredCogsSummary()
    if ((res.data as any)?.data) setDeferredCogs((res.data as any).data)
    else setError(res.error?.message || 'Failed to load Deferred COGS')
  }

  const applyExpensePeriod = (period: ExpensePeriod) => {
    setExpensePeriod(period)
    const now = new Date()
    let from: Date, to: Date
    switch (period) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        to = new Date(from)
        to.setDate(to.getDate() + 1)
        break
      case 'yesterday':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'this-week':
        from = new Date(now)
        from.setDate(now.getDate() - now.getDay())
        from.setHours(0, 0, 0, 0)
        to = new Date()
        break
      case 'last-week':
        from = new Date(now)
        from.setDate(now.getDate() - now.getDay() - 7)
        to = new Date(from)
        to.setDate(to.getDate() + 7)
        break
      case 'this-month':
        from = new Date(now.getFullYear(), now.getMonth(), 1)
        to = new Date()
        break
      case 'last-month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
        break
      case 'last-3-months':
        from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
        to = new Date()
        break
      default:
        return
    }
    setExpenseDateFrom(from.toISOString().split('T')[0])
    setExpenseDateTo(to.toISOString().split('T')[0])
    loadExpenses(from.toISOString().split('T')[0], to.toISOString().split('T')[0])
  }

  const clearExpenseFilters = () => {
    setExpensePeriod('')
    setExpenseDateFrom('')
    setExpenseDateTo('')
    loadExpenses()
  }

  const loadExpenses = async (dateFrom?: string, dateTo?: string) => {
    const res = await financeApi.getJournalEntries({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sourceModule: 'EXPENSE'
    })
    if (res.data) setExpenses((res.data as any).data || [])
    else setError(res.error?.message || 'Failed to load expenses')
  }

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.accountId || expenseForm.amount <= 0 || !expenseForm.description) {
      setError('Account, amount, and description are required')
      return
    }
    setSavingExpense(true)
    setError(null)

    try {
      const allAccountsRes = await financeApi.getAccounts()
      const allAccounts = (allAccountsRes.data as any)?.data || []
      const cashAccountCode = expenseForm.paymentMethod === 'Bank Transfer' ? '1100' : '1000'
      const cashAccount = allAccounts.find((a: Account) => a.code === cashAccountCode)

      if (!cashAccount) {
        setError(`Account ${cashAccountCode} (Cash/Bank) not found`)
        setSavingExpense(false)
        return
      }

      const ref = expenseForm.referenceNumber || (() => {
        const now = new Date()
        const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
        const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
        return `EXP-${ymd}-${suffix}`
      })()

      const res = await financeApi.postJournalEntry({
        description: expenseForm.description,
        sourceModule: 'EXPENSE',
        reference: ref,
        date: expenseForm.date,
        lines: [
          { accountId: expenseForm.accountId, debit: expenseForm.amount, credit: 0, memo: expenseForm.notes || expenseForm.description },
          { accountId: cashAccount.id, debit: 0, credit: expenseForm.amount, memo: `Paid via ${expenseForm.paymentMethod}` }
        ]
      })

      if (res.data) {
        setShowExpenseModal(false)
        setExpenseForm({
          accountId: '',
          amount: 0,
          description: '',
          paymentMethod: 'Cash',
          date: new Date().toISOString().split('T')[0],
          referenceNumber: '',
          notes: ''
        })
        loadExpenses(expenseDateFrom || undefined, expenseDateTo || undefined)
      } else {
        setError(res.error?.message || 'Failed to record expense')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to record expense')
    }
    setSavingExpense(false)
  }

  const handleReverse = async (entryId: string, entryNumber: string) => {
    if (!window.confirm(`Reverse ${entryNumber}? This will create a new entry that nullifies the original.`)) return
    setReversing(entryId)
    const res = await financeApi.reverseJournalEntry(entryId)
    if (res.data) {
      await loadJournal(journalDateFrom || undefined, journalDateTo || undefined, journalSourceModule || undefined)
    } else {
      setError(res.error?.message || 'Failed to reverse journal entry')
    }
    setReversing(null)
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    
    const loaders: Record<TabType, () => Promise<void>> = {
      dashboard: loadDashboard,
      expenses: async () => {
        await Promise.all([
          loadExpenses(expenseDateFrom || undefined, expenseDateTo || undefined),
          loadAccounts()
        ])
      },
      accounts: loadAccounts,
      journal: loadJournal,
      balances: loadBalances,
      vat: loadVat,
      profit: loadProfit,
      'deferred-cogs': loadDeferredCogs
    }
    
    loaders[activeTab]().finally(() => setLoading(false))
  }, [activeTab])

  const accountTypeColors: Record<string, string> = {
    ASSET: 'bg-blue-100 text-blue-800',
    LIABILITY: 'bg-red-100 text-red-800',
    EQUITY: 'bg-purple-100 text-purple-800',
    REVENUE: 'bg-green-100 text-green-800',
    EXPENSE: 'bg-orange-100 text-orange-800',
    COGS: 'bg-yellow-100 text-yellow-800'
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'accounts', label: 'Chart of Accounts' },
    { id: 'journal', label: 'Journal' },
    { id: 'balances', label: 'Balances' },
    { id: 'vat', label: 'VAT' },
    { id: 'profit', label: 'Profit & Loss' },
    { id: 'deferred-cogs', label: 'Deferred COGS' }
  ]

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
            <p className="text-slate-500 mt-1">Financial management and accounting</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && dashboard && (
              <div className="space-y-6">
                {/* Cash Position */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Cash Position</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-sm text-slate-500">Opening Balance</p>
                      <p className="text-xl font-bold text-slate-900">{formatCurrency(dashboard?.cashPosition?.openingBalance ?? 0)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600">Money In Today</p>
                      <p className="text-xl font-bold text-green-700">+{formatCurrency(dashboard?.cashPosition?.moneyInToday ?? 0)}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="text-sm text-red-600">Money Out Today</p>
                      <p className="text-xl font-bold text-red-700">-{formatCurrency(dashboard?.cashPosition?.moneyOutToday ?? 0)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-600">Closing Balance</p>
                      <p className="text-xl font-bold text-blue-700">{formatCurrency(dashboard?.cashPosition?.closingBalance ?? 0)}</p>
                    </div>
                  </div>
                </div>

                {/* Receivables & Payables */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Receivables</h2>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Total Owed</span>
                        <span className="text-xl font-bold text-slate-900">{formatCurrency(dashboard?.receivables?.totalOwed ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Overdue</span>
                        <span className="text-lg font-semibold text-red-600">{formatCurrency(dashboard?.receivables?.overdueAmount ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Customers</span>
                        <span className="text-lg font-medium text-slate-700">{dashboard?.receivables?.customerCount ?? 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Payables</h2>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Total Payable</span>
                        <span className="text-xl font-bold text-slate-900">{formatCurrency(dashboard?.payables?.totalPayable ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Suppliers</span>
                        <span className="text-lg font-medium text-slate-700">{dashboard?.payables?.supplierCount ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Profit Snapshot */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Profit Snapshot (This Month)</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600">Revenue</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(dashboard?.profitSnapshot?.revenueThisMonth ?? 0)}</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm text-orange-600">Material Cost</p>
                      <p className="text-lg font-bold text-orange-700">{formatCurrency(dashboard?.profitSnapshot?.materialCostThisMonth ?? 0)}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="text-sm text-red-600">Expenses</p>
                      <p className="text-lg font-bold text-red-700">{formatCurrency(dashboard?.profitSnapshot?.expensesThisMonth ?? 0)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-600">Estimated Profit</p>
                      <p className="text-lg font-bold text-blue-700">{formatCurrency(dashboard?.profitSnapshot?.estimatedProfit ?? 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Expenses Tab */}
            {activeTab === 'expenses' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="p-4 border-b border-slate-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <h2 className="font-semibold">Expenses</h2>
                    <button onClick={() => setShowExpenseModal(true)} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                      + Record Expense
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { key: 'today', label: 'Today' },
                        { key: 'yesterday', label: 'Yesterday' },
                        { key: 'this-week', label: 'This Week' },
                        { key: 'last-week', label: 'Last Week' },
                        { key: 'this-month', label: 'This Month' },
                        { key: 'last-month', label: 'Last Month' },
                        { key: 'last-3-months', label: 'Last 3 Months' },
                      ].map(p => (
                        <button key={p.key}
                          onClick={() => applyExpensePeriod(p.key as ExpensePeriod)}
                          className={`px-3 py-1.5 text-sm rounded-lg border ${
                            expensePeriod === p.key
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-4 items-center flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">From:</label>
                        <DateInput value={expenseDateFrom}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setExpensePeriod(''); setExpenseDateFrom(e.target.value); loadExpenses(e.target.value || undefined, expenseDateTo || undefined) }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">To:</label>
                        <DateInput value={expenseDateTo}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setExpensePeriod(''); setExpenseDateTo(e.target.value); loadExpenses(expenseDateFrom || undefined, e.target.value || undefined) }}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      {(expensePeriod || expenseDateFrom || expenseDateTo) && (
                        <button onClick={clearExpenseFilters}
                          className="px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg border border-slate-300">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Account</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {expenses.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No expenses found</td></tr>
                    ) : (
                      expenses.map(entry => {
                        const expenseLine = entry.lines?.find(l => Number(l.debit) > 0)
                        const accountInfo = expenseLine ? `${expenseLine.account.code} ${expenseLine.account.name}` : '-'
                        const amount = expenseLine ? Number(expenseLine.debit) : 0
                        return (
                          <tr key={entry.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-sm text-slate-600">{formatDate(entry.date)}</td>
                            <td className="px-6 py-4 text-sm text-slate-900">{entry.description}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{accountInfo}</td>
                            <td className="px-6 py-4 text-sm font-medium text-red-600 text-right">-{formatCurrency(amount)}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{entry.reference || '-'}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Accounts Tab */}
            {activeTab === 'accounts' && accounts && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-700">Filter by type:</label>
                    <select value={accountTypeFilter} onChange={e => setAccountTypeFilter(e.target.value)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm">
                      <option value="">All</option>
                      <option value="ASSET">ASSET</option>
                      <option value="LIABILITY">LIABILITY</option>
                      <option value="EQUITY">EQUITY</option>
                      <option value="REVENUE">REVENUE</option>
                      <option value="EXPENSE">EXPENSE</option>
                      <option value="COGS">COGS</option>
                    </select>
                    <span className="text-sm text-slate-500">
                      {accountTypeFilter
                        ? `${accounts.filter(a => a.type === accountTypeFilter).length} accounts`
                        : `${accounts.length} accounts`
                      }
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Account</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">VAT</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(accounts.filter(a => !accountTypeFilter || a.type === accountTypeFilter)).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No accounts found</td>
                        </tr>
                      ) : accounts.filter(a => !accountTypeFilter || a.type === accountTypeFilter).map(account => (
                        <tr key={account.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-mono font-medium text-slate-900">{account.code}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{account.name}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${accountTypeColors[account.type] || 'bg-gray-100 text-gray-800'}`}>
                              {account.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {account.isVatEnabled ? 'Yes' : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">{account.description || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Journal Tab */}
            {activeTab === 'journal' && journalEntries && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-600">From:</label>
                      <DateInput value={journalDateFrom}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setJournalDateFrom(e.target.value); loadJournal(e.target.value || undefined, journalDateTo || undefined, journalSourceModule || undefined) }}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-600">To:</label>
                      <DateInput value={journalDateTo}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setJournalDateTo(e.target.value); loadJournal(journalDateFrom || undefined, e.target.value || undefined, journalSourceModule || undefined) }}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-600">Module:</label>
                      <select value={journalSourceModule}
                        onChange={(e) => { setJournalSourceModule(e.target.value); loadJournal(journalDateFrom || undefined, journalDateTo || undefined, e.target.value || undefined) }}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        <option value="">All</option>
                        <option value="SALES">Sales</option>
                        <option value="PROCUREMENT">Procurement</option>
                        <option value="PRODUCTION">Production</option>
                        <option value="EXPENSE">Expense</option>
                        <option value="PAYMENT">Payment</option>
                        <option value="ADJUSTMENT">Adjustment</option>
                        <option value="OPENING">Opening</option>
                      </select>
                    </div>
                    {(journalDateFrom !== initDateFrom() || journalDateTo !== initDateTo() || journalSourceModule) && (
                      <button onClick={() => { setJournalDateFrom(initDateFrom()); setJournalDateTo(initDateTo()); setJournalSourceModule(''); loadJournal(initDateFrom(), initDateTo()) }}
                        className="px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg border border-slate-300">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Entry #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Source</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Debit</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Credit</th>
                        {canReverse && <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {journalEntries.length === 0 ? (
                        <tr>
                          <td colSpan={canReverse ? 7 : 6} className="px-6 py-8 text-center text-slate-500">No journal entries yet</td>
                        </tr>
                      ) : journalEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-900">{formatDate(entry.date)}</td>
                          <td className="px-6 py-4 text-sm font-mono">
                            <button onClick={() => setSelectedEntry(entry)} className="text-blue-600 hover:text-blue-800 hover:underline">
                              {entry.entryNumber}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-900">{entry.description}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{entry.sourceModule}</td>
                          <td className="px-6 py-4 text-sm text-right text-slate-900">
                            {formatCurrency(entry.lines?.reduce((sum, l) => sum + Number(l.debit), 0) ?? 0)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-slate-900">
                            {formatCurrency(entry.lines?.reduce((sum, l) => sum + Number(l.credit), 0) ?? 0)}
                          </td>
                          {canReverse && (
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleReverse(entry.id, entry.entryNumber)}
                                disabled={reversing === entry.id}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {reversing === entry.id ? (
                                  <span className="flex items-center gap-1">
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Reversing...
                                  </span>
                                ) : (
                                  'Reverse'
                                )}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Balances Tab */}
            {activeTab === 'balances' && balances && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Account</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Debit</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Credit</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {balances.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No balances found</td>
                        </tr>
                      ) : balances.map(balance => (
                        <tr key={balance.accountId} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-mono font-medium text-slate-900">{balance.accountCode}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{balance.accountName}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${accountTypeColors[balance.accountType] || 'bg-gray-100 text-gray-800'}`}>
                              {balance.accountType}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-slate-900">{formatCurrency(balance.totalDebit)}</td>
                          <td className="px-6 py-4 text-sm text-right text-slate-900">{formatCurrency(balance.totalCredit)}</td>
                          <td className={`px-6 py-4 text-sm text-right font-medium ${
                            (balance.balance ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {formatCurrency(balance.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={3} className="px-6 py-3 text-sm font-bold text-slate-900">TOTAL</td>
                        <td className="px-6 py-3 text-sm text-right font-bold text-slate-900">
                          {formatCurrency(balances.reduce((sum, b) => sum + (b.totalDebit ?? 0), 0))}
                        </td>
                        <td className="px-6 py-3 text-sm text-right font-bold text-slate-900">
                          {formatCurrency(balances.reduce((sum, b) => sum + (b.totalCredit ?? 0), 0))}
                        </td>
                        <td className="px-6 py-3 text-sm text-right font-bold text-slate-900">
                          {formatCurrency(balances.reduce((sum, b) => sum + (b.balance ?? 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* VAT Tab */}
            {activeTab === 'vat' && vatSummary && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">VAT Summary (YTD)</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-purple-50 rounded-lg p-6">
                      <p className="text-sm text-purple-600">Output VAT (Collected)</p>
                      <p className="text-2xl font-bold text-purple-700">{formatCurrency(vatSummary?.outputVat ?? 0)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-6">
                      <p className="text-sm text-blue-600">Input VAT (Paid)</p>
                      <p className="text-2xl font-bold text-blue-700">{formatCurrency(vatSummary?.inputVat ?? 0)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-6">
                      <p className="text-sm text-green-600">VAT Payable</p>
                      <p className={`text-2xl font-bold ${(vatSummary?.vatPayable ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(vatSummary?.vatPayable ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {vatSummary.periods && vatSummary.periods.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200">
                      <h2 className="text-lg font-semibold text-slate-900">Monthly VAT Breakdown</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Period</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Output VAT</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Input VAT</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">VAT Payable</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {vatSummary.periods.map(p => (
                            <tr key={p.month} className="hover:bg-slate-50">
                              <td className="px-6 py-4 text-sm font-medium text-slate-900">{p.month}</td>
                              <td className="px-6 py-4 text-sm text-right text-purple-700">{formatCurrency(p.outputVat)}</td>
                              <td className="px-6 py-4 text-sm text-right text-blue-700">{formatCurrency(p.inputVat)}</td>
                              <td className={`px-6 py-4 text-sm text-right font-medium ${p.vatPayable >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {formatCurrency(p.vatPayable)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profit Tab */}
            {activeTab === 'profit' && profitSummary && (
              <div className="space-y-6">
                {/* Key Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <p className="text-sm text-green-600 font-medium">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(profitSummary?.revenue ?? 0)}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                    <p className="text-sm text-red-600 font-medium">Cost of Goods Sold</p>
                    <p className="text-2xl font-bold text-red-700 mt-1">-{formatCurrency(profitSummary?.costOfGoodsSold ?? 0)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
                    <p className="text-sm text-orange-600 font-medium">Total Expenses</p>
                    <p className="text-2xl font-bold text-orange-700 mt-1">-{formatCurrency(profitSummary?.expenses ?? 0)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <p className="text-sm text-blue-600 font-medium">Net Profit</p>
                    <p className={`text-2xl font-bold mt-1 ${(profitSummary?.netProfit ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(profitSummary?.netProfit ?? 0)}
                    </p>
                  </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Revenue Detail */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Revenue</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-700">Sales Revenue</span>
                        <span className="font-medium text-green-700">{formatCurrency(profitSummary?.breakdown?.salesRevenue ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-700">Packing Bags Revenue</span>
                        <span className="font-medium text-green-700">{formatCurrency(profitSummary?.breakdown?.packingRevenue ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-700">Other Income</span>
                        <span className="font-medium text-green-700">{formatCurrency(profitSummary?.breakdown?.otherIncome ?? 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* COGS & Margin */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Cost of Goods Sold</h3>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-700">Total COGS</span>
                      <span className="font-medium text-red-700">-{formatCurrency(profitSummary?.costOfGoodsSold ?? 0)}</span>
                    </div>
                    <div className="flex justify-between py-2 font-bold">
                      <span className="text-slate-900">Gross Profit</span>
                      <span className={`font-medium ${((profitSummary?.revenue ?? 0) - (profitSummary?.costOfGoodsSold ?? 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency((profitSummary?.revenue ?? 0) - (profitSummary?.costOfGoodsSold ?? 0))}
                      </span>
                    </div>
                  </div>

                  {/* Expenses Detail */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Expenses</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {Object.entries(profitSummary?.expenseBreakdown ?? {}).map(([code, amount]) => (
                        <div key={code} className="flex justify-between py-1 border-b border-slate-100 text-sm">
                          <span className="text-slate-700">{code}</span>
                          <span className="font-medium text-red-700">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between py-2 font-bold mt-2 border-t border-slate-200">
                      <span className="text-slate-900">Total Expenses</span>
                      <span className="text-red-700">-{formatCurrency(profitSummary?.expenses ?? 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Deferred COGS Tab */}
            {activeTab === 'deferred-cogs' && (
              <DeferredCogsTab deferredCogs={deferredCogs} />
            )}
          </>
        )}
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Record Expense</h2>
            <form onSubmit={handleRecordExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expense Account <span className="text-red-500">*</span></label>
                <select value={expenseForm.accountId} onChange={e => setExpenseForm({...expenseForm, accountId: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required>
                  <option value="">Select expense account</option>
                  {accounts.filter(a => a.type === 'EXPENSE').map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦) <span className="text-red-500">*</span></label>
                <input type="number" min="1" step="0.01" value={expenseForm.amount || ''} onChange={e => setExpenseForm({...expenseForm, amount: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-red-500">*</span></label>
                <input type="text" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" required placeholder="e.g. Diesel for generator 25L" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paid Via</label>
                <select value={expenseForm.paymentMethod} onChange={e => setExpenseForm({...expenseForm, paymentMethod: e.target.value as 'Cash' | 'Bank Transfer'})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <DateInput value={expenseForm.date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpenseForm({...expenseForm, date: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                <input type="text" value={expenseForm.referenceNumber} onChange={e => setExpenseForm({...expenseForm, referenceNumber: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" placeholder="Optional - receipt/invoice number" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={expenseForm.notes} onChange={e => setExpenseForm({...expenseForm, notes: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={2} />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={savingExpense} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                  {savingExpense ? 'Saving...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Journal Entry Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedEntry.entryNumber}</h2>
                <p className="text-sm text-slate-500">{selectedEntry.description}</p>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="p-1 hover:bg-slate-100 rounded">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{formatDate(selectedEntry.date)}</span></div>
                <div><span className="text-slate-500">Source:</span> <span className="font-medium">{selectedEntry.sourceModule}</span></div>
                {selectedEntry.reference && (
                  <div><span className="text-slate-500">Reference:</span> <span className="font-medium">{selectedEntry.reference}</span></div>
                )}
                {selectedEntry.sourceId && (
                  <div><span className="text-slate-500">Source ID:</span> <span className="font-medium font-mono text-xs">{selectedEntry.sourceId}</span></div>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Account</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Debit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Credit</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Memo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedEntry.lines.map(line => (
                    <tr key={line.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-slate-500">{line.account.code}</span>
                        <span className="ml-2">{line.account.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">
                        {Number(line.debit) > 0 ? formatCurrency(Number(line.debit)) : ''}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-red-700">
                        {Number(line.credit) > 0 ? formatCurrency(Number(line.credit)) : ''}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{line.memo || ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-medium">
                  <tr>
                    <td className="px-3 py-2 text-slate-700">Total</td>
                    <td className="px-3 py-2 text-right font-mono text-green-700">
                      {formatCurrency(selectedEntry.lines.reduce((s, l) => s + Number(l.debit), 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-700">
                      {formatCurrency(selectedEntry.lines.reduce((s, l) => s + Number(l.credit), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function DeferredCogsTab({ deferredCogs }: { deferredCogs: DeferredCogsSummary | null }) {
  if (!deferredCogs) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-slate-500">
          Loading...
        </div>
      </div>
    )
  }

  const orders = deferredCogs.orders || []

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6">
          <p className="text-sm text-yellow-600 font-medium">Total Deferred COGS</p>
          <p className="text-2xl font-bold text-yellow-700 mt-1">
            {formatCurrency(deferredCogs.totalDeferred || 0)}
          </p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
          <p className="text-sm text-blue-600 font-medium">Pending Deliveries</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">
            {deferredCogs.pendingCount || 0}
          </p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-6">
          <p className="text-sm text-red-600 font-medium">Overdue (&gt;7 days)</p>
          <p className="text-2xl font-bold text-red-700 mt-1">
            {deferredCogs.overdueCount || 0}
          </p>
        </div>
      </div>

      {/* Pending Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Pending Orders with Deferred COGS</h2>
          <p className="text-sm text-slate-500 mt-1">
            These orders have completed production but are awaiting pickup/delivery
          </p>
        </div>
        
        {orders.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No pending orders with deferred COGS
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Order #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Deferred Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Days Pending</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {orders.map(order => {
                  const completedDate = order.completedAt ? new Date(order.completedAt).toLocaleDateString('en-NG') : 'N/A'
                  const daysPending = order.daysPending || 0
                  const isOverdue = daysPending > 7
                  
                  return (
                    <tr key={order.id} className={isOverdue ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {order.orderNumber || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {order.customerName || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-yellow-700">
                        {formatCurrency(order.deferredAmount || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {completedDate}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                        isOverdue ? 'text-red-600' : 'text-slate-600'
                      }`}>
                        {daysPending} days
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {isOverdue ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>How it works:</strong> When a production job is completed, material costs + overhead are posted to Deferred COGS (1330). 
          When the customer picks up or the shipment is delivered, COGS is recognized by moving from Deferred COGS (1330) to COGS (5000).
        </p>
      </div>
    </div>
  )
}
