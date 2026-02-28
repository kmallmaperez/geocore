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

  const [rows,    setRows]    = useState([])
  const [ddhids,  setDdhids]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)   // null | 'new' | row
  const [importing, setImporting] = useState(false)
  const [search,  setSearch]  = useState('')
  const [filterD, setFilterD] = useState('')

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
    if (!confirm(`¿Eliminar este registro?`)) return
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

  // Filtros
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

      {/* Header */}
      <div className="ph-top">
        <div>
          <div className="page-title">{def.label}</div>
          <div className="page-desc">{filtered.length} registros</div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {canImport && (
            <button className="btn btn-blu" onClick={() => setImporting(true)}>📥 CSV</button>
          )}
          {canWrite && (
            <button className="btn btn-acc" onClick={() => setModal('new')}>＋ Nuevo</button>
          )}
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="s-row">
        <input
          className="s-inp"
          placeholder={`Buscar en ${def.label}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:0 }}
        />
        {ddhids.length > 0 && (
          <select className="sel-x" value={filterD} onChange={e => setFilterD(e.target.value)} style={{ minWidth:120 }}>
            <option value="">Todos los DDHID</option>
            {ddhids.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {(search || filterD) && (
          <button className="btn btn-out btn-sm" onClick={() => { setSearch(''); setFilterD('') }}>✕ Limpiar</button>
        )}
      </div>

      {/* Tabla */}
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

      {/* Modales */}
      {modal && (
        <RowModal
          tkey={tkey}
          onClose={() => setModal(null)}
          onSave={handleSave}
          initData={modal === 'new' ? null : modal}
          existingRows={rows}
          ddhids={ddhids}
        />
      )}
      {importing && (
        <ImportModal
          tkey={tkey}
          def={def}
          onClose={() => setImporting(false)}
          onImport={handleImport}
        />
      )}
    </div>
  )
}
