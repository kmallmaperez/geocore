import React, { useState, useEffect } from 'react'
import { statCls } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

const ESTADOS = ['En Proceso','Completado']

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color:'var(--brd)', marginLeft:3 }}>⇅</span>
  return <span style={{ color:'var(--acc)', marginLeft:3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function EstadoCell({ row, canEdit, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(row.ESTADO)

  async function save() {
    if (val === row.ESTADO) { setEditing(false); return }
    await onUpdate(row.DDHID, val)
    setEditing(false)
  }

  if (!canEdit) return <span className={`bdg ${statCls(row.ESTADO)}`}>{row.ESTADO}</span>

  if (editing) return (
    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
      <select value={val} onChange={e => setVal(e.target.value)} autoFocus
        style={{ background:'var(--bg)', border:'1px solid var(--acc)', borderRadius:6, padding:'3px 8px', color:'var(--txt)', fontSize:12 }}>
        {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
      <button className="btn btn-grn btn-sm" onClick={save}>✓</button>
      <button className="btn btn-out btn-sm" onClick={() => { setVal(row.ESTADO); setEditing(false) }}>✕</button>
    </div>
  )

  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}
      onClick={() => { setVal(row.ESTADO); setEditing(true) }} title="Clic para editar">
      <span className={`bdg ${statCls(row.ESTADO)}`}>{row.ESTADO}</span>
      <span style={{ fontSize:10, color:'var(--mut)' }}>✎</span>
      {row._estadoManual && <span style={{ fontSize:10, color:'var(--acc)' }} title="Editado manualmente">★</span>}
    </div>
  )
}

// Columnas y cómo ordenarlas
const COLS = [
  { key:'DDHID',       label:'DDHID',      type:'str' },
  { key:'EQUIPO',      label:'EQUIPO',     type:'str' },
  { key:'PLATAFORMA',  label:'PLATAFORMA', type:'str' },
  { key:'PROGRAMADO',  label:'PROG.',      type:'num' },
  { key:'EJECUTADO',   label:'EJEC.',      type:'num' },
  { key:'ESTADO',      label:'ESTADO',     type:'str' },
  { key:'FECHA_INICIO',label:'F_INICIO',   type:'str' },
  { key:'FECHA_FIN',   label:'F_FIN',      type:'str' },
  { key:'PCT',         label:'%',          type:'num' },
]

export default function ResumenPage() {
  const { user }        = useAuth()
  const { toast, show } = useToast()
  const [resumen, setResumen] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortCol, setSortCol] = useState('DDHID')
  const [sortDir, setSortDir] = useState('asc')
  const canEdit = user.role === 'ADMIN' || user.role === 'SUPERVISOR'

  function fetchResumen() {
    api.get('/tables/resumen/general')
      .then(r => {
        // Solo filas con DDHID con valor
        const filtrado = r.data.filter(x => x.DDHID && String(x.DDHID).trim() !== '')
        setResumen(filtrado)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchResumen() }, [])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // Ordenar
  const sorted = [...resumen].sort((a, b) => {
    const colDef = COLS.find(c => c.key === sortCol)
    let va = a[sortCol], vb = b[sortCol]
    if (colDef?.type === 'num') { va = parseFloat(va)||0; vb = parseFloat(vb)||0 }
    else { va = String(va||'').toLowerCase(); vb = String(vb||'').toLowerCase() }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  async function updateEstado(ddhid, estado) {
    try {
      await api.put('/tables/resumen/estado', { DDHID: ddhid, ESTADO: estado })
      setResumen(prev => prev.map(r => r.DDHID === ddhid ? { ...r, ESTADO: estado, _estadoManual: true } : r))
      show(`${ddhid} → ${estado} ✓`)
    } catch (err) {
      show(err.response?.data?.error || 'Error al actualizar estado', 'err')
    }
  }

  async function resetEstado(ddhid) {
    try {
      await api.delete(`/tables/resumen/estado/${ddhid}`)
      fetchResumen()
      show(`${ddhid}: estado restablecido a automático`)
    } catch { show('Error', 'err') }
  }

  function dlCSV() {
    const bom = '\uFEFF'
    const cols = ['#','DDHID','EQUIPO','PLATAFORMA','PROGRAMADO','EJECUTADO','ESTADO','FECHA_INICIO','FECHA_FIN','PCT']
    const lines = [
      cols.join(','),
      ...sorted.map((r, i) => [i+1, r.DDHID, r.EQUIPO, r.PLATAFORMA, r.PROGRAMADO, r.EJECUTADO, r.ESTADO, r.FECHA_INICIO, r.FECHA_FIN, r.PCT+'%'].map(v => `"${v}"`).join(','))
    ]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bom + lines.join('\r\n')], { type:'text/csv;charset=utf-8;' }))
    a.download = `Resumen_General_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />
      <div className="page-title">Resumen General</div>
      <div className="page-desc">{sorted.length} sondajes · Clic en columna para ordenar</div>

      {canEdit && (
        <div className="alert a-warn">
          ✎ Clic sobre el <strong>ESTADO</strong> para cambiarlo.
          Los marcados con <span style={{color:'var(--acc)'}}>★</span> tienen estado manual — usa <strong>↺</strong> para revertir.
        </div>
      )}

      <div className="t-wrap">
        <div className="t-top">
          <span className="t-title">Resumen General</span>
          <button className="btn btn-grn btn-sm" onClick={dlCSV}>⬇ CSV</button>
        </div>
        <div className="ox">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                {COLS.map(c => (
                  <th key={c.key}
                    onClick={() => toggleSort(c.key)}
                    style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                    {c.label}<SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir} />
                  </th>
                ))}
                {canEdit && <th>↺</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canEdit ? 11 : 10} className="no-data">Cargando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={canEdit ? 11 : 10} className="no-data">Sin datos — agrega registros en Programa General con DDHID</td></tr>
              ) : sorted.map((r, i) => (
                <tr key={r.DDHID}>
                  <td style={{ color:'var(--mut)', fontSize:11 }}>{i+1}</td>
                  <td><strong>{r.DDHID}</strong></td>
                  <td>{r.EQUIPO}</td>
                  <td>{r.PLATAFORMA}</td>
                  <td>{r.PROGRAMADO}m</td>
                  <td>{r.EJECUTADO}m</td>
                  <td><EstadoCell row={r} canEdit={canEdit} onUpdate={updateEstado} /></td>
                  <td>{r.FECHA_INICIO}</td>
                  <td>{r.FECHA_FIN}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div className="p-bar"><div className="p-fill" style={{ width:Math.min(r.PCT,100)+'%' }} /></div>
                      <span style={{ fontSize:11, color:'var(--mut)', minWidth:32 }}>{r.PCT}%</span>
                    </div>
                  </td>
                  {canEdit && (
                    <td>{r._estadoManual && (
                      <button className="btn btn-out btn-sm" onClick={() => resetEstado(r.DDHID)} title="Volver a automático">↺</button>
                    )}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
