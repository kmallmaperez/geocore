import React, { useEffect, useRef, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'

// ── Transformación afín ──────────────────────────────────────────
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
  return { este: (T.e*(px-T.c) - T.b*(py-T.f)) / det, norte: (T.a*(py-T.f) - T.d*(px-T.c)) / det }
}
function coordToPx(este, norte, T) {
  return { px: T.a*este + T.b*norte + T.c, py: T.d*este + T.e*norte + T.f }
}

const ESTADO_COLOR = { 'Completado':'#10b981', 'En Proceso':'#f59e0b', 'Pendiente':'#64748b' }

function normalizeEstado(est) {
  const s = (est || '').trim()
  if (s === 'Completado') return 'Completado'
  if (s === 'En Proceso') return 'En Proceso'
  return 'Pendiente'
}

export default function MapaPage() {
  const { user }        = useAuth()
  const { toast, show } = useToast()
  const isAdmin         = user?.role === 'ADMIN'

  const [imgDataUrl,  setImgDataUrl]  = useState(null)
  const [imgNatW,     setImgNatW]     = useState(0)
  const [imgNatH,     setImgNatH]     = useState(0)
  const [imgDispW,    setImgDispW]    = useState(0)
  const [imgDispH,    setImgDispH]    = useState(0)
  const [puntosCtrl,  setPuntosCtrl]  = useState([])
  const [transform,   setTransform]   = useState(null)
  const [sondajes,    setSondajes]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [modo,        setModo]        = useState('ver')
  const [pendPx,      setPendPx]      = useState(null)
  const [formCoord,   setFormCoord]   = useState({ este:'', norte:'' })
  const [zoom,        setZoom]        = useState(1)
  const [offset,      setOffset]      = useState({ x:0, y:0 })
  const [tooltip,     setTooltip]     = useState(null)
  const [mouseCoord,  setMouseCoord]  = useState(null)
  const [visibles,    setVisibles]    = useState({ Completado:true, 'En Proceso':true, Pendiente:true })

  const containerRef   = useRef(null)
  const imgRef         = useRef(null)
  // Refs para acceder a valores actuales dentro de event listeners DOM
  const zoomRef        = useRef(1)
  const offsetRef      = useRef({ x:0, y:0 })
  const modoRef        = useRef('ver')
  const imgDispRef     = useRef({ w:0, h:0 })
  const imgNatRef      = useRef({ w:0, h:0 })
  const transformRef   = useRef(null)
  const dragging       = useRef(false)
  const dragStart      = useRef({ x:0, y:0, ox:0, oy:0 })
  const lastTouches    = useRef([])
  const lastPinchDist  = useRef(null)
  const longPressTimer = useRef(null)

  // Mantener refs sincronizados con state
  useEffect(() => { zoomRef.current = zoom },           [zoom])
  useEffect(() => { offsetRef.current = offset },       [offset])
  useEffect(() => { modoRef.current = modo },           [modo])
  useEffect(() => { transformRef.current = transform }, [transform])
  useEffect(() => { imgDispRef.current = { w: imgDispW, h: imgDispH } }, [imgDispW, imgDispH])
  useEffect(() => { imgNatRef.current  = { w: imgNatW,  h: imgNatH  } }, [imgNatW,  imgNatH])

  // ── Cargar datos ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([api.get('/mapa/config'), api.get('/tables/resumen/general')])
      .then(([cfgRes, sRes]) => {
        const cfg = cfgRes.data || {}
        if (cfg.imagen_b64 && cfg.imagen_tipo) {
          setImgDataUrl(`data:${cfg.imagen_tipo};base64,${cfg.imagen_b64}`)
          setImgNatW(cfg.imagen_w || 0); setImgNatH(cfg.imagen_h || 0)
        }
        const pts = Array.isArray(cfg.puntos_ctrl) ? cfg.puntos_ctrl : []
        setPuntosCtrl(pts)
        if (pts.length >= 3) setTransform(calcTransform(pts))
        // Dedup por DDHID
        const seen = new Map()
        ;(sRes.data || []).forEach(s => { if (s.DDHID) seen.set(s.DDHID, s) }) // excluir DDHID null/vacío
        setSondajes([...seen.values()])
      }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // ── Event listeners DOM no-pasivos (wheel + touch) ─────────
  // Los handlers se guardan en refs para que el useEffect([]]) no capture closures stale
  const wheelHandlerRef      = useRef(null)
  const touchStartHandlerRef = useRef(null)
  const touchMoveHandlerRef  = useRef(null)
  const touchEndHandlerRef   = useRef(null)

  // Actualizar los handlers en cada render (siempre tienen valores frescos)
  wheelHandlerRef.current = function(e) {
    e.preventDefault()
    const rect   = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.85 : 1.18
    const z = zoomRef.current, o = offsetRef.current
    const nz = Math.min(Math.max(z * factor, 0.2), 10)
    zoomRef.current   = nz
    offsetRef.current = { x: mouseX-(mouseX-o.x)*(nz/z), y: mouseY-(mouseY-o.y)*(nz/z) }
    setZoom(nz); setOffset({...offsetRef.current})
  }

  touchStartHandlerRef.current = function(e) {
    const isBtn = e.target.tagName === 'BUTTON' || !!e.target.closest('button')
    const isDot = !!e.target.closest('[data-dot]')
    if (!isBtn) e.preventDefault()
    // Si toca un dot: dejar que el handler React del dot maneje el long press, no interferir
    if (isDot) return
    // Si toca fuera de dot: cerrar tooltip y manejar pan/pinch
    setTooltip(null)
    lastTouches.current = Array.from(e.touches)
    if (e.touches.length === 1) {
      lastPinchDist.current = null
    } else if (e.touches.length === 2) {
      clearTimeout(longPressTimer.current)
      const t1 = e.touches[0], t2 = e.touches[1]
      lastPinchDist.current = Math.hypot(t1.clientX-t2.clientX, t1.clientY-t2.clientY)
    }
  }

  touchMoveHandlerRef.current = function(e) {
    e.preventDefault()
    clearTimeout(longPressTimer.current)
    const isDot = !!e.target.closest('[data-dot]')
    // Si el movimiento empezó en un dot con 1 dedo y no tenemos lastTouches, inicializar pan
    if (isDot && e.touches.length === 1 && !lastTouches.current[0]) {
      lastTouches.current = Array.from(e.touches); return
    }
    if (e.touches.length === 1 && modoRef.current !== 'georef') {
      const prev = lastTouches.current[0]
      if (!prev) return
      const t = e.touches[0]
      const o = offsetRef.current
      offsetRef.current = { x: o.x + t.clientX - prev.clientX, y: o.y + t.clientY - prev.clientY }
      setOffset({...offsetRef.current})
      lastTouches.current = Array.from(e.touches)
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1]
      const dist = Math.hypot(t1.clientX-t2.clientX, t1.clientY-t2.clientY)
      if (lastPinchDist.current) {
        const factor = dist / lastPinchDist.current
        const rect   = containerRef.current.getBoundingClientRect()
        const cx     = ((t1.clientX+t2.clientX)/2) - rect.left
        const cy     = ((t1.clientY+t2.clientY)/2) - rect.top
        const z = zoomRef.current, o = offsetRef.current
        const nz = Math.min(Math.max(z * factor, 0.2), 10)
        zoomRef.current   = nz
        offsetRef.current = { x: cx-(cx-o.x)*(nz/z), y: cy-(cy-o.y)*(nz/z) }
        setZoom(nz); setOffset({...offsetRef.current})
      }
      lastPinchDist.current = dist
      lastTouches.current   = Array.from(e.touches)
    }
  }

  touchEndHandlerRef.current = function(e) {
    lastTouches.current = Array.from(e.touches)
    if (e.touches.length < 2) lastPinchDist.current = null
  }

  // Registrar listeners una sola vez, llamando al ref (siempre fresco)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const opts = { passive: false }
    const onWheel      = e => wheelHandlerRef.current(e)
    const onTouchStart = e => touchStartHandlerRef.current(e)
    const onTouchMove  = e => touchMoveHandlerRef.current(e)
    const onTouchEnd   = e => touchEndHandlerRef.current(e)
    el.addEventListener('wheel',      onWheel,      opts)
    el.addEventListener('touchstart', onTouchStart, opts)
    el.addEventListener('touchmove',  onTouchMove,  opts)
    el.addEventListener('touchend',   onTouchEnd,   opts)
    return () => {
      el.removeEventListener('wheel',      onWheel,      opts)
      el.removeEventListener('touchstart', onTouchStart, opts)
      el.removeEventListener('touchmove',  onTouchMove,  opts)
      el.removeEventListener('touchend',   onTouchEnd,   opts)
    }
  }, [imgDataUrl]) // re-corre cuando aparece/desaparece el mapa

  // ── Subir imagen ──────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (file.size > 15*1024*1024) { show('Máximo 15MB', 'err'); return }
    setUploading(true)
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = ev => res(ev.target.result); r.onerror = () => rej(new Error('Error leyendo'))
        r.readAsDataURL(file)
      })
      const { w, h } = await new Promise((res, rej) => {
        const img = new Image()
        img.onload = () => res({ w:img.naturalWidth, h:img.naturalHeight }); img.onerror = () => rej(new Error('Imagen inválida'))
        img.src = dataUrl
      })
      await api.post('/mapa/upload', { base64: dataUrl.split(',')[1], mimeType: file.type, width: w, height: h })
      setImgDataUrl(dataUrl); setImgNatW(w); setImgNatH(h)
      setImgDispW(0); setImgDispH(0); setPuntosCtrl([]); setTransform(null)
      setZoom(1); zoomRef.current = 1; setOffset({x:0,y:0}); offsetRef.current = {x:0,y:0}
      show('Plano subido ✓', 'ok')
    } catch(err) { show('Error: '+(err.response?.data?.error||err.message), 'err') }
    finally { setUploading(false) }
  }

  function handleEliminar() {
    if (!window.confirm('¿Eliminar el plano? Se perderán los puntos de georeferencia.')) return
    api.delete('/mapa/imagen').then(() => {
      setImgDataUrl(null); setPuntosCtrl([]); setTransform(null); setModo('ver')
      show('Plano eliminado', 'ok')
    }).catch(() => show('Error al eliminar', 'err'))
  }

  // ── Georeferenciación ─────────────────────────────────────────
  function handleImgClick(e) {
    if (modo !== 'georef' || !containerRef.current) return
    const rect  = containerRef.current.getBoundingClientRect()
    const cX    = e.clientX - rect.left
    const cY    = e.clientY - rect.top
    const dispX = (cX - zoomRef.current === zoom ? offset.x : offsetRef.current.x) / zoom
    const dispY = (cY - offsetRef.current.y) / zoom
    const natX  = Math.round(dispX * (imgNatW / (imgDispW || 1)))
    const natY  = Math.round(dispY * (imgNatH / (imgDispH || 1)))
    setPendPx({ px: natX, py: natY }); setFormCoord({ este:'', norte:'' })
  }

  function handleImgClickFixed(e) {
    if (modo !== 'georef' || !containerRef.current) return
    const rect  = containerRef.current.getBoundingClientRect()
    const dispX = (e.clientX - rect.left - offsetRef.current.x) / zoomRef.current
    const dispY = (e.clientY - rect.top  - offsetRef.current.y) / zoomRef.current
    const natX  = Math.round(dispX * (imgNatRef.current.w / (imgDispRef.current.w || 1)))
    const natY  = Math.round(dispY * (imgNatRef.current.h / (imgDispRef.current.h || 1)))
    setPendPx({ px: natX, py: natY }); setFormCoord({ este:'', norte:'' })
  }

  function confirmPunto() {
    const este = parseFloat(formCoord.este), norte = parseFloat(formCoord.norte)
    if (isNaN(este)||isNaN(norte)) { show('Coordenadas inválidas','err'); return }
    const nuevos = [...puntosCtrl, { px:pendPx.px, py:pendPx.py, este, norte }]
    setPuntosCtrl(nuevos)
    if (nuevos.length >= 3) setTransform(calcTransform(nuevos))
    setPendPx(null)
    api.put('/mapa/puntos', { puntos: nuevos }).then(() => show(`Punto ${nuevos.length} guardado ✓`,'ok'))
  }

  function eliminarPunto(i) {
    const nuevos = puntosCtrl.filter((_,j) => j !== i)
    setPuntosCtrl(nuevos); setTransform(nuevos.length>=3 ? calcTransform(nuevos) : null)
    api.put('/mapa/puntos', { puntos: nuevos })
  }

  // ── Mouse drag ────────────────────────────────────────────────
  function handleMouseDown(e) {
    if (modo === 'georef') return
    dragging.current = true
    dragStart.current = { x:e.clientX, y:e.clientY, ox:offsetRef.current.x, oy:offsetRef.current.y }
  }
  function handleMouseMove(e) {
    if (dragging.current) {
      const nx = dragStart.current.ox + e.clientX - dragStart.current.x
      const ny = dragStart.current.oy + e.clientY - dragStart.current.y
      offsetRef.current = { x:nx, y:ny }; setOffset({ x:nx, y:ny })
    }
    if (transformRef.current && imgNatRef.current.w > 0 && containerRef.current) {
      const rect  = containerRef.current.getBoundingClientRect()
      const dispX = (e.clientX - rect.left - offsetRef.current.x) / zoomRef.current
      const dispY = (e.clientY - rect.top  - offsetRef.current.y) / zoomRef.current
      if (dispX >= 0 && dispY >= 0 && dispX <= imgDispRef.current.w && dispY <= imgDispRef.current.h) {
        const natX = dispX * (imgNatRef.current.w / (imgDispRef.current.w||1))
        const natY = dispY * (imgNatRef.current.h / (imgDispRef.current.h||1))
        const coord = pxToCoord(natX, natY, transformRef.current)
        if (coord) setMouseCoord({ este: coord.este.toFixed(0), norte: coord.norte.toFixed(0) })
        else setMouseCoord(null)
      } else setMouseCoord(null)
    }
  }
  function handleMouseUp()    { dragging.current = false }
  function handleMouseLeave() { dragging.current = false; setMouseCoord(null) }

  // ── Zoom con botones ──────────────────────────────────────────
  function zoomBtn(factor) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.width/2, cy = rect.height/2
    const z  = zoomRef.current, o = offsetRef.current
    const nz = Math.min(Math.max(z*factor, 0.2), 10)
    const no = { x: cx - (cx-o.x)*(nz/z), y: cy - (cy-o.y)*(nz/z) }
    zoomRef.current = nz; offsetRef.current = no
    setZoom(nz); setOffset(no)
  }

  // ── Posición display de un sondaje ────────────────────────────
  function sondajePosDisplay(s) {
    if (!transform || !s.ESTE || !s.NORTE || !imgDispW || !imgNatW) return null
    const { px, py } = coordToPx(s.ESTE, s.NORTE, transform)
    return { x: px*(imgDispW/imgNatW), y: py*(imgDispH/imgNatH) }
  }

  const tieneImagen = !!imgDataUrl
  const calibrado   = transform !== null

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, color:'var(--mut)' }}>Cargando...</div>

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <div>
          <div className="page-title">🗺 Mapa de Sondajes</div>
          <div className="page-desc">Ubicación de sondajes sobre el plano del proyecto</div>
        </div>
        {isAdmin && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <label style={{ cursor: uploading?'not-allowed':'pointer' }}>
              <input type="file" accept="image/png,image/jpeg" style={{ display:'none' }} onChange={handleFileChange} disabled={uploading} />
              <span className="btn btn-blu" style={{ opacity:uploading?.6:1, pointerEvents:uploading?'none':'auto' }}>
                {uploading ? '⏳ Subiendo...' : '📤 '+(tieneImagen?'Cambiar plano':'Subir plano')}
              </span>
            </label>
            {tieneImagen && <button className="btn btn-red" onClick={handleEliminar}>🗑 Eliminar</button>}
            {tieneImagen && (
              <button className={modo==='georef'?'btn btn-acc':'btn btn-out'}
                onClick={() => { setModo(m => m==='georef'?'ver':'georef'); modoRef.current = modo==='georef'?'ver':'georef'; setPendPx(null) }}>
                {modo==='georef' ? '✅ Georeferenciando...' : '📍 Georeferenciar'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sin imagen */}
      {!tieneImagen && (
        <div className="ch-card" style={{ textAlign:'center', padding:60, color:'var(--mut)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🗺</div>
          <div style={{ fontSize:15, marginBottom:6 }}>No hay plano cargado</div>
          <div style={{ fontSize:13 }}>{isAdmin?'Usa "Subir plano" para comenzar':'El administrador debe cargar el plano'}</div>
        </div>
      )}

      {/* Panel georeferenciación */}
      {isAdmin && tieneImagen && modo==='georef' && (
        <div className="ch-card" style={{ marginBottom:12, padding:'12px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13 }}>
              <strong>Georeferenciación</strong>
              <span style={{ color:'var(--mut)', marginLeft:8 }}>
                {calibrado ? `✅ ${puntosCtrl.length} puntos` : `Haz clic en el plano e ingresa ESTE/NORTE (${puntosCtrl.length}/3 mínimo)`}
              </span>
            </div>
            {puntosCtrl.length > 0 && (
              <button className="btn btn-red btn-sm" onClick={() => { setPuntosCtrl([]); setTransform(null); api.put('/mapa/puntos',{puntos:[]}); show('Puntos eliminados','ok') }}>
                🗑 Limpiar
              </button>
            )}
          </div>
          {puntosCtrl.length > 0 && (
            <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:6 }}>
              {puntosCtrl.map((p,i) => (
                <div key={i} style={{ background:'var(--sur2)', border:'1px solid var(--brd)', borderRadius:6, padding:'4px 10px', fontSize:11, display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ color:'var(--acc)', fontWeight:700 }}>P{i+1}</span>
                  <span style={{ color:'var(--mut)' }}>E:{p.este.toFixed(0)} N:{p.norte.toFixed(0)}</span>
                  <span style={{ cursor:'pointer', color:'var(--red)' }} onClick={() => eliminarPunto(i)}>✕</span>
                </div>
              ))}
            </div>
          )}
          {pendPx && (
            <div style={{ marginTop:10, background:'var(--sur2)', border:'1px solid var(--acc)', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, color:'var(--acc)', fontWeight:600 }}>📍 ¿Coordenada de este punto?</span>
              <input type="number" placeholder="ESTE"  value={formCoord.este}  onChange={e => setFormCoord(p=>({...p,este:e.target.value}))}
                style={{ width:140, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }} />
              <input type="number" placeholder="NORTE" value={formCoord.norte} onChange={e => setFormCoord(p=>({...p,norte:e.target.value}))}
                style={{ width:140, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }} />
              <button className="btn btn-grn btn-sm" onClick={confirmPunto}>✓ Confirmar</button>
              <button className="btn btn-out btn-sm" onClick={() => setPendPx(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* Leyenda — botones toggle */}
      {tieneImagen && (
        <div style={{ display:'flex', gap:10, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
          {Object.entries(ESTADO_COLOR).map(([est, col]) => {
            const total    = sondajes.filter(s => normalizeEstado(s.ESTADO) === est).length
            const conCoord = sondajes.filter(s => normalizeEstado(s.ESTADO) === est && s.ESTE && s.NORTE).length
            const count    = est === 'Pendiente' ? `${conCoord}📍/${total}` : conCoord
            return (
              <button key={est} onClick={() => setVisibles(v => ({...v,[est]:!v[est]}))}
                style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer',
                  background: visibles[est] ? col+'22' : 'transparent',
                  border: `1.5px solid ${visibles[est] ? col : 'var(--brd)'}`,
                  borderRadius:20, padding:'4px 12px 4px 8px', color: visibles[est] ? 'var(--txt)' : 'var(--mut)',
                  opacity: visibles[est] ? 1 : 0.5, transition:'all .15s',
                }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: visibles[est] ? col : 'var(--mut)' }} />
                {est} <span style={{ fontSize:10, opacity:.7 }}>({count})</span>
              </button>
            )
          })}
          {calibrado
            ? <span style={{ fontSize:11, color:'var(--grn)' }}>✅ {sondajes.filter(s=>s.ESTE&&s.NORTE).length} con coordenadas · {sondajes.filter(s=>!s.ESTE||!s.NORTE).length} sin coordenadas</span>
            : isAdmin && <span style={{ fontSize:11, color:'var(--mut)', fontStyle:'italic' }}>⚠ Faltan {Math.max(0,3-puntosCtrl.length)} puntos de georeferencia</span>
          }
          <span style={{ fontSize:11, color:'var(--mut)', marginLeft:'auto' }}>🖱 Scroll · Arrastra · 📱 Pellizca · Mantén para info</span>
        </div>
      )}

      {/* Mapa */}
      {tieneImagen && (
        <div ref={containerRef} style={{
          position:'relative', overflow:'hidden',
          background:'var(--sur2)', border:'1px solid var(--brd)', borderRadius:14,
          height:'calc(100dvh - 230px)', minHeight:350,
          cursor: modo==='georef' ? 'crosshair' : 'grab', userSelect:'none',
          touchAction:'none',
        }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          {/* Capa transformada */}
          <div style={{ transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`, transformOrigin:'0 0', position:'relative', display:'inline-block' }}>

            <img ref={imgRef} src={imgDataUrl} alt="Plano" draggable={false}
              onClick={handleImgClickFixed}
              onLoad={e => { setImgDispW(e.target.offsetWidth); setImgDispH(e.target.offsetHeight) }}
              style={{ display:'block', maxWidth:'100%', maxHeight:'calc(100dvh - 230px)' }}
            />

            {/* Punto pendiente de georef */}
            {pendPx && imgDispW>0 && (
              <div style={{
                position:'absolute',
                left: pendPx.px*(imgDispW/imgNatW) - 12/zoom,
                top:  pendPx.py*(imgDispH/imgNatH) - 12/zoom,
                width:24/zoom, height:24/zoom, borderRadius:'50%',
                background:'rgba(245,158,11,.95)', border:`${3/zoom}px solid #fff`,
                pointerEvents:'none', zIndex:10, boxShadow:`0 0 0 ${4/zoom}px rgba(245,158,11,.3)`,
              }} />
            )}

            {/* Puntos de georef guardados */}
            {modo==='georef' && imgDispW>0 && puntosCtrl.map((p,i) => (
              <div key={i} style={{
                position:'absolute',
                left: p.px*(imgDispW/imgNatW) - 10/zoom,
                top:  p.py*(imgDispH/imgNatH) - 10/zoom,
                width:20/zoom, height:20/zoom, borderRadius:'50%',
                background:'#3b82f6', border:`${2/zoom}px solid #fff`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:9/zoom, color:'#fff', fontWeight:700, pointerEvents:'none', zIndex:9,
              }}>{i+1}</div>
            ))}

            {/* Sondajes */}
            {calibrado && imgDispW>0 && sondajes.map(s => {
              const est = normalizeEstado(s.ESTADO)
              if (!visibles[est]) return null          // ← filtro aquí, simple y claro
              if (!s.ESTE || !s.NORTE) return null
              const pos = sondajePosDisplay(s)
              if (!pos) return null
              const color = ESTADO_COLOR[est]
              const r     = (est==='En Proceso' ? 9 : 7) / zoom
              return (
                <div key={s.DDHID} data-dot="1" style={{
                  position:'absolute', left:pos.x-r, top:pos.y-r,
                  width:r*2, height:r*2, borderRadius:'50%',
                  background:color, border:`${1.5/zoom}px solid rgba(255,255,255,.8)`,
                  cursor:'pointer', zIndex:5, transition:'transform .1s',
                  boxShadow: est==='En Proceso' ? `0 0 ${8/zoom}px ${color}` : `0 1px ${3/zoom}px rgba(0,0,0,.3)`,
                }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform='scale(1.8)'
                    setTooltip({ s, est,
                      cx: pos.x*zoomRef.current + offsetRef.current.x,
                      cy: pos.y*zoomRef.current + offsetRef.current.y,
                    })
                  }}
                  onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; setTooltip(null) }}
                  onTouchStart={e => {
                    // stopPropagation en React NO detiene listeners nativos DOM
                    // El handler nativo detecta [data-dot] y nos deja actuar solos
                    const touch = e.touches[0]
                    const rect  = containerRef.current?.getBoundingClientRect()
                    const cx    = rect ? touch.clientX - rect.left : 0
                    const cy    = rect ? touch.clientY - rect.top  : 0
                    // Inicializar lastTouches para que pan funcione si el usuario mueve después
                    lastTouches.current = Array.from(e.touches)
                    longPressTimer.current = setTimeout(() => setTooltip({ s, est, cx, cy }), 500)
                  }}
                  onTouchMove={e => { clearTimeout(longPressTimer.current) }}
                  onTouchEnd={e => { clearTimeout(longPressTimer.current) }}
                />
              )
            })}
          </div>

          {/* Tooltip — fuera de la capa transformada */}
          {tooltip && (() => {
            const s   = tooltip.s
            const est = tooltip.est || normalizeEstado(s.ESTADO)
            const pct = Math.min(s.PCT??0, 100)
            const contW = containerRef.current?.offsetWidth  || 600
            const contH = containerRef.current?.offsetHeight || 400
            const lp    = tooltip.cx+14+220 > contW ? tooltip.cx-230 : tooltip.cx+14
            const tp    = Math.min(Math.max(4, tooltip.cy-20), contH-180)
            return (
              <div style={{
                position:'absolute', left:lp, top:tp,
                background:'var(--sur)', border:'1px solid var(--brd)',
                borderRadius:10, padding:'10px 14px', fontSize:12,
                zIndex:30, pointerEvents:'none', minWidth:190, maxWidth:220,
                boxShadow:'0 4px 20px rgba(0,0,0,.5)',
              }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>{s.DDHID}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {s.EQUIPO     && <span style={{ color:'var(--mut)' }}>🔧 {s.EQUIPO}</span>}
                  {s.PLATAFORMA && <span style={{ color:'var(--mut)' }}>📍 {s.PLATAFORMA}</span>}
                  <span style={{ color:ESTADO_COLOR[est], fontWeight:600 }}>● {est}</span>
                  <div style={{ marginTop:4 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ color:'var(--mut)' }}>Prog: {s.PROGRAMADO}m</span>
                      <span style={{ color:'var(--grn)', fontWeight:600 }}>{pct}%</span>
                    </div>
                    <div style={{ background:'var(--sur2)', borderRadius:99, height:5, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:ESTADO_COLOR[est], borderRadius:99 }} />
                    </div>
                    <div style={{ marginTop:3 }}>Ejec: {s.EJECUTADO}m</div>
                  </div>
                  {s.FECHA_INICIO && s.FECHA_INICIO!=='—' && (
                    <span style={{ color:'var(--mut)', fontSize:11 }}>📅 {s.FECHA_INICIO} → {s.FECHA_FIN}</span>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Botones zoom */}
          <div style={{ position:'absolute', bottom:46, right:12, display:'flex', flexDirection:'column', gap:4, zIndex:20 }}>
            {[
              { label:'+', action: () => zoomBtn(1.3) },
              { label:'−', action: () => zoomBtn(0.77) },
              { label:'⌂', action: () => { setZoom(1); zoomRef.current=1; setOffset({x:0,y:0}); offsetRef.current={x:0,y:0} } },
            ].map(({ label, action }) => (
              <button key={label} className="btn btn-out btn-sm"
                style={{ width:44, height:44, padding:0, fontSize: label==='⌂'?16:22, lineHeight:1, touchAction:'manipulation' }}
                onClick={action}
                onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); action() }}>
                {label}
              </button>
            ))}
          </div>

          {/* % zoom */}
          <div style={{ position:'absolute', bottom:46, left:12, fontSize:11, color:'var(--mut)', background:'var(--sur)', border:'1px solid var(--brd)', borderRadius:6, padding:'2px 8px', zIndex:15 }}>
            {Math.round(zoom*100)}%
          </div>

          {/* Barra coordenadas */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'var(--sur)', borderTop:'1px solid var(--brd)', padding:'6px 14px', display:'flex', alignItems:'center', gap:16, fontSize:12, zIndex:15, borderRadius:'0 0 14px 14px' }}>
            <span style={{ color:'var(--mut)' }}>📐</span>
            {mouseCoord
              ? <><span>E: <strong style={{ color:'var(--acc)' }}>{mouseCoord.este}</strong></span><span>N: <strong style={{ color:'var(--acc)' }}>{mouseCoord.norte}</strong></span><span style={{ color:'var(--mut)', fontSize:10 }}>(PSAD56 18S)</span></>
              : <span style={{ color:'var(--mut)', fontStyle:'italic' }}>Mueve el cursor sobre el plano</span>
            }
          </div>
        </div>
      )}
    </div>
  )
}
