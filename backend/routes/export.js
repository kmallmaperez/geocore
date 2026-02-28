const express = require('express')
const db      = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')

const router = express.Router()

// Tablas y sus columnas en orden
const TABLES = {
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

// GET /api/export/all  → JSON con todas las tablas
router.get('/all', authMiddleware, requireRole('ADMIN', 'SUPERVISOR'), async (req, res) => {
  try {
    const result = {}
    for (const [table, cols] of Object.entries(TABLES)) {
      const r = await db.query(`SELECT * FROM ${table} ORDER BY id`)
      result[table] = { cols, rows: r.rows }
    }
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/export/:table  → JSON de una tabla
router.get('/:table', authMiddleware, async (req, res) => {
  const table = req.params.table
  if (!TABLES[table]) return res.status(404).json({ error: 'Tabla no existe' })
  try {
    const cols = TABLES[table]
    const r = await db.query(`SELECT * FROM ${table} ORDER BY id`)
    res.json({ cols, rows: r.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
