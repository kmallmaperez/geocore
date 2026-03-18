const express = require('express')
const router  = express.Router()
const db      = require('../data/db')
const { authMiddleware } = require('../middleware/auth')

// Crear tabla si no existe
db.query(`
  CREATE TABLE IF NOT EXISTS quick_log (
    id         SERIAL PRIMARY KEY,
    "DDHID"    TEXT NOT NULL,
    from_m     NUMERIC,
    to_m       NUMERIC,
    lito_cod   INTEGER,
    lito_desc  TEXT,
    alter_cod  INTEGER,
    alter_desc TEXT,
    extra      TEXT,
    obs        TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(console.error)

// GET /api/quicklog/export/all — debe ir ANTES del /:ddhid
router.get('/export/all', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM quick_log ORDER BY "DDHID" ASC, from_m ASC NULLS LAST`
    )
    res.json(r.rows)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// GET /api/quicklog/:ddhid
router.get('/:ddhid', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM quick_log WHERE "DDHID"=$1 ORDER BY from_m ASC NULLS LAST, id ASC`,
      [req.params.ddhid]
    )
    res.json(r.rows)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// POST /api/quicklog
router.post('/', authMiddleware, async (req, res) => {
  // Verificar permiso: ADMIN/SUPERVISOR siempre pueden, USER necesita 'quicklog' o 'all'
  const u = req.user
  if (u.role === 'USER') {
    const tables = Array.isArray(u.tables) ? u.tables : []
    if (!tables.includes('all') && !tables.includes('quicklog')) {
      return res.status(403).json({ error: 'Sin permiso para escribir en Quick Log' })
    }
  }
  const { ddhid, rows } = req.body
  if (!ddhid) return res.status(400).json({ error: 'ddhid requerido' })
  try {
    await db.query('BEGIN')
    await db.query(`DELETE FROM quick_log WHERE "DDHID"=$1`, [ddhid])
    for (const r of (rows || [])) {
      await db.query(
        `INSERT INTO quick_log ("DDHID",from_m,to_m,lito_cod,lito_desc,alter_cod,alter_desc,extra,obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ddhid,
         r.from !== '' ? r.from : null,
         r.to   !== '' ? r.to   : null,
         r.lito_cod  ?? null, r.lito_desc  || null,
         r.alter_cod ?? null, r.alter_desc || null,
         r.extra || null, r.obs || null]
      )
    }
    await db.query('COMMIT')
    res.json({ ok: true })
  } catch(e) {
    await db.query('ROLLBACK')
    res.status(500).json({ error: e.message })
  }
})

// Catálogos de códigos para resolver nombres en importación
const LITO_MAP = {
  0:'Cobertura',1:'Diorita/Andesita Porfirita',2:'Granodiorita',3:'Pórfido Feldespático',
  4:'Pórfido Cuarcífero',5:'Pórfido Dacítico',6:'Pórfido Yantac',7:'Endoskarn',
  10:'Hornfels',11:'Skarn',12:'Skarn de Magnetita',13:'Basalto Montero',
  14:'Sedimentos Calcareos',15:'Shale (Lutitas)',16:'Volcánicos Catalina',
  17:'Anhidrita / Yeso',18:'Sandstone (Areniscas)',19:'Brecha en Igneos',
  20:'Brecha en sedimentarios',25:'Relleno',102:'Sin Recuperación',
}
const ALTER_MAP = {
  0:'Cobertura',2:'Biotita y/o Feldespato potasico (Potasica)',3:'Cloritica (Propilitica)',
  4:'Sericitica (Filica)',5:'Argílica',6:'Silicificación',
  9:'Skarn de Tremolita-Actinolita, Clorita',10:'Skarn de Serpentina-Magnetita',
  11:'Skarn de Diopsido-Granate',12:'Hornfels Verde - Diopsido en Hornfels',
  15:'Sedimentos Calcareos - Marmol',16:'Anhidrita / Yeso',17:'Shale (Lutitas)',
  18:'Skarn de Magnetita',19:'Sandstone (Areniscas)',25:'Relleno',102:'Sin Recuperación',
}

// POST /api/quicklog/import — importar desde CSV/Excel
router.post('/import', authMiddleware, async (req, res) => {
  const u = req.user
  if (u.role === 'USER') {
    const tables = Array.isArray(u.tables) ? u.tables : []
    if (!tables.includes('all') && !tables.includes('quicklog'))
      return res.status(403).json({ error: 'Sin permiso' })
  }
  const { rows, mode } = req.body  // mode: 'skip' | 'overwrite'
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'Sin datos' })

  let inserted = 0, updated = 0, skipped = 0, errors = []

  try {
    for (const r of rows) {
      const ddhid    = String(r.DDHID || '').trim()
      const from_m   = parseFloat(r.FROM ?? r.from_m)
      const to_m     = parseFloat(r.TO   ?? r.to_m)
      const lito_cod = r.LITO_COD != null && r.LITO_COD !== '' ? parseInt(r.LITO_COD) : null
      const alter_cod  = r.ALTER_COD != null && r.ALTER_COD !== '' ? parseInt(r.ALTER_COD) : null
      // Resolver nombres desde códigos usando los catálogos
      const lito_desc  = lito_cod  != null ? (LITO_MAP[lito_cod]  || '') : null
      const alter_desc = alter_cod != null ? (ALTER_MAP[alter_cod] || '') : null
      const extra = String(r.EXTRA || r.extra || '').trim() || null
      const obs   = String(r.OBS   || r.obs   || '').trim() || null

      if (!ddhid || isNaN(from_m) || isNaN(to_m)) {
        errors.push(`Fila inválida: DDHID=${r.DDHID} FROM=${r.FROM} TO=${r.TO}`)
        continue
      }

      // Buscar si ya existe ese tramo
      const existing = await db.query(
        `SELECT id FROM quick_log WHERE "DDHID"=$1 AND from_m=$2 AND to_m=$3`,
        [ddhid, from_m, to_m]
      )

      if (existing.rows.length > 0) {
        if (mode === 'overwrite') {
          await db.query(
            `UPDATE quick_log SET lito_cod=$1, lito_desc=$2, alter_cod=$3, alter_desc=$4,
             extra=$5, obs=$6 WHERE "DDHID"=$7 AND from_m=$8 AND to_m=$9`,
            [lito_cod, lito_desc, alter_cod, alter_desc, extra, obs, ddhid, from_m, to_m]
          )
          updated++
        } else {
          skipped++
        }
      } else {
        await db.query(
          `INSERT INTO quick_log ("DDHID", from_m, to_m, lito_cod, lito_desc, alter_cod, alter_desc, extra, obs)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [ddhid, from_m, to_m, lito_cod, lito_desc, alter_cod, alter_desc, extra, obs]
        )
        inserted++
      }
    }
    res.json({ ok: true, inserted, updated, skipped, errors })
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/quicklog/:id — eliminar registro individual (para deduplicación)
router.delete('/:id', authMiddleware, async (req, res) => {
  if (!['ADMIN','SUPERVISOR'].includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos' })
  try {
    const r = await db.query('DELETE FROM quick_log WHERE id=$1 RETURNING id', [parseInt(req.params.id)])
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' })
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
