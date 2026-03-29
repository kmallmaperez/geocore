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
  'RECEPCION','RECUPERADO','FOTOGRAFIADO','GEOTECNICO','GEOLOGICO',
])

const DATE_COLS = new Set([
  'Fecha','F_Envio','F_Solicitud','F_Resultados','FECHA_INICIO','FECHA_FIN',
  'Desde','Hasta','created_at',
])

const TABLES = {
  perforacion:   ['DDHID','EQUIPO','Fecha','From_Dia','TO_Dia','Turno_Dia','From_Noche','To_Noche','Turno_Noche','Total_Dia','Acumulado','Comentarios','Geologo'],
  recepcion:     ['Fecha','HORA','DDHID','FROM','TO','Metros','CAJAS','Geologo'],
  recuperacion:  ['Fecha','DDHID','From','To','Avance','Geologo'],
  fotografia:    ['Fecha','DDHID','From','To','Avance','N_Foto','Geologo'],
  l_geotecnico:  ['Fecha','DDHID','From','To','Avance','PLT','UCS','Geologo'],
  l_geologico:   ['Fecha','DDHID','From','To','Avance','Geologo','SG','Observaciones'],
  muestreo:      ['Fecha','DDHID','BATCH','DE','HASTA','MUESTRAS','Geologo'],
  corte:         ['Fecha','DDHID','DE','A','AVANCE','CAJAS','MAQUINA','Observaciones','Geologo'],
  envios:        ['Fecha','Envio_N','Total_muestras','Geologo'],
  batch:         ['Envio','Batch','Sondaje','Qty_Mina','Qty_Lab','Muestras_Dens','Cod_Cert','F_Envio','F_Solicitud','F_Resultados','Tiempo_dias','Geologo'],
  tormentas:     ['Fecha','Desde','Hasta','TOTAL','Minutos','Horas','Geologo'],
}

const SHEET_NAMES = {
  resumen_dashboard: 'Resumen de Avances', resumen_general: 'Resumen de Sondajes y Plataforma', programa_general: 'Programa General',
  perforacion: 'Perforación',         perf_equipo: 'Perforación por Equipo', recepcion: 'Recepción',
  recuperacion: 'Recuperación',       fotografia: 'Fotografía',
  l_geotecnico: 'L_Geotécnico',       l_geologico: 'L_Geológico',
  muestreo: 'Muestreo',               corte: 'Corte',
  envios: 'Envíos',                   batch: 'Batch',
  tormentas: 'Tormentas',
}

const HEADER_COLORS = {
  resumen_dashboard: '0F4C81', resumen_general: '1E3A5F',  programa_general: '1E3A5F',
  perforacion: '10B981',      perf_equipo: '10B981', recepcion: '3B82F6',
  recuperacion: 'A855F7',     fotografia: 'F59E0B',
  l_geotecnico: 'EF4444',     l_geologico: '14B8A6',
  muestreo: '8B5CF6',         corte: 'F97316',
  envios: '06B6D4',           batch: '84CC16',
  tormentas: '6366F1',
}

const DARK_BG = new Set(['0F4C81','1E3A5F','10B981','3B82F6','A855F7','EF4444','14B8A6','8B5CF6','F97316','06B6D4','6366F1'])

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

    // ── Datos base ──────────────────────────────────────────────
    const pg      = await db.query('SELECT * FROM programa_general ORDER BY id')
    const perfSum = await db.query('SELECT "DDHID", SUM("Total_Dia") AS ejecutado FROM perforacion GROUP BY "DDHID"')
    const recepQ  = await db.query(`SELECT "DDHID", MAX(NULLIF(TRIM("TO"::text),'')::numeric) AS max_to FROM recepcion   GROUP BY "DDHID"`)
    const recupQ  = await db.query(`SELECT "DDHID", MAX(NULLIF(TRIM("To"::text),'')::numeric) AS max_to FROM recuperacion GROUP BY "DDHID"`)
    const fotoQ   = await db.query(`SELECT "DDHID", MAX(NULLIF(TRIM("To"::text),'')::numeric) AS max_to FROM fotografia   GROUP BY "DDHID"`)
    const geotQ   = await db.query(`SELECT "DDHID", MAX(NULLIF(TRIM("To"::text),'')::numeric) AS max_to FROM l_geotecnico GROUP BY "DDHID"`)
    const geolQ   = await db.query(`SELECT "DDHID", MAX(NULLIF(TRIM("To"::text),'')::numeric) AS max_to FROM l_geologico  GROUP BY "DDHID"`)
    const ovQ     = await db.query('SELECT ddhid, estado FROM estado_overrides')

    // Plataforma info
    let platRows = []
    try { const pr = await db.query('SELECT * FROM plataforma_info'); platRows = pr.rows } catch(_) {}

    const perfMap  = {}; perfSum.rows.forEach(r => { perfMap[r.DDHID]  = parseFloat(r.ejecutado)||0 })
    const recepMap = {}; recepQ.rows.forEach(r  => { recepMap[r.DDHID] = parseFloat(r.max_to)||0 })
    const recupMap = {}; recupQ.rows.forEach(r  => { recupMap[r.DDHID] = parseFloat(r.max_to)||0 })
    const fotoMap  = {}; fotoQ.rows.forEach(r   => { fotoMap[r.DDHID]  = parseFloat(r.max_to)||0 })
    const geotMap  = {}; geotQ.rows.forEach(r   => { geotMap[r.DDHID]  = parseFloat(r.max_to)||0 })
    const geolMap  = {}; geolQ.rows.forEach(r   => { geolMap[r.DDHID]  = parseFloat(r.max_to)||0 })
    const ovMap    = {}; ovQ.rows.forEach(r     => { ovMap[r.ddhid]    = r.estado })
    const platMap  = {}
    platRows.forEach(r => {
      if (r.DDHID)      platMap[r.DDHID] = r
      if (r.PLATAFORMA && !r.DDHID) platMap['__PLAT__' + String(r.PLATAFORMA).trim()] = r
    })

    function buildResumenRow(p) {
      const ej     = perfMap[p.DDHID] || 0
      const pct    = p.LENGTH > 0 ? Math.round(ej / p.LENGTH * 100) : 0
      const eCalc  = pct >= 100 ? 'Completado' : ej > 0 ? 'En Proceso' : 'Pendiente'
      const estado = ovMap[p.DDHID] || eCalc
      const plat   = platMap[p.DDHID] || platMap['__PLAT__' + String(p.PLATAFORMA||'').trim()] || {}
      return {
        DDHID:        p.DDHID || '',
        EQUIPO:       p.EQUIPO || '',
        PLATAFORMA:   p.PLATAFORMA || '',
        PROGRAMADO:   parseFloat(p.LENGTH || 0),
        EJECUTADO:    parseFloat(ej.toFixed(1)),
        RECEPCION:    recepMap[p.DDHID] || 0,
        RECUPERADO:   recupMap[p.DDHID] || 0,
        FOTOGRAFIADO: fotoMap[p.DDHID]  || 0,
        GEOTECNICO:   geotMap[p.DDHID]  || 0,
        GEOLOGICO:    geolMap[p.DDHID]  || 0,
        ESTADO:       estado,
        PCT:          pct,
        FECHA_ENTREGA_PLAT:  plat.fecha_entrega_plataforma    || '',
        FECHA_PREINICIO:     plat.fecha_preinicio_perforacion  || '',
        FECHA_CIERRE_PLAT:   plat.fecha_cierre_plataforma      || '',
        STATUS_PLATAFORMA:   plat.status_plataforma            || '',
        FORMATO_CHECKLIST:   plat.formato_checklist            || '',
        ENTREGADO_POR:       plat.entregado_por                || '',
      }
    }

    const allResumen = pg.rows
      .filter(p => {
        const tieneDDHID = p.DDHID && String(p.DDHID).trim() !== ''
        const platKey    = '__PLAT__' + String(p.PLATAFORMA||'').trim()
        const platInfo   = platMap[p.DDHID] || platMap[platKey] || {}
        const tienePlat  = platInfo.status_plataforma || platInfo.fecha_entrega_plataforma || platInfo.entregado_por
        return tieneDDHID || tienePlat
      })
      .map(buildResumenRow)

    // ── HOJA 1: Resumen de Avances — solo sondajes con DDHID ──────
    const dashCols = ['DDHID','EQUIPO','PLATAFORMA','ESTADO','PROGRAMADO','EJECUTADO',
                      'RECEPCION','RECUPERADO','FOTOGRAFIADO','GEOTECNICO','GEOLOGICO','PCT']
    const dashRows = allResumen.filter(r => r.DDHID && String(r.DDHID).trim() !== '')
    await buildSheet(ExcelJS, wb, 'resumen_dashboard', dashCols, dashRows)

    // ── HOJA 2: Resumen General (con campos plataforma) ─────────
    const resCols = ['DDHID','EQUIPO','PLATAFORMA','PROGRAMADO','EJECUTADO','ESTADO','PCT',
                     'FECHA_ENTREGA_PLAT','FECHA_PREINICIO','FECHA_CIERRE_PLAT',
                     'STATUS_PLATAFORMA','FORMATO_CHECKLIST','ENTREGADO_POR']
    // Agregar fechas al DATE_COLS para formato correcto
    const extraDateCols = new Set(['FECHA_ENTREGA_PLAT','FECHA_PREINICIO','FECHA_CIERRE_PLAT'])
    const origDateCols = [...DATE_COLS]
    extraDateCols.forEach(c => DATE_COLS.add(c))
    await buildSheet(ExcelJS, wb, 'resumen_general', resCols, allResumen)
    // Restaurar DATE_COLS
    DATE_COLS.clear(); origDateCols.forEach(c => DATE_COLS.add(c))

    // ── HOJA 3: Programa General ────────────────────────────────
    await buildSheet(ExcelJS, wb, 'programa_general',
      ['PLATAFORMA','DDHID','EQUIPO','ESTE','NORTE','ELEV','LENGTH'], pg.rows)

    // Build EQUIPO map from programa_general for perforacion enrichment
    const pgEqRows = await db.query('SELECT "DDHID", "EQUIPO" FROM programa_general')
    const pgEqMap = {}
    pgEqRows.rows.forEach(r => { if (r.DDHID) pgEqMap[String(r.DDHID).trim()] = String(r.EQUIPO||'').trim() })

    // ── HOJAS 4+: Resto de tablas ───────────────────────────────
    for (const [tkey, cols] of Object.entries(TABLES)) {
      const r = await db.query(`SELECT * FROM ${tkey} ORDER BY id`)
      // Enrich perforacion rows with EQUIPO
      let sheetRows = r.rows
      if (tkey === 'perforacion') {
        sheetRows = r.rows.map(row => ({
          ...row,
          EQUIPO: pgEqMap[String(row.DDHID||'').trim()] || ''
        }))
      }
      await buildSheet(ExcelJS, wb, tkey, cols, sheetRows)

      // ── Hoja "Perforación por Equipo" inmediatamente después de Perforación ──
      if (tkey === 'perforacion') {
        const EQUIPOS = ['HYDX-5A-05','HYDX-5A-06','HYDX-5A-07','YN-1500','XZCR-N18A']

        // Agrupar Total_Dia por fecha y equipo
        const equipoMap = pgEqMap  // reuse the map built above
        const perfRows = sheetRows
        const porFechaEquipo = {}   // { 'YYYY-MM-DD': { 'HYDX-5A-05': X, ... } }

        perfRows.forEach(row => {
          // Resolver fecha
          let fecha = ''
          if (row.Fecha instanceof Date) {
            const d = row.Fecha
            fecha = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
          } else {
            fecha = String(row.Fecha || '').slice(0,10)
          }
          if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return

          const ddhidKey = String(row.DDHID || '').trim()
          const equipo  = equipoMap[ddhidKey] || String(row.EQUIPO || '').trim()
          const total   = parseFloat(row.Total_Dia) || 0

          if (!porFechaEquipo[fecha]) porFechaEquipo[fecha] = {}
          // Sumar por equipo en esa fecha (puede haber varios registros)
          porFechaEquipo[fecha][equipo] = (porFechaEquipo[fecha][equipo] || 0) + total
        })

        // Generar rango de fechas correlativo (sin huecos)
        const fechas = Object.keys(porFechaEquipo).sort()
        if (fechas.length === 0) continue

        const fechaInicio = new Date(fechas[0])
        const fechaFin    = new Date(fechas[fechas.length - 1])
        const allFechas   = []
        for (let d = new Date(fechaInicio); d <= fechaFin; d.setUTCDate(d.getUTCDate() + 1)) {
          const y = d.getUTCFullYear()
          const m = String(d.getUTCMonth()+1).padStart(2,'0')
          const day = String(d.getUTCDate()).padStart(2,'0')
          allFechas.push(`${y}-${m}-${day}`)
        }

        // Construir filas para buildSheet
        const equipoRows = allFechas.map(fecha => {
          const dData = porFechaEquipo[fecha] || {}
          const vals  = {}
          vals.Fecha  = fecha
          let total = 0
          EQUIPOS.forEach(eq => {
            const v = parseFloat((dData[eq] || 0).toFixed(2))
            vals[eq] = v
            total += v
          })
          vals['TOTAL DIA'] = parseFloat(total.toFixed(2))
          return vals
        })

        const equipoCols = ['Fecha', ...EQUIPOS, 'TOTAL DIA']
        // Build perf_equipo sheet manually to ensure numeric format for equipo columns
        {
          const bgHex = 'B4D4FF'  // light blue header
          const ws2 = wb.addWorksheet('Perforación por Equipo')
          ws2.addRow(equipoCols)
          const hdr2 = ws2.getRow(1)
          hdr2.height = 22
          hdr2.eachCell(cell => {
            cell.font      = { bold:true, color:{argb:'FF1E3A5F'}, name:'Arial', size:10 }
            cell.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:'FF' + bgHex} }
            cell.alignment = { horizontal:'center', vertical:'middle' }
            cell.border    = { bottom:{ style:'medium', color:{argb:'FF000000'} } }
          })
          equipoRows.forEach((row, ri) => {
            const vals = equipoCols.map(col => {
              if (col === 'Fecha') return row[col] || ''
              return typeof row[col] === 'number' ? row[col] : (parseFloat(row[col]) || 0)
            })
            const dr = ws2.addRow(vals)
            const zebraFg = ri % 2 === 0 ? 'FFF1F5F9' : 'FFFFFFFF'
            dr.eachCell({ includeEmpty:true }, (cell, ci) => {
              const col = equipoCols[ci-1]
              cell.fill   = { type:'pattern', pattern:'solid', fgColor:{ argb:zebraFg } }
              cell.font   = { name:'Arial', size:10 }
              cell.border = { bottom:{ style:'thin', color:{argb:'FFCBD5E1'} }, right:{ style:'thin', color:{argb:'FFCBD5E1'} } }
              if (col !== 'Fecha') {
                cell.numFmt    = '#,##0.00'
                cell.alignment = { horizontal:'right', vertical:'middle' }
              } else {
                cell.alignment = { horizontal:'left', vertical:'middle' }
              }
            })
          })
          if (equipoRows.length > 0) {
            ws2.autoFilter = `A1:${ws2.getColumn(equipoCols.length).letter}1`
          }
          equipoCols.forEach((col, i) => {
            const maxLen = equipoRows.reduce((mx, row) => Math.max(mx, String(row[col]||'').length), col.length)
            ws2.getColumn(i+1).width = Math.min(Math.max(maxLen+2, 10), 20)
          })
          ws2.views = [{ state:'frozen', ySplit:1 }]
        }
      }
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
