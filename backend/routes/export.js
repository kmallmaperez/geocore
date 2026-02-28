const express = require('express')
const db      = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')

const router = express.Router()

// Tablas y sus columnas en orden
const TABLES = {
  programa_general: ['PLATAFORMA','DDHID','EQUIPO','ESTE','NORTE','ELEV','LENGTH'],
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


// GET /api/export/resumen  → Resumen General calculado
router.get('/resumen', authMiddleware, async (req, res) => {
  try {
    const pg = await db.query('SELECT * FROM programa_general')
    // Usar comillas para respetar el case de las columnas
    const perf = await db.query(`SELECT "DDHID", SUM("Total_Dia") as ejecutado, MIN("Fecha") as f_inicio, MAX("Fecha") as f_fin FROM perforacion GROUP BY "DDHID"`)
    const overrides = await db.query('SELECT ddhid, estado FROM estado_overrides')
    const ovMap = {}
    overrides.rows.forEach(o => { ovMap[o.ddhid] = o.estado })
    const perfMap = {}
    perf.rows.forEach(p => { perfMap[p.DDHID] = p })

    const rows = pg.rows
      .filter(r => r.DDHID && String(r.DDHID).trim() !== '')
      .map(r => {
        const p = perfMap[r.DDHID] || {}
        const ejecutado = parseFloat(p.ejecutado || 0).toFixed(2)
        const programado = parseFloat(r.LENGTH || 0).toFixed(2)
        const pct = programado > 0 ? Math.round((ejecutado / programado) * 100) : 0
        const estado = ovMap[r.DDHID] || (pct >= 100 ? 'Completado' : parseFloat(ejecutado) > 0 ? 'En Proceso' : 'Pendiente')
        return {
          DDHID: r.DDHID,
          EQUIPO: r.EQUIPO || '',
          PLATAFORMA: r.PLATAFORMA || '',
          PROGRAMADO: programado,
          EJECUTADO: ejecutado,
          ESTADO: estado,
          FECHA_INICIO: p.f_inicio ? String(p.f_inicio).slice(0,10) : '',
          FECHA_FIN: p.f_fin ? String(p.f_fin).slice(0,10) : '',
          PCT: pct
        }
      })

    res.json({
      cols: ['DDHID','EQUIPO','PLATAFORMA','PROGRAMADO','EJECUTADO','ESTADO','FECHA_INICIO','FECHA_FIN','PCT'],
      rows
    })
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

