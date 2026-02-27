import React, { useEffect, useRef, useState } from 'react'
import { Chart, BarElement, BarController, CategoryScale, LinearScale, ArcElement, DoughnutController, Tooltip, Legend } from 'chart.js'
import { useAuth } from '../context/AuthContext'
import { statCls, today } from '../utils/tableDefs'
import api from '../utils/api'

Chart.register(BarElement, BarController, CategoryScale, LinearScale, ArcElement, DoughnutController, Tooltip, Legend)

export default function Dashboard() {
  const { user } = useAuth()
  const [resumen, setResumen] = useState([])
  const [stats, setStats] = useState({ sondajes: 0, metros: 0, muestras: 0, completados: 0 })
  const cr1 = useRef(null), cr2 = useRef(null)
  const ci1 = useRef(null), ci2 = useRef(null)

  useEffect(() => {
    api.get('/tables/resumen/general').then(r => setResumen(r.data)).catch(() => {})
    api.get('/tables/programa_general').then(r => setStats(p => ({ ...p, sondajes: r.data.length }))).catch(() => {})
    api.get('/tables/perforacion').then(r => {
      const tot = r.data.reduce((s, x) => s + (parseFloat(x.Total_Dia) || 0), 0)
      setStats(p => ({ ...p, metros: tot.toFixed(1) }))
    }).catch(() => {})
    api.get('/tables/muestreo').then(r => {
      const tot = r.data.reduce((s, x) => s + (parseFloat(x.MUESTRAS) || 0), 0)
      setStats(p => ({ ...p, muestras: tot }))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setStats(p => ({ ...p, completados: resumen.filter(r => r.ESTADO === 'Completado').length }))
  }, [resumen])

  useEffect(() => {
    if (!cr1.current || !resumen.length) return
    if (ci1.current) ci1.current.destroy()
    ci1.current = new Chart(cr1.current, {
      type: 'bar',
      data: {
        labels: resumen.map(r => r.DDHID),
        datasets: [
          { label: 'Programado', data: resumen.map(r => r.PROGRAMADO || 0), backgroundColor: 'rgba(59,130,246,.35)', borderColor: '#3b82f6', borderWidth: 1 },
          { label: 'Ejecutado',  data: resumen.map(r => r.EJECUTADO  || 0), backgroundColor: 'rgba(16,185,129,.35)', borderColor: '#10b981', borderWidth: 1 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#64748b' } }, y: { ticks: { color: '#64748b' } } } }
    })
  }, [resumen])

  useEffect(() => {
    if (!cr2.current || !resumen.length) return
    if (ci2.current) ci2.current.destroy()
    const est = ['Completado', 'En Progreso', 'Pendiente']
    ci2.current = new Chart(cr2.current, {
      type: 'doughnut',
      data: {
        labels: est,
        datasets: [{ data: est.map(s => resumen.filter(r => r.ESTADO === s).length), backgroundColor: ['#10b981','#f59e0b','#475569'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    })
  }, [resumen])

  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-desc">Bienvenido, {user.name} — {today()}</div>

      <div className="c-grid">
        <div className="s-card"><div className="s-lbl">Sondajes</div><div className="s-val" style={{ color: 'var(--acc)' }}>{stats.sondajes}</div><div className="s-sub">Programados</div></div>
        <div className="s-card"><div className="s-lbl">Metros Perf.</div><div className="s-val" style={{ color: 'var(--grn)' }}>{stats.metros}</div><div className="s-sub">Acumulado</div></div>
        <div className="s-card"><div className="s-lbl">Muestras</div><div className="s-val" style={{ color: 'var(--blu)' }}>{stats.muestras}</div><div className="s-sub">Registros</div></div>
        <div className="s-card"><div className="s-lbl">Completados</div><div className="s-val" style={{ color: 'var(--red)' }}>{stats.completados}/{stats.sondajes}</div><div className="s-sub">Sondajes</div></div>
      </div>

      <div className="ch-grid">
        <div className="ch-card"><div className="ch-title">📊 Avance por Sondaje (m)</div><div style={{ height: 200 }}><canvas ref={cr1} /></div></div>
        <div className="ch-card"><div className="ch-title">📋 Estado de Sondajes</div><div style={{ height: 200 }}><canvas ref={cr2} /></div></div>
      </div>

      {user.role !== 'USER' && (
        <div className="t-wrap">
          <div className="t-top"><span className="t-title">Progreso de Sondajes</span></div>
          <div className="ox">
            <table className="tbl">
              <thead><tr>{['DDHID','Plataforma','Programado','Ejecutado','Estado','Progreso'].map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {resumen.map(r => (
                  <tr key={r.DDHID}>
                    <td><strong>{r.DDHID}</strong></td>
                    <td>{r.PLATAFORMA}</td>
                    <td>{r.PROGRAMADO}m</td>
                    <td>{r.EJECUTADO}m</td>
                    <td><span className={`bdg ${statCls(r.ESTADO)}`}>{r.ESTADO}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="p-bar"><div className="p-fill" style={{ width: Math.min(r.PCT, 100) + '%' }} /></div>
                        <span style={{ fontSize: 11, color: 'var(--mut)', minWidth: 32 }}>{r.PCT}%</span>
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
