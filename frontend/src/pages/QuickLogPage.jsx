import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useBeforeUnload } from 'react-router-dom'
import api from '../utils/api'
import Toast, { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'

// ── Catálogos ─────────────────────────────────────────────────────
const LITO_LIST = [
  { cod:0,  desc:'Cobertura' },
  { cod:1,  desc:'Diorita/Andesita Porfirita' },
  { cod:2,  desc:'Granodiorita' },
  { cod:3,  desc:'Pórfido Feldespático' },
  { cod:4,  desc:'Pórfido Cuarcífero' },
  { cod:5,  desc:'Pórfido Dacítico' },
  { cod:6,  desc:'Pórfido Yantac' },
  { cod:7,  desc:'Endoskarn' },
  { cod:10, desc:'Hornfels' },
  { cod:11, desc:'Skarn' },
  { cod:12, desc:'Skarn de Magnetita' },
  { cod:13, desc:'Basalto Montero' },
  { cod:14, desc:'Sedimentos Calcareos' },
  { cod:15, desc:'Shale (Lutitas)' },
  { cod:16, desc:'Volcánicos Catalina' },
  { cod:17, desc:'Anhidrita / Yeso' },
  { cod:18, desc:'Sandstone (Areniscas)' },
  { cod:19, desc:'Brecha en Igneos' },
  { cod:20, desc:'Brecha en sedimentarios' },
  { cod:25, desc:'Relleno' },
  { cod:102, desc:'Sin Recuperación' },
]
const ALTER_BY_LITO = {
  0:  [{ cod:0,  desc:'Cobertura' }],
  1:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argílica' },{ cod:6,  desc:'Silicificación' }],
  2:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argílica' },{ cod:6,  desc:'Silicificación' }],
  3:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argílica' },{ cod:6,  desc:'Silicificación' }],
  4:  [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argílica' },{ cod:6,  desc:'Silicificación' }],
  5:  [{ cod:5,  desc:'Argílica' },{ cod:6,  desc:'Silicificación' }],
  6:  [{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:5,  desc:'Argílica' }],
  7:  [{ cod:5,  desc:'Argílica' },{ cod:9,  desc:'Skarn de Tremolita-Actinolita, Clorita' },{ cod:10, desc:'Skarn de Serpentina-Magnetita' },{ cod:11, desc:'Skarn de Diopsido-Granate' }],
  10: [{ cod:5,  desc:'Argílica' },{ cod:12, desc:'Hornfels Verde - Diopsido en Hornfels' }],
  11: [{ cod:5,  desc:'Argílica' },{ cod:9,  desc:'Skarn de Tremolita-Actinolita, Clorita' },{ cod:10, desc:'Skarn de Serpentina-Magnetita' },{ cod:11, desc:'Skarn de Diopsido-Granate' }],
  12: [{ cod:5,  desc:'Argílica' },{ cod:18, desc:'Skarn de Magnetita' }],
  13: [{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:5,  desc:'Argílica' }],
  14: [{ cod:5,  desc:'Argílica' },{ cod:15, desc:'Sedimentos Calcareos - Marmol' }],
  15: [{ cod:5,  desc:'Argílica' },{ cod:17, desc:'Shale (Lutitas)' }],
  16: [{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:5,  desc:'Argílica' }],
  17: [{ cod:5,  desc:'Argílica' },{ cod:16, desc:'Anhidrita / Yeso' }],
  18: [{ cod:5,  desc:'Argílica' },{ cod:19, desc:'Sandstone (Areniscas)' }],
  19: [{ cod:2,  desc:'Biotita y/o Feldespato potasico (Potasica)' },{ cod:3,  desc:'Cloritica (Propilitica)' },{ cod:4,  desc:'Sericitica (Filica)' },{ cod:5,  desc:'Argílica' },{ cod:6,  desc:'Silicificación' }],
  20: [{ cod:5,  desc:'Argílica' },{ cod:9,  desc:'Skarn de Tremolita-Actinolita, Clorita' },{ cod:10, desc:'Skarn de Serpentina-Magnetita' },{ cod:11, desc:'Skarn de Diopsido-Granate' }],
  25: [{ cod:25, desc:'Relleno' }],
  102:[{ cod:102,desc:'Sin Recuperación' }],
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
  const rect     = anchor?.getBoundingClientRect()
  const top      = rect ? Math.min(rect.bottom + 4, window.innerHeight - 280) : 100
  const left     = rect ? Math.min(rect.left, window.innerWidth - 310) : 100
  const filtered = items.filter(i => i.desc.toLowerCase().includes(search.toLowerCase()) || String(i.cod).includes(search))
  return (
    <div ref={ref} style={{position:'fixed',zIndex:2000,background:'var(--sur)',border:'1px solid var(--brd)',borderRadius:10,boxShadow:'0 8px 32px rgba(0,0,0,.4)',width:300,top,left}}>
      <div style={{padding:'8px 10px',borderBottom:'1px solid var(--brd)'}}>
        <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..."
          style={{width:'100%',background:'var(--sur2)',border:'1px solid var(--brd)',borderRadius:6,padding:'5px 10px',color:'var(--txt)',fontSize:12,outline:'none'}}/>
      </div>
      <div style={{maxHeight:240,overflowY:'auto'}}>
        {filtered.length === 0
          ? <div style={{padding:'12px 16px',color:'var(--mut)',fontSize:12,textAlign:'center'}}>Sin resultados</div>
          : filtered.map(item => (
            <div key={item.cod} onClick={()=>{onSelect(item);onClose()}}
              style={{padding:'8px 14px',cursor:'pointer',fontSize:12,borderBottom:'1px solid var(--brd)',display:'flex',gap:8,alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--sur2)'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>
              <span style={{color:'var(--mut)',fontSize:10,minWidth:18,textAlign:'right'}}>{item.cod}</span>
              <span>{item.desc}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── Modal de importación ──────────────────────────────────────────
function ImportModal({ onClose, onImported }) {
  const { show } = useToast()
  const [step,      setStep]      = useState('upload')   // upload | preview | result
  const [preview,   setPreview]   = useState([])         // filas parseadas
  const [mode,      setMode]      = useState('skip')     // skip | overwrite
  const [importing, setImporting] = useState(false)
  const [result,    setResult]    = useState(null)
  const fileRef = useRef(null)

  const CSV_COLS = ['DDHID','FROM','TO','LITO_COD','ALTER_COD','EXTRA','OBS']

  function litoDescFromCod(cod) {
    const n = parseInt(cod); if (isNaN(n)) return ''
    return LITO_LIST.find(l => l.cod === n)?.desc || ''
  }
  function alterDescFromCod(litoCod, alterCod) {
    const ln = parseInt(litoCod), an = parseInt(alterCod); if (isNaN(an)) return ''
    const opts = ALTER_BY_LITO[ln] || []
    const found = opts.find(a => a.cod === an)
    if (found) return found.desc
    for (const arr of Object.values(ALTER_BY_LITO)) {
      const f = arr.find(a => a.cod === an); if (f) return f.desc
    }
    return ''
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g,'').trim().toUpperCase())
    return lines.slice(1).map(line => {
      const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || []
      const row = {}
      headers.forEach((h,i) => { row[h] = (vals[i]||'').replace(/^"|"$/g,'').trim() })
      // Auto-rellenar nombres desde códigos
      if (row.LITO_COD)  row.LITO  = litoDescFromCod(row.LITO_COD)
      if (row.ALTER_COD) row.ALTER = alterDescFromCod(row.LITO_COD, row.ALTER_COD)
      return row
    }).filter(r => r.DDHID && r.FROM && r.TO)
  }

  function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result)
      if (rows.length === 0) { show('Archivo sin datos válidos o formato incorrecto','err'); return }
      setPreview(rows); setStep('preview')
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    setImporting(true)
    try {
      const r = await api.post('/quicklog/import', { rows: preview, mode })
      setResult(r.data)
      setStep('result')
      onImported && onImported()
    } catch(e) { show(e.response?.data?.error || 'Error al importar','err') }
    finally { setImporting(false) }
  }

  const inpStyle = {background:'var(--bg)',border:'1px solid var(--brd)',borderRadius:6,padding:'6px 10px',color:'var(--txt)',fontSize:12,outline:'none'}

  return (
    <div className="m-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="m-box" style={{maxWidth:600}}>
        <div className="m-title">📥 Importar Quick Log</div>

        {step === 'upload' && (
          <>
            {/* Formato esperado */}
            <div style={{background:'var(--sur2)',border:'1px solid var(--brd)',borderRadius:8,padding:'12px 16px',marginBottom:16,fontSize:12}}>
              <div style={{fontWeight:700,marginBottom:8,color:'var(--acc)'}}>📋 Formato del CSV requerido</div>
              <div style={{fontFamily:'monospace',fontSize:11,color:'var(--txt)',marginBottom:8,background:'var(--bg)',padding:'8px 10px',borderRadius:6}}>
                {CSV_COLS.join(',')}
              </div>
              <div style={{color:'var(--mut)',lineHeight:1.7}}>
                <div>• <strong>DDHID</strong> — Nombre del sondaje <span style={{color:'var(--red)'}}>*obligatorio</span></div>
                <div>• <strong>FROM / TO</strong> — Profundidad en metros <span style={{color:'var(--red)'}}>*obligatorio</span></div>
                <div>• <strong>LITO_COD</strong> — Código numérico de litología → el nombre se rellena automáticamente</div>
                <div>• <strong>ALTER_COD</strong> — Código numérico de alteración → el nombre se rellena automáticamente</div>
                <div>• <strong>EXTRA</strong> — Campo extra (opcional)</div>
                <div>• <strong>OBS</strong> — Observaciones (opcional)</div>
              </div>
            </div>
            {/* Opción de conflictos */}
            <div style={{marginBottom:16}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Si el tramo ya existe (mismo DDHID + FROM + TO):</div>
              <div style={{display:'flex',gap:12}}>
                {[{v:'skip',l:'Omitir (conservar el existente)'},{v:'overwrite',l:'Sobreescribir con los nuevos datos'}].map(o=>(
                  <label key={o.v} style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:13}}>
                    <input type="radio" checked={mode===o.v} onChange={()=>setMode(o.v)}/> {o.l}
                  </label>
                ))}
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={handleFile}/>
            <div className="m-actions">
              <button className="btn btn-acc" onClick={()=>fileRef.current?.click()}>📂 Seleccionar CSV</button>
              <button className="btn btn-out" onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div style={{marginBottom:12,fontSize:13,color:'var(--mut)'}}>
              <strong style={{color:'var(--txt)'}}>{preview.length} filas</strong> detectadas.
              Modo: <strong>{mode==='skip'?'Omitir duplicados':'Sobreescribir duplicados'}</strong>
            </div>
            <div style={{overflowX:'auto',maxHeight:300,border:'1px solid var(--brd)',borderRadius:8,marginBottom:16}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr style={{background:'var(--acc)',color:'#fff'}}>
                    {['DDHID','FROM','TO','LITO','ALTER','OBS'].map(h=>(
                      <th key={h} style={{padding:'6px 10px',textAlign:'left',fontWeight:700}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0,50).map((r,i)=>(
                    <tr key={i} style={{background:i%2?'var(--sur2)':'var(--bg)',borderBottom:'1px solid var(--brd)'}}>
                      <td style={{padding:'5px 10px'}}>{r.DDHID}</td>
                      <td style={{padding:'5px 10px'}}>{r.FROM}</td>
                      <td style={{padding:'5px 10px'}}>{r.TO}</td>
                      <td style={{padding:'5px 10px',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {r.LITO ? <span>{r.LITO} <span style={{color:'var(--mut)',fontSize:10}}>({r.LITO_COD})</span></span> : r.LITO_COD||'—'}
                      </td>
                      <td style={{padding:'5px 10px',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {r.ALTER ? <span>{r.ALTER} <span style={{color:'var(--mut)',fontSize:10}}>({r.ALTER_COD})</span></span> : r.ALTER_COD||'—'}
                      </td>
                      <td style={{padding:'5px 10px',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.OBS||'—'}</td>
                    </tr>
                  ))}
                  {preview.length > 50 && (
                    <tr><td colSpan={6} style={{padding:'6px 10px',color:'var(--mut)',textAlign:'center',fontSize:11}}>...y {preview.length-50} filas más</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="m-actions">
              <button className="btn btn-acc" onClick={handleImport} disabled={importing}>
                {importing ? '⏳ Importando...' : `✓ Importar ${preview.length} filas`}
              </button>
              <button className="btn btn-out" onClick={()=>setStep('upload')}>← Atrás</button>
              <button className="btn btn-out" onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
              {[
                {label:'Insertados',  val:result.inserted, color:'var(--grn)'},
                {label:'Actualizados',val:result.updated,  color:'var(--acc)'},
                {label:'Omitidos',    val:result.skipped,  color:'var(--mut)'},
              ].map(s=>(
                <div key={s.label} style={{background:'var(--sur2)',border:'1px solid var(--brd)',borderRadius:8,padding:'14px',textAlign:'center'}}>
                  <div style={{fontSize:28,fontWeight:700,color:s.color}}>{s.val}</div>
                  <div style={{fontSize:12,color:'var(--mut)'}}>{s.label}</div>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--red)'}}>
                <div style={{fontWeight:700,marginBottom:6}}>⚠ {result.errors.length} fila(s) con error:</div>
                {result.errors.slice(0,5).map((e,i)=><div key={i}>• {e}</div>)}
              </div>
            )}
            <div className="m-actions">
              <button className="btn btn-acc" onClick={onClose}>✓ Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────
export default function QuickLogPage() {
  const { toast, show } = useToast()
  const { user }        = useAuth()
  const navigate        = useNavigate()
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR' ||
                  (Array.isArray(user?.tables) && (user.tables.includes('all') || user.tables.includes('quicklog')))

  const [ddhids,      setDdhids]      = useState([])
  const [ddhid,       setDdhid]       = useState('')
  const [rows,        setRows]        = useState([newRow()])
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [dirty,       setDirty]       = useState(false)   // cambios sin guardar
  const [popup,       setPopup]       = useState(null)
  const [errors,      setErrors]      = useState({})
  const [showImport,  setShowImport]  = useState(false)
  const [pendingDDHID,setPendingDDHID]= useState(null)    // sondaje pendiente de cambiar

  const saveTimer  = useRef(null)
  const isSaving   = useRef(false)
  const anchorRefs = useRef({})
  const rowsRef    = useRef(rows)
  const ddhidRef   = useRef(ddhid)
  useEffect(() => { rowsRef.current  = rows  }, [rows])
  useEffect(() => { ddhidRef.current = ddhid }, [ddhid])

  // ── Cargar sondajes ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/tables/programa_general').then(r => {
      setDdhids((r.data||[]).map(x=>x.DDHID||x.ddhid).filter(x=>x&&String(x).trim()!=='').sort())
    })
  }, [])

  // ── Cargar filas al cambiar sondaje ─────────────────────────────
  function loadDdhid(id) {
    if (!id) { setRows([newRow()]); setErrors({}); setDirty(false); return }
    setLoading(true)
    api.get(`/quicklog/${id}`)
      .then(r => {
        const data = r.data || []
        setRows(data.length > 0 ? data.map(d => ({
          _id: String(d.id), from: d.from_m ?? '', to: d.to_m ?? '',
          lito_cod: d.lito_cod, lito_desc: d.lito_desc || '',
          alter_cod: d.alter_cod, alter_desc: d.alter_desc || '',
          extra: d.extra || '', obs: d.obs || '',
        })) : [newRow()])
        setDirty(false)
      })
      .catch(() => setRows([newRow()]))
      .finally(() => { setLoading(false); setErrors({}) })
  }

  useEffect(() => { loadDdhid(ddhid) }, [ddhid])

  // ── Guardar inmediatamente ──────────────────────────────────────
  async function saveNow(currentDdhid, currentRows) {
    if (!currentDdhid || !canEdit) return
    if (isSaving.current) return
    clearTimeout(saveTimer.current)
    const data = currentRows.filter(r => r.lito_desc !== '')
    isSaving.current = true; setSaving(true)
    try {
      await api.post('/quicklog', { ddhid: currentDdhid, rows: data })
      setDirty(false)
      show('Guardado ✓','ok')
    } catch(e) { show('Error al guardar','err') }
    finally { isSaving.current = false; setSaving(false) }
  }

  // ── Autoguardado con debounce ───────────────────────────────────
  const autoSave = useCallback((currentDdhid, currentRows) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!currentDdhid || !canEdit || isSaving.current) return
      const data = currentRows.filter(r => r.lito_desc !== '')
      isSaving.current = true; setSaving(true)
      try {
        await api.post('/quicklog', { ddhid: currentDdhid, rows: data })
        setDirty(false)
      } catch(e) { show('Error al guardar','err') }
      finally { isSaving.current = false; setSaving(false) }
    }, 1500)
  }, [])

  // ── Alerta al cerrar pestaña/navegador ─────────────────────────
  useBeforeUnload(
    useCallback(e => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }, [dirty])
  )

  // ── Cambio de sondaje con confirmación ─────────────────────────
  function handleDdhidChange(newId) {
    if (dirty && ddhid) {
      setPendingDDHID(newId)   // mostrar confirmación
    } else {
      setDdhid(newId)
    }
  }

  async function confirmChangeDdhid(save) {
    const id = pendingDDHID
    setPendingDDHID(null)
    if (save) await saveNow(ddhidRef.current, rowsRef.current)
    setDdhid(id)
  }

  // ── Validación ─────────────────────────────────────────────────
  function validateRows(newRows) {
    const errs = {}
    newRows.forEach((r, i) => {
      const f = parseFloat(r.from), t = parseFloat(r.to)
      if (r.from !== '' && r.to !== '' && f >= t)
        errs[r._id] = `FROM (${f}) debe ser menor que TO (${t})`
      if (i > 0 && r.from !== '') {
        const prev = newRows[i-1]
        if (prev.to !== '' && parseFloat(prev.to) !== f)
          errs[r._id] = (errs[r._id]?errs[r._id]+' · ':'')+`FROM debería ser ${prev.to}`
      }
    })
    return errs
  }

  function setRowsAndSave(updater) {
    setRows(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      setErrors(validateRows(next)); setDirty(true)
      autoSave(ddhid, next); return next
    })
  }

  function updateField(id, field, val) {
    setRowsAndSave(prev => prev.map(r => r._id === id ? {...r, [field]: val} : r))
  }
  function addRow() {
    setRowsAndSave(prev => {
      const last = prev[prev.length-1]
      return [...prev, newRow(last?.to !== '' ? last.to : '0')]
    })
  }
  function deleteRow(id) {
    const row = rows.find(r => r._id === id)
    const label = row?.lito_desc ? `el tramo ${row.from}–${row.to} (${row.lito_desc})` : 'esta fila'
    if (!window.confirm(`¿Eliminar ${label}?`)) return
    setRowsAndSave(prev => { const n = prev.filter(r=>r._id!==id); return n.length===0?[newRow()]:n })
  }
  function handleToBlur(id, val) {
    setRowsAndSave(prev => {
      const idx = prev.findIndex(r=>r._id===id); if (idx===-1) return prev
      const next = [...prev]; next[idx]={...next[idx],to:val}
      if (idx+1<next.length&&next[idx+1].from==='') next[idx+1]={...next[idx+1],from:val}
      return next
    })
  }

  // ── Exportar ───────────────────────────────────────────────────
  function exportCSV() {
    const data = rows.filter(r=>r.lito_desc!=='')
    const cols = ['FROM','TO','LITO_COD','LITO','ALTER_COD','ALTER','EXTRA','OBS']
    const lines = [cols.join(','), ...data.map(r=>
      [r.from,r.to,r.lito_cod,r.lito_desc,r.alter_cod,r.alter_desc,r.extra,r.obs]
        .map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`)
        .join(',')
    )]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}))
    a.download = `quicklog_${ddhid}.csv`; a.click()
  }
  async function exportAll() {
    try {
      show('Preparando exportación...','ok')
      const r = await api.get('/quicklog/export/all')
      const all = r.data||[]; if (!all.length){show('Sin datos','err');return}
      const cols=['DDHID','FROM','TO','LITO_COD','LITO','ALTER_COD','ALTER','EXTRA','OBS']
      const lines=[cols.join(','),...all.map(r=>
        [r.DDHID,r.from_m,r.to_m,r.lito_cod,r.lito_desc,r.alter_cod,r.alter_desc,r.extra,r.obs]
          .map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`)
          .join(',')
      )]
      const a=document.createElement('a')
      a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}))
      a.download='quicklog_todos.csv'; a.click()
    } catch(e){show('Error al exportar','err')}
  }

  const th = {padding:'9px 8px',fontWeight:700,fontSize:11,textAlign:'center',borderRight:'1px solid rgba(255,255,255,.2)',whiteSpace:'nowrap'}
  const inputStyle = {width:'100%',background:'transparent',border:'none',outline:'none',color:'var(--txt)',fontSize:12,padding:'2px 4px',textAlign:'center'}

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type}/>
      {popup && <div style={{position:'fixed',inset:0,zIndex:1999}} onClick={()=>setPopup(null)}/>}

      {/* Modal confirmación cambio sondaje */}
      {pendingDDHID !== null && (
        <div className="m-bg">
          <div className="m-box" style={{maxWidth:400}}>
            <div className="m-title">⚠ Cambios sin guardar</div>
            <p style={{fontSize:13,color:'var(--mut)',marginBottom:20}}>
              Tienes cambios no guardados en <strong>{ddhid}</strong>. ¿Qué deseas hacer antes de cambiar al sondaje <strong>{pendingDDHID||'— ninguno —'}</strong>?
            </p>
            <div className="m-actions">
              <button className="btn btn-acc" onClick={()=>confirmChangeDdhid(true)}>💾 Guardar y continuar</button>
              <button className="btn btn-red" onClick={()=>confirmChangeDdhid(false)}>✕ Descartar cambios</button>
              <button className="btn btn-out" onClick={()=>setPendingDDHID(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {showImport && (
        <ImportModal
          onClose={()=>setShowImport(false)}
          onImported={()=>{ if(ddhid) loadDdhid(ddhid) }}
        />
      )}

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <div className="page-title">📋 Quick Log</div>
          <div className="page-desc">Registro rápido de litología y alteración por sondaje</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {saving && <span style={{fontSize:11,color:'var(--mut)',fontStyle:'italic'}}>⏳ Guardando...</span>}
          {dirty && !saving && <span style={{fontSize:11,color:'#f59e0b',fontStyle:'italic'}}>● Sin guardar</span>}
          {!canEdit && <span style={{fontSize:12,color:'var(--mut)',background:'var(--sur2)',border:'1px solid var(--brd)',borderRadius:6,padding:'4px 10px'}}>👁 Solo lectura</span>}
          {canEdit && ddhid && (
            <button className="btn btn-grn" onClick={()=>saveNow(ddhid,rows)} disabled={saving||!dirty}>
              💾 Guardar
            </button>
          )}
          {canEdit && <button className="btn btn-out" onClick={()=>setShowImport(true)}>📥 Importar</button>}
          <button className="btn btn-out" onClick={exportCSV} disabled={!ddhid||rows.every(r=>!r.lito_desc)}>📤 Exportar sondaje</button>
          <button className="btn btn-out" onClick={exportAll}>📦 Exportar todos</button>
        </div>
      </div>

      {/* Selector */}
      <div className="ch-card" style={{marginBottom:16,padding:'12px 20px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <span style={{fontWeight:600,fontSize:14}}>Sondaje:</span>
        <select value={ddhid} onChange={e=>handleDdhidChange(e.target.value)}
          style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--brd)',
            background:'var(--acc)',color:'#fff',fontSize:14,fontWeight:600,
            cursor:'pointer',outline:'none',minWidth:200}}>
          <option value="">— Seleccionar —</option>
          {ddhids.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        {ddhid && <span style={{fontSize:12,color:'var(--mut)'}}>{rows.filter(r=>r.lito_desc!=='').length} tramo(s)</span>}
      </div>

      {/* Tabla */}
      <div className="ch-card" style={{padding:0,overflow:'hidden'}}>
        {loading
          ? <div style={{padding:40,textAlign:'center',color:'var(--mut)'}}>Cargando...</div>
          : <>
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
                    const hasErr    = !!errors[row._id]
                    const alterOpts = row.lito_cod != null ? (ALTER_BY_LITO[row.lito_cod]||[]) : []
                    const tdBase    = {borderRight:'1px solid var(--brd)',borderBottom:'1px solid var(--brd)',padding:'3px 4px'}
                    const rowBg     = hasErr ? 'rgba(239,68,68,.06)' : idx%2===0 ? 'var(--bg)' : 'var(--sur2)'
                    return (
                      <React.Fragment key={row._id}>
                        <tr style={{background:rowBg}}>
                          <td style={{...tdBase,width:32,textAlign:'center',color:'var(--mut)',fontSize:11}}>{idx+1}</td>
                          <td style={{...tdBase,width:72}}>
                            <input style={{...inputStyle,color:hasErr?'var(--red)':'var(--txt)'}}
                              type="number" placeholder="0.0" value={row.from}
                              onChange={e=>updateField(row._id,'from',e.target.value)}/>
                          </td>
                          <td style={{...tdBase,width:72}}>
                            <input style={{...inputStyle,color:hasErr?'var(--red)':'var(--txt)'}}
                              type="number" placeholder="0.0" value={row.to}
                              onChange={e=>updateField(row._id,'to',e.target.value)}
                              onBlur={e=>handleToBlur(row._id,e.target.value)}/>
                          </td>
                          <td style={{...tdBase,width:210,position:'relative'}}>
                            <div ref={el=>{if(el)anchorRefs.current[`lito-${row._id}`]=el}}
                              onClick={()=>setPopup({type:'lito',rowId:row._id,anchor:anchorRefs.current[`lito-${row._id}`]})}
                              style={{padding:'4px 8px',cursor:'pointer',borderRadius:4,
                                background:row.lito_desc?'var(--acc)18':'transparent',
                                border:row.lito_desc?'1px solid var(--acc)44':'1px solid transparent',
                                display:'flex',justifyContent:'space-between',alignItems:'center',minHeight:26}}>
                              <span style={{fontSize:12,color:row.lito_desc?'var(--txt)':'var(--mut)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.lito_desc||'Seleccionar...'}</span>
                              {row.lito_cod!=null&&<span style={{fontSize:10,color:'var(--mut)',marginLeft:4,flexShrink:0}}>{row.lito_cod}</span>}
                            </div>
                            {popup?.type==='lito'&&popup.rowId===row._id&&(
                              <Popup items={LITO_LIST} anchor={popup.anchor}
                                onSelect={item=>{updateField(row._id,'lito_cod',item.cod);updateField(row._id,'lito_desc',item.desc);updateField(row._id,'alter_cod',null);updateField(row._id,'alter_desc','')}}
                                onClose={()=>setPopup(null)}/>
                            )}
                          </td>
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
                              <span style={{fontSize:12,color:row.alter_desc?'var(--txt)':'var(--mut)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.alter_desc||(row.lito_cod!=null?'Seleccionar...':'— elige lito —')}</span>
                              {row.alter_cod!=null&&<span style={{fontSize:10,color:'var(--mut)',marginLeft:4,flexShrink:0}}>{row.alter_cod}</span>}
                            </div>
                            {popup?.type==='alter'&&popup.rowId===row._id&&(
                              <Popup items={alterOpts} anchor={popup.anchor}
                                onSelect={item=>{updateField(row._id,'alter_cod',item.cod);updateField(row._id,'alter_desc',item.desc)}}
                                onClose={()=>setPopup(null)}/>
                            )}
                          </td>
                          <td style={{...tdBase,width:90}}>
                            <input style={inputStyle} placeholder="—" value={row.extra}
                              onChange={e=>updateField(row._id,'extra',e.target.value)}/>
                          </td>
                          <td style={{...tdBase,borderRight:'none'}}>
                            <input style={{...inputStyle,textAlign:'left'}} placeholder="Observaciones..."
                              value={row.obs} onChange={e=>updateField(row._id,'obs',e.target.value)}/>
                          </td>
                          <td style={{...tdBase,width:36,borderRight:'none',textAlign:'center'}}>
                            <button onClick={()=>deleteRow(row._id)}
                              style={{background:'none',border:'none',cursor:'pointer',color:'var(--mut)',fontSize:14,padding:'2px 4px',borderRadius:4,transition:'all .1s'}}
                              onMouseEnter={e=>{e.currentTarget.style.color='var(--red)';e.currentTarget.style.background='rgba(239,68,68,.1)'}}
                              onMouseLeave={e=>{e.currentTarget.style.color='var(--mut)';e.currentTarget.style.background='none'}}
                            >✕</button>
                          </td>
                        </tr>
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
            <div style={{padding:'10px 16px',borderTop:'1px solid var(--brd)'}}>
              <button onClick={addRow} className="btn btn-out btn-sm"
                style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}
                disabled={!ddhid||!canEdit}>
                <span style={{fontSize:16,lineHeight:1}}>+</span> Agregar tramo
              </button>
            </div>
          </>
        }
      </div>
    </div>
  )
}
