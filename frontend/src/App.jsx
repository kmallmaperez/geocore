import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import api from './utils/api'
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
import DrillLogPage        from './pages/DrillLogPage'

// ── Selector de proyecto (dinámico) ──────────────────────────────
function ProyectoSelector() {
  const { user, proyectoActivo, setProyectoActivo, proyectos, addProyecto } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [addErr,  setAddErr]  = useState('')
  const [saving,  setSaving]  = useState(false)

  // ADMIN siempre tiene selector; otros solo si tienen ≥2 proyectos asignados
  if (user?.role !== 'ADMIN' && proyectos.length <= 1) return null

  function proyIco(p) {
    if (p === 'Mina') return '⛏'
    if (p === 'Exploraciones') return '🔭'
    return '📁'
  }

  async function handleAdd() {
    const nombre = newName.trim()
    if (!nombre) return
    setSaving(true); setAddErr('')
    try {
      await api.post('/proyectos', { nombre })
      addProyecto(nombre)
      setProyectoActivo(nombre)
      setNewName(''); setShowAdd(false)
    } catch (e) {
      setAddErr(e.response?.data?.error || 'Error al crear proyecto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="proyecto-bar" style={{ flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
        Proyecto:
      </span>

      {/* Botón "Todos" */}
      <button
        className={`btn btn-sm ${proyectoActivo === 'Ambos' ? 'btn-acc' : 'btn-out'}`}
        style={{ fontSize: 12, whiteSpace: 'nowrap' }}
        onClick={() => setProyectoActivo('Ambos')}
      >
        🔀 Todos
      </button>

      {/* Proyectos dinámicos */}
      {proyectos.map(p => (
        <button
          key={p}
          className={`btn btn-sm ${proyectoActivo === p ? 'btn-acc' : 'btn-out'}`}
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          onClick={() => setProyectoActivo(p)}
        >
          {proyIco(p)} {p}
        </button>
      ))}

      {/* Botón + (solo ADMIN) */}
      {user.role === 'ADMIN' && !showAdd && (
        <button
          className="btn btn-sm btn-out"
          style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px' }}
          title="Nuevo proyecto"
          onClick={() => { setShowAdd(true); setAddErr('') }}
        >
          +
        </button>
      )}

      {/* Formulario inline para crear proyecto */}
      {showAdd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <input
            autoFocus
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddErr('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setShowAdd(false); setNewName('') } }}
            placeholder="Nombre del proyecto"
            style={{ fontSize: 12, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--brd)', background: 'var(--bg)', color: 'var(--txt)', outline: 'none', width: 160 }}
          />
          <button
            className="btn btn-sm btn-acc"
            style={{ fontSize: 12 }}
            onClick={handleAdd}
            disabled={saving || !newName.trim()}
          >
            {saving ? '…' : '✓'}
          </button>
          <button
            className="btn btn-sm btn-out"
            style={{ fontSize: 12 }}
            onClick={() => { setShowAdd(false); setNewName(''); setAddErr('') }}
          >
            ✕
          </button>
          {addErr && <span style={{ fontSize: 11, color: 'var(--red)' }}>{addErr}</span>}
        </div>
      )}

      {proyectoActivo !== 'Ambos' && !showAdd && (
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
      <Route path="/drill-log"       element={<PrivateLayout><DrillLogPage /></PrivateLayout>} />
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
