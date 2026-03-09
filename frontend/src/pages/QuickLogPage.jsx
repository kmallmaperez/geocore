import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../utils/api'
import Toast, { useToast } from '../components/Toast'

// ── Catálogos ─────────────────────────────────────────────────────
const LITO_LIST = [
  { cod:0,  desc:'Cobertura' },
  { cod:1,  desc:'Diorita/Andesita Porfiritica' },
  { cod:2,  desc:'Granodiorica' },
  { cod:3,  desc:'Porfido Feldespatico' },
  { cod:4,  desc:'Porfido Cuarcifero' },
  { cod:5,  desc:'Porfido Dacitico' },
  { cod:6,  desc:'Porfido Yantac' },
  { cod:7,  desc:'Endoskarn' },
  { cod:11, desc:'Skarn' },
  { cod:12, desc:'Skarn de Magnetita' },
  { cod:13, desc:'Basalto Montero' },
  { cod:14, desc:'Hornfels' },
  { cod:15, desc:'Shale (Lutitas)' },
  { cod:16, desc:'Sedimentos Calcareos' },
  { cod:17, desc:'Anhidrita / Yeso' },
  { cod:18, desc:'Sandstone (Areniscas)' },
  { cod:19, desc:'Brecha en Igneos' },
  { cod:20, desc:'Brecha en Sedimentos' },
  { cod:21, desc:'Volcanicos Catalina' },
  { cod:25, desc:'Relleno' },
]
const ALTER_BY_LITO = {
  0:  [{ cod:0,  desc:'Cobertura' },{ cod:25, desc:'Relleno' }],
  1:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argilica' },{ cod:6,  desc:'Silicificacion' },{ cod:25, desc:'Relleno' }],
  2:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argilica' },{ cod:6,  desc:'Silicificacion' },{ cod:25, desc:'Relleno' }],
  3:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argilica' },{ cod:6,  desc:'Silicificacion' },{ cod:25, desc:'Relleno' }],
  4:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argilica' },{ cod:6,  desc:'Silicificacion' },{ cod:25, desc:'Relleno' }],
  5:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argilica' },{ cod:6,  desc:'Silicificacion' },{ cod:25, desc:'Relleno' }],
  6:  [{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:5,  desc:'Argilica' },{ cod:25, desc:'Relleno' }],
  7:  [{ cod:5,  desc:'Argilica' },{ cod:9,  desc:'Skarn de Tremolita-Actinolita, Clorita' },{ cod:10, desc:'Skarn de Serpentina Magnetita' },{ cod:11, desc:'Skarn de Diopsido-Granate' },{ cod:25, desc:'Relleno' }],
  11: [{ cod:5,  desc:'Argilica' },{ cod:9,  desc:'Skarn de Tremolita-Actinolita, Clorita' },{ cod:25, desc:'Relleno' }],
  12: [{ cod:5,  desc:'Argilica' },{ cod:18, desc:'Skarn de Magnetita' },{ cod:25, desc:'Relleno' }],
  13: [{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:5,  desc:'Argilica' },{ cod:25, desc:'Relleno' }],
  14: [{ cod:5,  desc:'Argilica' },{ cod:12, desc:'Honfels Verde - Diopsido en Horfels' },{ cod:25, desc:'Relleno' }],
  15: [{ cod:5,  desc:'Argilica' },{ cod:17, desc:'Shale (Lutitas)' },{ cod:25, desc:'Relleno' }],
  16: [{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:5,  desc:'Argilica' },{ cod:15, desc:'Sedimentos Calcareos - Marmol' },{ cod:25, desc:'Relleno' }],
  17: [{ cod:5,  desc:'Argilica' },{ cod:16, desc:'Anhidrita / Yeso - Marmol' },{ cod:25, desc:'Relleno' }],
  18: [{ cod:5,  desc:'Argilica' },{ cod:19, desc:'Sandstone (Areniscas)' },{ cod:25, desc:'Relleno' }],
  19: [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argilica' },{ cod:6,  desc:'Silicificacion' },{ cod:25, desc:'Relleno' }],
  20: [{ cod:5,  desc:'Argilica' },{ cod:9,  desc:'Skarn de Tremolita-Actinolita, Clorita' },{ cod:10, desc:'Skarn de Serpentina Magnetita' },{ cod:11, desc:'Skarn de Diopsido-Granate' },{ cod:25, desc:'Relleno' }],
  21: [{ cod:5,  desc:'Argilica' },{ cod:25, desc:'Relleno' }],
  25: [{ cod:25, desc:'Relleno' }],
}

function newRow(from = '0') {
  return { _id: Math.random().toString(36).slice(2), from: String(from), to: '', lito_cod: null, lito_desc: '', alter_cod: null, alter_desc: '', extra: '', obs: '' }
}

// ── Popup flotante ────────────────────────────────────────────────
function Popup({ items, anchor, onSelect, onClose }) {
  const ref  = useRef(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [anchor])

  // Posición relativa al viewport
  const rect = anchor?.getBoundingClientRect()
  const top  = rect ? Math.min(rect.bottom + 4, window.innerHeight - 280) : 100
  const left = rect ? Math.min(rect.left, window.innerWidth - 310) : 100

  const filtered = items.filter(i => i.desc.toLowerCase().includes(search.toLowerCase()) || String(i.cod).includes(search))

  return (
    <div ref={ref} style={{
      position:'fixed', zIndex:2000, background:'var(--sur)',
      border:'1px solid var(--brd)', borderRadius:10,
      boxShadow:'0 8px 32px rgba(0,0,0,.4)',
      width:300, top, left,
    }}>
      <div style={{padding:'8px 10px',borderBottom:'1px solid var(--brd)'}}>
        <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Buscar..." style={{
            width:'100%',background:'var(--sur2)',border:'1px solid var(--brd)',
            borderRadius:6,padding:'5px 10px',color:'var(--txt)',fontSize:12,outline:'none'
          }}/>
      </div>
      <div style={{maxHeight:240,overflowY:'auto'}}>
        {filtered.length === 0
          ? <div style={{padding:'12px 16px',color:'var(--mut)',fontSize:12,textAlign:'center'}}>Sin resultados</div>
          : filtered.map(item => (
            <div key={item.cod} onClick={()=>{onSelect(item);onClose()}}
              style={{padding:'8px 14px',cursor:'pointer',fontSize:12,
                borderBottom:'1px solid var(--brd)',display:'flex',gap:8,alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--sur2)'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>
              <span style={{color:'var(--mut)',fontSize:10,minWidth:18,textAlign:'right'}}>{item.cod}</span>
              <span>{item.desc}</span>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────
export default function QuickLogPage() {
  const { toast, show } = useToast()
  const [ddhids,    setDdhids]    = useState([])
  const [ddhid,     setDdhid]     = useState('')
  const [rows,      setRows]      = useState([newRow()])
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [popup,     setPopup]     = useState(null)  // { type, rowId, anchor }
  const [errors,    setErrors]    = useState({})    // { rowId: msg }
  const saveTimer   = useRef(null)
  const anchorRefs  = useRef({})

  // ── Cargar sondajes ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/tables/programa_general').then(r => {
      setDdhids((r.data||[])
        .map(x => x.DDHID || x.ddhid)
        .filter(x => x && String(x).trim() !== '')
        .sort())
    })
  }, [])

  // ── Cargar filas al cambiar sondaje ─────────────────────────────
  useEffect(() => {
    if (!ddhid) { setRows([newRow()]); setErrors({}); return }
    setLoading(true)
    api.get(`/quicklog/${ddhid}`)
      .then(r => {
        const data = r.data || []
        setRows(data.length > 0 ? data.map(d => ({
          _id: String(d.id), from: d.from_m ?? '', to: d.to_m ?? '',
          lito_cod: d.lito_cod, lito_desc: d.lito_desc || '',
          alter_cod: d.alter_cod, alter_desc: d.alter_desc || '',
          extra: d.extra || '', obs: d.obs || '',
        })) : [newRow()])
      })
      .catch(() => setRows([newRow()]))
      .finally(() => { setLoading(false); setErrors({}) })
  }, [ddhid])

  // ── Autoguardado con debounce ───────────────────────────────────
  const autoSave = useCallback((currentDdhid, currentRows) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!currentDdhid) return
      const data = currentRows.filter(r => r.lito_desc !== '')
      setSaving(true)
      try {
        await api.post('/quicklog', { ddhid: currentDdhid, rows: data })
      } catch(e) { show('Error al guardar','err') }
      finally { setSaving(false) }
    }, 1200)
  }, [])

  // ── Validación from/to ──────────────────────────────────────────
  function validateRows(newRows) {
    const errs = {}
    newRows.forEach((r, i) => {
      const f = parseFloat(r.from), t = parseFloat(r.to)
      if (r.from !== '' && r.to !== '') {
        if (f >= t) errs[r._id] = `FROM (${f}) debe ser menor que TO (${t})`
      }
      if (i > 0 && r.from !== '') {
        const prev = newRows[i-1]
        if (prev.to !== '' && parseFloat(prev.to) !== f) {
          errs[r._id] = (errs[r._id] ? errs[r._id]+' · ' : '') + `FROM debería ser ${prev.to} (continuación)`
        }
      }
    })
    return errs
  }

  function setRowsAndSave(updater) {
    setRows(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      setErrors(validateRows(next))
      autoSave(ddhid, next)
      return next
    })
  }

  // ── Actualizar campo ────────────────────────────────────────────
  function updateField(id, field, val) {
    setRowsAndSave(prev => prev.map(r => r._id === id ? { ...r, [field]: val } : r))
  }

  // ── Añadir fila ─────────────────────────────────────────────────
  function addRow() {
    setRowsAndSave(prev => {
      const last = prev[prev.length - 1]
      const fromVal = last?.to !== '' ? last.to : '0'
      return [...prev, newRow(fromVal)]
    })
  }

  // ── Eliminar fila ───────────────────────────────────────────────
  function deleteRow(id) {
    const row = rows.find(r => r._id === id)
    const label = row?.lito_desc ? `el tramo ${row.from}–${row.to} (${row.lito_desc})` : 'esta fila'
    if (!window.confirm(`¿Eliminar ${label}?`)) return
    setRowsAndSave(prev => {
      const next = prev.filter(r => r._id !== id)
      return next.length === 0 ? [newRow()] : next
    })
  }

  // ── TO blur: rellenar FROM de la siguiente ──────────────────────
  function handleToBlur(id, val) {
    setRowsAndSave(prev => {
      const idx = prev.findIndex(r => r._id === id)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], to: val }
      // Si hay fila siguiente con from vacío → rellenar
      if (idx + 1 < next.length && next[idx+1].from === '') {
        next[idx+1] = { ...next[idx+1], from: val }
      }
      return next
    })
  }

  // ── Exportar CSV sondaje actual ─────────────────────────────────
  function exportCSV() {
    const data = rows.filter(r => r.lito_desc !== '')
    const cols  = ['FROM','TO','LITO_COD','LITO','ALTER_COD','ALTER','EXTRA','OBS']
    const lines = [cols.join(','), ...data.map(r =>
      [r.from,r.to,r.lito_cod,r.lito_desc,r.alter_cod,r.alter_desc,r.extra,r.obs]
        .map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`)
        .join(',')
    )]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}))
    a.download = `quicklog_${ddhid}.csv`; a.click()
  }

  // ── Exportar TODOS los sondajes ─────────────────────────────────
  async function exportAll() {
    try {
      show('Preparando exportación...','ok')
      const r   = await api.get('/quicklog/export/all')
      const all = r.data || []
      if (all.length === 0) { show('No hay datos para exportar','err'); return }
      const cols  = ['DDHID','FROM','TO','LITO_COD','LITO','ALTER_COD','ALTER','EXTRA','OBS']
      const lines = [cols.join(','), ...all.map(r =>
        [r.DDHID,r.from_m,r.to_m,r.lito_cod,r.lito_desc,r.alter_cod,r.alter_desc,r.extra,r.obs]
          .map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`)
          .join(',')
      )]
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}))
      a.download = `quicklog_todos.csv`; a.click()
    } catch(e) { show('Error al exportar','err') }
  }

  // ── Estilos ─────────────────────────────────────────────────────
  const th = { padding:'9px 8px', fontWeight:700, fontSize:11, textAlign:'center',
    borderRight:'1px solid rgba(255,255,255,.2)', whiteSpace:'nowrap' }
  const inputStyle = { width:'100%', background:'transparent', border:'none', outline:'none',
    color:'var(--txt)', fontSize:12, padding:'2px 4px', textAlign:'center' }

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type}/>
      {popup && <div style={{position:'fixed',inset:0,zIndex:1999}} onClick={()=>setPopup(null)}/>}

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <div className="page-title">📋 Quick Log</div>
          <div className="page-desc">Registro rápido de litología y alteración por sondaje</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {saving && <span style={{fontSize:11,color:'var(--mut)',fontStyle:'italic'}}>💾 Guardando...</span>}
          <button className="btn btn-out" onClick={exportCSV} disabled={!ddhid||rows.every(r=>!r.lito_desc)}>📥 Exportar sondaje</button>
          <button className="btn btn-out" onClick={exportAll}>📦 Exportar todos</button>
        </div>
      </div>

      {/* Selector */}
      <div className="ch-card" style={{marginBottom:16,padding:'12px 20px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <span style={{fontWeight:600,fontSize:14}}>Sondaje:</span>
        <select value={ddhid} onChange={e=>setDdhid(e.target.value)}
          style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--brd)',
            background:'var(--acc)',color:'#fff',fontSize:14,fontWeight:600,
            cursor:'pointer',outline:'none',minWidth:200}}>
          <option value="">— Seleccionar —</option>
          {ddhids.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        {ddhid && (
          <span style={{fontSize:12,color:'var(--mut)'}}>
            {rows.filter(r=>r.lito_desc!=='').length} tramo(s) registrados
          </span>
        )}
      </div>

      {/* Tabla */}
      <div className="ch-card" style={{padding:0,overflow:'hidden'}}>
        {loading
          ? <div style={{padding:40,textAlign:'center',color:'var(--mut)'}}>Cargando...</div>
          : (
          <>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'var(--acc)',color:'#fff'}}>
                    <th style={{...th,width:32}}>#</th>
                    <th style={{...th,width:72}}>FROM</th>
                    <th style={{...th,width:72}}>TO</th>
                    <th style={{...th,width:210}}>LITOLOGÍA</th>
                    <th style={{...th,width:240}}>ALTERACIÓN</th>
                    <th style={{...th,width:90}}>EXTRA</th>
                    <th style={{...th,minWidth:140,borderRight:'none'}}>OBS</th>
                    <th style={{...th,width:36,borderRight:'none'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const hasErr  = !!errors[row._id]
                    const alterOpts = row.lito_cod != null ? (ALTER_BY_LITO[row.lito_cod] || []) : []
                    const tdBase  = { borderRight:'1px solid var(--brd)', borderBottom:'1px solid var(--brd)', padding:'3px 4px' }
                    const rowBg   = hasErr ? 'rgba(239,68,68,.06)' : idx%2===0 ? 'var(--bg)' : 'var(--sur2)'
                    return (
                      <React.Fragment key={row._id}>
                        <tr style={{background:rowBg}}>
                          {/* # */}
                          <td style={{...tdBase,width:32,textAlign:'center',color:'var(--mut)',fontSize:11}}>{idx+1}</td>
                          {/* FROM */}
                          <td style={{...tdBase,width:72}}>
                            <input style={{...inputStyle,color:hasErr?'var(--red)':'var(--txt)'}}
                              type="number" placeholder="0.0" value={row.from}
                              onChange={e=>updateField(row._id,'from',e.target.value)}/>
                          </td>
                          {/* TO */}
                          <td style={{...tdBase,width:72}}>
                            <input style={{...inputStyle,color:hasErr?'var(--red)':'var(--txt)'}}
                              type="number" placeholder="0.0" value={row.to}
                              onChange={e=>updateField(row._id,'to',e.target.value)}
                              onBlur={e=>handleToBlur(row._id,e.target.value)}/>
                          </td>
                          {/* LITO */}
                          <td style={{...tdBase,width:210,position:'relative'}}>
                            <div ref={el=>{if(el)anchorRefs.current[`lito-${row._id}`]=el}}
                              onClick={()=>setPopup({type:'lito',rowId:row._id,anchor:anchorRefs.current[`lito-${row._id}`]})}
                              style={{padding:'4px 8px',cursor:'pointer',borderRadius:4,
                                background:row.lito_desc?'var(--acc)18':'transparent',
                                border:row.lito_desc?'1px solid var(--acc)44':'1px solid transparent',
                                display:'flex',justifyContent:'space-between',alignItems:'center',minHeight:26}}>
                              <span style={{fontSize:12,color:row.lito_desc?'var(--txt)':'var(--mut)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {row.lito_desc||'Seleccionar...'}
                              </span>
                              {row.lito_cod!=null&&<span style={{fontSize:10,color:'var(--mut)',marginLeft:4,flexShrink:0}}>{row.lito_cod}</span>}
                            </div>
                            {popup?.type==='lito'&&popup.rowId===row._id&&(
                              <Popup items={LITO_LIST} anchor={popup.anchor}
                                onSelect={item=>{ updateField(row._id,'lito_cod',item.cod); updateField(row._id,'lito_desc',item.desc); updateField(row._id,'alter_cod',null); updateField(row._id,'alter_desc','') }}
                                onClose={()=>setPopup(null)}/>
                            )}
                          </td>
                          {/* ALTER */}
                          <td style={{...tdBase,width:240,position:'relative'}}>
                            <div ref={el=>{if(el)anchorRefs.current[`alter-${row._id}`]=el}}
                              onClick={()=>{
                                if(row.lito_cod==null){show('Selecciona una litología primero','err');return}
                                setPopup({type:'alter',rowId:row._id,anchor:anchorRefs.current[`alter-${row._id}`]})
                              }}
                              style={{padding:'4px 8px',cursor:row.lito_cod!=null?'pointer':'not-allowed',
                                borderRadius:4,opacity:row.lito_cod!=null?1:0.45,
                                background:row.alter_desc?'#f59e0b18':'transparent',
                                border:row.alter_desc?'1px solid #f59e0b44':'1px solid transparent',
                                display:'flex',justifyContent:'space-between',alignItems:'center',minHeight:26}}>
                              <span style={{fontSize:12,color:row.alter_desc?'var(--txt)':'var(--mut)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {row.alter_desc||(row.lito_cod!=null?'Seleccionar...':'— elige lito —')}
                              </span>
                              {row.alter_cod!=null&&<span style={{fontSize:10,color:'var(--mut)',marginLeft:4,flexShrink:0}}>{row.alter_cod}</span>}
                            </div>
                            {popup?.type==='alter'&&popup.rowId===row._id&&(
                              <Popup items={alterOpts} anchor={popup.anchor}
                                onSelect={item=>{ updateField(row._id,'alter_cod',item.cod); updateField(row._id,'alter_desc',item.desc) }}
                                onClose={()=>setPopup(null)}/>
                            )}
                          </td>
                          {/* EXTRA */}
                          <td style={{...tdBase,width:90}}>
                            <input style={inputStyle} placeholder="—" value={row.extra}
                              onChange={e=>updateField(row._id,'extra',e.target.value)}/>
                          </td>
                          {/* OBS */}
                          <td style={{...tdBase,borderRight:'none'}}>
                            <input style={{...inputStyle,textAlign:'left'}} placeholder="Observaciones..."
                              value={row.obs}
                              onChange={e=>updateField(row._id,'obs',e.target.value)}/>
                          </td>
                          {/* Eliminar */}
                          <td style={{...tdBase,width:36,borderRight:'none',textAlign:'center'}}>
                            <button onClick={()=>deleteRow(row._id)}
                              style={{background:'none',border:'none',cursor:'pointer',
                                color:'var(--mut)',fontSize:14,padding:'2px 4px',
                                borderRadius:4,transition:'all .1s'}}
                              onMouseEnter={e=>{e.currentTarget.style.color='var(--red)';e.currentTarget.style.background='rgba(239,68,68,.1)'}}
                              onMouseLeave={e=>{e.currentTarget.style.color='var(--mut)';e.currentTarget.style.background='none'}}
                            >✕</button>
                          </td>
                        </tr>
                        {/* Fila de error */}
                        {hasErr && (
                          <tr style={{background:'rgba(239,68,68,.06)'}}>
                            <td colSpan={8} style={{padding:'3px 12px',fontSize:11,color:'var(--red)',borderBottom:'1px solid var(--brd)'}}>
                              ⚠ {errors[row._id]}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Botón agregar */}
            <div style={{padding:'10px 16px',borderTop:'1px solid var(--brd)'}}>
              <button onClick={addRow} className="btn btn-out btn-sm"
                style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}
                disabled={!ddhid}>
                <span style={{fontSize:16,lineHeight:1}}>+</span> Agregar tramo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
