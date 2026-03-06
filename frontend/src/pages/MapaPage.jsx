import React, { useEffect, useRef, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'

function calcTransform(pts) {
  if (pts.length < 3) return null
  const [p0, p1, p2] = pts
  const det = p0.este*(p1.norte-p2.norte) + p1.este*(p2.norte-p0.norte) + p2.este*(p0.norte-p1.norte)
  if (Math.abs(det) < 1e-10) return null
  const a = (p0.px*(p1.norte-p2.norte) + p1.px*(p2.norte-p0.norte) + p2.px*(p0.norte-p1.norte)) / det
  const b = (p0.este*(p1.px-p2.px)     + p1.este*(p2.px-p0.px)     + p2.este*(p0.px-p1.px))     / det
  const c = p0.px - a*p0.este - b*p0.norte
  const d = (p0.py*(p1.norte-p2.norte) + p1.py*(p2.norte-p0.norte) + p2.py*(p0.norte-p1.norte)) / det
  const e = (p0.este*(p1.py-p2.py)     + p1.este*(p2.py-p0.py)     + p2.este*(p0.py-p1.py))     / det
  const f = p0.py - d*p0.este - e*p0.norte
  return { a, b, c, d, e, f }
}
function pxToCoord(px, py, T) {
  const det = T.a*T.e - T.b*T.d
  if (Math.abs(det) < 1e-10) return null
  return { este: (T.e*(px-T.c) - T.b*(py-T.f))/det, norte: (T.a*(py-T.f) - T.d*(px-T.c))/det }
}
function coordToPx(este, norte, T) {
  return { px: T.a*este + T.b*norte + T.c, py: T.d*este + T.e*norte + T.f }
}
function normEst(v) {
  const s = (v||'').trim()
  if (s === 'Completado') return 'Completado'
  if (s === 'En Proceso')  return 'En Proceso'
  return 'Pendiente'
}

const COLORES = { Completado:'#10b981', 'En Proceso':'#f59e0b', Pendiente:'#64748b' }
const ESTADOS = ['Completado', 'En Proceso', 'Pendiente']

export default function MapaPage() {
  const { user }        = useAuth()
  const { toast, show } = useToast()
  const isAdmin = user?.role === 'ADMIN'

  const [imgDataUrl, setImgDataUrl] = useState(null)
  const [imgNatW,    setImgNatW]    = useState(0)
  const [imgNatH,    setImgNatH]    = useState(0)
  const [imgDispW,   setImgDispW]   = useState(0)
  const [imgDispH,   setImgDispH]   = useState(0)
  const [puntosCtrl, setPuntosCtrl] = useState([])
  const [transform,  setTransform]  = useState(null)
  const [sondajes,   setSondajes]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [modo,       setModo]       = useState('ver')
  const [pendPx,     setPendPx]     = useState(null)
  const [formCoord,  setFormCoord]  = useState({ este:'', norte:'' })
  const [zoom,       setZoom]       = useState(1)
  const [offset,     setOffset]     = useState({ x:0, y:0 })
  const [tooltip,    setTooltip]    = useState(null)
  const [mouseCoord, setMouseCoord] = useState(null)
  // filtro: array de strings que SI se muestran
  const [mostrar,    setMostrar]    = useState(['Completado', 'En Proceso', 'Pendiente'])

  const containerRef = useRef(null)
  const imgRef       = useRef(null)
  const dragging     = useRef(false)
  const dragStart    = useRef({ x:0, y:0, ox:0, oy:0 })
  const zoomRef      = useRef(1)
  const offsetRef    = useRef({ x:0, y:0 })
  const modoRef      = useRef('ver')
  const transformRef = useRef(null)
  const imgDispRef   = useRef({ w:0, h:0 })
  const imgNatRef    = useRef({ w:0, h:0 })
  const longPress    = useRef(null)
  const lastTouches  = useRef([])
  const lastPinch    = useRef(null)
  const sondajesRef  = useRef([])

  useEffect(() => { zoomRef.current      = zoom      }, [zoom])
  useEffect(() => { offsetRef.current    = offset    }, [offset])
  useEffect(() => { modoRef.current      = modo      }, [modo])
  useEffect(() => { transformRef.current = transform }, [transform])
  useEffect(() => { sondajesRef.current  = sondajes  }, [sondajes])
  useEffect(() => { imgDispRef.current   = { w:imgDispW, h:imgDispH } }, [imgDispW, imgDispH])
  useEffect(() => { imgNatRef.current    = { w:imgNatW,  h:imgNatH  } }, [imgNatW,  imgNatH])

  // ── Cargar datos ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/mapa/config'),
      api.get('/tables/programa_general'),
      api.get('/tables/resumen/general'),
    ]).then(([cfgRes, pgRes, resRes]) => {
      const cfg = cfgRes.data || {}
      if (cfg.imagen_b64 && cfg.imagen_tipo) {
        setImgDataUrl(`data:${cfg.imagen_tipo};base64,${cfg.imagen_b64}`)
        setImgNatW(cfg.imagen_w || 0)
        setImgNatH(cfg.imagen_h || 0)
      }
      const pts = Array.isArray(cfg.puntos_ctrl) ? cfg.puntos_ctrl : []
      setPuntosCtrl(pts)
      if (pts.length >= 3) setTransform(calcTransform(pts))

      // Índice resumen por DDHID
      const idx = {}
      ;(resRes.data || []).forEach(r => { if (r.DDHID) idx[String(r.DDHID).trim()] = r })

      const lista = (pgRes.data || []).map(p => {
        const ddhid = String(p.DDHID || '').trim()
        const r     = idx[ddhid] || {}
        return {
          DDHID:        ddhid,
          PLATAFORMA:   String(p.PLATAFORMA || '').trim(),
          EQUIPO:       r.EQUIPO  || p.EQUIPO || '',
          ESTE:         parseFloat(p.ESTE  ?? p.este)  || null,
          NORTE:        parseFloat(p.NORTE ?? p.norte) || null,
          PROGRAMADO:   r.PROGRAMADO  || parseFloat(p.LENGTH) || 0,
          EJECUTADO:    r.EJECUTADO   || 0,
          PCT:          r.PCT         || 0,
          ESTADO:       normEst(r.ESTADO),
          FECHA_INICIO: r.FECHA_INICIO || '—',
          FECHA_FIN:    r.FECHA_FIN    || '—',
        }
      })
      setSondajes(lista)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // toggle filtro — método más simple posible
  function toggleEstado(est) {
    setMostrar(prev =>
      prev.includes(est)
        ? prev.filter(e => e !== est)   // quitar
        : [...prev, est]                // agregar
    )
  }

  // ── Zoom / pan helpers ────────────────────────────────────────
  function applyZoom(factor, cx, cy) {
    const z = zoomRef.current, o = offsetRef.current
    const nz = Math.min(Math.max(z * factor, 0.2), 10)
    const no = { x: cx-(cx-o.x)*(nz/z), y: cy-(cy-o.y)*(nz/z) }
    zoomRef.current = nz; offsetRef.current = no
    setZoom(nz); setOffset(no)
  }
  function resetView() {
    zoomRef.current = 1; offsetRef.current = { x:0, y:0 }
    setZoom(1); setOffset({ x:0, y:0 })
  }

  // ── Wheel / touch (no-passive) ────────────────────────────────
  const handlersRef = useRef({})
  handlersRef.current.wheel = (e) => {
    e.preventDefault()
    const r = containerRef.current.getBoundingClientRect()
    applyZoom(e.deltaY > 0 ? 0.85 : 1.18, e.clientX-r.left, e.clientY-r.top)
  }
  handlersRef.current.touchstart = (e) => {
    const isBtn = !!e.target.closest('button')
    const dotEl = e.target.closest('[data-dot]')
    if (!isBtn) e.preventDefault()
    clearTimeout(longPress.current)
    lastTouches.current = Array.from(e.touches)
    if (dotEl) {
      const touch = e.touches[0]
      const rect  = containerRef.current?.getBoundingClientRect()
      const cx = rect ? touch.clientX-rect.left : 0
      const cy = rect ? touch.clientY-rect.top  : 0
      const ddhid = dotEl.getAttribute('data-ddhid')
      longPress.current = setTimeout(() => {
        const s = sondajesRef.current.find(x => x.DDHID === ddhid)
        if (s) setTooltip({ s, cx, cy })
      }, 500)
      return
    }
    setTooltip(null)
    if (e.touches.length === 2) {
      lastPinch.current = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY)
    } else lastPinch.current = null
  }
  handlersRef.current.touchmove = (e) => {
    e.preventDefault()
    clearTimeout(longPress.current)
    if (e.touches.length === 1) {
      const prev = lastTouches.current[0]
      if (prev) {
        const o = offsetRef.current
        const no = { x: o.x+e.touches[0].clientX-prev.clientX, y: o.y+e.touches[0].clientY-prev.clientY }
        offsetRef.current = no; setOffset(no)
      }
      lastTouches.current = Array.from(e.touches)
    } else if (e.touches.length === 2) {
      const [t1,t2] = e.touches
      const dist = Math.hypot(t1.clientX-t2.clientX, t1.clientY-t2.clientY)
      if (lastPinch.current) {
        const r = containerRef.current.getBoundingClientRect()
        applyZoom(dist/lastPinch.current, (t1.clientX+t2.clientX)/2-r.left, (t1.clientY+t2.clientY)/2-r.top)
      }
      lastPinch.current = dist; lastTouches.current = Array.from(e.touches)
    }
  }
  handlersRef.current.touchend = (e) => {
    lastTouches.current = Array.from(e.touches)
    if (e.touches.length < 2) lastPinch.current = null
  }
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const o = { passive:false }
    const w  = e => handlersRef.current.wheel(e)
    const ts = e => handlersRef.current.touchstart(e)
    const tm = e => handlersRef.current.touchmove(e)
    const te = e => handlersRef.current.touchend(e)
    el.addEventListener('wheel', w, o); el.addEventListener('touchstart', ts, o)
    el.addEventListener('touchmove', tm, o); el.addEventListener('touchend', te, o)
    return () => {
      el.removeEventListener('wheel', w, o); el.removeEventListener('touchstart', ts, o)
      el.removeEventListener('touchmove', tm, o); el.removeEventListener('touchend', te, o)
    }
  }, [imgDataUrl])

  // ── Subir/eliminar imagen ─────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (file.size > 15*1024*1024) { show('Máximo 15MB','err'); return }
    setUploading(true)
    try {
      const dataUrl = await new Promise((res,rej) => { const r=new FileReader(); r.onload=ev=>res(ev.target.result); r.onerror=()=>rej(); r.readAsDataURL(file) })
      const {w,h}   = await new Promise((res,rej) => { const i=new Image(); i.onload=()=>res({w:i.naturalWidth,h:i.naturalHeight}); i.onerror=()=>rej(); i.src=dataUrl })
      await api.post('/mapa/upload', { base64:dataUrl.split(',')[1], mimeType:file.type, width:w, height:h })
      setImgDataUrl(dataUrl); setImgNatW(w); setImgNatH(h)
      setImgDispW(0); setImgDispH(0); setPuntosCtrl([]); setTransform(null); resetView()
      show('Plano subido ✓','ok')
    } catch(err) { show('Error: '+(err.response?.data?.error||err.message),'err') }
    finally { setUploading(false) }
  }
  function handleEliminar() {
    if (!window.confirm('¿Eliminar el plano?')) return
    api.delete('/mapa/imagen').then(() => {
      setImgDataUrl(null); setPuntosCtrl([]); setTransform(null); setModo('ver'); show('Plano eliminado','ok')
    }).catch(() => show('Error al eliminar','err'))
  }

  // ── Georeferenciación ─────────────────────────────────────────
  function handleImgClick(e) {
    if (modoRef.current !== 'georef' || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const { zoom:z, offset:o } = { zoom:zoomRef.current, offset:offsetRef.current }
    const { w:nw, h:nh } = imgNatRef.current
    const { w:dw, h:dh } = imgDispRef.current
    const dispX = (e.clientX-rect.left-o.x)/z
    const dispY = (e.clientY-rect.top -o.y)/z
    setPendPx({ px:Math.round(dispX*(nw/(dw||1))), py:Math.round(dispY*(nh/(dh||1))) })
    setFormCoord({ este:'', norte:'' })
  }
  function confirmPunto() {
    const este=parseFloat(formCoord.este), norte=parseFloat(formCoord.norte)
    if (isNaN(este)||isNaN(norte)) { show('Coordenadas inválidas','err'); return }
    const nuevos = [...puntosCtrl, { px:pendPx.px, py:pendPx.py, este, norte }]
    setPuntosCtrl(nuevos)
    if (nuevos.length >= 3) setTransform(calcTransform(nuevos))
    setPendPx(null)
    api.put('/mapa/puntos', { puntos:nuevos }).then(() => show(`Punto ${nuevos.length} guardado ✓`,'ok'))
  }
  function eliminarPunto(i) {
    const nuevos = puntosCtrl.filter((_,j)=>j!==i)
    setPuntosCtrl(nuevos); setTransform(nuevos.length>=3 ? calcTransform(nuevos) : null)
    api.put('/mapa/puntos', { puntos:nuevos })
  }

  // ── Mouse drag ────────────────────────────────────────────────
  function handleMouseDown(e) {
    if (modoRef.current === 'georef') return
    dragging.current = true
    dragStart.current = { x:e.clientX, y:e.clientY, ox:offsetRef.current.x, oy:offsetRef.current.y }
  }
  function handleMouseMove(e) {
    if (dragging.current) {
      const no = { x:dragStart.current.ox+e.clientX-dragStart.current.x, y:dragStart.current.oy+e.clientY-dragStart.current.y }
      offsetRef.current = no; setOffset(no)
    }
    const T = transformRef.current
    if (T && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const { zoom:z, offset:o } = { zoom:zoomRef.current, offset:offsetRef.current }
      const { w:dw, h:dh } = imgDispRef.current
      const { w:nw, h:nh } = imgNatRef.current
      const dx = (e.clientX-rect.left-o.x)/z, dy = (e.clientY-rect.top-o.y)/z
      if (dx>=0&&dy>=0&&dx<=dw&&dy<=dh) {
        const c = pxToCoord(dx*(nw/(dw||1)), dy*(nh/(dh||1)), T)
        setMouseCoord(c ? { este:c.este.toFixed(0), norte:c.norte.toFixed(0) } : null)
      } else setMouseCoord(null)
    }
  }
  function handleMouseUp()    { dragging.current = false }
  function handleMouseLeave() { dragging.current = false; setMouseCoord(null) }

  // ── Posición display ──────────────────────────────────────────
  function posDisplay(s) {
    if (!transform||!s.ESTE||!s.NORTE||!imgDispW||!imgNatW) return null
    const { px, py } = coordToPx(s.ESTE, s.NORTE, transform)
    return { x:px*(imgDispW/imgNatW), y:py*(imgDispH/imgNatH) }
  }

  // ── CSV export ────────────────────────────────────────────────
  function exportCSV() {
    const cols = ['DDHID','PLATAFORMA','EQUIPO','ESTE','NORTE','ESTADO','PROGRAMADO','EJECUTADO','PCT','FECHA_INICIO','FECHA_FIN']
    const rows = [cols.join(','), ...sondajes.map(s => cols.map(k => JSON.stringify(s[k]??'')).join(','))]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], {type:'text/csv'}))
    a.download = 'sondajes_mapa.csv'; a.click()
  }

  const tieneImagen = !!imgDataUrl
  const calibrado   = transform !== null

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:400,color:'var(--mut)'}}>Cargando...</div>

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <div className="page-title">🗺 Mapa de Sondajes</div>
          <div className="page-desc">Ubicación de sondajes sobre el plano del proyecto</div>
        </div>
        {isAdmin && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <label>
              <input type="file" accept="image/png,image/jpeg" style={{display:'none'}} onChange={handleFileChange} disabled={uploading}/>
              <span className="btn btn-blu" style={{opacity:uploading?.6:1,pointerEvents:uploading?'none':'auto',cursor:'pointer'}}>
                {uploading?'⏳ Subiendo...':'📤 '+(tieneImagen?'Cambiar plano':'Subir plano')}
              </span>
            </label>
            {tieneImagen && <button className="btn btn-red" onClick={handleEliminar}>🗑 Eliminar</button>}
            {tieneImagen && (
              <button className={modo==='georef'?'btn btn-acc':'btn btn-out'} onClick={() => {
                const next = modo==='georef'?'ver':'georef'
                setModo(next); modoRef.current=next; setPendPx(null)
              }}>
                {modo==='georef'?'✅ Georeferenciando...':'📍 Georeferenciar'}
              </button>
            )}
            {sondajes.length>0 && <button className="btn btn-out" onClick={exportCSV}>📥 CSV</button>}
          </div>
        )}
      </div>

      {/* Sin imagen */}
      {!tieneImagen && (
        <div className="ch-card" style={{textAlign:'center',padding:60,color:'var(--mut)'}}>
          <div style={{fontSize:48,marginBottom:12}}>🗺</div>
          <div style={{fontSize:15,marginBottom:6}}>No hay plano cargado</div>
          <div style={{fontSize:13}}>{isAdmin?'Usa "Subir plano" para comenzar':'El administrador debe cargar el plano'}</div>
        </div>
      )}

      {/* Panel georef */}
      {isAdmin && tieneImagen && modo==='georef' && (
        <div className="ch-card" style={{marginBottom:12,padding:'12px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
            <div style={{fontSize:13}}>
              <strong>Georeferenciación</strong>
              <span style={{color:'var(--mut)',marginLeft:8}}>
                {calibrado ? `✅ ${puntosCtrl.length} puntos` : `Clic en plano → ingresa ESTE/NORTE (${puntosCtrl.length}/3 mín)`}
              </span>
            </div>
            {puntosCtrl.length>0 && (
              <button className="btn btn-red btn-sm" onClick={() => {
                setPuntosCtrl([]); setTransform(null)
                api.put('/mapa/puntos',{puntos:[]}); show('Puntos eliminados','ok')
              }}>🗑 Limpiar</button>
            )}
          </div>
          {puntosCtrl.length>0 && (
            <div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:6}}>
              {puntosCtrl.map((p,i) => (
                <div key={i} style={{background:'var(--sur2)',border:'1px solid var(--brd)',borderRadius:6,padding:'4px 10px',fontSize:11,display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{color:'var(--acc)',fontWeight:700}}>P{i+1}</span>
                  <span style={{color:'var(--mut)'}}>E:{p.este.toFixed(0)} N:{p.norte.toFixed(0)}</span>
                  <span style={{cursor:'pointer',color:'var(--red)'}} onClick={()=>eliminarPunto(i)}>✕</span>
                </div>
              ))}
            </div>
          )}
          {pendPx && (
            <div style={{marginTop:10,background:'var(--sur2)',border:'1px solid var(--acc)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <span style={{fontSize:12,color:'var(--acc)',fontWeight:600}}>📍 Coordenada</span>
              <input type="number" placeholder="ESTE"  value={formCoord.este}  onChange={e=>setFormCoord(p=>({...p,este:e.target.value}))}
                style={{width:140,background:'var(--bg)',border:'1px solid var(--brd)',borderRadius:6,padding:'6px 10px',color:'var(--txt)',fontSize:13,outline:'none'}}/>
              <input type="number" placeholder="NORTE" value={formCoord.norte} onChange={e=>setFormCoord(p=>({...p,norte:e.target.value}))}
                style={{width:140,background:'var(--bg)',border:'1px solid var(--brd)',borderRadius:6,padding:'6px 10px',color:'var(--txt)',fontSize:13,outline:'none'}}/>
              <button className="btn btn-grn btn-sm" onClick={confirmPunto}>✓ Confirmar</button>
              <button className="btn btn-out btn-sm" onClick={()=>setPendPx(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* Leyenda / filtros */}
      {tieneImagen && (
        <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
          {ESTADOS.map(est => {
            const col   = COLORES[est]
            const total = sondajes.filter(s=>s.ESTADO===est).length
            const conC  = sondajes.filter(s=>s.ESTADO===est&&s.ESTE&&s.NORTE).length
            const label = est==='Pendiente' ? `${conC}📍/${total}` : conC
            const activo = mostrar.includes(est)
            return (
              <button key={est} onClick={()=>toggleEstado(est)}
                style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer',
                  background:activo?col+'22':'transparent',
                  border:`1.5px solid ${activo?col:'var(--brd)'}`,
                  borderRadius:20,padding:'4px 12px 4px 8px',
                  color:activo?'var(--txt)':'var(--mut)',
                  opacity:activo?1:0.45,transition:'all .15s',
                }}>
                <div style={{width:10,height:10,borderRadius:'50%',background:activo?col:'var(--mut)'}}/>
                {est} <span style={{fontSize:10,opacity:.7}}>({label})</span>
              </button>
            )
          })}
          {calibrado
            ? <span style={{fontSize:11,color:'var(--grn)'}}>✅ {sondajes.filter(s=>s.ESTE&&s.NORTE).length} con coords · {sondajes.filter(s=>!s.ESTE||!s.NORTE).length} sin</span>
            : isAdmin && <span style={{fontSize:11,color:'var(--mut)',fontStyle:'italic'}}>⚠ Faltan {Math.max(0,3-puntosCtrl.length)} puntos de georef</span>
          }
          <span style={{fontSize:11,color:'var(--mut)',marginLeft:'auto'}}>🖱 Scroll · Arrastra · 📱 Pellizca</span>
        </div>
      )}

      {/* Mapa */}
      {tieneImagen && (
        <div ref={containerRef}
          style={{position:'relative',overflow:'hidden',background:'var(--sur2)',border:'1px solid var(--brd)',
            borderRadius:14,height:'calc(100dvh - 230px)',minHeight:350,
            cursor:modo==='georef'?'crosshair':'grab',userSelect:'none',touchAction:'none'}}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}    onMouseLeave={handleMouseLeave}
        >
          {/* Capa transformada */}
          <div style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`,transformOrigin:'0 0',position:'relative',display:'inline-block'}}>

            <img ref={imgRef} src={imgDataUrl} alt="Plano" draggable={false}
              onClick={handleImgClick}
              onLoad={e=>{setImgDispW(e.target.offsetWidth);setImgDispH(e.target.offsetHeight)}}
              style={{display:'block',maxWidth:'100%',maxHeight:'calc(100dvh - 230px)'}}
            />

            {/* Punto pendiente georef */}
            {pendPx && imgDispW>0 && (
              <div style={{position:'absolute',
                left:pendPx.px*(imgDispW/imgNatW)-12/zoom, top:pendPx.py*(imgDispH/imgNatH)-12/zoom,
                width:24/zoom,height:24/zoom,borderRadius:'50%',
                background:'rgba(245,158,11,.95)',border:`${3/zoom}px solid #fff`,
                pointerEvents:'none',zIndex:10,boxShadow:`0 0 0 ${4/zoom}px rgba(245,158,11,.3)`}}/>
            )}

            {/* Puntos georef guardados */}
            {modo==='georef' && imgDispW>0 && puntosCtrl.map((p,i)=>(
              <div key={i} style={{position:'absolute',
                left:p.px*(imgDispW/imgNatW)-10/zoom, top:p.py*(imgDispH/imgNatH)-10/zoom,
                width:20/zoom,height:20/zoom,borderRadius:'50%',
                background:'#3b82f6',border:`${2/zoom}px solid #fff`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:9/zoom,color:'#fff',fontWeight:700,pointerEvents:'none',zIndex:9}}>{i+1}</div>
            ))}

            {/* ── SONDAJES — filtro con mostrar[] ── */}
            {calibrado && imgDispW>0 && sondajes.map(s => {
              // FILTRO: si el estado del sondaje no está en el array mostrar, no renderizar
              if (!mostrar.includes(s.ESTADO)) return null
              if (!s.ESTE || !s.NORTE) return null
              const pos = posDisplay(s)
              if (!pos) return null
              const col = COLORES[s.ESTADO]
              const r   = (s.ESTADO==='En Proceso' ? 9 : 7) / zoom
              return (
                <div key={s.DDHID} data-dot="1" data-ddhid={s.DDHID}
                  style={{position:'absolute',left:pos.x-r,top:pos.y-r,
                    width:r*2,height:r*2,borderRadius:'50%',
                    background:col,border:`${1.5/zoom}px solid rgba(255,255,255,.8)`,
                    cursor:'pointer',zIndex:5,
                    boxShadow:s.ESTADO==='En Proceso'?`0 0 ${8/zoom}px ${col}`:`0 1px ${3/zoom}px rgba(0,0,0,.3)`,
                  }}
                  onMouseEnter={()=>{
                    const {zoom:z,offset:o}={zoom:zoomRef.current,offset:offsetRef.current}
                    setTooltip({s,cx:pos.x*z+o.x,cy:pos.y*z+o.y})
                  }}
                  onMouseLeave={()=>setTooltip(null)}
                />
              )
            })}
          </div>

          {/* Tooltip — fuera de capa transformada */}
          {tooltip && (()=>{
            const {s,cx,cy} = tooltip
            const pct = Math.min(s.PCT??0,100)
            const cW  = containerRef.current?.offsetWidth  || 600
            const cH  = containerRef.current?.offsetHeight || 400
            const lp  = cx+14+220>cW ? cx-230 : cx+14
            const tp  = Math.min(Math.max(4,cy-20),cH-180)
            return (
              <div style={{position:'absolute',left:lp,top:tp,
                background:'var(--sur)',border:'1px solid var(--brd)',
                borderRadius:10,padding:'10px 14px',fontSize:12,
                zIndex:30,pointerEvents:'none',minWidth:190,maxWidth:220,
                boxShadow:'0 4px 20px rgba(0,0,0,.5)'}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>{s.DDHID}</div>
                <div style={{display:'flex',flexDirection:'column',gap:3}}>
                  {s.EQUIPO     && <span style={{color:'var(--mut)'}}>🔧 {s.EQUIPO}</span>}
                  {s.PLATAFORMA && <span style={{color:'var(--mut)'}}>📍 {s.PLATAFORMA}</span>}
                  <span style={{color:COLORES[s.ESTADO],fontWeight:600}}>● {s.ESTADO}</span>
                  <div style={{marginTop:4}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{color:'var(--mut)'}}>Prog: {s.PROGRAMADO}m</span>
                      <span style={{color:'var(--grn)',fontWeight:600}}>{pct}%</span>
                    </div>
                    <div style={{background:'var(--sur2)',borderRadius:99,height:5,overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',background:COLORES[s.ESTADO],borderRadius:99}}/>
                    </div>
                    <div style={{marginTop:3}}>Ejec: {s.EJECUTADO}m</div>
                  </div>
                  {s.FECHA_INICIO&&s.FECHA_INICIO!=='—'&&(
                    <span style={{color:'var(--mut)',fontSize:11}}>📅 {s.FECHA_INICIO} → {s.FECHA_FIN}</span>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Zoom buttons */}
          <div style={{position:'absolute',bottom:46,right:12,display:'flex',flexDirection:'column',gap:4,zIndex:20}}>
            {[
              {label:'+', fn:()=>{const r=containerRef.current?.getBoundingClientRect();if(r)applyZoom(1.3,r.width/2,r.height/2)}},
              {label:'−', fn:()=>{const r=containerRef.current?.getBoundingClientRect();if(r)applyZoom(0.77,r.width/2,r.height/2)}},
              {label:'⌂', fn:resetView},
            ].map(({label,fn})=>(
              <button key={label} className="btn btn-out btn-sm"
                style={{width:44,height:44,padding:0,fontSize:label==='⌂'?16:22,lineHeight:1,touchAction:'manipulation'}}
                onClick={fn} onTouchEnd={e=>{e.preventDefault();e.stopPropagation();fn()}}>
                {label}
              </button>
            ))}
          </div>

          {/* Zoom % */}
          <div style={{position:'absolute',bottom:46,left:12,fontSize:11,color:'var(--mut)',
            background:'var(--sur)',border:'1px solid var(--brd)',borderRadius:6,padding:'2px 8px',zIndex:15}}>
            {Math.round(zoom*100)}%
          </div>

          {/* Coordenadas cursor */}
          <div style={{position:'absolute',bottom:0,left:0,right:0,background:'var(--sur)',
            borderTop:'1px solid var(--brd)',padding:'6px 14px',display:'flex',alignItems:'center',
            gap:16,fontSize:12,zIndex:15,borderRadius:'0 0 14px 14px'}}>
            <span style={{color:'var(--mut)'}}>📐</span>
            {mouseCoord
              ? <><span>E: <strong style={{color:'var(--acc)'}}>{mouseCoord.este}</strong></span>
                  <span>N: <strong style={{color:'var(--acc)'}}>{mouseCoord.norte}</strong></span>
                  <span style={{color:'var(--mut)',fontSize:10}}>(PSAD56 18S)</span></>
              : <span style={{color:'var(--mut)',fontStyle:'italic'}}>Mueve el cursor sobre el plano</span>
            }
          </div>
        </div>
      )}
    </div>
  )
}
