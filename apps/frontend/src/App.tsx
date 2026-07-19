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
import { NotificationProvider } from './contexts/NotificationContext'
import { Toast } from './components/Toast'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    setIsAuthenticated(!!token)
    setLoading(false)
  }, [])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
          <Route path="/customers/:customerId" element={<ProtectedRoute><CustomerDetailPage /></ProtectedRoute>} />
          <Route path="/procurement" element={<ProtectedRoute><ProcurementPage /></ProtectedRoute>} />
          <Route path="/production" element={<ProtectedRoute><ProductionPage /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
          <Route path="/sales-orders" element={<ProtectedRoute><SalesOrdersPage /></ProtectedRoute>} />
          <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/*" element={<ProtectedRoute><Routes><Route path="/" element={<DashboardPage />} /></Routes></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
      <Toast />
    </NotificationProvider>
  )
}

export default App
