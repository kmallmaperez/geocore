import React, { useEffect, useRef, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'

// ── Transformación afín ───────────────────────────────────────────
function calcTransform(puntos) {
  if (puntos.length < 3) return null
  const pts = puntos.slice(0, 3)
  const [p0, p1, p2] = pts
  const det = (p0.este*(p1.norte-p2.norte) + p1.este*(p2.norte-p0.norte) + p2.este*(p0.norte-p1.norte))
  if (Math.abs(det) < 1e-10) return null
  const a = ((p0.px*(p1.norte-p2.norte) + p1.px*(p2.norte-p0.norte) + p2.px*(p0.norte-p1.norte)) / det)
  const b = ((p0.este*(p1.px-p2.px)     + p1.este*(p2.px-p0.px)     + p2.este*(p0.px-p1.px))     / det)
  const c = p0.px - a*p0.este - b*p0.norte
  const d = ((p0.py*(p1.norte-p2.norte) + p1.py*(p2.norte-p0.norte) + p2.py*(p0.norte-p1.norte)) / det)
  const e = ((p0.este*(p1.py-p2.py)     + p1.este*(p2.py-p0.py)     + p2.este*(p0.py-p1.py))     / det)
  const f = p0.py - d*p0.este - e*p0.norte
  return { a, b, c, d, e, f }
}

function coordToPx(este, norte, T) {
  if (!T) return null
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

  const [config,      setConfig]      = useState(null)
  const [sondajes,    setSondajes]    = useState([])
  const [transform,   setTransform]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)

  const [modo,        setModo]        = useState('ver')
  const [pendPx,      setPendPx]      = useState(null)
  const [puntosCtrl,  setPuntosCtrl]  = useState([])
  const [formCoord,   setFormCoord]   = useState({ este:'', norte:'' })
  const [imgSize,     setImgSize]     = useState({ w:0, h:0 })
  const [imgNat,      setImgNat]      = useState({ w:0, h:0 })

  const [zoom,   setZoom]   = useState(1)
  const [offset, setOffset] = useState({ x:0, y:0 })
  const [tooltip, setTooltip] = useState(null)

  const imgRef    = useRef(null)
  const dragging  = useRef(false)
  const dragStart = useRef({ x:0, y:0, ox:0, oy:0 })

  // ── Cargar datos ─────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/mapa/config'),
      api.get('/tables/resumen/general'),
    ]).then(([cfgRes, sRes]) => {
      setConfig(cfgRes.data)
      setPuntosCtrl(cfgRes.data.puntos_ctrl || [])
      setSondajes(sRes.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    setTransform(puntosCtrl.length >= 3 ? calcTransform(puntosCtrl) : null)
  }, [puntosCtrl])

  // ── Subir imagen ──────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { show('Imagen demasiado grande (máx 15MB)', 'err'); return }
    setUploading(true)
    try {
      // 1. Leer como base64
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = e => resolve(e.target.result)
        reader.onerror = () => reject(new Error('Error leyendo archivo'))
        reader.readAsDataURL(file)
      })

      // 2. Obtener dimensiones
      const { w, h } = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => reject(new Error('Error cargando imagen'))
        img.src = dataUrl
      })

      // 3. Enviar al backend
      const base64 = dataUrl.split(',')[1]
      await api.post('/mapa/upload', { base64, mimeType: file.type, width: w, height: h })

      // 4. Actualizar estado
      setImgSrc(dataUrl)
      setPuntosCtrl([])
      setTransform(null)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      show('Plano subido correctamente ✓', 'ok')
    } catch (err) {
      show('Error: ' + (err.response?.data?.error || err.message || 'Error desconocido'), 'err')
    } finally {
      setUploading(false)
    }
  }

  // ── Eliminar plano ────────────────────────────────────────────
  function handleEliminar() {
    if (!window.confirm('¿Eliminar el plano? Se perderán los puntos de calibración.')) return
    api.delete('/mapa/imagen').then(() => {
      setConfig(prev => ({ ...prev, imagen_b64: null, imagen_tipo: null, puntos_ctrl: [] }))
      setPuntosCtrl([])
      setTransform(null)
      setModo('ver')
      show('Plano eliminado', 'ok')
    }).catch(() => show('Error al eliminar', 'err'))
  }

  // ── Calibración ───────────────────────────────────────────────
  function handleImgClick(e) {
    if (modo !== 'calibrar') return
    const rect = imgRef.current.getBoundingClientRect()
    const dispX = e.clientX - rect.left
    const dispY = e.clientY - rect.top
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
    api.put('/mapa/puntos', { puntos: nuevo })
      .then(() => show(`Punto ${nuevo.length} guardado ✓`, 'ok'))
      .catch(() => show('Error al guardar punto', 'err'))
  }

  function eliminarPunto(i) {
    const nuevo = puntosCtrl.filter((_,j) => j !== i)
    setPuntosCtrl(nuevo)
    api.put('/mapa/puntos', { puntos: nuevo }).then(() => show('Punto eliminado', 'ok'))
  }

  // ── Zoom y pan ────────────────────────────────────────────────
  function handleWheel(e) {
    e.preventDefault()
    setZoom(z => Math.min(Math.max(z * (e.deltaY > 0 ? 0.85 : 1.18), 0.3), 8))
  }
  function handleMouseDown(e) {
    if (modo === 'calibrar') return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function handleMouseMove(e) {
    if (!dragging.current) return
    setOffset({ x: dragStart.current.ox + e.clientX - dragStart.current.x, y: dragStart.current.oy + e.clientY - dragStart.current.y })
  }
  function handleMouseUp() { dragging.current = false }

  // ── Posición display de sondaje ───────────────────────────────
  function sondajePx(s) {
    if (!transform || !s.ESTE || !s.NORTE) return null
    const { px, py } = coordToPx(parseFloat(s.ESTE), parseFloat(s.NORTE), transform)
    return { x: px * (imgSize.w / (imgNat.w||1)), y: py * (imgSize.h / (imgNat.h||1)) }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, color:'var(--mut)' }}>Cargando...</div>
  )

  const tieneImagen = !!(config?.imagen_b64)
  const calibrado   = puntosCtrl.length >= 3
  const imgSrc      = tieneImagen ? `data:${config.imagen_tipo};base64,${config.imagen_b64}` : null

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
              <span className="btn btn-blu" style={{ opacity: uploading ? .6 : 1 }}>
                {uploading ? '⏳ Subiendo...' : '📤 ' + (tieneImagen ? 'Cambiar plano' : 'Subir plano')}
              </span>
            </label>
            {tieneImagen && <>
              <button className="btn btn-red" onClick={handleEliminar}>🗑 Eliminar plano</button>
              <button className={modo==='calibrar' ? 'btn btn-acc' : 'btn btn-out'}
                onClick={() => { setModo(m => m==='calibrar'?'ver':'calibrar'); setPendPx(null) }}>
                {modo==='calibrar' ? '✅ Calibrando...' : '📍 Calibrar'}
              </button>
            </>}
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
      {isAdmin && tieneImagen && modo==='calibrar' && (
        <div className="ch-card" style={{ marginBottom:12, padding:'12px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13 }}>
              <strong>Modo calibración</strong>
              <span style={{ color:'var(--mut)', marginLeft:8 }}>
                {puntosCtrl.length < 3
                  ? `Haz clic en el plano e ingresa la coordenada ESTE/NORTE (${puntosCtrl.length}/3 mínimo)`
                  : `✅ ${puntosCtrl.length} puntos — puedes agregar más para mayor precisión`}
              </span>
            </div>
            {puntosCtrl.length > 0 && (
              <button className="btn btn-red btn-sm" onClick={() => {
                setPuntosCtrl([])
                api.put('/mapa/puntos', { puntos: [] })
                show('Puntos eliminados', 'ok')
              }}>🗑 Limpiar</button>
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
              <span style={{ fontSize:12, color:'var(--acc)', fontWeight:600 }}>📍 Pixel ({pendPx.px}, {pendPx.py})</span>
              <input type="number" placeholder="ESTE" value={formCoord.este}
                onChange={e => setFormCoord(p => ({...p, este: e.target.value}))}
                style={{ width:130, background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:6, padding:'6px 10px', color:'var(--txt)', fontSize:13, outline:'none' }} />
              <input type="number" placeholder="NORTE" value={formCoord.norte}
                onChange={e => setFormCoord(p => ({...p, norte: e.target.value}))}
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
          {Object.entries(ESTADO_COLOR).map(([est,col]) => (
            <div key={est} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
              <div style={{ width:12, height:12, borderRadius:'50%', background:col }} />
              <span style={{ color:'var(--mut)' }}>{est}</span>
            </div>
          ))}
          {!calibrado && <span style={{ fontSize:11, color:'var(--mut)', fontStyle:'italic' }}>
            {isAdmin ? `⚠ Faltan ${3-puntosCtrl.length} puntos de control` : '⚠ Mapa en calibración'}
          </span>}
          {calibrado && <span style={{ fontSize:11, color:'var(--grn)' }}>✅ {sondajes.filter(s=>s.ESTE&&s.NORTE).length} sondajes con coordenadas</span>}
          <span style={{ fontSize:11, color:'var(--mut)', marginLeft:'auto' }}>🖱 Scroll = zoom · Arrastra = mover</span>
        </div>
      )}

      {/* Mapa */}
      {tieneImagen && (
        <div style={{ position:'relative', overflow:'hidden', background:'var(--sur2)', border:'1px solid var(--brd)', borderRadius:14, height:'calc(100vh - 280px)', minHeight:400, cursor: modo==='calibrar'?'crosshair':(dragging.current?'grabbing':'grab'), userSelect:'none' }}
          onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

          <div style={{ transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`, transformOrigin:'0 0', position:'relative', display:'inline-block' }}>
            <img ref={imgRef} src={imgSrc} alt="Plano" draggable={false}
              onLoad={e => {
                setImgNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })
                setImgSize({ w: e.target.offsetWidth,  h: e.target.offsetHeight })
              }}
              onClick={handleImgClick}
              style={{ display:'block', maxWidth:'100%', maxHeight:'calc(100vh - 280px)' }}
            />

            {/* Punto pendiente */}
            {pendPx && modo==='calibrar' && imgSize.w>0 && (
              <div style={{ position:'absolute', left: pendPx.px*(imgSize.w/(imgNat.w||1))-10, top: pendPx.py*(imgSize.h/(imgNat.h||1))-10, width:20, height:20, borderRadius:'50%', background:'rgba(245,158,11,.85)', border:'3px solid #fff', pointerEvents:'none', zIndex:10, boxShadow:'0 0 0 4px rgba(245,158,11,.3)' }} />
            )}

            {/* Puntos de control */}
            {modo==='calibrar' && puntosCtrl.map((p,i) => (
              <div key={i} style={{ position:'absolute', left: p.px*(imgSize.w/(imgNat.w||1))-8, top: p.py*(imgSize.h/(imgNat.h||1))-8, width:16, height:16, borderRadius:'50%', background:'#3b82f6', border:'2px solid #fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'#fff', fontWeight:700, zIndex:9, pointerEvents:'none' }}>{i+1}</div>
            ))}

            {/* Sondajes */}
            {calibrado && sondajes.map(s => {
              if (!s.ESTE || !s.NORTE) return null
              const pos = sondajePx(s)
              if (!pos) return null
              const color = ESTADO_COLOR[s.ESTADO] || ESTADO_COLOR['Pendiente']
              const r = s.ESTADO==='En Proceso' ? 9 : 7
              return (
                <div key={s.DDHID} style={{ position:'absolute', left:pos.x-r, top:pos.y-r, width:r*2, height:r*2, borderRadius:'50%', background:color, border: s.ESTADO==='En Proceso'?'2px solid #fff':'1.5px solid rgba(255,255,255,.5)', cursor:'pointer', zIndex:5, boxShadow: s.ESTADO==='En Proceso'?`0 0 8px ${color}`:'none', transition:'transform .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform='scale(1.7)'; setTooltip({s,x:pos.x,y:pos.y}) }}
                  onMouseLeave={e => { e.currentTarget.style.transform='scale(1)';   setTooltip(null) }}
                />
              )
            })}

            {/* Tooltip */}
            {tooltip && (() => {
              const s   = tooltip.s
              const pct = s.PCT ?? 0
              return (
                <div style={{ position:'absolute', left:tooltip.x+14, top:tooltip.y-10, background:'var(--sur)', border:'1px solid var(--brd)', borderRadius:10, padding:'10px 14px', fontSize:12, zIndex:20, pointerEvents:'none', boxShadow:'0 4px 20px rgba(0,0,0,.4)', minWidth:180 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>{s.DDHID}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {s.EQUIPO    && <span style={{ color:'var(--mut)' }}>🔧 {s.EQUIPO}</span>}
                    {s.PLATAFORMA && <span style={{ color:'var(--mut)' }}>📍 {s.PLATAFORMA}</span>}
                    <span style={{ color: ESTADO_COLOR[s.ESTADO]||'var(--mut)', fontWeight:600 }}>● {s.ESTADO}</span>
                    <div style={{ marginTop:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ color:'var(--mut)' }}>Prog: {s.PROGRAMADO}m</span>
                        <span style={{ color:'var(--grn)', fontWeight:600 }}>{pct}%</span>
                      </div>
                      <div style={{ background:'var(--sur2)', borderRadius:99, height:5, overflow:'hidden' }}>
                        <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background:ESTADO_COLOR[s.ESTADO]||'var(--mut)', borderRadius:99 }} />
                      </div>
                      <div style={{ marginTop:3 }}>Ejec: {s.EJECUTADO}m</div>
                    </div>
                    {s.FECHA_INICIO && s.FECHA_INICIO!=='—' && <span style={{ color:'var(--mut)', fontSize:11 }}>📅 {s.FECHA_INICIO} → {s.FECHA_FIN}</span>}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Controles zoom */}
          <div style={{ position:'absolute', bottom:14, right:14, display:'flex', flexDirection:'column', gap:4, zIndex:15 }}>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:16 }} onClick={() => setZoom(z=>Math.min(z*1.3,8))}>+</button>
            <button className="btn btn-out btn-sm" style={{ width:32, height:32, padding:0, fontSize:16 }} onClick={() => setZoom(z=>Math.max(z*0.77,0.3))}>−</button>
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
