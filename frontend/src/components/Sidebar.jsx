import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { inits, roleCls } from '../utils/tableDefs'

const NAV = [
  { section: 'Principal' },
  { id: '/dashboard',              ico: '📊', lbl: 'Dashboard' },
  { id: '/resumen',                ico: '📋', lbl: 'Resumen General' },
  { section: 'Tablas' },
  { id: '/tabla/programa_general', ico: '🗺',  lbl: 'Programa General', roles: ['ADMIN','SUPERVISOR'] },
  { id: '/tabla/perforacion',      ico: '🔩', lbl: 'Perforación' },
  { id: '/tabla/recepcion',        ico: '📦', lbl: 'Recepción' },
  { id: '/tabla/recuperacion',     ico: '🧪', lbl: 'Recuperación' },
  { id: '/tabla/fotografia',       ico: '📷', lbl: 'Fotografía' },
  { id: '/tabla/l_geotecnico',     ico: '🪨', lbl: 'L_Geotécnico' },
  { id: '/tabla/l_geologico',      ico: '🔬', lbl: 'L_Geológico' },
  { id: '/tabla/muestreo',         ico: '🧫', lbl: 'Muestreo' },
  { id: '/tabla/corte',            ico: '✂️', lbl: 'Corte' },
  { id: '/tabla/envios',           ico: '📮', lbl: 'Envíos' },
  { id: '/tabla/batch',            ico: '🧾', lbl: 'Batch' },
  { id: '/tabla/tormentas',        ico: '⛈',  lbl: 'Tormentas' },
  { section: 'Sistema' },
  { id: '/usuarios', ico: '👥', lbl: 'Usuarios',  roles: ['ADMIN'] },
  { id: '/exportar', ico: '⬇️', lbl: 'Exportar',  roles: ['ADMIN','SUPERVISOR'] },
]

const TABLE_KEYS = ['perforacion','recepcion','recuperacion','fotografia','l_geotecnico','l_geologico','muestreo','corte','envios','batch','tormentas']

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  // Cierra sidebar al navegar en mobile
  useEffect(() => { setOpen(false) }, [pathname])

  // Cierra con Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function canSee(item) {
    if (item.roles && !item.roles.includes(user.role)) return false
    if (user.role !== 'USER') return true
    if (item.id === '/dashboard' || item.id === '/resumen') return true
    const tkey = item.id?.replace('/tabla/', '')
    if (TABLE_KEYS.includes(tkey))
      return user.tables.includes('all') || user.tables.includes(tkey)
    return false
  }

  function go(id) { navigate(id); setOpen(false) }

  return (
    <>
      {/* Botón hamburguesa — solo visible en mobile */}
      <button className="mob-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '✕' : '☰'}
      </button>

      {/* Overlay oscuro cuando sidebar está abierto en mobile */}
      {open && <div className="mob-overlay" onClick={() => setOpen(false)} />}

      <div className={`sidebar ${open ? 'open' : ''}`}>
        <div className="s-logo">
          ⛏ GeoCore
          <small>Reporte de trabajos diarios · KPDI</small>
        </div>

        {NAV.map((item, i) => {
          if (item.section) return <div key={i} className="nav-sec">{item.section}</div>
          if (!canSee(item)) return null
          const active = pathname === item.id || pathname.startsWith(item.id)
          return (
            <div key={item.id} className={`nav-item ${active ? 'active' : ''}`} onClick={() => go(item.id)}>
              <span>{item.ico}</span> {item.lbl}
            </div>
          )
        })}

        <div className="s-bot">
          <div className="u-pill">
            <div className="u-av">{inits(user.name)}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name.split(' ')[0]}</div>
              <span className={`bdg ${roleCls(user.role)}`}>{user.role}</span>
            </div>
          </div>
          <button className="log-btn" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>
    </>
  )
}
