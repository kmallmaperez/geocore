const express = require('express')
const router  = express.Router()
const db      = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')

// Programa Mina: 28000 m acumulados al 31/07/2026
const MINA_SEED = [
  ['2025-12-31', 2200], ['2026-01-04', 2620], ['2026-01-11', 3370],
  ['2026-01-18', 4110], ['2026-01-25', 4850], ['2026-01-31', 5490],
  ['2026-02-01', 5610], ['2026-02-08', 6430], ['2026-02-15', 7250],
  ['2026-02-22', 8080], ['2026-02-28', 8780], ['2026-03-01', 8910],
  ['2026-03-08', 9780], ['2026-03-15', 10640], ['2026-03-22', 11510],
  ['2026-03-29', 12380], ['2026-03-31', 12630], ['2026-04-05', 13450],
  ['2026-04-12', 14600], ['2026-04-19', 15760], ['2026-04-26', 16910],
  ['2026-04-30', 17570], ['2026-05-03', 18100], ['2026-05-10', 19340],
  ['2026-05-17', 20580], ['2026-05-24', 21820], ['2026-05-31', 23060],
  ['2026-06-07', 23830], ['2026-06-14', 24600], ['2026-06-21', 25370],
  ['2026-06-28', 26140], ['2026-06-30', 26350], ['2026-07-05', 26620],
  ['2026-07-12', 26990], ['2026-07-19', 27360], ['2026-07-26', 27740],
  ['2026-07-31', 28000],
]

async function initTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS programa_perforacion (
      id            SERIAL PRIMARY KEY,
      tipo_proyecto TEXT NOT NULL DEFAULT 'Mina',
      fecha         DATE NOT NULL,
      acum_prog     NUMERIC NOT NULL,
      descripcion   TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tipo_proyecto, fecha)
    )
  `)
  // Sembrar datos Mina si la tabla está vacía O si tiene datos con escala incorrecta (< 5000 = escala 2800m)
  const { rows } = await db.query(
    `SELECT COUNT(*) AS cnt, COALESCE(MAX(acum_prog), 0) AS max_v FROM programa_perforacion WHERE tipo_proyecto='Mina'`
  )
  const cnt  = parseInt(rows[0].cnt)
  const maxV = parseFloat(rows[0].max_v) || 0

  if (cnt === 0 || maxV < 5000) {
    if (cnt > 0) {
      await db.query(`DELETE FROM programa_perforacion WHERE tipo_proyecto='Mina'`)
    }
    for (const [fecha, acum_prog] of MINA_SEED) {
      await db.query(
        `INSERT INTO programa_perforacion (tipo_proyecto, fecha, acum_prog)
         VALUES ('Mina', $1, $2) ON CONFLICT DO NOTHING`,
        [fecha, acum_prog]
      )
    }
  }
}
initTable().catch(console.error)

// GET /api/programa-perf?tipo_proyecto=Mina
router.get('/', authMiddleware, async (req, res) => {
  const tipo = req.query.tipo_proyecto || null
  try {
    const q = tipo
      ? `SELECT * FROM programa_perforacion WHERE tipo_proyecto=$1 ORDER BY fecha`
      : `SELECT * FROM programa_perforacion ORDER BY tipo_proyecto, fecha`
    const r = await db.query(q, tipo ? [tipo] : [])
    res.json(r.rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/programa-perf — agrega o actualiza un punto del programa
router.post('/', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const { tipo_proyecto, fecha, acum_prog, descripcion } = req.body
  if (!tipo_proyecto || !fecha || acum_prog == null)
    return res.status(400).json({ error: 'tipo_proyecto, fecha y acum_prog son requeridos' })
  try {
    const r = await db.query(
      `INSERT INTO programa_perforacion (tipo_proyecto, fecha, acum_prog, descripcion)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tipo_proyecto, fecha) DO UPDATE SET acum_prog=$3, descripcion=$4
       RETURNING *`,
      [tipo_proyecto, fecha, acum_prog, descripcion || null]
    )
    res.status(201).json(r.rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/programa-perf/:id
router.put('/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const { fecha, acum_prog, descripcion } = req.body
  try {
    const r = await db.query(
      `UPDATE programa_perforacion SET fecha=$1, acum_prog=$2, descripcion=$3 WHERE id=$4 RETURNING *`,
      [fecha, acum_prog, descripcion || null, parseInt(req.params.id)]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' })
    res.json(r.rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/programa-perf/:id
router.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(
      `DELETE FROM programa_perforacion WHERE id=$1 RETURNING id`,
      [parseInt(req.params.id)]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
