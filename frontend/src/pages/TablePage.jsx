import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { DEFS } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'
import RowModal from '../components/RowModal'
import ImportModal from '../components/ImportModal'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

export default function TablePage() {
  const { tkey } = useParams()
  const { user } = useAuth()
  const { toast, show } = useToast()
  const def = DEFS[tkey]

  const [rows, setRows]           = useState([])
  const [ddhids, setDdhids]       = useState([])
  const [search, setSearch]       = useState('')
  const [filterDDHID, setFilter]  = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editRow, setEditRow]     = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    setRows([]); setSearch(''); setFilter(''); setLoading(true)
    fetchRows()
    api.get('/tables/programa_general')
      .then(r => setDdhids(r.data.map(x => x.DDHID)))
      .catch(() => {})
  }, [tkey])

  function fetchRows() {
    api.get(`/tables/${tkey}`)
      .then(r => setRows(r.data))
      .catch(() => show('Error al cargar datos', 'err'))
      .finally(() => setLoading(false))
  }

  async function handleSave(data) {
    try {
      if (editRow) {
        const r = await api.put(`/tables/${tkey}/${editRow.id}`, data)
        setRows(prev => prev.map(x => x.id === editRow.id ? r.data : x))
        show('Registro actualizado ✓')
      } else {
        const r = await api.post(`/tables/${tkey}`, data)
        setRows(prev => [...prev, r.data])
        show('Registro agregado ✓')
      }
      setShowModal(false); setEditRow(null)
    } catch (err) {
      const errs = err.response?.data?.errors
      if (errs) show(errs.map(e => e.message).join(' | '), 'err')
      else show(err.response?.data?.error || 'Error al guardar', 'err')
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar este registro?')) return
    try {
      await api.delete(`/tables/${tkey}/${id}`)
      setRows(prev => prev.filter(r => r.id !== id))
      show('Registro eliminado', 'warn')
    } catch (err) {
      show(err.response?.data?.error || 'Error al eliminar', 'err')
    }
  }

  function dlCSV() {
    if (!filtered.length) { show('Sin datos para exportar', 'warn'); return }
    const cols = def.cols
    const lines = [cols.join(','), ...filtered.map(r => cols.map(c => `"${r[c] ?? ''}"`).join(','))]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = `${tkey}.csv`; a.click()
  }

  const canEdit   = user.role !== 'USER' || user.tables.includes('all') || user.tables.includes(tkey)
  const canImport = user.role === 'ADMIN'

  const filtered = rows.filter(r => {
    const ms = !search || Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
    const md = !filterDDHID || r.DDHID === filterDDHID
    return ms && md
  })

  if (!def) return <div className="page-title">Tabla no encontrada</div>

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />

      <div className="ph-top">
        <div>
          <div className="page-title">{def.label}</div>
          <div className="page-desc">{def.cols.length} columnas · {rows.length} registros</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canImport && (
            <button className="btn btn-blu" onClick={() => setShowImport(true)}>
              📥 Importar CSV
            </button>
          )}
          {canEdit && (
            <button className="btn btn-acc" onClick={() => { setEditRow(null); setShowModal(true) }}>
              +&nbsp; Nuevo Registro
            </button>
          )}
        </div>
      </div>

      {user.role === 'USER' && (
        <div className="alert a-warn">👁 Mostrando solo registros de los últimos 10 días</div>
      )}

      <div className="s-row">
        <input className="s-inp" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        {ddhids.length > 0 && (
          <select className="sel-x" value={filterDDHID} onChange={e => setFilter(e.target.value)}>
            <option value="">Todos los DDHID</option>
            {ddhids.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button className="btn btn-out btn-sm" onClick={dlCSV}>⬇ CSV</button>
      </div>

      <div className="t-wrap">
        <div className="ox">
          <table className="tbl">
            <thead>
              <tr><th>#</th>{def.cols.map(c => <th key={c}>{c}</th>)}<th>Acc.</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={def.cols.length + 2} className="no-data">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={def.cols.length + 2} className="no-data">Sin registros</td></tr>
              ) : filtered.map((row, idx) => (
                <tr key={row.id}><td style={{ color: "var(--mut)", fontSize: 11 }}>{idx + 1}</td>
                  {def.cols.map(c => <td key={c}>{row[c] != null ? String(row[c]) : '—'}</td>)}
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {canEdit && (
                        <button className="btn btn-blu btn-sm" onClick={() => { setEditRow(row); setShowModal(true) }}>✏</button>
                      )}
                      {(user.role === 'ADMIN' || user.role === 'SUPERVISOR') && (
                        <button className="btn btn-red btn-sm" onClick={() => handleDelete(row.id)}>🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <RowModal
          tkey={tkey}
          onClose={() => { setShowModal(false); setEditRow(null) }}
          onSave={handleSave}
          initData={editRow}
          existingRows={rows}
          ddhids={ddhids}
        />
      )}

      {showImport && (
        <ImportModal
          tkey={tkey}
          onClose={() => setShowImport(false)}
          onImported={() => { fetchRows(); show(`CSV importado correctamente ✓`) }}
        />
      )}
    </div>
  )
}
