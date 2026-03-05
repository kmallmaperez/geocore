import React, { useEffect, useRef, useState, useCallback } from 'react'
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

// Pixel natural → coordenada
function pxToCoord(px, py, T) {
  // Invertir la transformación afín
  const det = T.a*T.e - T.b*T.d
  if (Math.abs(det) < 1e-10) return null
  const este  = (T.e*(px-T.c) - T.b*(py-T.f)) / det
  const norte = (T.a*(py-T.f) - T.d*(px-T.c)) / det
  return { este, norte }
}

// Coordenada → pixel natural
function coordToPx(este, norte, T) {
  return { px: T.a*este + T.b*norte + T.c, py: T.d*este + T.e*norte + T.f }
}

const ESTADO_COLOR = {
  'Completado': '#10b981',
  'En Proceso': '#f59e0b',
  'Pendiente':  '#64748b',
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
  const [formCoord,   setFormCoord]   = useState({ este: '', norte: '' })
  const [zoom,        setZoom]        = useState(1)
  const [offset,      setOffset]      = useState({ x: 0, y: 0 })
  const [tooltip,     setTooltip]     = useState(null)
  const [mouseCoord,  setMouseCoord]  = useState(null) // {este, norte} bajo el cursor
  const [visibles,    setVisibles]    = useState({ Completado: true, 'En Proceso': true, Pendiente: true })

  const containerRef  = useRef(null)
  const imgRef        = useRef(null)
  const dragging      = useRef(false)
  const dragStart     = useRef({ x:0, y:0, ox:0, oy:0 })
  const lastTouch     = useRef(null)   // para pan táctil
  const lastPinchDist = useRef(null)   // para pinch zoom

  // ── Touch listeners no-pasivos (para poder llamar preventDefault) ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const opts = { passive: false }
    el.addEventListener('touchstart', handleTouchStart, opts)
    el.addEventListener('touchmove',  handleTouchMove,  opts)
    el.addEventListener('touchend',   handleTouchEnd,   opts)
    return () => {
      el.removeEventListener('touchstart', handleTouchStart, opts)
      el.removeEventListener('touchmove',  handleTouchMove,  opts)
      el.removeEventListener('touchend',   handleTouchEnd,   opts)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, zoom, modo])

  // ── Cargar config y sondajes ──────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/mapa/config'),
      api.get('/tables/resumen/general'),
    ]).then(([cfgRes, sRes]) => {
      const cfg = cfgRes.data || {}
      if (cfg.imagen_b64 && cfg.imagen_tipo) {
        setImgDataUrl(`data:${cfg.imagen_tipo};base64,${cfg.imagen_b64}`)
        setImgNatW(cfg.imagen_w || 0)
        setImgNatH(cfg.imagen_h || 0)
      }
      const pts = Array.isArray(cfg.puntos_ctrl) ? cfg.puntos_ctrl : []
      setPuntosCtrl(pts)
      if (pts.length >= 3) setTransform(calcTransform(pts))
      setSondajes(sRes.data || [])
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  // ── Subir imagen ──────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 15*1024*1024) { show('Máximo 15MB', 'err'); return }
    setUploading(true)
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload  = ev => res(ev.target.result)
        r.onerror = ()  => rej(new Error('Error leyendo archivo'))
        r.readAsDataURL(file)
      })
      const { w, h } = await new Promise((res, rej) => {
        const img = new Image()
        img.onload  = () => res({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = ()  => rej(new Error('Imagen inválida'))
        img.src = dataUrl
      })
      const base64 = dataUrl.split(',')[1]
      await api.post('/mapa/upload', { base64, mimeType: file.type, width: w, height: h })
      setImgDataUrl(dataUrl)
      setImgNatW(w); setImgNatH(h)
      setImgDispW(0); setImgDispH(0)
      setPuntosCtrl([]); setTransform(null)
      setZoom(1); setOffset({ x:0, y:0 })
      show('Plano subido ✓', 'ok')
    } catch (err) {
      show('Error: ' + (err.response?.data?.error || err.message), 'err')
    } finally { setUploading(false) }
  }

  // ── Eliminar plano ────────────────────────────────────────────
  function handleEliminar() {
    if (!window.confirm('¿Eliminar el plano? Se perderán los puntos de georeferencia.')) return
    api.delete('/mapa/imagen').then(() => {
      setImgDataUrl(null); setImgNatW(0); setImgNatH(0)
      setPuntosCtrl([]); setTransform(null); setModo('ver')
      show('Plano eliminado', 'ok')
    }).catch(() => show('Error al eliminar', 'err'))
  }

  // ── Georeferenciación: click en imagen ────────────────────────
  function handleImgClick(e) {
    if (modo !== 'georef' || !imgRef.current || !containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    // Posición del click en el espacio del contenedor
    const cX = e.clientX - containerRect.left
    const cY = e.clientY - containerRect.top
    // Revertir transform: translate(offset) scale(zoom) → posición en imagen display
    const dispX = (cX - offset.x) / zoom
    const dispY = (cY - offset.y) / zoom
    // Display → pixel natural
    const natX = Math.round(dispX * (imgNatW / (imgDispW || 1)))
    const natY = Math.round(dispY * (imgNatH / (imgDispH || 1)))
    setPendPx({ px: natX, py: natY })
    setFormCoord({ este: '', norte: '' })
  }

  function confirmPunto() {
    const este  = parseFloat(formCoord.este)
    const norte = parseFloat(formCoord.norte)
    if (isNaN(este) || isNaN(norte)) { show('Coordenadas inválidas', 'err'); return }
    const nuevos = [...puntosCtrl, { px: pendPx.px, py: pendPx.py, este, norte }]
    setPuntosCtrl(nuevos)
    if (nuevos.length >= 3) setTransform(calcTransform(nuevos))
    setPendPx(null)
    api.put('/mapa/puntos', { puntos: nuevos }).then(() => show(`Punto ${nuevos.length} guardado ✓`, 'ok'))
  }

  function eliminarPunto(i) {
    const nuevos = puntosCtrl.filter((_, j) => j !== i)
    setPuntosCtrl(nuevos)
    setTransform(nuevos.length >= 3 ? calcTransform(nuevos) : null)
    api.put('/mapa/puntos', { puntos: nuevos })
  }

  // ── Touch: pan con 1 dedo, pinch-zoom con 2 dedos ───────────
  function getTouchDist(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
  }
  function getTouchCenter(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }
  }

  function handleTouchStart(e) {
    e.preventDefault()
    if (e.touches.length === 1) {
      const t = e.touches[0]
      lastTouch.current     = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y }
      lastPinchDist.current = null
    } else if (e.touches.length === 2) {
      lastPinchDist.current = getTouchDist(e.touches[0], e.touches[1])
      lastTouch.current     = null
    }
  }

  function handleTouchMove(e) {
    e.preventDefault()
    if (e.touches.length === 1 && lastTouch.current && modo !== 'georef') {
      const t = e.touches[0]
      setOffset({
        x: lastTouch.current.ox + t.clientX - lastTouch.current.x,
        y: lastTouch.current.oy + t.clientY - lastTouch.current.y,
      })
    } else if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dist   = getTouchDist(e.touches[0], e.touches[1])
      const factor = dist / lastPinchDist.current
      lastPinchDist.current = dist
      const center = getTouchCenter(e.touches[0], e.touches[1])
      const rect   = containerRef.current.getBoundingClientRect()
      const mouseX = center.x - rect.left
      const mouseY = center.y - rect.top
      setZoom(z => {
        const newZoom = Math.min(Math.max(z * factor, 0.2), 10)
        setOffset(o => ({
          x: mouseX - (mouseX - o.x) * (newZoom / z),
          y: mouseY - (mouseY - o.y) * (newZoom / z),
        }))
        return newZoom
      })
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length === 0) {
      lastTouch.current     = null
      lastPinchDist.current = null
    } else if (e.touches.length === 1) {
      // quedó 1 dedo: reiniciar pan
      const t = e.touches[0]
      lastTouch.current     = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y }
      lastPinchDist.current = null
    }
  }

  // ── Zoom centrado en el cursor ────────────────────────────────
  function handleWheel(e) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.85 : 1.18
    const rect   = containerRef.current.getBoundingClientRect()
    // Posición del cursor relativa al contenedor
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    setZoom(z => {
      const newZoom  = Math.min(Math.max(z * factor, 0.2), 10)
      // Ajustar offset para que el punto bajo el cursor no se mueva
      setOffset(o => ({
        x: mouseX - (mouseX - o.x) * (newZoom / z),
        y: mouseY - (mouseY - o.y) * (newZoom / z),
      }))
      return newZoom
    })
  }

  function handleMouseDown(e) {
    if (modo === 'georef') return
    dragging.current  = true
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function handleMouseMove(e) {
    if (dragging.current) {
      setOffset({ x: dragStart.current.ox + e.clientX - dragStart.current.x, y: dragStart.current.oy + e.clientY - dragStart.current.y })
    }
    // Mostrar coordenadas bajo el cursor si hay transformación
    if (transform && containerRef.current && imgNatW > 0) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const cX = e.clientX - containerRect.left
      const cY = e.clientY - containerRect.top
      const dispX = (cX - offset.x) / zoom
      const dispY = (cY - offset.y) / zoom
      if (dispX >= 0 && dispY >= 0 && dispX <= imgDispW && dispY <= imgDispH) {
        const natX  = dispX * (imgNatW / (imgDispW || 1))
        const natY  = dispY * (imgNatH / (imgDispH || 1))
        const coord = pxToCoord(natX, natY, transform)
        if (coord) setMouseCoord({ este: coord.este.toFixed(0), norte: coord.norte.toFixed(0) })
        else setMouseCoord(null)
      } else {
        setMouseCoord(null)
      }
    }
  }
  function handleMouseUp()    { dragging.current = false }
  function handleMouseLeave() { dragging.current = false; setMouseCoord(null) }

  function toggleEstado(est) {
    setVisibles(v => ({ ...v, [est]: !v[est] }))
  }

  // ── Posición display de un sondaje ────────────────────────────
  function sondajePosDisplay(s) {
    if (!transform || !s.ESTE || !s.NORTE || !imgDispW || !imgNatW) return null
    const { px, py } = coordToPx(s.ESTE, s.NORTE, transform)
    return { x: px * (imgDispW / imgNatW), y: py * (imgDispH / imgNatH) }
  }

  // Posición display de un punto de control guardado
  function ptrlPosDisplay(p) {
    if (!imgDispW || !imgNatW) return null
    return { x: p.px * (imgDispW / imgNatW), y: p.py * (imgDispH / imgNatH) }
  }

  const tieneImagen = !!imgDataUrl
  const calibrado   = transform !== null

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, color:'var(--mut)' }}>Cargando...</div>
  )

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
            <label style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
              <input type="file" accept="image/png,image/jpeg" style={{ display:'none' }} onChange={handleFileChange} disabled={uploading} />
              <span className="btn btn-blu" style={{ opacity: uploading ? .6 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
                {uploading ? '⏳ Subiendo...' : '📤 ' + (tieneImagen ? 'Cambiar plano' : 'Subir plano')}
              </span>
            </label>
            {tieneImagen && <button className="btn btn-red" onClick={handleEliminar}>🗑 Eliminar</button>}
            {tieneImagen && (
              <button className={modo === 'georef' ? 'btn btn-acc' : 'btn btn-out'}
                onClick={() => { setModo(m => m === 'georef' ? 'ver' : 'georef'); setPendPx(null) }}>
                {modo === 'georef' ? '✅ Georeferenciando...' : '📍 Georeferenciar'}
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
          <div style={{ fontSize:13 }}>{isAdmin ? 'Usa "Subir plano" para comenzar' : 'El administrador debe cargar el plano'}</div>
        </div>
      )}

      {/* Panel georeferenciación */}
      {isAdmin && tieneImagen && modo === 'georef' && (
        <div className="ch-card" style={{ marginBottom:12, padding:'12px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13 }}>
              <strong>Georeferenciación</strong>
              <span style={{ color:'var(--mut)', marginLeft:8 }}>
                {calibrado
                  ? `✅ ${puntosCtrl.length} puntos — haz clic para agregar más`
                  : `Haz clic en el plano e ingresa la coordenada ESTE/NORTE (${puntosCtrl.length}/3 mínimo)`}
              </span>
            </div>
            {puntosCtrl.length > 0 && (
              <button className="btn btn-red btn-sm" onClick={() => { setPuntosCtrl([]); setTransform(null); api.put('/mapa/puntos', { puntos: [] }).then(() => show('Puntos eliminados', 'ok')) }}>
                🗑 Limpiar puntos
              </button>
            )}
          </div>
          {puntosCtrl.length > 0 && (
            <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:6 }}>
              {puntosCtrl.map((p, i) => (
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
              <input type="number" placeholder="ESTE"  value={formCoord.este}  onChange={e => setFormCoord(p => ({...p, este:  e.target.value}))}
                style={{ width:140, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }} />
              <input type="number" placeholder="NORTE" value={formCoord.norte} onChange={e => setFormCoord(p => ({...p, norte: e.target.value}))}
                style={{ width:140, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }} />
              <button className="btn btn-grn btn-sm" onClick={confirmPunto}>✓ Confirmar</button>
              <button className="btn btn-out btn-sm" onClick={() => setPendPx(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* Leyenda */}
      {tieneImagen && (
        <div style={{ display:'flex', gap:16, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
          {Object.entries(ESTADO_COLOR).map(([est, col]) => (
            <div key={est}
              onClick={() => toggleEstado(est)}
              style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer',
                background: visibles[est] ? 'var(--sur2)' : 'transparent',
                border: `1px solid ${visibles[est] ? col : 'var(--brd)'}`,
                borderRadius:20, padding:'3px 10px 3px 7px',
                opacity: visibles[est] ? 1 : 0.45,
                transition:'all .15s', userSelect:'none',
              }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background: visibles[est] ? col : 'var(--mut)', transition:'background .15s' }} />
              <span style={{ color: visibles[est] ? 'var(--txt)' : 'var(--mut)' }}>{est}</span>
            </div>
          ))}
          {calibrado
            ? <span style={{ fontSize:11, color:'var(--grn)' }}>✅ {sondajes.filter(s => s.ESTE && s.NORTE).length} sondajes con coordenadas</span>
            : isAdmin && <span style={{ fontSize:11, color:'var(--mut)', fontStyle:'italic' }}>⚠ Faltan {Math.max(0, 3-puntosCtrl.length)} puntos de georeferencia</span>
          }
          <span style={{ fontSize:11, color:'var(--mut)', marginLeft:'auto' }}>🖱 Scroll zoom · Arrastra para mover</span>
        </div>
      )}

      {/* Mapa */}
      {tieneImagen && (
        <div
          ref={containerRef}
          style={{ position:'relative', overflow:'hidden', background:'var(--sur2)', border:'1px solid var(--brd)', borderRadius:14, height:'calc(100dvh - 236px)', minHeight:'300px', cursor: modo === 'georef' ? 'crosshair' : (dragging.current ? 'grabbing' : 'grab'), userSelect:'none' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Capa transformada: imagen + puntos */}
          <div style={{ transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`, transformOrigin:'0 0', position:'relative', display:'inline-block' }}>

            <img
              ref={imgRef}
              src={imgDataUrl}
              alt="Plano"
              draggable={false}
              onClick={handleImgClick}
              onLoad={e => { setImgDispW(e.target.offsetWidth); setImgDispH(e.target.offsetHeight) }}
              style={{ display:'block', maxWidth:'100%', maxHeight:'calc(100dvh - 236px)' }}
            />

            {/* Punto pendiente de georeferenciación */}
            {pendPx && modo === 'georef' && imgDispW > 0 && (
              <div style={{
                position:'absolute',
                left: pendPx.px * (imgDispW/imgNatW) - 12/zoom,
                top:  pendPx.py * (imgDispH/imgNatH) - 12/zoom,
                width:24/zoom, height:24/zoom, borderRadius:'50%',
                background:'rgba(245,158,11,.95)', border:`${3/zoom}px solid #fff`,
                pointerEvents:'none', zIndex:10,
                boxShadow:`0 0 0 ${4/zoom}px rgba(245,158,11,.4)`,
              }} />
            )}

            {/* Puntos de control guardados — siempre visibles en modo georef */}
            {modo === 'georef' && imgDispW > 0 && puntosCtrl.map((p, i) => {
              const pos = ptrlPosDisplay(p)
              if (!pos) return null
              return (
                <div key={i} style={{
                  position:'absolute', left: pos.x - 10/zoom, top: pos.y - 10/zoom,
                  width:20/zoom, height:20/zoom, borderRadius:'50%',
                  background:'#3b82f6', border:`${2/zoom}px solid #fff`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:9/zoom, color:'#fff', fontWeight:700, pointerEvents:'none', zIndex:9,
                  boxShadow:`0 ${2/zoom}px ${6/zoom}px rgba(0,0,0,.4)`,
                }}>{i+1}</div>
              )
            })}

            {/* Sondajes */}
            {calibrado && imgDispW > 0 && sondajes.filter(s => visibles[s.ESTADO] !== false).map(s => {
              if (!s.ESTE || !s.NORTE) return null
              const pos = sondajePosDisplay(s)
              if (!pos) return null
              const color = ESTADO_COLOR[s.ESTADO] || ESTADO_COLOR['Pendiente']
              // Radio base en píxeles de pantalla, escalado inversamente al zoom
              const baseR  = s.ESTADO === 'En Proceso' ? 9 : 7
              const r      = baseR / zoom
              return (
                <div key={s.DDHID} style={{
                  position:'absolute', left:pos.x - r, top:pos.y - r,
                  width:r*2, height:r*2, borderRadius:'50%',
                  background:color, border:`${1.5/zoom}px solid rgba(255,255,255,.8)`,
                  cursor:'pointer', zIndex:5, transition:'transform .15s',
                  boxShadow: s.ESTADO === 'En Proceso' ? `0 0 ${8/zoom}px ${color}` : `0 1px ${3/zoom}px rgba(0,0,0,.3)`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform='scale(1.8)'; setTooltip({ s, x:pos.x, y:pos.y }) }}
                  onMouseLeave={e => { e.currentTarget.style.transform='scale(1)';   setTooltip(null) }}
                />
              )
            })}

            {/* Tooltip */}
            {tooltip && (() => {
              // Escalar tooltip inversamente al zoom, con mínimo legible
              const ts   = Math.max(0.7, Math.min(1, 1/zoom))
              const tOff = 14/zoom
              return (
                <div style={{
                  position:'absolute', left:tooltip.x + tOff, top:Math.max(0, tooltip.y - 10/zoom),
                  background:'var(--sur)', border:`${1/zoom}px solid var(--brd)`,
                  borderRadius:10/zoom, padding:`${10*ts}px ${14*ts}px`,
                  fontSize:12*ts, zIndex:20, pointerEvents:'none', minWidth:180*ts,
                  boxShadow:`0 ${4*ts}px ${20*ts}px rgba(0,0,0,.4)`,
                  transform:`scale(${ts})`, transformOrigin:'top left',
                }}>
                  <div style={{ fontWeight:700, fontSize:14*ts, marginBottom:6*ts }}>{tooltip.s.DDHID}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3*ts }}>
                    {tooltip.s.EQUIPO    && <span style={{ color:'var(--mut)' }}>🔧 {tooltip.s.EQUIPO}</span>}
                    {tooltip.s.PLATAFORMA && <span style={{ color:'var(--mut)' }}>📍 {tooltip.s.PLATAFORMA}</span>}
                    <span style={{ color: ESTADO_COLOR[tooltip.s.ESTADO], fontWeight:600 }}>● {tooltip.s.ESTADO}</span>
                    <div style={{ marginTop:4*ts }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3*ts }}>
                        <span style={{ color:'var(--mut)' }}>Prog: {tooltip.s.PROGRAMADO}m</span>
                        <span style={{ color:'var(--grn)', fontWeight:600 }}>{Math.min(tooltip.s.PCT??0,100)}%</span>
                      </div>
                      <div style={{ background:'var(--sur2)', borderRadius:99, height:5*ts, overflow:'hidden' }}>
                        <div style={{ width:`${Math.min(tooltip.s.PCT??0,100)}%`, height:'100%', background:ESTADO_COLOR[tooltip.s.ESTADO], borderRadius:99 }} />
                      </div>
                      <div style={{ marginTop:3*ts }}>Ejec: {tooltip.s.EJECUTADO}m</div>
                    </div>
                    {tooltip.s.FECHA_INICIO && tooltip.s.FECHA_INICIO !== '—' && (
                      <span style={{ color:'var(--mut)', fontSize:11*ts }}>📅 {tooltip.s.FECHA_INICIO} → {tooltip.s.FECHA_FIN}</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Controles zoom */}
          <div style={{ position:'absolute', bottom:50, right:14, display:'flex', flexDirection:'column', gap:4, zIndex:15 }}>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:18 }} onClick={() => {
              const rect = containerRef.current.getBoundingClientRect()
              const cx = rect.width/2, cy = rect.height/2
              const factor = 1.3
              setZoom(z => {
                const nz = Math.min(z*factor, 10)
                setOffset(o => ({ x: cx - (cx-o.x)*(nz/z), y: cy - (cy-o.y)*(nz/z) }))
                return nz
              })
            }}>+</button>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:18 }} onClick={() => {
              const rect = containerRef.current.getBoundingClientRect()
              const cx = rect.width/2, cy = rect.height/2
              const factor = 0.77
              setZoom(z => {
                const nz = Math.max(z*factor, 0.2)
                setOffset(o => ({ x: cx - (cx-o.x)*(nz/z), y: cy - (cy-o.y)*(nz/z) }))
                return nz
              })
            }}>−</button>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:13 }} title="Reset"
              onClick={() => { setZoom(1); setOffset({x:0,y:0}) }}>⌂</button>
          </div>

          {/* Indicador zoom */}
          <div style={{ position:'absolute', bottom:50, left:14, fontSize:11, color:'var(--mut)', background:'var(--sur)', border:'1px solid var(--brd)', borderRadius:6, padding:'2px 8px', zIndex:15 }}>
            {Math.round(zoom*100)}%
          </div>

          {/* Detector de coordenadas */}
          <div style={{
            position:'absolute', bottom:0, left:0, right:0,
            background:'var(--sur)', borderTop:'1px solid var(--brd)',
            padding:'6px 14px', display:'flex', alignItems:'center', gap:16,
            fontSize:12, zIndex:15, borderRadius:'0 0 14px 14px',
          }}>
            <span style={{ color:'var(--mut)' }}>📐 Coordenadas:</span>
            {mouseCoord
              ? <>
                  <span>E: <strong style={{ color:'var(--acc)' }}>{mouseCoord.este}</strong></span>
                  <span>N: <strong style={{ color:'var(--acc)' }}>{mouseCoord.norte}</strong></span>
                  <span style={{ color:'var(--mut)', fontSize:10 }}>(PSAD56 18S)</span>
                </>
              : <span style={{ color:'var(--mut)', fontStyle:'italic' }}>Mueve el cursor sobre el plano</span>
            }
          </div>
        </div>
      )}
    </div>
  )
}
