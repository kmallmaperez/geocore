import React, { useState } from 'react'
import api from '../utils/api'
import Toast, { useToast } from '../components/Toast'

const TABLA_LABELS = {
  resumen_general:  'Resumen General',
  programa_general: 'Programa General',
  perforacion:      'Perforación',
  recepcion:        'Recepción',
  recuperacion:     'Recuperación',
  fotografia:       'Fotografía',
  l_geotecnico:     'L_Geotécnico',
  l_geologico:      'L_Geológico',
  muestreo:         'Muestreo',
  corte:            'Corte',
  envios:           'Envíos',
  batch:            'Batch',
  tormentas:        'Tormentas',
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function formatVal(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Fechas ISO YYYY-MM-DD → DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
  }
  return v
}

export default function ExportPage() {
  const { toast, show } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingTable, setLoadingTable] = useState(null)

  async function exportAll() {
    setLoading(true)
    try {
      const XLSX = await loadXLSX()
      // Obtener todas las tablas + resumen (secuencial para mejor manejo de errores)
      const allData = await api.get('/export/all').then(r => r.data)
      const resumenData = await api.get('/export/resumen').then(r => r.data)

      const wb = XLSX.utils.book_new()

      // Primera hoja: Resumen General
      const wsResumen = XLSX.utils.aoa_to_sheet([
        resumenData.cols,
        ...resumenData.rows.map(row => resumenData.cols.map(c => formatVal(row[c])))
      ])
      wsResumen['!cols'] = resumenData.cols.map(c => ({ wch: Math.max(c.length, 14) }))
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen General')

      // Resto de tablas
      for (const [tkey, { cols, rows }] of Object.entries(allData)) {
        const sheetName = (TABLA_LABELS[tkey] || tkey).slice(0, 31)
        const wsData = [cols, ...rows.map(row => cols.map(c => formatVal(row[c])))]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws['!cols'] = cols.map(c => ({ wch: Math.max(c.length, 12) }))
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      }

      XLSX.writeFile(wb, `GeoCore_${new Date().toISOString().slice(0,10)}.xlsx`)
      show('Excel exportado con todas las tablas ✓', 'ok')
    } catch (err) {
      show('Error al exportar: ' + err.message, 'err')
    } finally {
      setLoading(false)
    }
  }

  async function exportOne(tkey) {
    setLoadingTable(tkey)
    try {
      const endpoint = tkey === 'resumen_general' ? '/export/resumen' : `/export/${tkey}`
      const { data } = await api.get(endpoint)
      const { cols, rows } = data

      const bom = '\uFEFF'
      const lines = [
        cols.join(','),
        ...rows.map(row => cols.map(c => {
          const v = String(formatVal(row[c]))
          return v.includes(',') || v.includes('"') || v.includes('\n')
            ? `"${v.replace(/"/g, '""')}"` : v
        }).join(','))
      ]
      const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${TABLA_LABELS[tkey] || tkey}_${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      show(`${TABLA_LABELS[tkey]} exportado ✓`, 'ok')
    } catch (err) {
      show('Error: ' + err.message, 'err')
    } finally {
      setLoadingTable(null)
    }
  }

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />
      <div className="page-title">Exportar Datos</div>
      <div className="page-desc">Descarga los datos en Excel o CSV con acentos correctos</div>

      {/* Excel completo */}
      <div className="f-card" style={{ marginBottom:24 }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>📊 Todo en un Excel</div>
        <div style={{ color:'var(--mut)', fontSize:13, marginBottom:14 }}>
          Incluye Resumen General + las 12 tablas, cada una en su propia hoja.
        </div>
        <button className="btn btn-acc"
          style={{ width:'100%', padding:'13px', fontSize:14, borderRadius:10, justifyContent:'center' }}
          onClick={exportAll} disabled={loading}>
          {loading ? '⏳ Generando...' : '⬇ Descargar Excel completo (.xlsx)'}
        </button>
      </div>

      {/* Por tabla */}
      <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'.05em' }}>
        O exportar por tabla (CSV):
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {Object.entries(TABLA_LABELS).map(([tkey, label]) => (
          <div key={tkey} className="f-card"
            style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <span style={{ fontSize:14 }}>
              {tkey === 'resumen_general' ? '📋 ' : ''}{label}
            </span>
            <button className="btn btn-grn btn-sm"
              onClick={() => exportOne(tkey)}
              disabled={loadingTable === tkey}
              style={{ flexShrink:0 }}>
              {loadingTable === tkey ? '⏳' : '⬇ CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
