const express = require('express')
const db      = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')
const { validateRow } = require('../middleware/validate')

const router = express.Router()

const TABLE_COLS = {
  programa_general: ['PLATAFORMA','DDHID','ESTE','NORTE','ELEV','LENGTH'],
  perforacion:      ['DDHID','Fecha','From_Dia','TO_Dia','Turno_Dia','From_Noche','To_Noche','Turno_Noche','Total_Dia','Acumulado','Comentarios','Geologo'],
  recepcion:        ['Fecha','HORA','DDHID','FROM','TO','Metros','CAJAS','Geologo'],
  recuperacion:     ['Fecha','DDHID','From','To','Avance','Geologo'],
  fotografia:       ['Fecha','DDHID','From','To','Avance','N_Foto','Geologo'],
  l_geotecnico:     ['Fecha','DDHID','From','To','Avance','PLT','UCS','Geologo'],
  l_geologico:      ['Fecha','DDHID','From','To','Avance','Geologo','SG','Observaciones'],
  muestreo:         ['Fecha','DDHID','DE','HASTA','MUESTRAS','Geologo'],
  corte:            ['Fecha','DDHID','DE','A','AVANCE','CAJAS','MAQUINAS','Geologo'],
  envios:           ['Fecha','Envio_N','Total_muestras','Geologo'],
  batch:            ['Envio','Batch','Sondaje','Qty_Mina','Qty_Lab','Muestras_Dens','Cod_Cert','F_Envio','F_Solicitud','F_Resultados','Tiempo_dias','Geologo'],
  tormentas:        ['Fecha','Desde','Hasta','TOTAL','Minutos','Horas','Geologo'],
}

router.post('/:table', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const table = req.params.table
  if (!TABLE_COLS[table]) return res.status(404).json({ error: `Tabla "${table}" no existe` })

  const incoming = req.body.rows
  if (!Array.isArray(incoming) || !incoming.length)
    return res.status(400).json({ error: 'Se requiere array "rows"' })

  const results = { imported: 0, skipped: 0, errors: [] }
  const existing = await db.query(`SELECT * FROM ${table}`)
  const existingRows = existing.rows

  for (let idx = 0; idx < incoming.length; idx++) {
    const rawRow = incoming[idx]
    const row = {}
    Object.keys(rawRow).forEach(k => { row[k.trim()] = typeof rawRow[k] === 'string' ? rawRow[k].trim() : rawRow[k] })
    if (!row.Geologo) row.Geologo = req.user.name

    const errs = validateRow(table, row, existingRows, null)
    if (errs.length) {
      results.skipped++
      results.errors.push({ row: idx + 1, messages: errs.map(e => e.message) })
      continue
    }

    try {
      const cols = TABLE_COLS[table].filter(c => row[c] !== undefined && row[c] !== '')
      const vals = cols.map(c => row[c])
      const ph   = cols.map((_, i) => `$${i+1}`).join(',')
      const cns  = cols.map(c => `"${c}"`).join(',')
      const r = await db.query(`INSERT INTO ${table} (${cns}) VALUES (${ph}) RETURNING *`, vals)
      existingRows.push(r.rows[0])
      results.imported++
    } catch (err) {
      results.skipped++
      results.errors.push({ row: idx + 1, messages: [err.message] })
    }
  }
  res.json(results)
})

module.exports = router
