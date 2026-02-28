import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { DEFS, NUM_COLS } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'
import RowModal from '../components/RowModal'
import ImportModal from '../components/ImportModal'
import ReporteModal from '../components/ReporteModal'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

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

  useEffect(() => {
    setRows([]); setLoading(true); setSearch(''); setFilterD(''); setSortCol(null)
    api.get(`/tables/${tkey}`).then(r => setRows(r.data)).finally(() => setLoading(false))
    api.get('/tables/programa_general').then(r => setDdhids(r.data.map(x => x.DDHID).filter(Boolean)))
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

  const canWrite     = user.role === 'ADMIN' || user.role === 'SUPERVISOR' || (user.tables||[]).includes(tkey)
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
                  {def.cols.map(c => (
                    <td key={c}>
                      {NUM_COLS.has(c) && row[c] !== undefined && row[c] !== null && row[c] !== ''
                        ? parseFloat(row[c]).toLocaleString('es-PE')
                        : row[c] ?? '—'}
                    </td>
                  ))}
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      {tieneReporte && (
                        <button className="btn btn-grn btn-sm" title="Reporte WhatsApp"
                          onClick={() => setReporte(row)}>📋</button>
                      )}
                      {canWrite && (
                        <button className="btn btn-blu btn-sm" onClick={() => setModal(row)}>✎</button>
                      )}
                      {canWrite && user.role !== 'USER' && (
                        <button className="btn btn-red btn-sm" onClick={() => handleDelete(row)}>✕</button>
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
          initData={modal === 'new' ? null : modal} existingRows={rows} ddhids={ddhids} />
      )}
      {importing && (
        <ImportModal tkey={tkey} def={def} onClose={() => setImporting(false)} onImport={handleImport} />
      )}
      {reporte && (
        <ReporteModal tkey={tkey} row={reporte} onClose={() => setReporte(null)} />
      )}
    </div>
  )
}
