import React, { useEffect, useRef, useState } from 'react'
import {
  Chart, BarElement, BarController, LineElement, LineController, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler
} from 'chart.js'
import { useAuth } from '../context/AuthContext'
import { statCls, fmtFecha, today } from '../utils/tableDefs'
import api from '../utils/api'

Chart.register(BarElement, BarController, LineElement, LineController, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler)

// ── Colores ──────────────────────────────────────────────────────
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
const TOOLTIP_DIA = {
  mode:'index', intersect:false,
  callbacks: {
    label:  item  => ` ${item.dataset.label}: ${item.parsed.y.toFixed(2)} m`,
    footer: items => `  Total: ${items.reduce((s,i)=>s+i.parsed.y,0).toFixed(2)} m`
  }
}

// ── Componente gráfico por máquina (ref propio, se crea 1 vez) ───
function MaquinaChart({ equipo, ddhid, datos, completado, programado }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => {
    if (!datos.length) return
    const timer = setTimeout(() => {
      if (!canvasRef.current) return
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
      chartRef.current = new Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels: datos.map(([f]) => fmtFecha(f)),
          datasets: [
            { label:'☀ Turno Día',    data: datos.map(([,v]) => +v.dia.toFixed(2)),   backgroundColor:'rgba(245,158,11,.6)', borderColor:'#f59e0b', borderWidth:1 },
            { label:'🌙 Turno Noche', data: datos.map(([,v]) => +v.noche.toFixed(2)), backgroundColor:'rgba(99,102,241,.6)',  borderColor:'#6366f1', borderWidth:1 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: LEGEND_OPTS, tooltip: TOOLTIP_DIA },
          scales: {
            x: { stacked:true, ticks:{ ...TICK, maxRotation:45 } },
            y: { stacked:true, ticks:TICK, title:{ display:true, text:'metros', color:'#64748b', font:{ size:10 } } }
          }
        }
      })
    }, 50)
    return () => {
      clearTimeout(timer)
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  }, [datos])

  function downloadCSV() {
    const bom = '\uFEFF'
    const rows = [
      ['Fecha','Turno_Dia_m','Turno_Noche_m','Total_m'],
      ...datos.map(([f,v]) => [fmtFecha(f), v.dia.toFixed(2), v.noche.toFixed(2), (v.dia+v.noche).toFixed(2)])
    ]
    const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bom+csv],{type:'text/csv;charset=utf-8;'}))
    a.download = `Perf_${equipo}_${ddhid}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="ch-card">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8, gap:8 }}>
        <div>
          <div className="ch-title" style={{ margin:0 }}>
            🔧 {equipo || 'Sin equipo asignado'}
          </div>
          <div style={{ fontSize:12, color:'var(--acc)', fontWeight:600, marginTop:2 }}>
            {ddhid} {completado && <span style={{ fontSize:10, color:'var(--mut)', fontWeight:400 }}>— finalizado</span>}
          </div>
          {programado != null && (() => {
            const ejec  = datos.reduce((s,[,v]) => s + v.dia + v.noche, 0)
            const diff  = parseFloat((ejec - programado).toFixed(1))
            const color = diff >= 0 ? '#10b981' : '#ef4444'
            const sign  = diff >= 0 ? '+' : ''
            return (
              <div style={{ fontSize:11, marginTop:3, display:'flex', gap:10 }}>
                <span style={{ color:'var(--mut)' }}>Ejec: <strong style={{ color:'var(--txt)' }}>{ejec.toFixed(1)}m</strong></span>
                <span style={{ color:'var(--mut)' }}>Prog: <strong style={{ color:'var(--txt)' }}>{programado}m</strong></span>
                <span style={{ color, fontWeight:700 }}>{sign}{diff}m</span>
              </div>
            )
          })()}
        </div>
        <button className="btn btn-grn btn-sm" onClick={downloadCSV} style={{ flexShrink:0 }}>⬇ CSV</button>
      </div>
      <div style={{ height:200 }}><canvas ref={canvasRef} /></div>
    </div>
  )
}

// ── Componente gráfico diario (se monta cuando llegan los datos) ─
// DiaChart: recibe perfDia ya cargado, se monta UNA sola vez con dimensiones correctas
function DiaChartInner({ perfDia }) {
  const canvasRef = useRef(null)
  const W = Math.max(700, perfDia.length * 48)

  useEffect(() => {
    if (!canvasRef.current) return
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: perfDia.map(([f]) => fmtFecha(f)),
        datasets: [
          { label:'☀ Turno Día',    data: perfDia.map(([,v])=>+v.dia.toFixed(2)),   backgroundColor:'rgba(245,158,11,.6)', borderColor:'#f59e0b', borderWidth:1 },
          { label:'🌙 Turno Noche', data: perfDia.map(([,v])=>+v.noche.toFixed(2)), backgroundColor:'rgba(99,102,241,.6)',  borderColor:'#6366f1', borderWidth:1 },
        ]
      },
      options: {
        responsive: false, maintainAspectRatio: false,
        plugins: { legend: LEGEND_OPTS, tooltip: TOOLTIP_DIA },
        scales: {
          x: { stacked:true, ticks:{ ...TICK, maxRotation:45 } },
          y: { stacked:true, ticks:TICK, title:{ display:true, text:'metros', color:'#64748b', font:{ size:10 } } }
        }
      }
    })
    return () => chart.destroy()
  }, [])  // [] — solo se ejecuta al montar, datos ya están disponibles

  return (
    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
      <div style={{ width: W, height: 240 }}>
        <canvas ref={canvasRef} width={W} height={240} style={{ display:'block' }} />
      </div>
    </div>
  )
}

// Wrapper: no renderiza DiaChartInner hasta que haya datos
// key={perfDia.length} garantiza desmonte/remonte si cambia el array
function DiaChart({ perfDia }) {
  if (!perfDia.length) return (
    <div style={{ height:240, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--mut)' }}>
      Cargando...
    </div>
  )
  return <DiaChartInner key={perfDia.length} perfDia={perfDia} />
}

// ── Dashboard principal ──────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const [stats,        setStats]        = useState({ perforado:0, recepcion:0, recuperado:0, fotografiado:0, geotecnico:0, geologico:0 })
  const [ultFecha,     setUltFecha]     = useState({ perf:'', recup:'', foto:'', geot:'', geol:'' })
  const [porSondaje,   setPorSondaje]   = useState([])
  const [serieProg,    setSerieProg]    = useState([])   // [{fecha,acumProg,acumReal,acumIdeal,maquinas}]
  const [serieDiaria,  setSerieDiaria]  = useState([])   // [{fecha,real,maquinas}] para CSV
  const [showIdeal,    setShowIdeal]    = useState(false) // toggle línea ideal
  const [perfDia,      setPerfDia]      = useState([])
  const [maquinaGrupos,setMaquinaGrupos]= useState([]) // en proceso + 2 últimos completados

  const crAcum   = useRef(null); const ciAcum   = useRef(null)
  // crDia y diaWrapRef movidos a componente DiaChart
  const crSondaj = useRef(null); const ciSondaj = useRef(null)
  const sondajWrap = useRef(null)

  // ── Carga principal ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/tables/dashboard/stats').then(r => {
      const d = r.data
      setStats(d.totales)
      setUltFecha(d.ultimasFechas || { perf:'', recup:'', foto:'', geot:'', geol:'' })
      const sorted = [...d.porSondaje].sort((a,b) => {
        const aC = a.ESTADO === 'Completado' ? 1 : 0
        const bC = b.ESTADO === 'Completado' ? 1 : 0
        if (aC !== bC) return aC - bC
        return (a.DDHID||'').localeCompare(b.DDHID||'')
      })
      setPorSondaje(sorted)
      setSerieProg(d.serieProg   || [])
      setSerieDiaria(d.serieDiaria || [])

      // Sondajes a mostrar en gráficos por máquina:
      // En proceso con equipo + 2 últimos completados
      // Mostrar todos los sondajes en proceso (con o sin equipo asignado)
      const enProceso = sorted.filter(s => s.ESTADO !== 'Completado')
      const completadosRecientes = d.completadosRecientes || []
      const paraGraficos = [
        ...enProceso.map(s => ({ ...s, completado: false })),
        ...completadosRecientes.map(s => ({ ...s, completado: true }))
      ]

      // Cargar perforación y agrupar por equipo+sondaje
      api.get('/tables/perforacion').then(rp => {
        const perf = rp.data
        const grupos = paraGraficos.map(s => {
          const rows = perf.filter(p => p.DDHID === s.DDHID)
          const byDate = {}
          rows.forEach(p => {
            const raw = p.Fecha ? String(p.Fecha) : null
            if (!raw) return
            const f = raw.includes('T') ? raw.slice(0,10) : raw.slice(0,10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return
            if (!byDate[f]) byDate[f] = { dia:0, noche:0 }
            byDate[f].dia   += parseFloat(p.Turno_Dia)   || 0
            byDate[f].noche += parseFloat(p.Turno_Noche) || 0
          })
          const datos = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b))
          return { equipo:s.EQUIPO, ddhid:s.DDHID, datos, completado:s.completado, programado:s.PROGRAMADO ?? null }
        }).filter(g => g.datos.length > 0)
        setMaquinaGrupos(grupos)
      }).catch(() => {})
    }).catch(() => {})

    // Avance diario por turno — últimos 14 días
    api.get('/tables/perforacion').then(r => {
      const byDate = {}
      r.data.forEach(x => {
        const raw = x.Fecha ? String(x.Fecha) : null
        if (!raw) return
        const f = raw.includes('T') ? raw.slice(0,10) : raw.slice(0,10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return
        if (!byDate[f]) byDate[f] = { dia:0, noche:0 }
        byDate[f].dia   += parseFloat(x.Turno_Dia)   || 0
        byDate[f].noche += parseFloat(x.Turno_Noche) || 0
      })
      setPerfDia(Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b))) // todos los días
    }).catch(() => {})
  }, [])

  // ── Gráfico Programado vs Ejecutado (+ toggle Ideal) ──────────
  useEffect(() => {
    if (!serieProg.length || !crAcum.current) return
    if (ciAcum.current) { ciAcum.current.destroy(); ciAcum.current = null }

    const hoy = new Date().toISOString().slice(0,10)
    // Solo mostrar real hasta hoy
    const labels   = serieProg.map(p => fmtFecha(p.fecha))
    const dataProg = serieProg.map(p => p.acumProg)
    const dataReal = serieProg.map(p => p.fecha <= hoy ? p.acumReal : null)
    const dataIdeal= serieProg.map(p => p.fecha <= hoy ? p.acumIdeal : null)

    const datasets = [
      {
        label: '📋 Programado',
        data: dataProg,
        borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.08)',
        borderWidth: 2.5, pointRadius: 3, tension: 0.4, fill: true,
      },
      {
        label: '⛏ Ejecutado real',
        data: dataReal,
        borderColor: C.perf.bd, backgroundColor: 'rgba(16,185,129,.12)',
        borderWidth: 2.5, pointRadius: 4, tension: 0.3, fill: true,
        spanGaps: false,
      },
    ]

    if (showIdeal) {
      datasets.push({
        label: '📐 Ideal (35m/día × máquinas)',
        data: dataIdeal,
        borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,.06)',
        borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.3, fill: false,
        spanGaps: false,
      })
    }

    ciAcum.current = new Chart(crAcum.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: LEGEND_OPTS,
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              label: item => ` ${item.dataset.label}: ${item.parsed.y != null ? item.parsed.y.toLocaleString('es-PE') + ' m' : '—'}`,
              afterBody: items => {
                const idx = items[0]?.dataIndex
                const maq = serieProg[idx]?.maquinas
                return showIdeal && maq ? [`  Máquinas activas: ${maq}`] : []
              }
            }
          }
        },
        scales: {
          x: { ticks: { ...TICK, maxRotation: 45 } },
          y: {
            ticks: { ...TICK, callback: v => v.toLocaleString('es-PE') + ' m' },
            title: { display: true, text: 'metros acumulados', color: '#64748b', font: { size: 10 } }
          }
        }
      }
    })
  }, [serieProg, showIdeal])

  // Gráfico diario → componente DiaChart (ver arriba)

  // ── Gráfico Avance por Sondaje: ordenar por (Perf - GeoLog) desc → izq mayor diferencia
  useEffect(() => {
    if (!porSondaje.length || !crSondaj.current) return
    if (ciSondaj.current) { ciSondaj.current.destroy(); ciSondaj.current = null }
    const sondajOrdenado = [...porSondaje].sort((a,b) => {
      const da = (a.PERFORADO||0) - (a.GEOLOGICO||0)
      const db = (b.PERFORADO||0) - (b.GEOLOGICO||0)
      return db - da // mayor diferencia a la izquierda
    })
    ciSondaj.current = new Chart(crSondaj.current, {
      type:'bar',
      data:{
        labels: sondajOrdenado.map(r=>r.DDHID),
        datasets:[
          { label:'Perforado',    data:sondajOrdenado.map(r=>r.PERFORADO),    backgroundColor:C.perf.bg,  borderColor:C.perf.bd,  borderWidth:1 },
          { label:'Recepcionado', data:sondajOrdenado.map(r=>r.RECEPCION),    backgroundColor:C.recep.bg, borderColor:C.recep.bd, borderWidth:1 },
          { label:'Recuperado',   data:sondajOrdenado.map(r=>r.RECUPERADO),   backgroundColor:C.recup.bg, borderColor:C.recup.bd, borderWidth:1 },
          { label:'Fotografiado', data:sondajOrdenado.map(r=>r.FOTOGRAFIADO), backgroundColor:C.foto.bg,  borderColor:C.foto.bd,  borderWidth:1 },
          { label:'Geotécnico',   data:sondajOrdenado.map(r=>r.GEOTECNICO),   backgroundColor:C.geot.bg,  borderColor:C.geot.bd,  borderWidth:1 },
          { label:'Geológico',    data:sondajOrdenado.map(r=>r.GEOLOGICO),    backgroundColor:C.geol.bg,  borderColor:C.geol.bd,  borderWidth:1 },
        ]
      },
      options:{
        responsive:false, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', ...LEGEND_OPTS }, tooltip:{ mode:'index', intersect:false } },
        scales:{
          x:{ ticks:{ ...TICK, maxRotation:45 } },
          y:{ ticks:TICK, title:{ display:true, text:'metros', color:'#64748b', font:{ size:10 } } }
        }
      }
    })
    setTimeout(() => {
      if (!sondajWrap.current) return
      const primerEnProceso = porSondaje.findIndex(r => r.ESTADO !== 'Completado')
      if (primerEnProceso >= 0) {
        const px = (primerEnProceso / porSondaje.length) * Math.max(700, porSondaje.length * 80)
        sondajWrap.current.scrollLeft = Math.max(0, px - 60)
      }
    }, 150)
  }, [porSondaje])

  // ── Descarga CSV acumulado real vs ideal ───────────────────────
  function downloadAcumCSV() {
    const bom = '\uFEFF'
    const sep = '\r\n'
    const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const row   = cols => cols.map(quote).join(',')

    // Hoja 1: Detalle diario
    // Ejecutado_ideal_dia = 35 × máquinas activas ese día
    const diario = [
      row(['Fecha','Ejecutado_dia_m','Acum_Real_m','Maquinas_Activas','Ejecutado_Ideal_dia_m','Acum_Ideal_m']),
    ]
    let acumDia  = 0
    let acumIdealDia = 0
    serieDiaria.forEach(d => {
      const ejec_dia   = parseFloat((parseFloat(d.real) - acumDia).toFixed(1))
      const ideal_dia  = parseFloat((35 * d.maquinas).toFixed(1))
      acumDia       = parseFloat(d.real)
      acumIdealDia  = parseFloat((acumIdealDia + ideal_dia).toFixed(1))
      diario.push(row([fmtFecha(d.fecha), ejec_dia, d.real, d.maquinas, ideal_dia, acumIdealDia]))
    })

    // Hoja 2: Programa semanal
    // acumReal ya viene calculado en serieProg desde el backend
    const prog = [
      row(['Fecha_Programa','Acum_Programado_m','Acum_Real_hasta_fecha_m','Acum_Ideal_m','Maquinas_Activas']),
      ...serieProg.map(p => row([fmtFecha(p.fecha), p.acumProg, p.acumReal, p.acumIdeal, p.maquinas]))
    ]

    // Unir en un solo CSV con separador de sección
    const csv = [
      '=== DETALLE DIARIO ===', ...diario,
      '', '=== PROGRAMA SEMANAL ===', ...prog
    ].join(sep)

    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bom+csv],{type:'text/csv;charset=utf-8;'}))
    a.download = `Perf_Programada_vs_Ejecutada_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const CARDS = [
    { lbl:'Perforado',    val:stats.perforado,    color:C.perf.bd,  icon:'⛏', ult:ultFecha.perf  },
    { lbl:'Recuperado',   val:stats.recuperado,   color:C.recup.bd, icon:'🧪', ult:ultFecha.recup },
    { lbl:'Fotografiado', val:stats.fotografiado, color:C.foto.bd,  icon:'📷', ult:ultFecha.foto  },
    { lbl:'Log. Geotéc.', val:stats.geotecnico,   color:C.geot.bd,  icon:'🪨', ult:ultFecha.geot  },
    { lbl:'Log. Geológ.', val:stats.geologico,    color:C.geol.bd,  icon:'🔬', ult:ultFecha.geol  },
  ]

  const sondajCanvasW = Math.max(700, porSondaje.length * 80)

  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-desc">Bienvenido, {user.name} — {fmtFecha(today())}</div>

      {/* Cards */}
      <div className="c-grid" style={{ gridTemplateColumns:'repeat(5,1fr)', marginBottom:20 }}>
        {CARDS.map(c=>(
          <div key={c.lbl} className="s-card">
            <div className="s-lbl">{c.icon} {c.lbl}</div>
            <div className="s-val" style={{ color:c.color }}>{c.val ?? '—'}</div>
            <div className="s-sub">metros totales</div>
            {c.ult && <div style={{ fontSize:10, color:'var(--mut)', marginTop:4 }}>📅 {fmtFecha(c.ult)}</div>}
          </div>
        ))}
      </div>

      {/* Programado vs Ejecutado */}
      <div className="ch-card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexWrap:'wrap', gap:8 }}>
          <div className="ch-title" style={{ margin:0 }}>📈 Perforación Programada vs Perforación Ejecutada</div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button
              className={`btn btn-sm ${showIdeal ? 'btn-grn' : 'btn-out'}`}
              onClick={() => setShowIdeal(v => !v)}
              title="Mostrar/ocultar línea ideal (35m/día × máquinas)"
            >
              {showIdeal ? '📐 Ideal ON' : '📐 Ideal OFF'}
            </button>
            <button className="btn btn-grn btn-sm" onClick={downloadAcumCSV}>⬇ CSV</button>
          </div>
        </div>
        <div style={{ height:300 }}><canvas ref={crAcum} /></div>
      </div>

      {/* Avance de Perforación Diaria — componente con scroll */}
      <div className="ch-card" style={{ marginBottom:16 }}>
        <div className="ch-title">⛏ Avance de Perforación Diaria</div>
        <DiaChart perfDia={perfDia} />
      </div>

      {/* Gráficos por máquina */}
      {maquinaGrupos.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
            🔧 Perforación por máquina
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:14 }}>
            {maquinaGrupos.map(g => (
              <MaquinaChart
                key={`${g.equipo}||${g.ddhid}`}
                equipo={g.equipo}
                ddhid={g.ddhid}
                datos={g.datos}
                completado={g.completado}
                programado={g.programado}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gráfico metros por sondaje */}
      <div className="ch-card" style={{ marginBottom:16 }}>
        <div className="ch-title">📊 Avance por Sondaje</div>
        <div ref={sondajWrap} style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <div style={{ width:sondajCanvasW, height:280 }}>
            <canvas ref={crSondaj} width={sondajCanvasW} height={280} />
          </div>
        </div>
      </div>

      {/* Tabla resumen */}
      {porSondaje.length > 0 && (
        <div className="t-wrap">
          <div className="t-top"><span className="t-title">Resumen completo por sondaje</span></div>
          <div className="ox">
            <table className="tbl">
              <thead>
                <tr>{['#','DDHID','Estado','Prog.(m)','Perf.(m)','Recep.(m)','Recup.(m)','Foto.(m)','Geotéc.(m)','Geológ.(m)','%'].map(c=><th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {porSondaje.map((r,i)=>(
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
