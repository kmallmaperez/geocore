const express = require('express')
const db      = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')

const router = express.Router()

// Crear tabla si no existe
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mapa_config (
      id          SERIAL PRIMARY KEY,
      imagen_b64  TEXT,
      imagen_tipo TEXT,
      imagen_w    INTEGER,
      imagen_h    INTEGER,
      puntos_ctrl JSONB DEFAULT '[]',
      updated_at  TIMESTAMP DEFAULT NOW()
    )
  `)
  const r = await db.query('SELECT id FROM mapa_config LIMIT 1')
  if (r.rows.length === 0) {
    await db.query("INSERT INTO mapa_config (puntos_ctrl) VALUES ('[]')")
  }
}
ensureTable().catch(console.error)

// GET /api/mapa/config
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT id, imagen_b64, imagen_tipo, imagen_w, imagen_h, puntos_ctrl FROM mapa_config ORDER BY id LIMIT 1'
    )
    res.json(r.rows[0] || { imagen_b64: null, imagen_tipo: null, imagen_w: null, imagen_h: null, puntos_ctrl: [] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/mapa/upload — base64 en body JSON (solo ADMIN)
router.post('/upload', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { base64, mimeType, width, height } = req.body
    if (!base64) return res.status(400).json({ error: 'No se recibió imagen' })
    await db.query(
      `UPDATE mapa_config
       SET imagen_b64=$1, imagen_tipo=$2, imagen_w=$3, imagen_h=$4, puntos_ctrl='[]', updated_at=NOW()`,
      [base64, mimeType || 'image/png', parseInt(width) || 0, parseInt(height) || 0]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Upload error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/mapa/puntos (solo ADMIN)
router.put('/puntos', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { puntos } = req.body
    await db.query('UPDATE mapa_config SET puntos_ctrl=$1, updated_at=NOW()', [JSON.stringify(puntos)])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/mapa/imagen (solo ADMIN)
router.delete('/imagen', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    await db.query(
      "UPDATE mapa_config SET imagen_b64=NULL, imagen_tipo=NULL, imagen_w=NULL, imagen_h=NULL, puntos_ctrl='[]', updated_at=NOW()"
    )
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
