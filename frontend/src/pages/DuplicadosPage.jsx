import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

const TABLAS_CON_RANGO = [
  { key: 'perforacion',   label: 'Perforación',     from: 'Fecha',  to: 'Turnos' },
  { key: 'recuperacion',  label: 'Recuperación',    from: 'From',   to: 'To'    },
  { key: 'fotografia',    label: 'Fotografía',      from: 'From',   to: 'To'    },
  { key: 'l_geotecnico',  label: 'L_Geotécnico',   from: 'From',   to: 'To'    },
  { key: 'l_geologico',   label: 'L_Geológico',    from: 'From',   to: 'To'    },
  { key: 'muestreo',      label: 'Muestreo',        from: 'DE',     to: 'HASTA' },
  { key: 'corte',         label: 'Corte',           from: 'DE',     to: 'A'     },
  { key: 'recepcion',     label: 'Recepción',       from: 'FROM',   to: 'TO'    },
  { key: 'quicklog',      label: 'Quick Log',       from: 'from_m', to: 'to_m'  },
]

// Delete correcto según tabla
async function deleteRecord(tabla, id) {
  if (tabla === 'quicklog') {
    return api.delete(`/quicklog/${id}`)
  }
  return api.delete(`/tables/${tabla}/${id}`)
}

export default function DuplicadosPage() {
  const { user }        = useAuth()
  const { toast, show } = useToast()
  const [results,   setResults]   = useState({})
  const [loading,   setLoading]   = useState(false)
  const [scanned,   setScanned]   = useState(false)
  const [activeTab, setActiveTab] = useState(null)
  const [checked,   setChecked]   = useState({})   // { id: true } — ids seleccionados para eliminar
  const [deleting,  setDeleting]  = useState(false)

  if (user?.role !== 'ADMIN') return (
    <div className="ch-card" style={{padding:40,textAlign:'center',color:'var(--mut)'}}>
      🔒 Solo administradores pueden acceder a esta sección.
    </div>
  )

  async function scanAll() {
    setLoading(true); setResults({}); setScanned(false); setChecked({})
    try {
      const r = await api.get('/tables/duplicados')
      setResults(r.data || {})
      setScanned(true)
      const primera = Object.entries(r.data || {}).find(([,g]) => g.length > 0)
      setActiveTab(primera ? primera[0] : null)
    } catch(e) { show('Error al escanear','err') }
    finally { setLoading(false) }
  }

  // Al cambiar tab, limpiar checks
  function switchTab(key) { setActiveTab(key); setChecked({}) }

  const gruposActivos = results[activeTab] || []
  const tabDef = TABLAS_CON_RANGO.find(t => t.key === activeTab)

  // Todos los IDs eliminables del tab activo (excluye el primero de cada grupo)
  const allDeletableIds = gruposActivos.flatMap(g =>
    [...g.registros].sort((a,b) => a.id - b.id).slice(1).map(r => r.id)
  )
  const allChecked = allDeletableIds.length > 0 && allDeletableIds.every(id => checked[id])

  function toggleAll() {
    if (allChecked) {
      setChecked({})
    } else {
      const next = {}
      allDeletableIds.forEach(id => { next[id] = true })
      setChecked(next)
    }
  }
  function toggleOne(id) {
    setChecked(p => ({ ...p, [id]: !p[id] }))
  }

  const selectedIds = Object.keys(checked).filter(id => checked[id]).map(Number)

  // Eliminar UNO
  async function deleteOne(id) {
    if (!window.confirm('¿Eliminar este registro duplicado?')) return
    setDeleting(true)
    try {
      await deleteRecord(activeTab, id)
      removeFromResults(activeTab, [id])
      setChecked(p => { const n={...p}; delete n[id]; return n })
      show('Eliminado ✓','ok')
    } catch(e) { show(e.response?.data?.error || 'Error al eliminar','err') }
    finally { setDeleting(false) }
  }

  // Eliminar seleccionados
  async function deleteSelected() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`¿Eliminar ${selectedIds.length} registro(s) seleccionado(s)?`)) return
    setDeleting(true)
    let ok = 0, fail = 0
    for (const id of selectedIds) {
      try { await deleteRecord(activeTab, id); ok++ }
      catch(e) { fail++; console.error('Error eliminando', id, e.message) }
    }
    removeFromResults(activeTab, selectedIds)
    setChecked({})
    show(`${ok} eliminado(s)${fail > 0 ? `, ${fail} fallido(s)` : ''} ✓`, fail > 0 ? 'warn' : 'ok')
    setDeleting(false)
  }

  // Conservar solo el primero de UN grupo
  async function keepFirst(grupo) {
    const toDelete = [...grupo.registros].sort((a,b)=>a.id-b.id).slice(1)
    if (!window.confirm(`¿Conservar solo ID ${grupo.registros.sort((a,b)=>a.id-b.id)[0]?.id} y eliminar ${toDelete.length} duplicado(s)?`)) return
    setDeleting(true)
    for (const r of toDelete) {
      try { await deleteRecord(activeTab, r.id) } catch(e) {}
    }
    removeFromResults(activeTab, toDelete.map(r=>r.id))
    setChecked(p => { const n={...p}; toDelete.forEach(r=>delete n[r.id]); return n })
    show('Grupo limpiado ✓','ok')
    setDeleting(false)
  }

  function removeFromResults(tabla, ids) {
    setResults(prev => {
      const next = {...prev}
      next[tabla] = (next[tabla] || [])
        .map(g => ({...g, registros: g.registros.filter(r => !ids.includes(r.id))}))
        .filter(g => g.registros.length > 1)
      return next
    })
  }

  const totalGrupos = Object.values(results).reduce((s,g) => s+g.length, 0)
  const totalExceso = Object.values(results).reduce((s,g) =>
    s + g.reduce((ss,gr) => ss + (gr.registros.length - 1), 0), 0)

  const thS = {padding:'7px 12px',textAlign:'left',fontWeight:600,color:'var(--mut)',fontSize:11,
    background:'var(--sur2)',borderBottom:'1px solid var(--brd)'}

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type}/>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <div className="page-title">🔍 Validación de Duplicados</div>
          <div className="page-desc">Detecta y elimina registros duplicados en {TABLAS_CON_RANGO.length} tablas</div>
        </div>
        <button className="btn btn-acc" onClick={scanAll} disabled={loading}>
          {loading ? '⏳ Escaneando...' : '🔍 Escanear todas las tablas'}
        </button>
      </div>

      {/* Resumen global */}
      {scanned && (
        <div className="ch-card" style={{marginBottom:16,padding:'14px 20px'}}>
          {totalGrupos === 0
            ? <div style={{color:'var(--grn)',fontWeight:600,fontSize:14}}>✅ Sin duplicados encontrados en ninguna tabla.</div>
            : <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'center'}}>
                <div>
                  <span style={{fontSize:22,fontWeight:700,color:'#ef4444'}}>{totalGrupos}</span>
                  <span style={{fontSize:12,color:'var(--mut)',marginLeft:6}}>grupos duplicados</span>
                </div>
                <div>
                  <span style={{fontSize:22,fontWeight:700,color:'#f59e0b'}}>{totalExceso}</span>
                  <span style={{fontSize:12,color:'var(--mut)',marginLeft:6}}>registros extra a eliminar</span>
                </div>
                <div style={{fontSize:12,color:'var(--mut)'}}>
                  Tablas: {Object.entries(results).filter(([,g])=>g.length>0).map(([k])=>
                    TABLAS_CON_RANGO.find(t=>t.key===k)?.label||k).join(', ')}
                </div>
              </div>
          }
        </div>
      )}

      {/* Tabs */}
      {scanned && totalGrupos > 0 && (
        <>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
            {TABLAS_CON_RANGO.filter(t => (results[t.key]||[]).length > 0).map(t => {
              const n = (results[t.key]||[]).length
              return (
                <button key={t.key} onClick={()=>switchTab(t.key)}
                  className={activeTab===t.key ? 'btn btn-acc btn-sm' : 'btn btn-out btn-sm'}>
                  {t.label}
                  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',
                    minWidth:18,height:18,borderRadius:9,fontSize:10,fontWeight:700,
                    background:'#ef4444',color:'#fff',padding:'0 5px',marginLeft:6}}>{n}</span>
                </button>
              )
            })}
          </div>

          {activeTab && gruposActivos.length > 0 && (
            <div className="ch-card" style={{padding:0,overflow:'hidden'}}>
              {/* Barra de acciones */}
              <div style={{padding:'10px 16px',borderBottom:'1px solid var(--brd)',
                display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',background:'var(--sur2)'}}>
                <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:13}}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll}
                    style={{width:15,height:15,cursor:'pointer'}}/>
                  <span>Seleccionar todos los duplicados</span>
                  {selectedIds.length > 0 && (
                    <span style={{fontSize:11,color:'var(--mut)'}}>({selectedIds.length} seleccionados)</span>
                  )}
                </label>
                {selectedIds.length > 0 && (
                  <button className="btn btn-red btn-sm" onClick={deleteSelected} disabled={deleting}>
                    {deleting ? '⏳ Eliminando...' : `🗑 Eliminar ${selectedIds.length} seleccionado(s)`}
                  </button>
                )}
                <span style={{fontSize:11,color:'var(--mut)',marginLeft:'auto'}}>
                  {tabDef?.label} · criterio: DDHID + {tabDef?.from} + {tabDef?.to}
                </span>
              </div>

              {/* Grupos */}
              <div style={{overflowX:'auto'}}>
                {gruposActivos.map((grupo, gi) => {
                  const sorted = [...grupo.registros].sort((a,b)=>a.id-b.id)
                  const deletables = sorted.slice(1)
                  const groupAllChecked = deletables.every(r => checked[r.id])
                  const fromKey = tabDef?.from === 'from_m' ? 'from_m' : tabDef?.from
                  const toKey   = tabDef?.to   === 'to_m'   ? 'to_m'   : tabDef?.to
                  const ddhidKey = 'DDHID' in sorted[0] ? 'DDHID' : 'ddhid'
                  const extraKeys = Object.keys(sorted[0])
                    .filter(k => !['id','DDHID','ddhid',fromKey,toKey,'from_m','to_m','created_at'].includes(k))
                    .slice(0, 4)

                  return (
                    <div key={grupo.key} style={{borderBottom:'2px solid var(--brd)'}}>
                      {/* Cabecera grupo */}
                      <div style={{padding:'8px 16px',background:'rgba(239,68,68,.07)',
                        display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                            <input type="checkbox" checked={groupAllChecked}
                              onChange={()=>{
                                if (groupAllChecked) setChecked(p=>{const n={...p};deletables.forEach(r=>delete n[r.id]);return n})
                                else setChecked(p=>{const n={...p};deletables.forEach(r=>{n[r.id]=true});return n})
                              }}
                              style={{width:14,height:14,cursor:'pointer'}}/>
                          </label>
                          <span style={{color:'#ef4444',fontWeight:700,fontSize:12}}>Grupo {gi+1}</span>
                          <span style={{color:'var(--mut)',fontSize:12}}>
                            <strong style={{color:'var(--txt)'}}>{grupo.ddhid}</strong>
                            {' · '}{tabDef?.from}: <strong>{grupo.from_val}</strong>
                            {' · '}{tabDef?.to}: <strong>{grupo.to_val}</strong>
                            {' · '}<span style={{color:'#ef4444'}}>{grupo.registros.length} registros</span>
                          </span>
                        </div>
                        <button className="btn btn-grn btn-sm" disabled={deleting}
                          onClick={()=>keepFirst(grupo)}>
                          ✓ Conservar solo ID {sorted[0]?.id}
                        </button>
                      </div>

                      {/* Tabla de registros */}
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead>
                          <tr>
                            <th style={{...thS,width:36}}></th>
                            <th style={thS}>ID</th>
                            <th style={thS}>DDHID</th>
                            <th style={thS}>{tabDef?.from}</th>
                            <th style={thS}>{tabDef?.to}</th>
                            {extraKeys.map(k=><th key={k} style={thS}>{k}</th>)}
                            <th style={{...thS,width:90}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((reg, ri) => {
                            const isFirst = ri === 0
                            const isDeletable = !isFirst
                            const isChecked = !!checked[reg.id]
                            return (
                              <tr key={reg.id} style={{
                                borderBottom:'1px solid var(--brd)',
                                background: isChecked ? 'rgba(239,68,68,.08)' : isFirst ? 'rgba(16,185,129,.05)' : 'var(--bg)',
                              }}>
                                <td style={{padding:'6px 12px',textAlign:'center'}}>
                                  {isDeletable && (
                                    <input type="checkbox" checked={isChecked}
                                      onChange={()=>toggleOne(reg.id)}
                                      style={{width:14,height:14,cursor:'pointer'}}/>
                                  )}
                                </td>
                                <td style={{padding:'6px 12px',fontWeight:isFirst?700:400,
                                  color:isFirst?'var(--grn)':'var(--txt)'}}>
                                  {reg.id}
                                  {isFirst && <span style={{fontSize:10,color:'var(--grn)',marginLeft:4}}>✓ conservar</span>}
                                </td>
                                <td style={{padding:'6px 12px'}}>{reg[ddhidKey]}</td>
                                <td style={{padding:'6px 12px'}}>{reg[fromKey] ?? reg.from_m}</td>
                                <td style={{padding:'6px 12px'}}>{reg[toKey]   ?? reg.to_m}</td>
                                {extraKeys.map(k=><td key={k} style={{padding:'6px 12px',color:'var(--mut)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{String(reg[k]??'')}</td>)}
                                <td style={{padding:'6px 8px',textAlign:'center'}}>
                                  {isDeletable && (
                                    <button disabled={deleting}
                                      onClick={()=>deleteOne(reg.id)}
                                      style={{background:'none',border:'1px solid #ef4444',color:'#ef4444',
                                        borderRadius:4,padding:'2px 8px',cursor:'pointer',fontSize:11,
                                        opacity:deleting?.5:1}}
                                      onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,.1)'}
                                      onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                      ✕
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!scanned && (
        <div className="ch-card" style={{padding:60,textAlign:'center',color:'var(--mut)'}}>
          <div style={{fontSize:40,marginBottom:12}}>🔍</div>
          <div style={{fontSize:14,marginBottom:6}}>Haz clic en "Escanear todas las tablas" para comenzar</div>
          <div style={{fontSize:12}}>Se revisarán {TABLAS_CON_RANGO.length} tablas buscando DDHID + FROM + TO repetidos</div>
        </div>
      )}
    </div>
  )
}
