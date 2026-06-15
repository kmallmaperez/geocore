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
import MapaPage        from './pages/MapaPage'
import DuplicadosPage  from './pages/DuplicadosPage'
import QuickLogPage       from './pages/QuickLogPage'
import ControlCalidadPage from './pages/ControlCalidadPage'

// ── Selector de proyecto (Mina / Exploraciones / Ambos) ──────────
function ProyectoSelector() {
  const { user, proyectoActivo, setProyectoActivo } = useAuth()
  const acceso = user?.tipo_acceso || 'Ambos'
  if (acceso !== 'Ambos') return null   // acceso fijo, sin selector

  const OPTS = [
    { id: 'Ambos',        lbl: '🔀 Ambos' },
    { id: 'Mina',         lbl: '⛏ Mina' },
    { id: 'Exploraciones',lbl: '🔭 Exploraciones' },
  ]

  return (
    <div className="proyecto-bar">
      <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
        Proyecto:
      </span>
      {OPTS.map(o => (
        <button
          key={o.id}
          className={`btn btn-sm ${proyectoActivo === o.id ? 'btn-acc' : 'btn-out'}`}
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          onClick={() => setProyectoActivo(o.id)}
        >
          {o.lbl}
        </button>
      ))}
      {proyectoActivo !== 'Ambos' && (
        <span className="proy-label" style={{ marginLeft: 4, fontSize: 11, color: 'var(--mut)' }}>
          — mostrando solo <strong style={{ color: 'var(--acc)' }}>{proyectoActivo}</strong>
        </span>
      )}
    </div>
  )
}

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
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <ProyectoSelector />
        <main className="main-content">{children}</main>
      </div>
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
      <Route path="/exportar"    element={<PrivateLayout><ExportPage /></PrivateLayout>} />
      <Route path="/mapa"         element={<PrivateLayout><MapaPage /></PrivateLayout>} />
      <Route path="/quicklog"      element={<PrivateLayout><QuickLogPage /></PrivateLayout>} />
      <Route path="/duplicados"     element={<PrivateLayout roles={['ADMIN']}><DuplicadosPage /></PrivateLayout>} />
      <Route path="/control-calidad" element={<PrivateLayout><ControlCalidadPage /></PrivateLayout>} />
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
