import React, { useEffect, useRef, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'

// ── Transformación afín: 3 puntos de control → matriz ────────────
function calcTransform(puntos) {
  if (puntos.length < 3) return null
  const [p0, p1, p2] = puntos
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

  // ── Estado ───────────────────────────────────────────────────
  const [imgDataUrl,  setImgDataUrl]  = useState(null)   // data:image/...;base64,...
  const [imgNatW,     setImgNatW]     = useState(0)
  const [imgNatH,     setImgNatH]     = useState(0)
  const [imgDispW,    setImgDispW]    = useState(0)
  const [imgDispH,    setImgDispH]    = useState(0)
  const [puntosCtrl,  setPuntosCtrl]  = useState([])
  const [transform,   setTransform]   = useState(null)
  const [sondajes,    setSondajes]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [modo,        setModo]        = useState('ver')   // 'ver' | 'calibrar'
  const [pendPx,      setPendPx]      = useState(null)
  const [formCoord,   setFormCoord]   = useState({ este: '', norte: '' })
  const [zoom,        setZoom]        = useState(1)
  const [offset,      setOffset]      = useState({ x: 0, y: 0 })
  const [tooltip,     setTooltip]     = useState(null)

  const imgRef    = useRef(null)
  const dragging  = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

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
    if (file.size > 15 * 1024 * 1024) { show('Máximo 15MB', 'err'); return }
    setUploading(true)
    try {
      // Leer como base64
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload  = ev => res(ev.target.result)
        r.onerror = ()  => rej(new Error('Error leyendo archivo'))
        r.readAsDataURL(file)
      })
      // Obtener dimensiones
      const { w, h } = await new Promise((res, rej) => {
        const img = new Image()
        img.onload  = () => res({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = ()  => rej(new Error('Imagen inválida'))
        img.src = dataUrl
      })
      // Enviar al backend
      const base64 = dataUrl.split(',')[1]
      await api.post('/mapa/upload', { base64, mimeType: file.type, width: w, height: h })
      // Actualizar estado local
      setImgDataUrl(dataUrl)
      setImgNatW(w)
      setImgNatH(h)
      setImgDispW(0)
      setImgDispH(0)
      setPuntosCtrl([])
      setTransform(null)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      show('Plano subido ✓', 'ok')
    } catch (err) {
      show('Error: ' + (err.response?.data?.error || err.message), 'err')
    } finally {
      setUploading(false)
    }
  }

  // ── Eliminar plano ────────────────────────────────────────────
  function handleEliminar() {
    if (!window.confirm('¿Eliminar el plano? Se perderán los puntos de calibración.')) return
    api.delete('/mapa/imagen').then(() => {
      setImgDataUrl(null)
      setImgNatW(0); setImgNatH(0)
      setPuntosCtrl([])
      setTransform(null)
      setModo('ver')
      show('Plano eliminado', 'ok')
    }).catch(() => show('Error al eliminar', 'err'))
  }

  // ── Calibración ───────────────────────────────────────────────
  function handleImgClick(e) {
    if (modo !== 'calibrar' || !imgRef.current) return
    const rect  = imgRef.current.getBoundingClientRect()
    const dispX = e.clientX - rect.left
    const dispY = e.clientY - rect.top
    const natX  = Math.round(dispX * (imgNatW / (imgDispW || 1)))
    const natY  = Math.round(dispY * (imgNatH / (imgDispH || 1)))
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

  function limpiarPuntos() {
    setPuntosCtrl([])
    setTransform(null)
    api.put('/mapa/puntos', { puntos: [] }).then(() => show('Puntos eliminados', 'ok'))
  }

  // ── Zoom y pan ────────────────────────────────────────────────
  function handleWheel(e) {
    e.preventDefault()
    setZoom(z => Math.min(Math.max(z * (e.deltaY > 0 ? 0.85 : 1.18), 0.2), 10))
  }
  function handleMouseDown(e) {
    if (modo === 'calibrar') return
    dragging.current  = true
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function handleMouseMove(e) {
    if (!dragging.current) return
    setOffset({ x: dragStart.current.ox + e.clientX - dragStart.current.x, y: dragStart.current.oy + e.clientY - dragStart.current.y })
  }
  function handleMouseUp() { dragging.current = false }

  // ── Posición de sondaje en display ────────────────────────────
  function sondajePosDisplay(s) {
    if (!transform || !s.ESTE || !s.NORTE || !imgDispW || !imgNatW) return null
    const { px, py } = coordToPx(parseFloat(s.ESTE), parseFloat(s.NORTE), transform)
    return { x: px * (imgDispW / imgNatW), y: py * (imgDispH / imgNatH) }
  }

  // ── Render ────────────────────────────────────────────────────
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
              <button className={modo === 'calibrar' ? 'btn btn-acc' : 'btn btn-out'}
                onClick={() => { setModo(m => m === 'calibrar' ? 'ver' : 'calibrar'); setPendPx(null) }}>
                {modo === 'calibrar' ? '✅ Calibrando...' : '📍 Calibrar'}
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

      {/* Panel calibración */}
      {isAdmin && tieneImagen && modo === 'calibrar' && (
        <div className="ch-card" style={{ marginBottom:12, padding:'12px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13 }}>
              <strong>Modo calibración</strong>
              <span style={{ color:'var(--mut)', marginLeft:8 }}>
                {calibrado ? `✅ ${puntosCtrl.length} puntos — haz clic para agregar más` : `Haz clic en el plano e ingresa la coordenada (${puntosCtrl.length}/3 mínimo)`}
              </span>
            </div>
            {puntosCtrl.length > 0 && <button className="btn btn-red btn-sm" onClick={limpiarPuntos}>🗑 Limpiar</button>}
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
                style={{ width:130, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }} />
              <input type="number" placeholder="NORTE" value={formCoord.norte} onChange={e => setFormCoord(p => ({...p, norte: e.target.value}))}
                style={{ width:130, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }} />
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
            <div key={est} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
              <div style={{ width:12, height:12, borderRadius:'50%', background:col }} />
              <span style={{ color:'var(--mut)' }}>{est}</span>
            </div>
          ))}
          {calibrado
            ? <span style={{ fontSize:11, color:'var(--grn)' }}>✅ {sondajes.filter(s => s.ESTE && s.NORTE).length} sondajes con coordenadas</span>
            : isAdmin && <span style={{ fontSize:11, color:'var(--mut)', fontStyle:'italic' }}>⚠ Faltan {Math.max(0, 3-puntosCtrl.length)} puntos de control</span>
          }
          <span style={{ fontSize:11, color:'var(--mut)', marginLeft:'auto' }}>🖱 Scroll zoom · Arrastra para mover</span>
        </div>
      )}

      {/* Mapa */}
      {tieneImagen && (
        <div style={{ position:'relative', overflow:'hidden', background:'var(--sur2)', border:'1px solid var(--brd)', borderRadius:14, height:'calc(100vh - 280px)', minHeight:400, cursor: modo === 'calibrar' ? 'crosshair' : 'grab', userSelect:'none' }}
          onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

          <div style={{ transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`, transformOrigin:'0 0', position:'relative', display:'inline-block' }}>

            {/* Imagen del plano */}
            <img ref={imgRef} src={imgDataUrl} alt="Plano" draggable={false}
              onClick={handleImgClick}
              onLoad={e => { setImgDispW(e.target.offsetWidth); setImgDispH(e.target.offsetHeight) }}
              style={{ display:'block', maxWidth:'100%', maxHeight:'calc(100vh - 280px)' }}
            />

            {/* Punto pendiente de calibración */}
            {pendPx && modo === 'calibrar' && imgDispW > 0 && (
              <div style={{
                position:'absolute',
                left: pendPx.px * (imgDispW/imgNatW) - 10,
                top:  pendPx.py * (imgDispH/imgNatH) - 10,
                width:20, height:20, borderRadius:'50%',
                background:'rgba(245,158,11,.9)', border:'3px solid #fff',
                pointerEvents:'none', zIndex:10,
                boxShadow:'0 0 0 4px rgba(245,158,11,.3)',
              }} />
            )}

            {/* Puntos de control guardados */}
            {modo === 'calibrar' && imgDispW > 0 && puntosCtrl.map((p, i) => (
              <div key={i} style={{
                position:'absolute',
                left: p.px * (imgDispW/imgNatW) - 8,
                top:  p.py * (imgDispH/imgNatH) - 8,
                width:16, height:16, borderRadius:'50%',
                background:'#3b82f6', border:'2px solid #fff',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:8, color:'#fff', fontWeight:700, pointerEvents:'none', zIndex:9,
              }}>{i+1}</div>
            ))}

            {/* Sondajes */}
            {calibrado && imgDispW > 0 && sondajes.map(s => {
              if (!s.ESTE || !s.NORTE) return null
              const pos = sondajePosDisplay(s)
              if (!pos) return null
              const color = ESTADO_COLOR[s.ESTADO] || ESTADO_COLOR['Pendiente']
              const r = s.ESTADO === 'En Proceso' ? 9 : 7
              return (
                <div key={s.DDHID} style={{
                  position:'absolute', left:pos.x-r, top:pos.y-r,
                  width:r*2, height:r*2, borderRadius:'50%',
                  background:color, border:'2px solid rgba(255,255,255,.7)',
                  cursor:'pointer', zIndex:5, transition:'transform .15s',
                  boxShadow: s.ESTADO === 'En Proceso' ? `0 0 8px ${color}` : 'none',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform='scale(1.7)'; setTooltip({ s, x:pos.x, y:pos.y }) }}
                  onMouseLeave={e => { e.currentTarget.style.transform='scale(1)';   setTooltip(null) }}
                />
              )
            })}

            {/* Tooltip */}
            {tooltip && (
              <div style={{
                position:'absolute', left:tooltip.x+14, top:tooltip.y-10,
                background:'var(--sur)', border:'1px solid var(--brd)',
                borderRadius:10, padding:'10px 14px', fontSize:12,
                zIndex:20, pointerEvents:'none', minWidth:190,
                boxShadow:'0 4px 20px rgba(0,0,0,.4)',
              }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>{tooltip.s.DDHID}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {tooltip.s.EQUIPO    && <span style={{ color:'var(--mut)' }}>🔧 {tooltip.s.EQUIPO}</span>}
                  {tooltip.s.PLATAFORMA && <span style={{ color:'var(--mut)' }}>📍 {tooltip.s.PLATAFORMA}</span>}
                  <span style={{ color: ESTADO_COLOR[tooltip.s.ESTADO], fontWeight:600 }}>● {tooltip.s.ESTADO}</span>
                  <div style={{ marginTop:4 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ color:'var(--mut)' }}>Prog: {tooltip.s.PROGRAMADO}m</span>
                      <span style={{ color:'var(--grn)', fontWeight:600 }}>{Math.min(tooltip.s.PCT??0,100)}%</span>
                    </div>
                    <div style={{ background:'var(--sur2)', borderRadius:99, height:5, overflow:'hidden' }}>
                      <div style={{ width:`${Math.min(tooltip.s.PCT??0,100)}%`, height:'100%', background:ESTADO_COLOR[tooltip.s.ESTADO], borderRadius:99 }} />
                    </div>
                    <div style={{ marginTop:3 }}>Ejec: {tooltip.s.EJECUTADO}m</div>
                  </div>
                  {tooltip.s.FECHA_INICIO && tooltip.s.FECHA_INICIO !== '—' && (
                    <span style={{ color:'var(--mut)', fontSize:11 }}>📅 {tooltip.s.FECHA_INICIO} → {tooltip.s.FECHA_FIN}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Controles zoom */}
          <div style={{ position:'absolute', bottom:14, right:14, display:'flex', flexDirection:'column', gap:4, zIndex:15 }}>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:18 }} onClick={() => setZoom(z => Math.min(z*1.3,10))}>+</button>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:18 }} onClick={() => setZoom(z => Math.max(z*0.77,0.2))}>−</button>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:13 }} onClick={() => { setZoom(1); setOffset({x:0,y:0}) }}>⌂</button>
          </div>
          <div style={{ position:'absolute', bottom:14, left:14, fontSize:11, color:'var(--mut)', background:'var(--sur)', border:'1px solid var(--brd)', borderRadius:6, padding:'2px 8px', zIndex:15 }}>
            {Math.round(zoom*100)}%
          </div>
        </div>
      )}
    </div>
  )
}
