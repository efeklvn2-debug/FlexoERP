import { Layout } from '../components/Layout'

interface KPICardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon: React.ReactNode
}

function KPICard({ title, value, change, changeType = 'neutral', icon }: KPICardProps) {
  const changeColors = {
    positive: 'text-green-600 bg-green-50',
    negative: 'text-red-600 bg-red-50',
    neutral: 'text-slate-600 bg-slate-50'
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {change && (
            <p className={`text-sm font-medium mt-2 ${changeColors[changeType].split(' ')[0]}`}>
              {change}
            </p>
          )}
        </div>
        <div className="p-3 bg-blue-50 rounded-lg">
          {icon}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}

export function DashboardPage() {
  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your operations</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard
            title="Total Revenue"
            value="₦124,500"
            change="+12.5% from last month"
            changeType="positive"
            icon={
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <KPICard
            title="Pending Orders"
            value="23"
            change="5 new today"
            changeType="neutral"
            icon={
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <KPICard
            title="Production Output"
            value="1,450 units"
            change="+8.2% from last week"
            changeType="positive"
            icon={
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <KPICard
            title="Low Stock Items"
            value="7"
            change="3 critical"
            changeType="negative"
            icon={
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard title="Active Customers" value="48" />
          <StatCard title="Active Jobs" value="12" />
          <StatCard title="Materials in Stock" value="156" />
          <StatCard title="Invoices Due" value="8" subtitle="₦15,400 total" />
          <StatCard title="Today's Output" value="245 rolls" />
          <StatCard title="Efficiency" value="94.2%" subtitle="Above target" />
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { id: 'ORD-2024-0156', customer: 'ABC Packaging', status: 'In Production', amount: '₦4,250' },
                { id: 'ORD-2024-0155', customer: 'XYZ Labels', status: 'Pending', amount: '₦1,890' },
                { id: 'ORD-2024-0154', customer: 'PrintPro Inc', status: 'Completed', amount: '₦6,720' },
                { id: 'ORD-2024-0153', customer: 'Flexo Solutions', status: 'Confirmed', amount: '₦2,100' },
                { id: 'ORD-2024-0152', customer: 'PackRight Co', status: 'Completed', amount: '₦3,450' },
              ].map((order) => (
                <div key={order.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-900">{order.id}</p>
                    <p className="text-sm text-slate-500">{order.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">{order.amount}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.status === 'Completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'In Production' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'Confirmed' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Inventory Alerts</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { material: '25microns', current: 12, min: 20, status: 'critical' },
                { material: '27microns', current: 18, min: 20, status: 'warning' },
                { material: 'Premium', current: 8, min: 15, status: 'critical' },
                { material: 'Ink - Black', current: 45, min: 50, status: 'warning' },
                { material: 'Cores 3"', current: 120, min: 100, status: 'ok' },
              ].map((item) => (
                <div key={item.material} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{item.material}</p>
                    <p className="text-sm text-slate-500">{item.current} / {item.min} minimum</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    item.status === 'critical' ? 'bg-red-100 text-red-800' :
                    item.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {item.status === 'critical' ? 'Critical' : item.status === 'warning' ? 'Low' : 'OK'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
