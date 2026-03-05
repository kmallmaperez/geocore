import React, { useEffect, useRef, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'

// ── Transformación afín: píxeles ↔ coordenadas ───────────────────
// Con 3+ puntos de control resuelve Ax=b por mínimos cuadrados
function calcTransform(puntos) {
  if (puntos.length < 3) return null
  // Resolver sistema: [px, py] = A * [este, norte, 1]
  // Usamos los 3 primeros puntos para la transformación afín exacta
  const pts = puntos.slice(0, Math.min(puntos.length, 6))
  // Método: least squares con todos los puntos disponibles
  // M * [a,b,c,d,e,f]^T = [px1,py1,px2,py2,...]
  const n = pts.length
  // Construir matrices para regresión
  let sumE=0,sumN=0,sumPx=0,sumPy=0
  let sumE2=0,sumN2=0,sumEN=0
  let sumEPx=0,sumNPx=0,sumEPy=0,sumNPy=0

  pts.forEach(p => {
    sumE  += p.este;   sumN  += p.norte
    sumPx += p.px;     sumPy += p.py
    sumE2 += p.este*p.este; sumN2 += p.norte*p.norte
    sumEN += p.este*p.norte
    sumEPx += p.este*p.px; sumNPx += p.norte*p.px
    sumEPy += p.este*p.py; sumNPy += p.norte*p.py
  })

  // Transformación afín: px = a*E + b*N + c, py = d*E + e*N + f
  // Usando 3 primeros puntos exactos si hay exactamente 3
  if (n === 3) {
    const [p0,p1,p2] = pts
    const det = (p0.este*(p1.norte-p2.norte) + p1.este*(p2.norte-p0.norte) + p2.este*(p0.norte-p1.norte))
    if (Math.abs(det) < 1e-10) return null
    const a = ((p0.px*(p1.norte-p2.norte) + p1.px*(p2.norte-p0.norte) + p2.px*(p0.norte-p1.norte)) / det)
    const b = ((p0.este*(p1.px-p2.px)     + p1.este*(p2.px-p0.px)     + p2.este*(p0.px-p1.px))     / det)
    const c = p0.px - a*p0.este - b*p0.norte
    const d = ((p0.py*(p1.norte-p2.norte) + p1.py*(p2.norte-p0.norte) + p2.py*(p0.norte-p1.norte)) / det)
    const e = ((p0.este*(p1.py-p2.py)     + p1.este*(p2.py-p0.py)     + p2.este*(p0.py-p1.py))     / det)
    const f = p0.py - d*p0.este - e*p0.norte
    return { a,b,c,d,e,f }
  }

  // Con más puntos: mínimos cuadrados simplificado (promedio de escalas)
  const scaleX = (sumEPx - sumE*sumPx/n) / (sumE2 - sumE*sumE/n || 1)
  const scaleY = (sumNPy - sumN*sumPy/n) / (sumN2 - sumN*sumN/n || 1)
  const offX   = (sumPx - scaleX*sumE) / n
  const offY   = (sumPy - scaleY*sumN) / n
  return { a:scaleX, b:0, c:offX, d:0, e:scaleY, f:offY }
}

function coordToPx(este, norte, T) {
  if (!T) return null
  return {
    px: T.a * este + T.b * norte + T.c,
    py: T.d * este + T.e * norte + T.f,
  }
}

// Colores por estado
const ESTADO_COLOR = {
  'Completado': '#10b981',
  'En Proceso': '#f59e0b',
  'Pendiente':  '#64748b',
}

export default function MapaPage() {
  const { user }         = useAuth()
  const { toast, show }  = useToast()
  const isAdmin          = user?.role === 'ADMIN'

  const [config,   setConfig]   = useState(null)   // { imagen_url, imagen_w, imagen_h, puntos_ctrl }
  const [sondajes, setSondajes] = useState([])
  const [transform,setTransform]= useState(null)
  const [loading,  setLoading]  = useState(true)
  const [uploading,setUploading]= useState(false)

  // Calibración
  const [modo,     setModo]     = useState('ver')   // 'ver' | 'calibrar'
  const [pendPx,   setPendPx]   = useState(null)    // click pendiente {px,py}
  const [puntosCtrl,setPuntosCtrl] = useState([])
  const [formCoord,setFormCoord]= useState({ este:'', norte:'' })

  // Imagen renderizada
  const [imgSize,  setImgSize]  = useState({ w:0, h:0 })  // tamaño display
  const [imgNat,   setImgNat]   = useState({ w:0, h:0 })  // tamaño natural
  const containerRef = useRef(null)
  const imgRef       = useRef(null)

  // Zoom y pan
  const [zoom,   setZoom]   = useState(1)
  const [offset, setOffset] = useState({ x:0, y:0 })
  const dragging = useRef(false)
  const dragStart= useRef({ x:0, y:0, ox:0, oy:0 })

  // Tooltip
  const [tooltip, setTooltip] = useState(null)

  // ── Cargar datos ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/mapa/config'),
      api.get('/tables/resumen/general'),
    ]).then(([cfgRes, sRes]) => {
      const cfg = cfgRes.data
      setConfig(cfg)
      setPuntosCtrl(cfg.puntos_ctrl || [])
      setSondajes(sRes.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Recalcular transformación cuando cambian puntos
  useEffect(() => {
    if (puntosCtrl.length >= 3) {
      setTransform(calcTransform(puntosCtrl))
    } else {
      setTransform(null)
    }
  }, [puntosCtrl])

  // ── Subir imagen ──────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 40 * 1024 * 1024) { show('Imagen demasiado grande (máx 40MB)', 'err'); return }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        const base64 = ev.result.split(',')[1]
        api.post('/mapa/upload', {
          base64, filename: file.name, mimeType: file.type,
          width: img.naturalWidth, height: img.naturalHeight
        }).then(r => {
          setConfig(prev => ({ ...prev, imagen_url: r.data.url, imagen_w: img.naturalWidth, imagen_h: img.naturalHeight, puntos_ctrl: [] }))
          setPuntosCtrl([])
          setTransform(null)
          show('Plano subido correctamente ✓', 'ok')
        }).catch(err => show('Error: ' + err.message, 'err'))
        .finally(() => setUploading(false))
      }
      img.src = ev.result
    }
    reader.readAsDataURL(file)
  }

  // ── Eliminar plano ───────────────────────────────────────────
  function handleEliminar() {
    if (!window.confirm('¿Eliminar el plano actual? Se perderán los puntos de calibración.')) return
    api.delete('/mapa/imagen').then(() => {
      setConfig(prev => ({ ...prev, imagen_url: null, imagen_w: null, imagen_h: null, puntos_ctrl: [] }))
      setPuntosCtrl([])
      setTransform(null)
      setModo('ver')
      show('Plano eliminado', 'ok')
    }).catch(() => show('Error al eliminar', 'err'))
  }

  // ── Click sobre imagen para calibrar ─────────────────────────
  function handleImgClick(e) {
    if (modo !== 'calibrar') return
    const rect = imgRef.current.getBoundingClientRect()
    // Coordenadas relativas a la imagen display, luego escalar a natural
    const dispX = (e.clientX - rect.left)
    const dispY = (e.clientY - rect.top)
    const natX  = Math.round(dispX * (imgNat.w / imgSize.w))
    const natY  = Math.round(dispY * (imgNat.h / imgSize.h))
    setPendPx({ px: natX, py: natY, dispX, dispY })
    setFormCoord({ este:'', norte:'' })
  }

  function confirmPunto() {
    const este  = parseFloat(formCoord.este)
    const norte = parseFloat(formCoord.norte)
    if (isNaN(este) || isNaN(norte)) { show('Ingresa coordenadas válidas', 'err'); return }
    const nuevo = [...puntosCtrl, { px: pendPx.px, py: pendPx.py, este, norte }]
    setPuntosCtrl(nuevo)
    setPendPx(null)
    // Guardar en backend
    api.put('/mapa/puntos', { puntos: nuevo })
      .then(() => show(`Punto de control ${nuevo.length} guardado ✓`, 'ok'))
      .catch(() => show('Error al guardar punto', 'err'))
  }

  function eliminarPunto(i) {
    const nuevo = puntosCtrl.filter((_,j) => j !== i)
    setPuntosCtrl(nuevo)
    api.put('/mapa/puntos', { puntos: nuevo })
      .then(() => show('Punto eliminado', 'ok'))
  }

  // ── Zoom y pan ────────────────────────────────────────────────
  function handleWheel(e) {
    e.preventDefault()
    const delta  = e.deltaY > 0 ? 0.85 : 1.18
    setZoom(z => Math.min(Math.max(z * delta, 0.3), 8))
  }

  function handleMouseDown(e) {
    if (modo === 'calibrar') return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function handleMouseMove(e) {
    if (!dragging.current) return
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    })
  }
  function handleMouseUp() { dragging.current = false }

  // ── Posición de sondajes en display ──────────────────────────
  function sondajePx(s) {
    if (!transform || !s.ESTE || !s.NORTE) return null
    const { px, py } = coordToPx(parseFloat(s.ESTE), parseFloat(s.NORTE), transform)
    // Escalar de píxel natural a display
    const dispX = px * (imgSize.w / (imgNat.w || 1))
    const dispY = py * (imgSize.h / (imgNat.h || 1))
    return { x: dispX, y: dispY }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, color:'var(--mut)' }}>
      Cargando...
    </div>
  )

  const tieneImagen = !!config?.imagen_url
  const calibrado   = puntosCtrl.length >= 3

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <div>
          <div className="page-title">🗺 Mapa de Sondajes</div>
          <div className="page-desc">Ubicación de sondajes sobre el plano del proyecto</div>
        </div>

        {isAdmin && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {/* Subir plano */}
            <label style={{ cursor:'pointer' }}>
              <input type="file" accept="image/png,image/jpeg" style={{ display:'none' }} onChange={handleFileChange} />
              <span className="btn btn-blu" style={{ pointerEvents: uploading ? 'none' : 'auto', opacity: uploading ? .6 : 1 }}>
                {uploading ? '⏳ Subiendo...' : '📤 ' + (tieneImagen ? 'Cambiar plano' : 'Subir plano')}
              </span>
            </label>

            {/* Eliminar plano */}
            {tieneImagen && (
              <button className="btn btn-red" onClick={handleEliminar}>
                🗑 Eliminar plano
              </button>
            )}

            {/* Modo calibrar */}
            {tieneImagen && (
              <button
                className={modo === 'calibrar' ? 'btn btn-acc' : 'btn btn-out'}
                onClick={() => { setModo(m => m === 'calibrar' ? 'ver' : 'calibrar'); setPendPx(null) }}>
                {modo === 'calibrar' ? '✅ Calibrando...' : '📍 Calibrar'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sin imagen ── */}
      {!tieneImagen && (
        <div className="ch-card" style={{ textAlign:'center', padding:60, color:'var(--mut)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🗺</div>
          <div style={{ fontSize:15, marginBottom:6 }}>No hay plano cargado</div>
          {isAdmin
            ? <div style={{ fontSize:13 }}>Usa el botón "Subir plano" para comenzar</div>
            : <div style={{ fontSize:13 }}>El administrador debe cargar el plano</div>}
        </div>
      )}

      {/* ── Panel calibración (ADMIN) ── */}
      {isAdmin && tieneImagen && modo === 'calibrar' && (
        <div className="ch-card" style={{ marginBottom:12, padding:'12px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13, color:'var(--txt)' }}>
              <strong>Modo calibración</strong>
              <span style={{ color:'var(--mut)', marginLeft:8 }}>
                {puntosCtrl.length < 3
                  ? `Haz clic en el plano y escribe la coordenada ESTE/NORTE de ese punto (${puntosCtrl.length}/3 mínimo)`
                  : `✅ Calibrado con ${puntosCtrl.length} puntos — puedes agregar más para mayor precisión`}
              </span>
            </div>
            {puntosCtrl.length > 0 && (
              <button className="btn btn-red btn-sm" onClick={() => {
                setPuntosCtrl([])
                api.put('/mapa/puntos', { puntos: [] })
                show('Puntos de control eliminados', 'ok')
              }}>🗑 Limpiar puntos</button>
            )}
          </div>

          {/* Lista de puntos */}
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

          {/* Form coordenada pendiente */}
          {pendPx && (
            <div style={{ marginTop:10, background:'var(--sur2)', border:'1px solid var(--acc)', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, color:'var(--acc)', fontWeight:600 }}>📍 Pixel ({pendPx.px}, {pendPx.py}) — ¿Qué coordenada tiene este punto?</span>
              <input
                type="number" placeholder="ESTE"
                value={formCoord.este}
                onChange={e => setFormCoord(p => ({ ...p, este: e.target.value }))}
                style={{ width:130, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }}
              />
              <input
                type="number" placeholder="NORTE"
                value={formCoord.norte}
                onChange={e => setFormCoord(p => ({ ...p, norte: e.target.value }))}
                style={{ width:130, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }}
              />
              <button className="btn btn-grn btn-sm" onClick={confirmPunto}>✓ Confirmar</button>
              <button className="btn btn-out btn-sm" onClick={() => setPendPx(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* ── Leyenda ── */}
      {tieneImagen && (
        <div style={{ display:'flex', gap:16, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
          {Object.entries(ESTADO_COLOR).map(([est, col]) => (
            <div key={est} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
              <div style={{ width:14, height:14, borderRadius:'50%', background:col, border:'2px solid rgba(255,255,255,.3)' }} />
              <span style={{ color:'var(--mut)' }}>{est}</span>
            </div>
          ))}
          {!calibrado && puntosCtrl.length < 3 && (
            <span style={{ fontSize:11, color:'var(--mut)', fontStyle:'italic' }}>
              {isAdmin ? `⚠ Faltan ${3 - puntosCtrl.length} puntos de control para mostrar sondajes` : '⚠ Mapa en calibración'}
            </span>
          )}
          {calibrado && (
            <span style={{ fontSize:11, color:'var(--grn)' }}>
              ✅ {sondajes.filter(s => s.ESTE && s.NORTE).length} sondajes con coordenadas
            </span>
          )}
          <span style={{ fontSize:11, color:'var(--mut)', marginLeft:'auto' }}>
            🖱 Scroll para zoom · Arrastra para mover
          </span>
        </div>
      )}

      {/* ── Mapa principal ── */}
      {tieneImagen && (
        <div
          ref={containerRef}
          style={{
            position:'relative', overflow:'hidden',
            background:'var(--sur2)', border:'1px solid var(--brd)', borderRadius:14,
            height: 'calc(100vh - 280px)', minHeight:400,
            cursor: modo === 'calibrar' ? 'crosshair' : (dragging.current ? 'grabbing' : 'grab'),
            userSelect:'none',
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position:'relative', display:'inline-block',
          }}>
            {/* Imagen del plano */}
            <img
              ref={imgRef}
              src={config.imagen_url}
              alt="Plano"
              draggable={false}
              onLoad={e => {
                setImgNat({ w: e.target.naturalWidth,  h: e.target.naturalHeight })
                setImgSize({ w: e.target.offsetWidth,  h: e.target.offsetHeight })
              }}
              onClick={handleImgClick}
              style={{ display:'block', maxWidth:'100%', maxHeight:'calc(100vh - 280px)', userSelect:'none' }}
            />

            {/* Punto pendiente de calibración */}
            {pendPx && modo === 'calibrar' && imgSize.w > 0 && (
              <div style={{
                position:'absolute',
                left: pendPx.px * (imgSize.w / (imgNat.w || 1)) - 10,
                top:  pendPx.py * (imgSize.h / (imgNat.h || 1)) - 10,
                width:20, height:20, borderRadius:'50%',
                background:'rgba(245,158,11,.8)', border:'3px solid #fff',
                pointerEvents:'none', zIndex:10,
                boxShadow:'0 0 0 3px rgba(245,158,11,.4)',
              }} />
            )}

            {/* Puntos de control guardados */}
            {modo === 'calibrar' && puntosCtrl.map((p, i) => {
              const dispX = p.px * (imgSize.w / (imgNat.w || 1))
              const dispY = p.py * (imgSize.h / (imgNat.h || 1))
              return (
                <div key={i} style={{
                  position:'absolute', left: dispX-8, top: dispY-8,
                  width:16, height:16, borderRadius:'50%',
                  background:'#3b82f6', border:'2px solid #fff',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:8, color:'#fff', fontWeight:700, zIndex:9,
                  pointerEvents:'none',
                }}>{i+1}</div>
              )
            })}

            {/* Sondajes */}
            {calibrado && sondajes.map(s => {
              if (!s.ESTE || !s.NORTE) return null
              const pos = sondajePx(s)
              if (!pos) return null
              const color = ESTADO_COLOR[s.ESTADO] || ESTADO_COLOR['Pendiente']
              const r = s.ESTADO === 'En Proceso' ? 9 : 7
              return (
                <div
                  key={s.DDHID}
                  style={{
                    position:'absolute',
                    left: pos.x - r, top: pos.y - r,
                    width: r*2, height: r*2, borderRadius:'50%',
                    background: color,
                    border: s.ESTADO === 'En Proceso' ? '2px solid #fff' : '1.5px solid rgba(255,255,255,.5)',
                    cursor:'pointer', zIndex:5,
                    boxShadow: s.ESTADO === 'En Proceso' ? `0 0 8px ${color}` : 'none',
                    transition:'transform .15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.6)'
                    setTooltip({ s, x: pos.x, y: pos.y })
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)'
                    setTooltip(null)
                  }}
                />
              )
            })}

            {/* Tooltip */}
            {tooltip && (() => {
              const s   = tooltip.s
              const pct = s.PCT ?? 0
              return (
                <div style={{
                  position:'absolute',
                  left: tooltip.x + 14, top: tooltip.y - 10,
                  background:'var(--sur)', border:'1px solid var(--brd)',
                  borderRadius:10, padding:'10px 14px',
                  fontSize:12, zIndex:20, pointerEvents:'none',
                  boxShadow:'0 4px 20px rgba(0,0,0,.4)',
                  minWidth:180, maxWidth:240,
                }}>
                  <div style={{ fontWeight:700, fontSize:14, color:'var(--txt)', marginBottom:6 }}>{s.DDHID}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {s.EQUIPO    && <span style={{ color:'var(--mut)' }}>🔧 {s.EQUIPO}</span>}
                    {s.PLATAFORMA && <span style={{ color:'var(--mut)' }}>📍 {s.PLATAFORMA}</span>}
                    <span style={{ color: ESTADO_COLOR[s.ESTADO] || 'var(--mut)', fontWeight:600 }}>● {s.ESTADO}</span>
                    <div style={{ marginTop:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ color:'var(--mut)' }}>Prog: {s.PROGRAMADO}m</span>
                        <span style={{ color:'var(--grn)', fontWeight:600 }}>{pct}%</span>
                      </div>
                      <div style={{ background:'var(--sur2)', borderRadius:99, height:5, overflow:'hidden' }}>
                        <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background: ESTADO_COLOR[s.ESTADO] || 'var(--mut)', borderRadius:99 }} />
                      </div>
                      <div style={{ color:'var(--txt)', marginTop:3 }}>Ejec: {s.EJECUTADO}m</div>
                    </div>
                    {s.FECHA_INICIO && s.FECHA_INICIO !== '—' && (
                      <span style={{ color:'var(--mut)', fontSize:11 }}>📅 {s.FECHA_INICIO} → {s.FECHA_FIN}</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Controles de zoom */}
          <div style={{ position:'absolute', bottom:14, right:14, display:'flex', flexDirection:'column', gap:4, zIndex:15 }}>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:16 }}
              onClick={() => setZoom(z => Math.min(z * 1.3, 8))}>+</button>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:16 }}
              onClick={() => setZoom(z => Math.max(z * 0.77, 0.3))}>−</button>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:13 }}
              onClick={() => { setZoom(1); setOffset({ x:0, y:0 }) }} title="Reset">⌂</button>
          </div>

          {/* Indicador de zoom */}
          <div style={{ position:'absolute', bottom:14, left:14, fontSize:11, color:'var(--mut)', background:'var(--sur)', border:'1px solid var(--brd)', borderRadius:6, padding:'2px 8px', zIndex:15 }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>
      )}
    </div>
  )
}
