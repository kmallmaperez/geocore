import React, { useState, useEffect } from 'react'
import { statCls } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

const ESTADOS = ['En Proceso','Completado']

function EstadoCell({ row, canEdit, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(row.ESTADO)

  async function save() {
    if (val === row.ESTADO) { setEditing(false); return }
    await onUpdate(row.DDHID, val)
    setEditing(false)
  }

  if (!canEdit) return <span className={`bdg ${statCls(row.ESTADO)}`}>{row.ESTADO}</span>

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <select
          value={val}
          onChange={e => setVal(e.target.value)}
          autoFocus
          style={{ background: 'var(--bg)', border: '1px solid var(--acc)', borderRadius: 6, padding: '3px 8px', color: 'var(--txt)', fontSize: 12 }}
        >
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button className="btn btn-grn btn-sm" onClick={save}>✓</button>
        <button className="btn btn-out btn-sm" onClick={() => { setVal(row.ESTADO); setEditing(false) }}>✕</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => { setVal(row.ESTADO); setEditing(true) }} title="Clic para editar">
      <span className={`bdg ${statCls(row.ESTADO)}`}>{row.ESTADO}</span>
      <span style={{ fontSize: 10, color: 'var(--mut)' }}>✎</span>
      {row._estadoManual && <span style={{ fontSize: 10, color: 'var(--acc)' }} title="Editado manualmente">★</span>}
    </div>
  )
}

export default function ResumenPage() {
  const { user }        = useAuth()
  const { toast, show } = useToast()
  const [resumen, setResumen] = useState([])
  const [loading, setLoading] = useState(true)
  const canEdit = user.role === 'ADMIN' || user.role === 'SUPERVISOR'

  function fetchResumen() {
    api.get('/tables/resumen/general')
      .then(r => setResumen(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchResumen() }, [])

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
    const cols = ['#','DDHID','EQUIPO','PLATAFORMA','PROGRAMADO','EJECUTADO','ESTADO','FECHA_INICIO','FECHA_FIN','PCT']
    const lines = [
      cols.join(','),
      ...resumen.map((r, i) => [i+1, r.DDHID, r.EQUIPO, r.PLATAFORMA, r.PROGRAMADO, r.EJECUTADO, r.ESTADO, r.FECHA_INICIO, r.FECHA_FIN, r.PCT+'%'].map(v => `"${v}"`).join(','))
    ]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = 'resumen_general.csv'; a.click()
  }

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />
      <div className="page-title">Resumen General</div>
      <div className="page-desc">{resumen.length} sondajes · Estado editable por ADMIN/SUPERVISOR</div>

      {canEdit && (
        <div className="alert a-warn">
          ✎ Haz clic sobre el <strong>ESTADO</strong> de cualquier fila para cambiarlo manualmente.
          Los marcados con <span style={{color:'var(--acc)'}}>★</span> tienen estado manual — usa <strong>↺ Auto</strong> para revertir al calculado.
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
                {['DDHID','EQUIPO','PLATAFORMA','PROGRAMADO','EJECUTADO','ESTADO','F_INICIO','F_FIN','%'].map(c => <th key={c}>{c}</th>)}
                {canEdit && <th>↺</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canEdit ? 11 : 10} className="no-data">Cargando...</td></tr>
              ) : resumen.length === 0 ? (
                <tr><td colSpan={canEdit ? 11 : 10} className="no-data">Sin datos — agrega registros en Programa General y Perforación</td></tr>
              ) : resumen.map((r, i) => (
                <tr key={r.DDHID}>
                  <td style={{ color: 'var(--mut)', fontSize: 11 }}>{i + 1}</td>
                  <td><strong>{r.DDHID}</strong></td>
                  <td>{r.EQUIPO}</td>
                  <td>{r.PLATAFORMA}</td>
                  <td>{r.PROGRAMADO}m</td>
                  <td>{r.EJECUTADO}m</td>
                  <td><EstadoCell row={r} canEdit={canEdit} onUpdate={updateEstado} /></td>
                  <td>{r.FECHA_INICIO}</td>
                  <td>{r.FECHA_FIN}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="p-bar"><div className="p-fill" style={{ width: Math.min(r.PCT, 100) + '%' }} /></div>
                      <span style={{ fontSize: 11, color: 'var(--mut)', minWidth: 32 }}>{r.PCT}%</span>
                    </div>
                  </td>
                  {canEdit && (
                    <td>
                      {r._estadoManual && (
                        <button className="btn btn-out btn-sm" onClick={() => resetEstado(r.DDHID)} title="Volver a automático">↺</button>
                      )}
                    </td>
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
