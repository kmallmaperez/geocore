import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { DEFS, NUM_COLS } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'
import RowModal from '../components/RowModal'
import ImportModal from '../components/ImportModal'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

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
  const [search,    setSearch]    = useState('')
  const [filterD,   setFilterD]   = useState('')

  useEffect(() => {
    setRows([]); setLoading(true); setSearch(''); setFilterD('')
    api.get(`/tables/${tkey}`).then(r => setRows(r.data)).finally(() => setLoading(false))
    api.get('/tables/programa_general').then(r => setDdhids(r.data.map(x => x.DDHID).filter(Boolean)))
  }, [tkey])

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

  const filtered = rows.filter(row => {
    const matchD = !filterD || row.DDHID === filterD
    const matchS = !search  || def.cols.some(c => String(row[c]||'').toLowerCase().includes(search.toLowerCase()))
    return matchD && matchS
  })

  if (!def) return <div className="page-title">Tabla no encontrada</div>

  const canWrite  = user.role === 'ADMIN' || user.role === 'SUPERVISOR' || (user.tables||[]).includes(tkey)
  const canImport = user.role === 'ADMIN'

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Header con título y botones */}
      <div style={{ marginBottom: 14 }}>
        <div className="page-title">{def.label}</div>
        <div className="page-desc">{filtered.length} registros</div>
      </div>

      {/* Botones de acción — apilados en mobile */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
        {canWrite && (
          <button className="btn btn-acc" style={{ width:'100%', padding:'13px', fontSize:14, borderRadius:10, justifyContent:'center' }}
            onClick={() => setModal('new')}>
            ＋ Nuevo registro
          </button>
        )}
        {canImport && (
          <button className="btn btn-blu" style={{ width:'100%', padding:'12px', fontSize:14, borderRadius:10, justifyContent:'center' }}
            onClick={() => setImporting(true)}>
            📥 Importar CSV
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
        <input
          className="s-inp"
          style={{ width:'100%', fontSize:16, padding:'12px 14px', minHeight:46, borderRadius:10 }}
          placeholder={`🔍 Buscar en ${def.label}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {ddhids.length > 0 && (
          <select
            className="sel-x"
            style={{ width:'100%', fontSize:16, padding:'12px 14px', minHeight:46, borderRadius:10 }}
            value={filterD}
            onChange={e => setFilterD(e.target.value)}
          >
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

      {/* Tabla con scroll horizontal */}
      <div className="t-wrap">
        <div className="ox">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                {def.cols.map(c => <th key={c}>{c}</th>)}
                {canWrite && <th>Acc.</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={def.cols.length + (canWrite?2:1)} className="no-data">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={def.cols.length + (canWrite?2:1)} className="no-data">Sin registros</td></tr>
              ) : filtered.map((row, idx) => (
                <tr key={row.id}>
                  <td style={{ color:'var(--mut)', fontSize:11 }}>{idx+1}</td>
                  {def.cols.map(c => (
                    <td key={c}>
                      {NUM_COLS.has(c) && row[c] !== undefined && row[c] !== null && row[c] !== ''
                        ? parseFloat(row[c]).toLocaleString()
                        : row[c] ?? '—'}
                    </td>
                  ))}
                  {canWrite && (
                    <td>
                      <div style={{ display:'flex', gap:5 }}>
                        <button className="btn btn-blu btn-sm" onClick={() => setModal(row)}>✎</button>
                        {user.role !== 'USER' && (
                          <button className="btn btn-red btn-sm" onClick={() => handleDelete(row)}>✕</button>
                        )}
                      </div>
                    </td>
                  )}
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
    </div>
  )
}
