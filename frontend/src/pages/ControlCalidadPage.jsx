import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import Toast, { useToast } from '../components/Toast'

const STATUS_OPTIONS = ['Pendiente', 'En Proceso', 'Completado']

const STATUS_STYLE = {
  Completado:   { bg: 'rgba(16,185,129,.18)',  color: '#10b981', label: '✅ Completado' },
  'En Proceso': { bg: 'rgba(245,158,11,.18)',  color: '#f59e0b', label: '⏳ En Proceso' },
  Pendiente:    { bg: 'rgba(107,114,128,.15)', color: '#9ca3af', label: '○ Pendiente'   },
}

const CAMPOS = [
  { key: 'collar',            label: 'Collar'             },
  { key: 'survey_control',    label: 'Survey Control'     },
  { key: 'survey_final',      label: 'Survey Final'       },
  { key: 'informe_survey',    label: 'Informe de Survey'  },
  { key: 'validacion_logueo', label: 'Val. de Logueo'     },
]

function StatusSelect({ ddhid, campo, valor, onSave }) {
  const [saving, setSaving] = useState(false)
  const s = STATUS_STYLE[valor] || STATUS_STYLE.Pendiente

  async function handleChange(e) {
    const nuevoValor = e.target.value
    setSaving(true)
    await onSave(ddhid, campo, nuevoValor)
    setSaving(false)
  }

  return (
    <select
      value={valor}
      disabled={saving}
      onChange={handleChange}
      style={{
        background:   s.bg,
        color:        s.color,
        border:       `1px solid ${s.color}`,
        borderRadius: 6,
        padding:      '4px 8px',
        fontSize:     12,
        fontWeight:   600,
        cursor:       saving ? 'wait' : 'pointer',
        outline:      'none',
        minWidth:     130,
        opacity:      saving ? .6 : 1,
        transition:   'all .15s',
      }}>
      {STATUS_OPTIONS.map(o => (
        <option key={o} value={o}>{STATUS_STYLE[o].label}</option>
      ))}
    </select>
  )
}

export default function ControlCalidadPage() {
  const { proyectoActivo } = useAuth()
  const { toast, show }    = useToast()
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    setLoading(true)
    const qp = (proyectoActivo && proyectoActivo !== 'Ambos')
      ? `?tipo_proyecto=${encodeURIComponent(proyectoActivo)}`
      : ''
    api.get(`/control-calidad${qp}`)
      .then(r => setRows(r.data || []))
      .catch(() => show('Error al cargar Control de Calidad', 'err'))
      .finally(() => setLoading(false))
  }, [proyectoActivo])

  async function handleSave(ddhid, campo, valor) {
    try {
      await api.put(`/control-calidad/${encodeURIComponent(ddhid)}`, { campo, valor })
      setRows(prev => prev.map(r => r.DDHID === ddhid ? { ...r, [campo]: valor } : r))
    } catch {
      show('Error al guardar', 'err')
    }
  }

  const filtered = rows.filter(r => {
    const matchS = !search || r.DDHID?.toLowerCase().includes(search.toLowerCase()) ||
                              r.PLATAFORMA?.toLowerCase().includes(search.toLowerCase())
    const matchF = !filterStatus || CAMPOS.some(c => r[c.key] === filterStatus)
    return matchS && matchF
  })

  // Contadores por estado global
  const counts = { Completado: 0, 'En Proceso': 0, Pendiente: 0 }
  rows.forEach(r => {
    CAMPOS.forEach(c => {
      const v = r[c.key] || 'Pendiente'
      counts[v] = (counts[v] || 0) + 1
    })
  })
  const total = rows.length * CAMPOS.length

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />

      <div style={{ marginBottom: 14 }}>
        <div className="page-title">✅ Control de Calidad</div>
        <div className="page-desc">{filtered.length} sondajes · {total} estados totales</div>
      </div>

      {/* Resumen de estados */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map(s => (
          <div key={s} style={{
            background: STATUS_STYLE[s].bg,
            color: STATUS_STYLE[s].color,
            border: `1px solid ${STATUS_STYLE[s].color}`,
            borderRadius: 8, padding: '6px 14px',
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            opacity: filterStatus === s ? 1 : filterStatus ? .5 : 1,
            transition: 'opacity .15s',
          }}
            onClick={() => setFilterStatus(p => p === s ? '' : s)}>
            {STATUS_STYLE[s].label} · {counts[s] || 0}
          </div>
        ))}
        {filterStatus && (
          <button className="btn btn-out" style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => setFilterStatus('')}>✕ Quitar filtro</button>
        )}
      </div>

      {/* Buscador */}
      <input className="s-inp"
        style={{ width: '100%', fontSize: 15, padding: '11px 14px', minHeight: 44, borderRadius: 10, marginBottom: 12 }}
        placeholder="🔍 Buscar sondaje o plataforma..."
        value={search} onChange={e => setSearch(e.target.value)} />

      {/* Tabla */}
      <div className="t-wrap">
        <div className="ox">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 120 }}>DDHID</th>
                <th>Plataforma</th>
                <th>Proyecto</th>
                {CAMPOS.map(c => (
                  <th key={c.key} style={{ minWidth: 140 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3 + CAMPOS.length} className="no-data">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3 + CAMPOS.length} className="no-data">Sin sondajes</td></tr>
              ) : filtered.map(row => (
                <tr key={row.DDHID}>
                  <td style={{ fontWeight: 700, color: 'var(--acc)', fontSize: 13 }}>{row.DDHID}</td>
                  <td style={{ color: 'var(--mut)', fontSize: 12 }}>{row.PLATAFORMA || '—'}</td>
                  <td>
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>
                      {row.tipo_proyecto === 'Exploraciones' ? '🔭' : '⛏'} {row.tipo_proyecto}
                    </span>
                  </td>
                  {CAMPOS.map(c => (
                    <td key={c.key}>
                      <StatusSelect
                        ddhid={row.DDHID}
                        campo={c.key}
                        valor={row[c.key] || 'Pendiente'}
                        onSave={handleSave}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
