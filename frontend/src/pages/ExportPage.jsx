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

const NUM_COLS = new Set([
  'ESTE','NORTE','ELEV','LENGTH','From','To','FROM','TO','DE','HASTA','A',
  'Avance','AVANCE','Total_Dia','Turno_Dia','Turno_Noche','From_Dia','TO_Dia',
  'From_Noche','To_Noche','Acumulado','Metros','CAJAS','MUESTRAS','MAQUINAS',
  'Minutos','Horas','TOTAL','PLT','UCS','SG','N_Foto','Qty_Mina','Qty_Lab',
  'Muestras_Dens','Tiempo_dias','Envio_N','Total_muestras','PROGRAMADO','EJECUTADO','PCT',
])

const DATE_COLS = new Set([
  'Fecha','F_Envio','F_Solicitud','F_Resultados','FECHA_INICIO','FECHA_FIN',
  'Desde','Hasta','created_at',
])

const TABLE_COLORS = {
  resumen_general:  { bg: '1E3A5F', fg: 'FFFFFF' },
  programa_general: { bg: '1E3A5F', fg: 'FFFFFF' },
  perforacion:      { bg: '10B981', fg: 'FFFFFF' },
  recepcion:        { bg: '3B82F6', fg: 'FFFFFF' },
  recuperacion:     { bg: 'A855F7', fg: 'FFFFFF' },
  fotografia:       { bg: 'F59E0B', fg: '000000' },
  l_geotecnico:     { bg: 'EF4444', fg: 'FFFFFF' },
  l_geologico:      { bg: '14B8A6', fg: 'FFFFFF' },
  muestreo:         { bg: '8B5CF6', fg: 'FFFFFF' },
  corte:            { bg: 'F97316', fg: 'FFFFFF' },
  envios:           { bg: '06B6D4', fg: 'FFFFFF' },
  batch:            { bg: '84CC16', fg: '000000' },
  tormentas:        { bg: '6366F1', fg: 'FFFFFF' },
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

function isoToExcelDate(s) {
  if (!s) return null
  const str = String(s).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null
  const [y, m, d] = str.split('-').map(Number)
  const date  = new Date(Date.UTC(y, m - 1, d))
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return Math.round((date - epoch) / 86400000)
}

function makeCell(col, val) {
  if (val === null || val === undefined || val === '') return { v: '', t: 's' }

  if (DATE_COLS.has(col)) {
    const serial = isoToExcelDate(val)
    if (serial) return { v: serial, t: 'n', z: 'DD/MM/YYYY' }
    // fecha ya formateada como string
    return { v: String(val), t: 's' }
  }

  if (NUM_COLS.has(col)) {
    const n = parseFloat(val)
    if (!isNaN(n)) return { v: n, t: 'n', z: '#,##0.00' }
  }

  return { v: String(val), t: 's' }
}

function makeSheet(XLSX, tkey, cols, rows) {
  const color = TABLE_COLORS[tkey] || { bg: '334155', fg: 'FFFFFF' }
  const ws = {}
  const nRows = rows.length

  // Cabeceras fila 0
  cols.forEach((col, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: ci })
    ws[ref] = {
      v: col, t: 's',
      s: {
        font:      { bold: true, color: { rgb: color.fg }, name: 'Arial', sz: 10 },
        fill:      { fgColor: { rgb: color.bg }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: { bottom: { style: 'medium', color: { rgb: '000000' } } }
      }
    }
  })

  // Filas de datos
  rows.forEach((row, ri) => {
    cols.forEach((col, ci) => {
      const ref  = XLSX.utils.encode_cell({ r: ri + 1, c: ci })
      const cell = makeCell(col, row[col])
      cell.s = {
        font:      { name: 'Arial', sz: 10 },
        fill:      {
          fgColor:     { rgb: ri % 2 === 0 ? 'F1F5F9' : 'FFFFFF' },
          patternType: 'solid'
        },
        alignment: { vertical: 'center', horizontal: NUM_COLS.has(col) ? 'right' : 'left' },
        border: {
          bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
          right:  { style: 'thin', color: { rgb: 'CBD5E1' } },
        }
      }
      ws[ref] = cell
    })
  })

  const range = { r: 0, c: 0, e: { r: nRows, c: cols.length - 1 } }
  ws['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: nRows, c: cols.length - 1 })

  // Tabla nativa con autofilter
  ws['!autofilter'] = { ref: ws['!ref'] }
  ws['!tables'] = [{
    name:           `T_${tkey.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 25)}`,
    ref:            ws['!ref'],
    headerRowCount: 1,
    totalsRowCount: 0,
    tableStyleInfo: {
      name:              'TableStyleMedium2',
      showFirstColumn:   false,
      showLastColumn:    false,
      showRowStripes:    true,
      showColumnStripes: false,
    },
    columns: cols.map(c => ({ name: c })),
  }]

  // Ancho automático por contenido
  ws['!cols'] = cols.map(col => {
    const maxData = rows.reduce((mx, row) => {
      const len = row[col] != null ? String(row[col]).length : 0
      return Math.max(mx, len)
    }, 0)
    return { wch: Math.min(Math.max(col.length, maxData) + 2, 40) }
  })

  // Altura de cabecera
  ws['!rows'] = [{ hpt: 22 }]

  return ws
}

function formatValCSV(col, v) {
  if (v === null || v === undefined) return ''
  if (DATE_COLS.has(col)) {
    const s = String(v).slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-')
      return `${y}/${m}/${d}`
    }
  }
  return String(v)
}

export default function ExportPage() {
  const { toast, show } = useToast()
  const [loading,       setLoading]       = useState(false)
  const [loadingTable,  setLoadingTable]  = useState(null)

  async function exportAll() {
    setLoading(true)
    try {
      // El backend genera el .xlsx con ExcelJS (tablas nativas + zebra + formatos reales)
      const token   = localStorage.getItem('token') || ''
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const resp    = await fetch(`${baseURL}/excel/download`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!resp.ok) throw new Error(await resp.text())
      const blob = await resp.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = `GeoCore_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
      show('Excel exportado con formato de tabla ✓', 'ok')
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

      const bom   = '\uFEFF'
      const lines = [
        cols.join(','),
        ...rows.map(row => cols.map(c => {
          const v = String(formatValCSV(c, row[c]))
          return v.includes(',') || v.includes('"') || v.includes('\n')
            ? `"${v.replace(/"/g, '""')}"` : v
        }).join(','))
      ]
      const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = `${TABLA_LABELS[tkey] || tkey}_${new Date().toISOString().slice(0, 10)}.csv`
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
      <div className="page-desc">Descarga los datos en Excel con formato de tabla o CSV</div>

      <div className="f-card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>📊 Todo en un Excel</div>
        <div style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 14 }}>
          Incluye Resumen General + 12 tablas, cada hoja con formato de tabla nativa Excel,
          columnas numéricas alineadas a la derecha y fechas en formato DD/MM/YYYY.
        </div>
        <button className="btn btn-acc"
          style={{ width: '100%', padding: '13px', fontSize: 14, borderRadius: 10, justifyContent: 'center' }}
          onClick={exportAll} disabled={loading}>
          {loading ? '⏳ Generando...' : '⬇ Descargar Excel completo (.xlsx)'}
        </button>
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        O exportar por tabla (CSV):
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(TABLA_LABELS).map(([tkey, label]) => (
          <div key={tkey} className="f-card"
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14 }}>{tkey === 'resumen_general' ? '📋 ' : ''}{label}</span>
            <button className="btn btn-grn btn-sm"
              onClick={() => exportOne(tkey)}
              disabled={loadingTable === tkey}
              style={{ flexShrink: 0 }}>
              {loadingTable === tkey ? '⏳' : '⬇ CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
