import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TablePage from './pages/TablePage'
import ResumenPage from './pages/ResumenPage'
import UsersPage from './pages/UsersPage'
import ExportPage from './pages/ExportPage'

function PrivateLayout({ children, roles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--mut)', fontSize: 14 }}>Cargando...</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  )
}

function PublicRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--mut)', fontSize: 14 }}>Cargando...</div>
      </div>
    )
  }

  return user ? <Navigate to="/dashboard" replace /> : <Login />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"            element={<PublicRoute />} />
      <Route path="/dashboard"   element={<PrivateLayout><Dashboard /></PrivateLayout>} />
      <Route path="/resumen"     element={<PrivateLayout><ResumenPage /></PrivateLayout>} />
      <Route path="/tabla/:tkey" element={<PrivateLayout><TablePage /></PrivateLayout>} />
      <Route path="/usuarios"    element={<PrivateLayout roles={['ADMIN']}><UsersPage /></PrivateLayout>} />
      <Route path="/exportar"    element={<PrivateLayout roles={['ADMIN','SUPERVISOR']}><ExportPage /></PrivateLayout>} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
