const express = require('express')
const db      = require('../data/db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

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

const TABLES = {
  perforacion:   ['DDHID','Fecha','From_Dia','TO_Dia','Turno_Dia','From_Noche','To_Noche','Turno_Noche','Total_Dia','Acumulado','Comentarios','Geologo'],
  recepcion:     ['Fecha','HORA','DDHID','FROM','TO','Metros','CAJAS','Geologo'],
  recuperacion:  ['Fecha','DDHID','From','To','Avance','Geologo'],
  fotografia:    ['Fecha','DDHID','From','To','Avance','N_Foto','Geologo'],
  l_geotecnico:  ['Fecha','DDHID','From','To','Avance','PLT','UCS','Geologo'],
  l_geologico:   ['Fecha','DDHID','From','To','Avance','Geologo','SG','Observaciones'],
  muestreo:      ['Fecha','DDHID','DE','HASTA','MUESTRAS','Geologo'],
  corte:         ['Fecha','DDHID','DE','A','AVANCE','CAJAS','MAQUINAS','Geologo'],
  envios:        ['Fecha','Envio_N','Total_muestras','Geologo'],
  batch:         ['Envio','Batch','Sondaje','Qty_Mina','Qty_Lab','Muestras_Dens','Cod_Cert','F_Envio','F_Solicitud','F_Resultados','Tiempo_dias','Geologo'],
  tormentas:     ['Fecha','Desde','Hasta','TOTAL','Minutos','Horas','Geologo'],
}

const SHEET_NAMES = {
  resumen_general: 'Resumen General', programa_general: 'Programa General',
  perforacion: 'Perforación',         recepcion: 'Recepción',
  recuperacion: 'Recuperación',       fotografia: 'Fotografía',
  l_geotecnico: 'L_Geotécnico',       l_geologico: 'L_Geológico',
  muestreo: 'Muestreo',               corte: 'Corte',
  envios: 'Envíos',                   batch: 'Batch',
  tormentas: 'Tormentas',
}

const HEADER_COLORS = {
  resumen_general: '1E3A5F',  programa_general: '1E3A5F',
  perforacion: '10B981',      recepcion: '3B82F6',
  recuperacion: 'A855F7',     fotografia: 'F59E0B',
  l_geotecnico: 'EF4444',     l_geologico: '14B8A6',
  muestreo: '8B5CF6',         corte: 'F97316',
  envios: '06B6D4',           batch: '84CC16',
  tormentas: '6366F1',
}

const DARK_BG = new Set(['1E3A5F','10B981','3B82F6','A855F7','EF4444','14B8A6','8B5CF6','F97316','06B6D4','6366F1'])

// Convierte cualquier valor de fecha a string DD/MM/YYYY
function fmtDate(val) {
  if (!val) return ''
  // PostgreSQL devuelve objetos Date — extraer con UTC para evitar timezone
  if (val instanceof Date) {
    const d = String(val.getUTCDate()).padStart(2,'0')
    const m = String(val.getUTCMonth()+1).padStart(2,'0')
    const y = val.getUTCFullYear()
    return `${d}/${m}/${y}`
  }
  // String ISO YYYY-MM-DD
  const s = String(val).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return String(val)
  const [yr, mo, dy] = s.split('-')
  return `${dy}/${mo}/${yr}`
}

function cellValue(col, val) {
  if (val === null || val === undefined) return ''
  if (DATE_COLS.has(col)) return fmtDate(val)
  if (NUM_COLS.has(col)) {
    const n = parseFloat(val)
    return isNaN(n) ? (val !== '' ? String(val) : '') : n
  }
  return String(val)
}

async function buildSheet(ExcelJS, wb, tkey, cols, rows) {
  const bgHex  = HEADER_COLORS[tkey] || '334155'
  const fgHex  = DARK_BG.has(bgHex) ? 'FFFFFF' : '000000'
  const ws     = wb.addWorksheet(SHEET_NAMES[tkey] || tkey)

  // ── Cabecera ─────────────────────────────────────────────────
  ws.addRow(cols)
  const hdr = ws.getRow(1)
  hdr.height = 22
  hdr.eachCell(cell => {
    cell.value     = cell.value  // keep
    cell.font      = { bold: true, color: { argb: 'FF' + fgHex }, name: 'Arial', size: 10 }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF000000' } } }
  })

  // ── Filas de datos ────────────────────────────────────────────
  rows.forEach((row, ri) => {
    const values  = cols.map(col => cellValue(col, row[col]))
    const dataRow = ws.addRow(values)
    const zebraFg = ri % 2 === 0 ? 'FFF1F5F9' : 'FFFFFFFF'

    dataRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      const col = cols[ci - 1]
      const val = cell.value

      // Formato numérico para números reales
      if (NUM_COLS.has(col) && typeof val === 'number') {
        cell.numFmt    = '#,##0.00'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
      }

      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraFg } }
      cell.font   = { name: 'Arial', size: 10 }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right:  { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
    })
  })

  // ── Autofilter (sin addTable para evitar errores XML) ─────────
  if (rows.length > 0) {
    const lastColLetter = ws.getColumn(cols.length).letter
    const filterRef = `A1:${lastColLetter}1`
    ws.autoFilter = filterRef
  }

  // ── Ancho de columnas ─────────────────────────────────────────
  cols.forEach((col, i) => {
    const maxData = rows.reduce((mx, row) => {
      const v = cellValue(col, row[col])
      return Math.max(mx, String(v).length)
    }, col.length)
    ws.getColumn(i + 1).width = Math.min(Math.max(maxData + 2, 10), 40)
  })

  // Congelar fila de cabecera
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

// GET /api/excel/download
router.get('/download', authMiddleware, async (req, res) => {
  try {
    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'GeoCore'
    wb.created = new Date()

    // 1. Resumen General
    const pg      = await db.query('SELECT * FROM programa_general')
    const perfSum = await db.query('SELECT "DDHID", SUM("Total_Dia") as ejecutado FROM perforacion GROUP BY "DDHID"')
    const perfMap = {}
    perfSum.rows.forEach(r => { perfMap[r.DDHID] = parseFloat(r.ejecutado) || 0 })
    const resumenRows = pg.rows.map(p => {
      const ej    = perfMap[p.DDHID] || 0
      const pct   = p.LENGTH > 0 ? Math.round(ej / p.LENGTH * 100) : 0
      const estado = pct >= 100 ? 'Completado' : ej > 0 ? 'En Proceso' : 'Pendiente'
      return { DDHID: p.DDHID, EQUIPO: p.EQUIPO||'', PLATAFORMA: p.PLATAFORMA, PROGRAMADO: parseFloat(p.LENGTH||0), EJECUTADO: parseFloat(ej.toFixed(1)), ESTADO: estado, PCT: pct }
    })
    await buildSheet(ExcelJS, wb, 'resumen_general',
      ['DDHID','EQUIPO','PLATAFORMA','PROGRAMADO','EJECUTADO','ESTADO','PCT'], resumenRows)

    // 2. Programa General
    const pgRows = await db.query('SELECT * FROM programa_general ORDER BY id')
    await buildSheet(ExcelJS, wb, 'programa_general',
      ['PLATAFORMA','DDHID','EQUIPO','ESTE','NORTE','ELEV','LENGTH'], pgRows.rows)

    // 3. Resto de tablas
    for (const [tkey, cols] of Object.entries(TABLES)) {
      const r = await db.query(`SELECT * FROM ${tkey} ORDER BY id`)
      await buildSheet(ExcelJS, wb, tkey, cols, r.rows)
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="GeoCore_${new Date().toISOString().slice(0,10)}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Excel error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
