import { useState, useEffect } from 'react'
import { Layout } from '../components/Layout'
import { financeApi, Account, JournalEntry, AccountBalance, FinanceDashboard, VatSummary, ProfitSummary } from '../api/finance'

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

type TabType = 'dashboard' | 'accounts' | 'journal' | 'balances' | 'vat' | 'profit'

export function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<FinanceDashboard | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null)
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = async () => {
    const res = await financeApi.getDashboard()
    if (res.data) setDashboard(res.data as any)
    else setError(res.error?.message || 'Failed to load dashboard')
  }

  const loadAccounts = async () => {
    const res = await financeApi.getAccounts()
    if (res.data) setAccounts((res.data as any).data || [])
    else setError(res.error?.message || 'Failed to load accounts')
  }

  const loadJournal = async () => {
    const res = await financeApi.getJournalEntries()
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
    if (res.data) setVatSummary((res.data as any))
    else setError(res.error?.message || 'Failed to load VAT')
  }

  const loadProfit = async () => {
    const res = await financeApi.getProfitSummary()
    if (res.data) setProfitSummary((res.data as any))
    else setError(res.error?.message || 'Failed to load profit')
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    
    const loaders: Record<TabType, () => Promise<void>> = {
      dashboard: loadDashboard,
      accounts: loadAccounts,
      journal: loadJournal,
      balances: loadBalances,
      vat: loadVat,
      profit: loadProfit
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
    { id: 'accounts', label: 'Chart of Accounts' },
    { id: 'journal', label: 'Journal' },
    { id: 'balances', label: 'Balances' },
    { id: 'vat', label: 'VAT' },
    { id: 'profit', label: 'Profit' }
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

            {/* Accounts Tab */}
            {activeTab === 'accounts' && accounts && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
                      {accounts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No accounts found</td>
                        </tr>
                      ) : accounts.map(account => (
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {journalEntries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No journal entries yet</td>
                        </tr>
                      ) : journalEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-900">{formatDate(entry.date)}</td>
                          <td className="px-6 py-4 text-sm font-mono text-blue-600">{entry.entryNumber}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{entry.description}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{entry.sourceModule}</td>
                          <td className="px-6 py-4 text-sm text-right text-slate-900">
                            {formatCurrency(entry.lines?.reduce((sum, l) => sum + Number(l.debit), 0) ?? 0)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-slate-900">
                            {formatCurrency(entry.lines?.reduce((sum, l) => sum + Number(l.credit), 0) ?? 0)}
                          </td>
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
              </div>
            )}

            {/* Profit Tab */}
            {activeTab === 'profit' && profitSummary && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Profit & Loss (This Month)</h2>
                  
                  {/* Revenue */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-slate-500 uppercase mb-3">Revenue</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-700">Sales Revenue</span>
                        <span className="font-medium text-green-700">{formatCurrency(profitSummary?.breakdown?.salesRevenue ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-700">Packing Bags Revenue</span>
                        <span className="font-medium text-green-700">{formatCurrency(profitSummary?.breakdown?.packingRevenue ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold">
                        <span className="text-slate-900">Total Revenue</span>
                        <span className="text-green-700">{formatCurrency(profitSummary?.revenue ?? 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* COGS */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-slate-500 uppercase mb-3">Cost of Goods Sold</h3>
                    <div className="flex justify-between py-2 font-bold">
                      <span className="text-slate-900">Total COGS</span>
                      <span className="text-red-700">-{formatCurrency(profitSummary?.costOfGoodsSold ?? 0)}</span>
                    </div>
                  </div>

                  {/* Expenses */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-slate-500 uppercase mb-3">Expenses</h3>
                    <div className="space-y-2">
                      {Object.entries(profitSummary?.expenseBreakdown ?? {}).map(([code, amount]) => (
                        <div key={code} className="flex justify-between py-2 border-b border-slate-100">
                          <span className="text-slate-700">{code}</span>
                          <span className="font-medium text-red-700">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-2 font-bold">
                        <span className="text-slate-900">Total Expenses</span>
                        <span className="text-red-700">-{formatCurrency(profitSummary?.expenses ?? 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className="bg-slate-50 rounded-lg p-6">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-slate-900">NET PROFIT</span>
                      <span className={`text-2xl font-bold ${(profitSummary?.netProfit ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(profitSummary?.netProfit ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
