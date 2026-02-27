import React, { useState } from 'react'
import { DEFS } from '../utils/tableDefs'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'

export default function ExportPage() {
  const { toast, show } = useToast()
  const [loading, setLoading] = useState(false)

  async function exportTable(tkey) {
    try {
      const r = await api.get(tkey === 'resumen' ? '/tables/resumen/general' : `/tables/${tkey}`)
      const data = r.data
      if (!data.length) { show('Sin datos en esta tabla', 'warn'); return }
      const cols = tkey === 'resumen'
        ? ['DDHID','EQUIPO','PLATAFORMA','PROGRAMADO','EJECUTADO','ESTADO','FECHA_INICIO','FECHA_FIN']
        : DEFS[tkey].cols
      const lines = [cols.join(','), ...data.map(row => cols.map(c => `"${row[c] ?? ''}"`).join(','))]
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
      a.download = `${tkey}.csv`; a.click()
      show(`${DEFS[tkey]?.label || 'Resumen'} exportado ✓`)
    } catch { show('Error al exportar', 'err') }
  }

  async function exportAll() {
    setLoading(true)
    try {
      let csv = 'GeoCore — Exportación Completa\n'
      const tableKeys = Object.keys(DEFS)
      for (const k of tableKeys) {
        const r = await api.get(`/tables/${k}`)
        const data = r.data
        csv += `\n\n=== ${DEFS[k].label} ===\n`
        const cols = DEFS[k].cols
        csv += cols.join(',') + '\n'
        data.forEach(row => { csv += cols.map(c => `"${row[c] ?? ''}"`).join(',') + '\n' })
      }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/plain' }))
      a.download = 'GeoCore_Exportacion_Completa.csv'; a.click()
      show('Exportación completa lista ✓')
    } catch { show('Error al exportar', 'err') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />
      <div className="page-title">Exportar Datos</div>
      <div className="page-desc">Descarga tablas en formato CSV</div>
      <div className="alert a-warn">ℹ Para producción se puede generar .xlsx con exceljs — una hoja por tabla.</div>

      <div className="f-card">
        <h3 style={{ fontFamily: 'Syne', marginBottom: 10 }}>📦 Exportación Completa</h3>
        <p style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 14 }}>Todas las tablas en un único archivo CSV separadas por sección.</p>
        <button className="btn btn-acc" onClick={exportAll} disabled={loading}>
          {loading ? 'Exportando...' : '⬇ Descargar Todo'}
        </button>
      </div>

      <div className="c-grid">
        {Object.keys(DEFS).map(k => (
          <div key={k} className="s-card">
            <div className="s-lbl">{DEFS[k].label}</div>
            <button className="btn btn-out btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={() => exportTable(k)}>
              ⬇ CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
