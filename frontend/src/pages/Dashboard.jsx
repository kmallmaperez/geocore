import React, { useEffect, useRef, useState } from 'react'
import { Chart, BarElement, BarController, CategoryScale, LinearScale, ArcElement, DoughnutController, Tooltip, Legend } from 'chart.js'
import { useAuth } from '../context/AuthContext'
import { statCls, today, fmtFecha } from '../utils/tableDefs'
import api from '../utils/api'

Chart.register(BarElement, BarController, CategoryScale, LinearScale, ArcElement, DoughnutController, Tooltip, Legend)

export default function Dashboard() {
  const { user } = useAuth()
  const [resumen,  setResumen]  = useState([])
  const [perfDia,  setPerfDia]  = useState([]) // perforacion por fecha
  const [stats,    setStats]    = useState({
    sondajes: 0, metrosPerf: 0,
    metosRecep: 0, totalGeoTec: 0, totalGeoLog: 0, completados: 0
  })
  const crAvance = useRef(null), crDia = useRef(null), crEstado = useRef(null)
  const ciAvance = useRef(null), ciDia = useRef(null), ciEstado = useRef(null)

  useEffect(() => {
    // Resumen general
    api.get('/tables/resumen/general').then(r => setResumen(r.data)).catch(() => {})

    // Cards: perforación total
    api.get('/tables/perforacion').then(r => {
      const rows = r.data
      const tot = rows.reduce((s, x) => s + (parseFloat(x.Total_Dia) || 0), 0)
      setStats(p => ({ ...p, metrosPerf: tot.toFixed(1) }))

      // Agrupar por fecha para gráfico de avance diario
      const byDate = {}
      rows.forEach(x => {
        const f = x.Fecha ? String(x.Fecha).slice(0,10) : null
        if (!f) return
        if (!byDate[f]) byDate[f] = { dia: 0, noche: 0 }
        byDate[f].dia   += parseFloat(x.Turno_Dia)   || 0
        byDate[f].noche += parseFloat(x.Turno_Noche) || 0
      })
      // Últimos 14 días con data
      const sorted = Object.entries(byDate)
        .sort(([a],[b]) => a.localeCompare(b))
        .slice(-14)
      setPerfDia(sorted)
    }).catch(() => {})

    // Cards: recepción
    api.get('/tables/recepcion').then(r => {
      const tot = r.data.reduce((s, x) => s + (parseFloat(x.Metros) || 0), 0)
      setStats(p => ({ ...p, metosRecep: tot.toFixed(1) }))
    }).catch(() => {})

    // Cards: geotécnico (count de registros)
    api.get('/tables/l_geotecnico').then(r => {
      setStats(p => ({ ...p, totalGeoTec: r.data.length }))
    }).catch(() => {})

    // Cards: geológico (count de registros)
    api.get('/tables/l_geologico').then(r => {
      setStats(p => ({ ...p, totalGeoLog: r.data.length }))
    }).catch(() => {})

    // Sondajes programados
    api.get('/tables/programa_general').then(r => {
      setStats(p => ({ ...p, sondajes: r.data.length }))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setStats(p => ({ ...p, completados: resumen.filter(r => r.ESTADO === 'Completado').length }))
  }, [resumen])

  // Gráfico 1: Avance por Sondaje (Programado vs Ejecutado)
  useEffect(() => {
    if (!crAvance.current || !resumen.length) return
    if (ciAvance.current) ciAvance.current.destroy()
    const filtered = resumen.filter(r => r.DDHID)
    ciAvance.current = new Chart(crAvance.current, {
      type: 'bar',
      data: {
        labels: filtered.map(r => r.DDHID),
        datasets: [
          { label: 'Programado', data: filtered.map(r => r.PROGRAMADO || 0), backgroundColor: 'rgba(59,130,246,.4)', borderColor: '#3b82f6', borderWidth: 1 },
          { label: 'Ejecutado',  data: filtered.map(r => r.EJECUTADO  || 0), backgroundColor: 'rgba(16,185,129,.4)', borderColor: '#10b981', borderWidth: 1 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } } },
          y: { ticks: { color: '#64748b' }, title: { display: true, text: 'metros', color: '#64748b', font: { size: 10 } } }
        }
      }
    })
  }, [resumen])

  // Gráfico 2: Avance diario (Turno Día vs Turno Noche) — últimos 14 días
  useEffect(() => {
    if (!crDia.current || !perfDia.length) return
    if (ciDia.current) ciDia.current.destroy()
    ciDia.current = new Chart(crDia.current, {
      type: 'bar',
      data: {
        labels: perfDia.map(([f]) => fmtFecha(f)),
        datasets: [
          {
            label: '☀ Turno Día',
            data: perfDia.map(([,v]) => parseFloat(v.dia.toFixed(2))),
            backgroundColor: 'rgba(245,158,11,.55)',
            borderColor: '#f59e0b',
            borderWidth: 1,
          },
          {
            label: '🌙 Turno Noche',
            data: perfDia.map(([,v]) => parseFloat(v.noche.toFixed(2))),
            backgroundColor: 'rgba(99,102,241,.55)',
            borderColor: '#6366f1',
            borderWidth: 1,
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              footer: (items) => {
                const total = items.reduce((s, i) => s + i.parsed.y, 0)
                return `Total día: ${total.toFixed(2)} m`
              }
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { stacked: true, ticks: { color: '#64748b' }, title: { display: true, text: 'metros', color: '#64748b', font: { size: 10 } } }
        }
      }
    })
  }, [perfDia])

  // Gráfico 3: Estado de Sondajes (donut)
  useEffect(() => {
    if (!crEstado.current || !resumen.length) return
    if (ciEstado.current) ciEstado.current.destroy()
    const est = ['Completado', 'En Proceso', 'Pendiente']
    ciEstado.current = new Chart(crEstado.current, {
      type: 'doughnut',
      data: {
        labels: est,
        datasets: [{ data: est.map(s => resumen.filter(r => r.ESTADO === s).length), backgroundColor: ['#10b981','#f59e0b','#475569'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } } }
    })
  }, [resumen])

  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-desc">Bienvenido, {user.name} — {fmtFecha(today())}</div>

      {/* 4 Cards */}
      <div className="c-grid">
        <div className="s-card">
          <div className="s-lbl">Perf. Total</div>
          <div className="s-val" style={{ color:'var(--grn)' }}>{stats.metrosPerf}</div>
          <div className="s-sub">metros perforados</div>
        </div>
        <div className="s-card">
          <div className="s-lbl">Recepción Total</div>
          <div className="s-val" style={{ color:'var(--blu)' }}>{stats.metosRecep}</div>
          <div className="s-sub">metros recibidos</div>
        </div>
        <div className="s-card">
          <div className="s-lbl">Log. Geotécnico</div>
          <div className="s-val" style={{ color:'var(--acc)' }}>{stats.totalGeoTec}</div>
          <div className="s-sub">registros</div>
        </div>
        <div className="s-card">
          <div className="s-lbl">Log. Geológico</div>
          <div className="s-val" style={{ color:'var(--red)' }}>{stats.totalGeoLog}</div>
          <div className="s-sub">registros</div>
        </div>
      </div>

      {/* 3 Gráficos */}
      <div className="ch-grid">
        <div className="ch-card" style={{ gridColumn: 'span 2' }}>
          <div className="ch-title">⛏ Avance diario por turno (últimos 14 días)</div>
          <div style={{ height: 220 }}><canvas ref={crDia} /></div>
        </div>
        <div className="ch-card">
          <div className="ch-title">📊 Avance por Sondaje (m)</div>
          <div style={{ height: 220 }}><canvas ref={crAvance} /></div>
        </div>
        <div className="ch-card">
          <div className="ch-title">📋 Estado de Sondajes</div>
          <div style={{ height: 220 }}><canvas ref={crEstado} /></div>
        </div>
      </div>

      {/* Tabla de progreso */}
      {user.role !== 'USER' && (
        <div className="t-wrap">
          <div className="t-top"><span className="t-title">Progreso de Sondajes</span></div>
          <div className="ox">
            <table className="tbl">
              <thead>
                <tr>{['DDHID','Plataforma','Programado','Ejecutado','Estado','Progreso'].map(c => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {resumen.filter(r => r.DDHID).map(r => (
                  <tr key={r.DDHID}>
                    <td><strong>{r.DDHID}</strong></td>
                    <td>{r.PLATAFORMA}</td>
                    <td>{r.PROGRAMADO}m</td>
                    <td>{r.EJECUTADO}m</td>
                    <td><span className={`bdg ${statCls(r.ESTADO)}`}>{r.ESTADO}</span></td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div className="p-bar"><div className="p-fill" style={{ width: Math.min(r.PCT,100)+'%' }} /></div>
                        <span style={{ fontSize:11, color:'var(--mut)', minWidth:32 }}>{r.PCT}%</span>
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
