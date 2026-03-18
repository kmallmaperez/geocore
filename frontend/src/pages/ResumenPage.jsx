import React, { useState, useEffect } from 'react'
import { statCls, fmtFecha } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

const ESTADOS = ['En Proceso','Completado','Pendiente']

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color:'var(--brd)', marginLeft:3 }}>⇅</span>
  return <span style={{ color:'var(--acc)', marginLeft:3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

// ── Celda editable genérica ───────────────────────────────────────
function EditCell({ value, canEdit, onSave, children, align='left' }) {
  const [editing, setEditing] = useState(false)
  if (!canEdit) return <span style={{color:value?'var(--txt)':'var(--mut)',fontSize:12}}>{value||'—'}</span>
  if (!editing) return (
    <div style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}} onClick={()=>setEditing(true)}>
      <span style={{color:value?'var(--txt)':'var(--mut)',fontSize:12}}>{value||<span style={{color:'var(--mut)',fontSize:11}}>—</span>}</span>
      <span style={{fontSize:9,color:'var(--mut)'}}>✎</span>
    </div>
  )
  return React.cloneElement(children, {
    autoFocus: true,
    onSave: async (v) => { await onSave(v); setEditing(false) },
    onCancel: () => setEditing(false),
    currentValue: value,
  })
}

// ── Inputs inline ─────────────────────────────────────────────────
function DateInput({ onSave, onCancel, currentValue }) {
  const [v, setV] = useState(currentValue ? String(currentValue).slice(0,10) : '')
  return (
    <div style={{display:'flex',gap:3,alignItems:'center'}}>
      <input type="date" value={v} onChange={e=>setV(e.target.value)} autoFocus
        style={{background:'var(--bg)',border:'1px solid var(--acc)',borderRadius:5,padding:'3px 6px',color:'var(--txt)',fontSize:11,outline:'none'}}/>
      <button className="btn btn-grn btn-sm" onClick={()=>onSave(v)}>✓</button>
      <button className="btn btn-out btn-sm" onClick={onCancel}>✕</button>
    </div>
  )
}

function SelectInput({ options, onSave, onCancel, currentValue }) {
  const [v, setV] = useState(currentValue||'')
  return (
    <div style={{display:'flex',gap:3,alignItems:'center'}}>
      <select value={v} onChange={e=>setV(e.target.value)} autoFocus
        style={{background:'var(--bg)',border:'1px solid var(--acc)',borderRadius:5,padding:'3px 8px',color:'var(--txt)',fontSize:11,outline:'none'}}>
        <option value="">— Seleccionar —</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
      <button className="btn btn-grn btn-sm" onClick={()=>onSave(v)}>✓</button>
      <button className="btn btn-out btn-sm" onClick={onCancel}>✕</button>
    </div>
  )
}

function EntregadoPorInput({ onSave, onCancel, currentValue }) {
  const OPTIONS = ['MCP','Alex Bautista','Juan Churi','Willy Ascencio','Otro']
  // Detect if current value is a custom "Otro" entry
  const isOtro = currentValue && !OPTIONS.slice(0,-1).includes(currentValue)
  const [sel, setSel] = useState(isOtro ? 'Otro' : (currentValue||''))
  const [otro, setOtro] = useState(isOtro ? currentValue : '')

  function handleSave() {
    const val = sel === 'Otro' ? otro.trim() : sel
    onSave(val)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      <div style={{display:'flex',gap:3,alignItems:'center'}}>
        <select value={sel} onChange={e=>setSel(e.target.value)} autoFocus
          style={{background:'var(--bg)',border:'1px solid var(--acc)',borderRadius:5,padding:'3px 8px',color:'var(--txt)',fontSize:11,outline:'none'}}>
          <option value="">— Seleccionar —</option>
          {OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
        <button className="btn btn-grn btn-sm" onClick={handleSave} disabled={sel==='Otro'&&!otro.trim()}>✓</button>
        <button className="btn btn-out btn-sm" onClick={onCancel}>✕</button>
      </div>
      {sel==='Otro' && (
        <input autoFocus value={otro} onChange={e=>setOtro(e.target.value)}
          placeholder="Ingresa el nombre..."
          style={{background:'var(--bg)',border:'1px solid var(--acc)',borderRadius:5,padding:'4px 8px',color:'var(--txt)',fontSize:11,outline:'none',width:180}}/>
      )}
    </div>
  )
}

// ── Celda ESTADO ───────────────────────────────────────────────────
function EstadoCell({ row, canEdit, onUpdateEstado }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(row.ESTADO)
  async function save() {
    if (val === row.ESTADO) { setEditing(false); return }
    await onUpdateEstado(row.DDHID, val); setEditing(false)
  }
  if (!canEdit) return <span className={`bdg ${statCls(row.ESTADO)}`}>{row.ESTADO}</span>
  if (editing) return (
    <div style={{display:'flex',gap:4,alignItems:'center'}}>
      <select value={val} onChange={e=>setVal(e.target.value)} autoFocus
        style={{background:'var(--bg)',border:'1px solid var(--acc)',borderRadius:6,padding:'3px 8px',color:'var(--txt)',fontSize:12}}>
        {ESTADOS.map(e=><option key={e} value={e}>{e}</option>)}
      </select>
      <button className="btn btn-grn btn-sm" onClick={save}>✓</button>
      <button className="btn btn-out btn-sm" onClick={()=>{setVal(row.ESTADO);setEditing(false)}}>✕</button>
    </div>
  )
  return (
    <div style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}
      onClick={()=>{setVal(row.ESTADO);setEditing(true)}} title="Clic para editar">
      <span className={`bdg ${statCls(row.ESTADO)}`}>{row.ESTADO}</span>
      <span style={{fontSize:10,color:'var(--mut)'}}>✎</span>
      {row._estadoManual && <span style={{fontSize:10,color:'var(--acc)'}} title="Editado manualmente">★</span>}
    </div>
  )
}

// ── Celda EQUIPO — solo lectura (se edita desde Programa General) ──
function EquipoCell({ row }) {
  return <span style={{fontSize:12}}>{row.EQUIPO||<span style={{color:'var(--mut)',fontSize:11}}>—</span>}</span>
}

const COLS = [
  { key:'DDHID',       label:'DDHID',     type:'str' },
  { key:'EQUIPO',      label:'EQUIPO',    type:'str' },
  { key:'PLATAFORMA',  label:'PLAT.',     type:'str' },
  { key:'PROGRAMADO',  label:'PROG.(m)',  type:'num' },
  { key:'EJECUTADO',   label:'EJEC.(m)',  type:'num' },
  { key:'ESTADO',      label:'ESTADO',    type:'str' },
  { key:'FECHA_INICIO',label:'F_INICIO',  type:'str' },
  { key:'FECHA_FIN',   label:'F_FIN',     type:'str' },
  { key:'PCT',         label:'%',         type:'num' },
  { key:'FECHA_ENTREGA_PLAT', label:'F.ENTREGA PLAT.',  type:'str' },
  { key:'FECHA_PREINICIO',    label:'F.PRE-INICIO PERF.',type:'str' },
  { key:'FECHA_CIERRE_PLAT',  label:'F.CIERRE PLAT.',   type:'str' },
  { key:'STATUS_PLATAFORMA',  label:'STATUS PLAT.',     type:'str' },
  { key:'FORMATO_CHECKLIST',  label:'CHECKLIST',        type:'str' },
  { key:'ENTREGADO_POR',      label:'ENTREGADO POR',    type:'str' },
]

export default function ResumenPage() {
  const { user }        = useAuth()
  const { toast, show } = useToast()
  const [resumen,  setResumen]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [sortCol,  setSortCol]  = useState('DDHID')
  const [sortDir,  setSortDir]  = useState('asc')
  const canEdit = user.role === 'ADMIN' || user.role === 'SUPERVISOR'

  function fetchResumen() {
    setLoading(true)
    api.get('/tables/resumen/general')
      .then(r => setResumen((r.data || []).filter(x => {
        const tieneDDHID = x.DDHID && String(x.DDHID).trim() !== ''
        const tienePlat  = x.STATUS_PLATAFORMA || x.FECHA_ENTREGA_PLAT || x.ENTREGADO_POR
        return tieneDDHID || tienePlat
      })))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchResumen() }, [])

  function toggleSort(col) {
    if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = [...resumen].sort((a,b) => {
    const colDef = COLS.find(c=>c.key===sortCol)
    let va=a[sortCol], vb=b[sortCol]
    if (colDef?.type==='num') { va=parseFloat(va)||0; vb=parseFloat(vb)||0 }
    else { va=String(va||'').toLowerCase(); vb=String(vb||'').toLowerCase() }
    if (va<vb) return sortDir==='asc'?-1:1
    if (va>vb) return sortDir==='asc'?1:-1
    return 0
  })

  async function updateEstado(ddhid, estado) {
    try {
      await api.put('/tables/resumen/estado', { DDHID:ddhid, ESTADO:estado })
      setResumen(prev => prev.map(r => r.DDHID===ddhid ? {...r,ESTADO:estado,_estadoManual:true} : r))
      show(`${ddhid} → ${estado} ✓`)
    } catch(err) { show(err.response?.data?.error||'Error','err') }
  }

  // EQUIPO se edita desde Programa General

  async function updatePlataforma(ddhid, campo, valor) {
    try {
      await api.put('/tables/resumen/plataforma', { DDHID:ddhid, campo, valor })
      const keyMap = {
        fecha_entrega_plataforma:    'FECHA_ENTREGA_PLAT',
        fecha_preinicio_perforacion: 'FECHA_PREINICIO',
        fecha_cierre_plataforma:     'FECHA_CIERRE_PLAT',
        status_plataforma:           'STATUS_PLATAFORMA',
        formato_checklist:           'FORMATO_CHECKLIST',
        entregado_por:               'ENTREGADO_POR',
      }
      const frontKey = keyMap[campo]
      setResumen(prev => prev.map(r => r.DDHID===ddhid ? {...r, [frontKey]: valor||null} : r))
      show(`${ddhid} actualizado ✓`)
    } catch(err) { show(err.response?.data?.error||'Error','err') }
  }

  async function resetEstado(ddhid) {
    try {
      await api.delete(`/tables/resumen/estado/${ddhid}`)
      fetchResumen(); show(`${ddhid}: estado restablecido`)
    } catch { show('Error','err') }
  }

  function dlCSV() {
    const bom = '\uFEFF'
    const cols = ['#','DDHID','EQUIPO','PLATAFORMA','PROG.(m)','EJEC.(m)','ESTADO','F_INICIO','F_FIN','%',
                  'F.ENTREGA PLAT.','F.PRE-INICIO PERF.','F.CIERRE PLAT.','STATUS PLAT.','CHECKLIST','ENTREGADO POR']
    const lines = [cols.join(','), ...sorted.map((r,i) => [
      i+1, r.DDHID, r.EQUIPO||'', r.PLATAFORMA||'',
      r.PROGRAMADO, r.EJECUTADO, r.ESTADO,
      r.FECHA_INICIO||'', r.FECHA_FIN||'', r.PCT+'%',
      r.FECHA_ENTREGA_PLAT||'', r.FECHA_PREINICIO||'', r.FECHA_CIERRE_PLAT||'',
      r.STATUS_PLATAFORMA||'', r.FORMATO_CHECKLIST||'', r.ENTREGADO_POR||'',
    ].map(v=>`"${v}"`).join(','))]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bom+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}))
    a.download = `Resumen_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  // Formato fecha para mostrar (de ISO a DD/MM/YYYY)
  function fmt(v) {
    if (!v) return null
    const s = String(v).slice(0,10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return v
    const [y,m,d] = s.split('-')
    return `${d}/${m}/${y}`
  }

  const thStyle = { cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', fontSize:11 }

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div className="page-title">Resumen de Sondajes</div>
      <div className="page-desc">{sorted.length} sondajes · Clic en columna para ordenar</div>

      {canEdit && (
        <div className="alert a-warn" style={{marginBottom:14}}>
          ✎ Clic sobre cualquier celda en azul para editarla. El equipo se asigna desde Programa General.
          Los estados con <span style={{color:'var(--acc)'}}>★</span> son manuales — usa <strong>↺</strong> para revertir.
        </div>
      )}

      <div className="t-wrap">
        <div className="t-top">
          <span className="t-title">Resumen de Sondajes</span>
          <button className="btn btn-grn btn-sm" onClick={dlCSV}>⬇ CSV</button>
        </div>
        <div className="ox">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                {COLS.map(c=>(
                  <th key={c.key} onClick={()=>toggleSort(c.key)} style={thStyle}>
                    {c.label}<SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir}/>
                  </th>
                ))}
                {canEdit && <th>↺</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLS.length+2} className="no-data">Cargando...</td></tr>
              ) : sorted.length===0 ? (
                <tr><td colSpan={COLS.length+2} className="no-data">Sin datos</td></tr>
              ) : sorted.map((r,i) => (
                <tr key={r.DDHID}>
                  <td style={{color:'var(--mut)',fontSize:11}}>{i+1}</td>
                  <td><strong>{r.DDHID}</strong></td>
                  <td><EquipoCell row={r}/></td>
                  <td>{r.PLATAFORMA}</td>
                  <td>{r.PROGRAMADO}m</td>
                  <td>{r.EJECUTADO}m</td>
                  <td><EstadoCell row={r} canEdit={canEdit} onUpdateEstado={updateEstado}/></td>
                  <td>{fmtFecha(r.FECHA_INICIO)}</td>
                  <td>{fmtFecha(r.FECHA_FIN)}</td>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div className="p-bar"><div className="p-fill" style={{width:Math.min(r.PCT,100)+'%'}}/></div>
                      <span style={{fontSize:11,color:'var(--mut)',minWidth:32}}>{r.PCT}%</span>
                    </div>
                  </td>

                  {/* ── Campos plataforma ── */}
                  <td style={{fontSize:12,color:'var(--txt)'}}>{fmt(r.FECHA_ENTREGA_PLAT)||<span style={{color:'var(--mut)'}}>—</span>}</td>
                  <td style={{fontSize:12,color:'var(--txt)'}}>{fmt(r.FECHA_PREINICIO)||<span style={{color:'var(--mut)'}}>—</span>}</td>
                  <td style={{fontSize:12,color:'var(--txt)'}}>{fmt(r.FECHA_CIERRE_PLAT)||<span style={{color:'var(--mut)'}}>—</span>}</td>
                  <td style={{fontSize:12,color:'var(--txt)'}}>{r.STATUS_PLATAFORMA||<span style={{color:'var(--mut)'}}>—</span>}</td>
                  <td style={{fontSize:12,color:'var(--txt)'}}>{r.FORMATO_CHECKLIST||<span style={{color:'var(--mut)'}}>—</span>}</td>
                  <td style={{fontSize:12,color:'var(--txt)'}}>{r.ENTREGADO_POR||<span style={{color:'var(--mut)'}}>—</span>}</td>

                  {canEdit && (
                    <td>{r._estadoManual && (
                      <button className="btn btn-out btn-sm" onClick={()=>resetEstado(r.DDHID)} title="Volver a automático">↺</button>
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
