import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { DEFS, NUM_COLS, DATE_COLS, fmtFecha } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'
import RowModal from '../components/RowModal'
import ImportModal from '../components/ImportModal'
import ReporteModal from '../components/ReporteModal'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'
import PlataformaModal from '../components/PlataformaModal'

const EQUIPOS_PG = ['HYDX-5A-05','HYDX-5A-06','HYDX-5A-07','YN-1500','XZCR-N18A']
const EQUIPO_COLOR = {
  'HYDX-5A-05': { bg:'rgba(59,130,246,.18)',  color:'#60a5fa' },
  'HYDX-5A-06': { bg:'rgba(168,85,247,.18)',  color:'#c084fc' },
  'HYDX-5A-07': { bg:'rgba(245,158,11,.18)',  color:'#fbbf24' },
  'YN-1500':    { bg:'rgba(16,185,129,.18)',   color:'#34d399' },
  'XZCR-N18A':  { bg:'rgba(239,68,68,.18)',    color:'#f87171' },
}

const TIENE_REPORTE = new Set([
  'perforacion','recepcion','recuperacion','fotografia',
  'l_geotecnico','l_geologico','muestreo','corte','tormentas','envios'
])

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color:'var(--brd)', marginLeft:3, fontSize:10 }}>⇅</span>
  return <span style={{ color:'var(--acc)', marginLeft:3, fontSize:10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

export default function TablePage() {
  const { tkey }        = useParams()
  const { user }        = useAuth()
  const { toast, show } = useToast()
  const def             = DEFS[tkey]

  const [rows,      setRows]      = useState([])
  const [ddhids,    setDdhids]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)
  const [importing, setImporting] = useState(false)
  const [reporte,   setReporte]   = useState(null)
  const [search,    setSearch]    = useState('')
  const [filterD,   setFilterD]   = useState('')
  const [sortCol,   setSortCol]   = useState(null)
  const [sortDir,   setSortDir]   = useState('asc')
  const [platMap,   setPlatMap]   = useState({})        // { DDHID: platData }
  const [platModal, setPlatModal] = useState(null)      // DDHID abierto

  useEffect(() => {
    setRows([]); setLoading(true); setSearch(''); setFilterD(''); setSortCol(null)
    api.get(`/tables/${tkey}`).then(r => setRows(r.data)).finally(() => setLoading(false))
    // Sondajes disponibles: filtrados por profundidad alcanzada en esta tabla
    api.get(`/tables/ddhids/${tkey}`).then(r => setDdhids(r.data || []))
    // Cargar datos de plataforma si estamos en programa_general
    if (tkey === 'programa_general') {
      api.get('/tables/resumen/plataforma').then(r => {
        const map = {}
        ;(r.data || []).forEach(p => {
          if (p.DDHID) map[p.DDHID] = p
          if (p.PLATAFORMA) map['PLAT:' + p.PLATAFORMA] = p
        })
        setPlatMap(map)
      }).catch(() => {})
    }
  }, [tkey])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  async function handleSave(data) {
    try {
      if (modal === 'new') {
        const r = await api.post(`/tables/${tkey}`, data)
        setRows(p => [...p, r.data])
        show('Registro guardado ✓', 'ok')
      } else {
        const r = await api.put(`/tables/${tkey}/${modal.id}`, data)
        setRows(p => p.map(x => x.id === modal.id ? r.data : x))
        show('Registro actualizado ✓', 'ok')
      }
      setModal(null)
    } catch (err) {
      const errs = err.response?.data?.errors
      show(errs ? errs.map(e => e.message).join(' · ') : 'Error al guardar', 'err')
    }
  }

  async function handleDelete(row) {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await api.delete(`/tables/${tkey}/${row.id}`)
      setRows(p => p.filter(x => x.id !== row.id))
      show('Eliminado ✓', 'ok')
    } catch { show('Error al eliminar', 'err') }
  }

  async function handleImport(imported) {
    const r = await api.get(`/tables/${tkey}`)
    setRows(r.data)
    show(`${imported} filas importadas ✓`, 'ok')
    setImporting(false)
  }

  // Filtrar
  const filtered = rows.filter(row => {
    const matchD = !filterD || row.DDHID === filterD
    const matchS = !search  || def.cols.some(c => String(row[c]||'').toLowerCase().includes(search.toLowerCase()))
    return matchD && matchS
  })

  // Ordenar
  const sorted = sortCol ? [...filtered].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol]
    if (NUM_COLS.has(sortCol)) { va = parseFloat(va)||0; vb = parseFloat(vb)||0 }
    else { va = String(va||'').toLowerCase(); vb = String(vb||'').toLowerCase() }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  }) : filtered

  if (!def) return <div className="page-title">Tabla no encontrada</div>

  const isViewer     = user.role === 'VIEWER'
  const canWrite     = !isViewer && (user.role === 'ADMIN' || user.role === 'SUPERVISOR' || (user.tables||[]).includes(tkey))
  // USER puede editar/eliminar solo si es dueño del registro (Geologo === user.name)
  function canEditRow(row) {
    if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') return true
    if (!canWrite) return false
    const geologo = row.Geologo || row.geologo
    // Si no tiene Geologo (tabla sin ese campo), permitir
    if (!geologo) return true
    return geologo === user.name
  }
  function canDeleteRow(row) {
    if (!canEditRow(row)) return false
    // Solo registros de los últimos 10 días
    if (!row.Fecha) return user.role === 'ADMIN' || user.role === 'SUPERVISOR'
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 10)
    return new Date(row.Fecha) >= cutoff
  }
  const canImport    = user.role === 'ADMIN'
  const tieneReporte = TIENE_REPORTE.has(tkey)

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />

      <div style={{ marginBottom:14 }}>
        <div className="page-title">{def.label}</div>
        <div className="page-desc">{sorted.length} registros{sortCol ? ` · Ordenado por ${sortCol} ${sortDir === 'asc' ? '↑' : '↓'}` : ''}</div>
      </div>

      {/* Botones */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
        {canWrite && (
          <button className="btn btn-acc"
            style={{ width:'100%', padding:'13px', fontSize:14, borderRadius:10, justifyContent:'center' }}
            onClick={() => setModal('new')}>
            ＋ Nuevo registro
          </button>
        )}
        {canImport && (
          <button className="btn btn-blu"
            style={{ width:'100%', padding:'12px', fontSize:14, borderRadius:10, justifyContent:'center' }}
            onClick={() => setImporting(true)}>
            📥 Importar CSV
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
        <input className="s-inp"
          style={{ width:'100%', fontSize:16, padding:'12px 14px', minHeight:46, borderRadius:10 }}
          placeholder={`🔍 Buscar en ${def.label}...`}
          value={search} onChange={e => setSearch(e.target.value)} />
        {ddhids.length > 0 && (
          <select className="sel-x"
            style={{ width:'100%', fontSize:16, padding:'12px 14px', minHeight:46, borderRadius:10 }}
            value={filterD} onChange={e => setFilterD(e.target.value)}>
            <option value="">Todos los DDHID</option>
            {ddhids.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {(search || filterD) && (
          <button className="btn btn-out" style={{ width:'100%', padding:'10px', borderRadius:10 }}
            onClick={() => { setSearch(''); setFilterD('') }}>
            ✕ Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="t-wrap">
        <div className="ox">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                {def.cols.map(c => (
                  <th key={c}
                    onClick={() => toggleSort(c)}
                    style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                    {c}<SortIcon col={c} sortCol={sortCol} sortDir={sortDir} />
                  </th>
                ))}
                {tkey === 'programa_general' && <th style={{whiteSpace:'nowrap'}}>C. Plataforma</th>}
                <th>Acc.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={def.cols.length + 2} className="no-data">Cargando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={def.cols.length + 2} className="no-data">Sin registros</td></tr>
              ) : sorted.map((row, idx) => (
                <tr key={row.id}>
                  <td style={{ color:'var(--mut)', fontSize:11 }}>{idx+1}</td>
                  {def.cols.map(col => (
                    <td key={col}>
                      {tkey === 'programa_general' && col === 'EQUIPO'
                        ? (
                          <select
                            value={row.EQUIPO || ''}
                            onChange={async e => {
                              const val = e.target.value
                              try {
                                await api.put('/tables/resumen/equipo', { DDHID: row.DDHID, EQUIPO: val })
                                setRows(prev => prev.map(r => r.id === row.id ? {...r, EQUIPO: val} : r))
                                show(`${row.DDHID} → ${val || 'Sin equipo'} ✓`)
                              } catch(err) { show('Error al guardar equipo','err') }
                            }}
                            style={{
                              background: EQUIPO_COLOR[row.EQUIPO]?.bg || 'var(--sur2)',
                              color:      EQUIPO_COLOR[row.EQUIPO]?.color || 'var(--mut)',
                              border: `1px solid ${EQUIPO_COLOR[row.EQUIPO]?.color || 'var(--brd)'}`,
                              borderRadius:6, padding:'4px 8px',
                              fontSize:12, fontWeight: row.EQUIPO ? 600 : 400,
                              cursor:'pointer', outline:'none', minWidth:120,
                            }}>
                            <option value="">— Sin equipo —</option>
                            {EQUIPOS_PG.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        )
                        : NUM_COLS.has(col) && row[col] !== undefined && row[col] !== null && row[col] !== ''
                          ? parseFloat(row[col]).toLocaleString('es-PE')
                          : DATE_COLS.has(col)
                            ? fmtFecha(row[col])
                            : row[col] ?? '—'
                      }
                    </td>
                  ))}
                  {tkey === 'programa_general' && (() => {
                    const platKey = row.DDHID && String(row.DDHID).trim() !== '' ? row.DDHID : ('PLAT:' + row.PLATAFORMA)
                    const plat = platMap[platKey] || platMap[row.PLATAFORMA] || {}
                    const tiene = !!(plat.status_plataforma || plat.fecha_entrega_plataforma || plat.entregado_por)
                    return (
                      <td style={{textAlign:'center'}}>
                        <button
                          onClick={() => setPlatModal(platKey)}
                          title={tiene ? 'Ver/editar plataforma' : 'Registrar plataforma'}
                          style={{
                            border: 'none', borderRadius: 6, cursor: 'pointer',
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            background: tiene ? '#10b98122' : 'var(--sur2)',
                            color: tiene ? '#10b981' : 'var(--mut)',
                            transition: 'all .15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '.75'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                          {tiene ? '✅ Ver' : '○ Registrar'}
                        </button>
                      </td>
                    )
                  })()}
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      {tieneReporte && (
                        <button className="btn btn-grn btn-sm" title="Reporte WhatsApp"
                          onClick={() => setReporte(row)}>📋</button>
                      )}
                      {canEditRow(row) && (
                        <button className="btn btn-blu btn-sm" onClick={() => setModal(row)} title="Editar">✎</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <RowModal tkey={tkey} onClose={() => setModal(null)} onSave={handleSave}
          onDelete={handleDelete}
          canDelete={modal !== 'new' && canDeleteRow(modal)}
          initData={modal === 'new' ? null : modal} existingRows={rows} ddhids={ddhids} />
      )}
      {importing && (
        <ImportModal tkey={tkey} def={def} onClose={() => setImporting(false)} onImport={handleImport} />
      )}
      {reporte && (
        <ReporteModal tkey={tkey} row={reporte} onClose={() => setReporte(null)} />
      )}
      {platModal && (
        <PlataformaModal
          ddhid={platModal}
          initial={platMap[platModal] || {}}
          onClose={() => setPlatModal(null)}
          onSaved={(data) => {
            setPlatMap(prev => ({...prev, [platModal]: {...(prev[platModal]||{}), ...data, _key: platModal}}))
          }}
        />
      )}
    </div>
  )
}
