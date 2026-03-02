import React, { useEffect, useRef, useState } from 'react'
import {
  Chart, BarElement, BarController, LineElement, LineController, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler
} from 'chart.js'
import { useAuth } from '../context/AuthContext'
import { statCls, fmtFecha, today } from '../utils/tableDefs'
import api from '../utils/api'

Chart.register(
  BarElement, BarController, LineElement, LineController, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler
)

function destroyChart(ref) {
  if (ref.current) { ref.current.destroy(); ref.current = null }
}

const C = {
  perf:  { bg:'rgba(16,185,129,.5)',  bd:'#10b981' },
  recep: { bg:'rgba(59,130,246,.5)',  bd:'#3b82f6' },
  recup: { bg:'rgba(168,85,247,.5)',  bd:'#a855f7' },
  foto:  { bg:'rgba(245,158,11,.5)',  bd:'#f59e0b' },
  geot:  { bg:'rgba(239,68,68,.5)',   bd:'#ef4444' },
  geol:  { bg:'rgba(20,184,166,.5)',  bd:'#14b8a6' },
}

const TICK = { color:'#64748b', font:{ size:9 } }
const LEGEND_OPTS = { labels:{ color:'#94a3b8', font:{ size:11 }, boxWidth:12 } }

export default function Dashboard() {
  const { user } = useAuth()
  const [stats,       setStats]       = useState({ perforado:0, recepcion:0, recuperado:0, fotografiado:0, geotecnico:0, geologico:0 })
  const [porSondaje,  setPorSondaje]  = useState([])
  const [serieReal,   setSerieReal]   = useState([])
  const [serieIdeal,  setSerieIdeal]  = useState([])
  const [fechasSerie, setFechasSerie] = useState([])
  const [perfDia,     setPerfDia]     = useState([])

  const crAcum   = useRef(null); const ciAcum   = useRef(null)
  const crDia    = useRef(null); const ciDia    = useRef(null)
  const crSondaj = useRef(null); const ciSondaj = useRef(null)
  const sondajWrap = useRef(null) // para auto-scroll

  // ── Carga de datos ───────────────────────────────────────────────
  useEffect(() => {
    // Stats completos
    api.get('/tables/dashboard/stats').then(r => {
      const d = r.data
      setStats(d.totales)
      // Orden: no completados (alfa) → completados (alfa)
      const sorted = [...d.porSondaje].sort((a, b) => {
        const aC = a.ESTADO === 'Completado' ? 1 : 0
        const bC = b.ESTADO === 'Completado' ? 1 : 0
        if (aC !== bC) return aC - bC
        return (a.DDHID||'').localeCompare(b.DDHID||'')
      })
      setPorSondaje(sorted)
      setSerieReal(d.serieReal)
      setSerieIdeal(d.serieIdeal)
      setFechasSerie(d.fechasOrdenadas)
    }).catch(() => {})

    // Avance diario por turno — últimos 14 días
    api.get('/tables/perforacion').then(r => {
      const byDate = {}
      r.data.forEach(x => {
        const raw = x.Fecha ? String(x.Fecha) : null
        if (!raw) return
        // Normalizar a YYYY-MM-DD
        const f = raw.includes('T') ? raw.slice(0,10) : raw.slice(0,10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return
        if (!byDate[f]) byDate[f] = { dia:0, noche:0 }
        byDate[f].dia   += parseFloat(x.Turno_Dia)   || 0
        byDate[f].noche += parseFloat(x.Turno_Noche) || 0
      })
      const sorted = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).slice(-14)
      setPerfDia(sorted)
    }).catch(() => {})
  }, [])

  // ── Gráfico 1: Acumulado real vs ideal (líneas) ─────────────────
  useEffect(() => {
    if (!serieReal.length || !crAcum.current) return
    destroyChart(ciAcum)
    ciAcum.current = new Chart(crAcum.current, {
      type: 'line',
      data: {
        labels: fechasSerie.map(f => fmtFecha(f)),
        datasets: [
          {
            label: '⛏ Real acumulado',
            data: serieReal.map(p => p.valor),
            borderColor: C.perf.bd, backgroundColor: 'rgba(16,185,129,.1)',
            borderWidth: 2.5, pointRadius: 3, tension: 0.3, fill: true,
          },
          {
            label: '📐 Ideal (35m/día × máquinas)',
            data: serieIdeal.map(p => p.valor),
            borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,.08)',
            borderWidth: 2, borderDash: [6,4], pointRadius: 0, tension: 0, fill: true,
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: LEGEND_OPTS, tooltip: { mode:'index', intersect:false } },
        scales: {
          x: { ticks:{ ...TICK, maxRotation:45 } },
          y: { ticks: TICK, title:{ display:true, text:'metros acumulados', color:'#64748b', font:{ size:10 } } }
        }
      }
    })
  }, [serieReal, serieIdeal, fechasSerie])

  // ── Gráfico 2: Avance diario por turno (barras apiladas) ────────
  useEffect(() => {
    if (!perfDia.length || !crDia.current) return
    destroyChart(ciDia)
    ciDia.current = new Chart(crDia.current, {
      type: 'bar',
      data: {
        labels: perfDia.map(([f]) => fmtFecha(f)),
        datasets: [
          { label:'☀ Turno Día',    data: perfDia.map(([,v]) => +v.dia.toFixed(2)),   backgroundColor:'rgba(245,158,11,.6)', borderColor:'#f59e0b', borderWidth:1 },
          { label:'🌙 Turno Noche', data: perfDia.map(([,v]) => +v.noche.toFixed(2)), backgroundColor:'rgba(99,102,241,.6)',  borderColor:'#6366f1', borderWidth:1 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: LEGEND_OPTS,
          tooltip: { callbacks: { footer: items => `Total: ${items.reduce((s,i)=>s+i.parsed.y,0).toFixed(2)} m` } }
        },
        scales: {
          x: { stacked:true, ticks:{ ...TICK, maxRotation:45 } },
          y: { stacked:true, ticks:TICK, title:{ display:true, text:'metros', color:'#64748b', font:{ size:10 } } }
        }
      }
    })
  }, [perfDia])

  // ── Gráfico 3: Metros por sondaje (6 series, barras agrupadas) ──
  useEffect(() => {
    if (!porSondaje.length || !crSondaj.current) return
    destroyChart(ciSondaj)
    const labels = porSondaje.map(r => r.DDHID)
    const BAR_W  = Math.max(50, porSondaje.length * 56) // ancho mínimo por sondaje

    ciSondaj.current = new Chart(crSondaj.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'Perforado',    data: porSondaje.map(r=>r.PERFORADO),    backgroundColor:C.perf.bg,  borderColor:C.perf.bd,  borderWidth:1 },
          { label:'Recepcionado', data: porSondaje.map(r=>r.RECEPCION),    backgroundColor:C.recep.bg, borderColor:C.recep.bd, borderWidth:1 },
          { label:'Recuperado',   data: porSondaje.map(r=>r.RECUPERADO),   backgroundColor:C.recup.bg, borderColor:C.recup.bd, borderWidth:1 },
          { label:'Fotografiado', data: porSondaje.map(r=>r.FOTOGRAFIADO), backgroundColor:C.foto.bg,  borderColor:C.foto.bd,  borderWidth:1 },
          { label:'Geotécnico',   data: porSondaje.map(r=>r.GEOTECNICO),   backgroundColor:C.geot.bg,  borderColor:C.geot.bd,  borderWidth:1 },
          { label:'Geológico',    data: porSondaje.map(r=>r.GEOLOGICO),    backgroundColor:C.geol.bg,  borderColor:C.geol.bd,  borderWidth:1 },
        ]
      },
      options: {
        responsive: false,   // false = respeta width/height del canvas explícito
        maintainAspectRatio: false,
        plugins: {
          legend: { position:'top', ...LEGEND_OPTS },
          tooltip: { mode:'index', intersect:false }
        },
        scales: {
          x: { ticks:{ ...TICK, maxRotation:45 } },
          y: { ticks:TICK, title:{ display:true, text:'metros', color:'#64748b', font:{ size:10 } } }
        }
      }
    })

    // Auto-scroll al primer sondaje "En Proceso" (más a la derecha → último no completado)
    setTimeout(() => {
      if (!sondajWrap.current) return
      const primerEnProceso = porSondaje.findIndex(r => r.ESTADO !== 'Completado')
      if (primerEnProceso >= 0) {
        const pxPorSondaje = BAR_W / porSondaje.length
        const scrollTarget = primerEnProceso * pxPorSondaje
        sondajWrap.current.scrollLeft = Math.max(0, scrollTarget - 60)
      }
    }, 150)
  }, [porSondaje])

  // ── Tarjetas ─────────────────────────────────────────────────────
  const CARDS = [
    { lbl:'Perforado',     val: stats.perforado,    color: C.perf.bd,  icon:'⛏' },
    { lbl:'Recuperado',    val: stats.recuperado,   color: C.recup.bd, icon:'🧪' },
    { lbl:'Fotografiado',  val: stats.fotografiado, color: C.foto.bd,  icon:'📷' },
    { lbl:'Log. Geotéc.',  val: stats.geotecnico,   color: C.geot.bd,  icon:'🪨' },
    { lbl:'Log. Geológ.',  val: stats.geologico,    color: C.geol.bd,  icon:'🔬' },
  ]

  // Ancho del canvas de sondajes: mínimo 100% pantalla, crece con más sondajes
  const sondajCanvasW = Math.max(700, porSondaje.length * 80)

  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-desc">Bienvenido, {user.name} — {fmtFecha(today())}</div>

      {/* ── 5 Cards ── */}
      <div className="c-grid" style={{ gridTemplateColumns:'repeat(5,1fr)', marginBottom:20 }}>
        {CARDS.map(c => (
          <div key={c.lbl} className="s-card">
            <div className="s-lbl">{c.icon} {c.lbl}</div>
            <div className="s-val" style={{ color:c.color }}>{c.val ?? '—'}</div>
            <div className="s-sub">metros totales</div>
          </div>
        ))}
      </div>

      {/* ── Gráfico acumulado real vs ideal (ancho completo) ── */}
      <div className="ch-card" style={{ marginBottom:16 }}>
        <div className="ch-title">📈 Acumulado real vs ideal (35m/día × máquinas activas)</div>
        <div style={{ height:240 }}>
          <canvas ref={crAcum} />
        </div>
      </div>

      {/* ── Avance diario (mitad izq) ── */}
      <div className="ch-card" style={{ marginBottom:16 }}>
        <div className="ch-title">⛏ Avance diario por turno — últimos 14 días</div>
        <div style={{ height:220 }}>
          <canvas ref={crDia} />
        </div>
      </div>

      {/* ── Gráfico metros por sondaje — scroll horizontal, auto-scroll a en-proceso ── */}
      <div className="ch-card" style={{ marginBottom:16 }}>
        <div className="ch-title">📊 Metros por sondaje (izq: completados → der: en proceso)</div>
        <div
          ref={sondajWrap}
          style={{ overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:4 }}
        >
          <div style={{ width: sondajCanvasW, height:280 }}>
            <canvas ref={crSondaj} width={sondajCanvasW} height={280} />
          </div>
        </div>
      </div>

      {/* ── Tabla resumen completo por sondaje ── */}
      {user.role !== 'USER' && porSondaje.length > 0 && (
        <div className="t-wrap">
          <div className="t-top"><span className="t-title">Resumen completo por sondaje</span></div>
          <div className="ox">
            <table className="tbl">
              <thead>
                <tr>
                  {['#','DDHID','Estado','Prog.(m)','Perf.(m)','Recep.(m)','Recup.(m)','Foto.(m)','Geotéc.(m)','Geológ.(m)','%'].map(c=>(
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porSondaje.map((r,i) => (
                  <tr key={r.DDHID}>
                    <td style={{ color:'var(--mut)', fontSize:11 }}>{i+1}</td>
                    <td><strong>{r.DDHID}</strong></td>
                    <td><span className={`bdg ${statCls(r.ESTADO)}`}>{r.ESTADO}</span></td>
                    <td>{r.PROGRAMADO}</td>
                    <td style={{ color:C.perf.bd  }}>{r.PERFORADO}</td>
                    <td style={{ color:C.recep.bd }}>{r.RECEPCION}</td>
                    <td style={{ color:C.recup.bd }}>{r.RECUPERADO}</td>
                    <td style={{ color:C.foto.bd  }}>{r.FOTOGRAFIADO}</td>
                    <td style={{ color:C.geot.bd  }}>{r.GEOTECNICO}</td>
                    <td style={{ color:C.geol.bd  }}>{r.GEOLOGICO}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div className="p-bar"><div className="p-fill" style={{ width:Math.min(r.PCT,100)+'%' }}/></div>
                        <span style={{ fontSize:11, color:'var(--mut)', minWidth:28 }}>{r.PCT}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
