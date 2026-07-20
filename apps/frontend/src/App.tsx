import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { CustomersPage } from './pages/CustomersPage'
import { CustomerDetailPage } from './pages/CustomerDetailPage'
import { ProcurementPage } from './pages/ProcurementPage'
import { ProductionPage } from './pages/ProductionPage'
import { SettingsPage } from './pages/SettingsPage'
import { FinancePage } from './pages/FinancePage'
import { SalesOrdersPage } from './pages/SalesOrdersPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { ReportsPage } from './pages/ReportsPage'
import { AdminPage } from './pages/AdminPage'
import { NotificationProvider } from './contexts/NotificationContext'
import { Toast } from './components/Toast'
import { useAuthStore, hasPermission } from './stores/authStore'

function ProtectedRoute({ children, requiredPermissions }: { children: React.ReactNode; requiredPermissions?: string[] }) {
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token) { setLoading(false); return }

    const { isAuthenticated, checkAuth } = useAuthStore.getState()
    ;(isAuthenticated ? Promise.resolve() : checkAuth())
      .finally(() => {
        setOk(useAuthStore.getState().isAuthenticated)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!ok) {
    return <Navigate to="/login" replace />
  }

  if (requiredPermissions && !requiredPermissions.every(p => hasPermission(p))) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/inventory" element={<ProtectedRoute requiredPermissions={['inventory:read']}><InventoryPage /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute requiredPermissions={['customer:read']}><CustomersPage /></ProtectedRoute>} />
          <Route path="/customers/:customerId" element={<ProtectedRoute requiredPermissions={['customer:read']}><CustomerDetailPage /></ProtectedRoute>} />
          <Route path="/procurement" element={<ProtectedRoute requiredPermissions={['procurement:read']}><ProcurementPage /></ProtectedRoute>} />
          <Route path="/production" element={<ProtectedRoute requiredPermissions={['production:read']}><ProductionPage /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute requiredPermissions={['finance:read']}><FinancePage /></ProtectedRoute>} />
          <Route path="/sales-orders" element={<ProtectedRoute requiredPermissions={['sales_order:read']}><SalesOrdersPage /></ProtectedRoute>} />
          <Route path="/suppliers" element={<ProtectedRoute requiredPermissions={['supplier:read']}><SuppliersPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute requiredPermissions={['report:read']}><ReportsPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requiredPermissions={['auth:manage_users']}><AdminPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute requiredPermissions={['settings:read']}><SettingsPage /></ProtectedRoute>} />
          <Route path="/*" element={<ProtectedRoute><Routes><Route path="/" element={<DashboardPage />} /></Routes></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
      <Toast />
    </NotificationProvider>
  )
}

export default App
