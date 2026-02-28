import React, { useState } from 'react'
import api from '../utils/api'
import Toast, { useToast } from '../components/Toast'

const TABLA_LABELS = {
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

// Genera un XLSX con múltiples hojas usando solo arrays (sin librería externa)
// Formato XLSX simplificado via generación de CSV con BOM UTF-8 por hoja
// Para múltiples hojas usamos la librería SheetJS (xlsx) via CDN dinámico
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
  if (v instanceof Date) return v.toLocaleDateString('es-PE')
  // Fechas en formato ISO
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return v.slice(0, 10) // YYYY-MM-DD
  }
  return v
}

export default function ExportPage() {
  const { toast, show } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingTable, setLoadingTable] = useState(null)

  // Exportar TODO en un Excel con hojas separadas
  async function exportAll() {
    setLoading(true)
    try {
      const XLSX = await loadXLSX()
      const { data } = await api.get('/export/all')
      const wb = XLSX.utils.book_new()

      for (const [tkey, { cols, rows }] of Object.entries(data)) {
        const sheetName = TABLA_LABELS[tkey] || tkey
        // Solo columnas definidas, en orden
        const wsData = [
          cols, // primera fila = encabezados
          ...rows.map(row => cols.map(c => formatVal(row[c])))
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        // Ancho automático de columnas
        ws['!cols'] = cols.map(c => ({ wch: Math.max(c.length, 12) }))
        XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
      }

      XLSX.writeFile(wb, `GeoCore_Export_${new Date().toISOString().slice(0,10)}.xlsx`)
      show('Excel exportado con todas las tablas ✓', 'ok')
    } catch (err) {
      show('Error al exportar: ' + err.message, 'err')
    } finally {
      setLoading(false)
    }
  }

  // Exportar UNA tabla como CSV con encoding UTF-8 + BOM (legible en Excel Perú)
  async function exportOne(tkey) {
    setLoadingTable(tkey)
    try {
      const { data } = await api.get(`/export/${tkey}`)
      const { cols, rows } = data
      const lines = [
        cols.join(','),
        ...rows.map(row => cols.map(c => {
          const v = formatVal(row[c])
          const s = String(v)
          // Escapar comas y comillas
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"` : s
        }).join(','))
      ]
      // BOM UTF-8 para que Excel en español lo abra correctamente
      const bom = '\uFEFF'
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
      <div className="page-desc">Descarga los datos en Excel o CSV</div>

      {/* Exportar todo */}
      <div className="f-card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>📊 Exportar todo en Excel</div>
        <div style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 14 }}>
          Un archivo .xlsx con cada tabla en una hoja separada. Los acentos y ñ se verán correctamente en Excel.
        </div>
        <button
          className="btn btn-acc"
          style={{ width: '100%', padding: '13px', fontSize: 14, borderRadius: 10, justifyContent: 'center' }}
          onClick={exportAll}
          disabled={loading}
        >
          {loading ? '⏳ Generando...' : '⬇ Descargar Excel completo (.xlsx)'}
        </button>
      </div>

      {/* Exportar por tabla */}
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--mut)' }}>
        O exportar tabla por tabla (CSV):
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(TABLA_LABELS).map(([tkey, label]) => (
          <div key={tkey} className="f-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14 }}>{label}</span>
            <button
              className="btn btn-grn btn-sm"
              onClick={() => exportOne(tkey)}
              disabled={loadingTable === tkey}
              style={{ flexShrink: 0 }}
            >
              {loadingTable === tkey ? '⏳' : '⬇ CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
