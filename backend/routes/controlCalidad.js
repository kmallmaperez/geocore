const express = require('express')
const router = express.Router()
const db = require('../data/db')
const { authMiddleware } = require('../middleware/auth')

db.query(`
  CREATE TABLE IF NOT EXISTS control_calidad (
    id                SERIAL PRIMARY KEY,
    "DDHID"           TEXT NOT NULL UNIQUE,
    collar            TEXT NOT NULL DEFAULT 'Pendiente',
    survey_control    TEXT NOT NULL DEFAULT 'Pendiente',
    survey_final      TEXT NOT NULL DEFAULT 'Pendiente',
    informe_survey    TEXT NOT NULL DEFAULT 'Pendiente',
    validacion_logueo TEXT NOT NULL DEFAULT 'Pendiente',
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error)

const VALID_FIELDS = ['collar','survey_control','survey_final','informe_survey','validacion_logueo']
const VALID_STATUS = ['Pendiente','En Proceso','Completado']

function canAccess(req, res, next) {
  const u = req.user
  if (u.role === 'ADMIN' || u.role === 'SUPERVISOR') return next()
  if (u.tables && (u.tables.includes('all') || u.tables.includes('control_calidad'))) return next()
  return res.status(403).json({ error: 'Sin permiso para acceder a Control de Calidad' })
}

// GET /api/control-calidad?tipo_proyecto=Mina
router.get('/', authMiddleware, canAccess, async (req, res) => {
  try {
    const tipo = req.query.tipo_proyecto
    let query, params = []

    if (tipo && tipo !== 'Ambos') {
      query = `
        SELECT
          pg."DDHID",
          pg."PLATAFORMA",
          COALESCE(pg."tipo_proyecto", 'Mina') AS tipo_proyecto,
          COALESCE(cc.collar,            'Pendiente') AS collar,
          COALESCE(cc.survey_control,    'Pendiente') AS survey_control,
          COALESCE(cc.survey_final,      'Pendiente') AS survey_final,
          COALESCE(cc.informe_survey,    'Pendiente') AS informe_survey,
          COALESCE(cc.validacion_logueo, 'Pendiente') AS validacion_logueo,
          cc.updated_at
        FROM programa_general pg
        LEFT JOIN control_calidad cc ON pg."DDHID" = cc."DDHID"
        WHERE pg."DDHID" IS NOT NULL AND pg."DDHID" <> ''
          AND COALESCE(pg."tipo_proyecto", 'Mina') = $1
        ORDER BY pg."DDHID"
      `
      params = [tipo]
    } else {
      query = `
        SELECT
          pg."DDHID",
          pg."PLATAFORMA",
          COALESCE(pg."tipo_proyecto", 'Mina') AS tipo_proyecto,
          COALESCE(cc.collar,            'Pendiente') AS collar,
          COALESCE(cc.survey_control,    'Pendiente') AS survey_control,
          COALESCE(cc.survey_final,      'Pendiente') AS survey_final,
          COALESCE(cc.informe_survey,    'Pendiente') AS informe_survey,
          COALESCE(cc.validacion_logueo, 'Pendiente') AS validacion_logueo,
          cc.updated_at
        FROM programa_general pg
        LEFT JOIN control_calidad cc ON pg."DDHID" = cc."DDHID"
        WHERE pg."DDHID" IS NOT NULL AND pg."DDHID" <> ''
        ORDER BY pg."DDHID"
      `
    }

    const r = await db.query(query, params)
    res.json(r.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/control-calidad/:ddhid  body: { campo, valor }
router.put('/:ddhid', authMiddleware, canAccess, async (req, res) => {
  const ddhid = req.params.ddhid
  const { campo, valor } = req.body

  if (!VALID_FIELDS.includes(campo))  return res.status(400).json({ error: 'Campo inválido' })
  if (!VALID_STATUS.includes(valor))  return res.status(400).json({ error: 'Estado inválido' })

  try {
    // VALID_FIELDS validated above — safe to interpolate column name
    await db.query(
      `INSERT INTO control_calidad ("DDHID", ${campo}, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT ("DDHID") DO UPDATE SET ${campo} = $2, updated_at = NOW()`,
      [ddhid, valor]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
