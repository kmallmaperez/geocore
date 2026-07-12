const express = require('express')
const db      = require('../data/db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

// Migración + datos iniciales
db.query(`
  CREATE TABLE IF NOT EXISTS proyectos (
    id         SERIAL PRIMARY KEY,
    nombre     TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => {
  db.query(`INSERT INTO proyectos (nombre) VALUES ('Mina') ON CONFLICT DO NOTHING`).catch(() => {})
  db.query(`INSERT INTO proyectos (nombre) VALUES ('Exploraciones') ON CONFLICT DO NOTHING`).catch(() => {})
}).catch(() => {})

// GET /api/proyectos — lista de nombres ordenada por id
router.get('/', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT nombre FROM proyectos ORDER BY id')
    res.json(r.rows.map(row => row.nombre))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/proyectos — solo ADMIN
router.post('/', authMiddleware, async (req, res) => {
  if (req.user.role !== 'ADMIN')
    return res.status(403).json({ error: 'Solo ADMIN puede crear proyectos' })
  const nombre = (req.body.nombre || '').trim()
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    await db.query('INSERT INTO proyectos (nombre) VALUES ($1)', [nombre])
    res.json({ nombre })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ese proyecto ya existe' })
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
