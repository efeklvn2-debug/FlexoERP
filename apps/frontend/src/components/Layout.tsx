import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore, hasPermission } from '../stores/authStore'
import { api } from '../api/client'
import { authApi } from '../api/auth'
import { PhlexMark } from './PhlexMark'
import { BrandWordmark } from './BrandWordmark'
import { useNotification } from '../contexts/NotificationContext'

interface NavItem {
  name: string
  path: string
  icon: React.ReactNode
  permission?: string
  role?: 'SUPER_ADMIN'
}

/** Thin modern stroke icons (Lucide-style, stroke 1.5) */
const ic = (d: string | string[]) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)

const navigation: NavItem[] = [
  {
    name: 'Dashboard',
    path: '/',
    icon: ic([
      'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
    ])
  },
  {
    name: 'MTO Orders',
    path: '/sales-orders',
    permission: 'sales_order:read',
    icon: ic([
      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2',
      'M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      'M9 12h6M9 16h4',
    ])
  },
  {
    name: 'Customers',
    path: '/customers',
    permission: 'customer:read',
    icon: ic([
      'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2',
      'M9 11a4 4 0 100-8 4 4 0 000 8z',
      'M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    ])
  },
  {
    name: 'Inventory',
    path: '/inventory',
    permission: 'inventory:read',
    icon: ic([
      'M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16V8z',
      'M3.3 7L12 12l8.7-5M12 22V12',
    ])
  },
  {
    name: 'Suppliers',
    path: '/suppliers',
    permission: 'supplier:read',
    icon: ic([
      'M3 21h18',
      'M5 21V7l7-4 7 4v14',
      'M9 21v-6h6v6',
      'M9 9h.01M15 9h.01M9 13h.01M15 13h.01',
    ])
  },
  {
    name: 'Procurement',
    path: '/procurement',
    permission: 'procurement:read',
    icon: ic([
      'M6 6h15l-1.5 9h-12z',
      'M6 6L5 3H2',
      'M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z',
    ])
  },
  {
    name: 'Production',
    path: '/production',
    permission: 'production:read',
    icon: ic([
      'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
    ])
  },
  {
    name: 'Finance',
    path: '/finance',
    permission: 'finance:read',
    icon: ic([
      'M12 2v20',
      'M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    ])
  },
  {
    name: 'Reports',
    path: '/reports',
    permission: 'report:read',
    icon: ic([
      'M3 3v18h18',
      'M7 16l4-8 4 5 5-9',
    ])
  },
  {
    name: 'Settings',
    path: '/settings',
    permission: 'settings:read',
    icon: ic([
      'M12 15a3 3 0 100-6 3 3 0 000 6z',
      'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
    ])
  },
  {
    name: 'Admin',
    path: '/admin',
    permission: 'auth:manage_users',
    icon: ic([
      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    ])
  },
  {
    name: 'Platform',
    path: '/platform',
    role: 'SUPER_ADMIN',
    icon: ic([
      'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z',
    ])
  },
]

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const notify = useNotification()

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        e.preventDefault()
      }
    }
    document.addEventListener('wheel', handler as EventListener, { passive: false } as AddEventListenerOptions)
    return () => document.removeEventListener('wheel', handler as EventListener, { passive: false } as AddEventListenerOptions)
  }, [])

  const user = useAuthStore(s => s.user) ?? { username: 'User', role: 'Unknown' as const, tenantName: undefined as string | undefined }
  const logout = useAuthStore(s => s.logout)

  const handleLogout = async () => {
    api.clearTokens()
    await logout()
    navigate('/login')
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { notify.error('New passwords do not match'); return }
    setChangingPassword(true)
    try {
      const res = await authApi.changePassword(currentPassword, newPassword)
      if (res.error) { notify.error(res.error.message); setChangingPassword(false); return }
      notify.success('Password changed successfully. Please log in again.')
      setPasswordModalOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setChangingPassword(false)
      handleLogout()
    } catch (err: any) {
      notify.error(err.message || 'Failed to change password')
      setChangingPassword(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg text-white flex items-center justify-center shadow-sm shadow-blue-600/30">
                <PhlexMark className="w-5 h-5" />
              </div>
              <BrandWordmark size="md" className="text-slate-800" />
              {user.tenantName && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  {user.tenantName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* User Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-slate-600">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-slate-700">{user.username}</span>
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900">{user.username}</p>
                    <p className="text-xs text-slate-500">{user.role}</p>
                    {user.tenantName && (
                      <p className="text-xs text-blue-600 mt-0.5">{user.tenantName}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setDropdownOpen(false); setPasswordModalOpen(true) }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Change Password
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 bottom-0 bg-white border-r border-slate-200 transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-16'
        }`}
      >
        <nav className="p-4 space-y-1">
          {navigation.filter(item => {
            if (item.role === 'SUPER_ADMIN') return user.role === 'SUPER_ADMIN'
            if (user.role === 'SUPER_ADMIN') return false
            return !item.permission || hasPermission(item.permission)
          }).map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path + '/'))
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title={!sidebarOpen ? item.name : undefined}
              >
                <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>
                  {item.icon}
                </span>
                {sidebarOpen && (
                  <span className="font-medium">{item.name}</span>
                )}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main
        className={`pt-16 min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-16'
        }`}
      >
        <div className="p-6">
          {children}
        </div>
      </main>

      {/* Change Password Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => { setPasswordModalOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-800 mb-4">Change Password</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                <p className="text-xs text-slate-400 mt-1">Min 8 chars, 1 uppercase letter, 1 number</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setPasswordModalOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
