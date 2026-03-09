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

module.exports = router
