const express = require('express')
const db      = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')

const router = express.Router()

// Crear tabla con soporte para 3 planos (slot 1, 2, 3)
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mapa_config (
      id          SERIAL PRIMARY KEY,
      slot        INTEGER DEFAULT 1,
      nombre      TEXT    DEFAULT 'Plano 1',
      imagen_b64  TEXT,
      imagen_tipo TEXT,
      imagen_w    INTEGER,
      imagen_h    INTEGER,
      puntos_ctrl JSONB DEFAULT '[]',
      updated_at  TIMESTAMP DEFAULT NOW()
    )
  `)
  // Migración: agregar columnas nuevas si ya existía la tabla
  await db.query(`ALTER TABLE mapa_config ADD COLUMN IF NOT EXISTS slot INTEGER DEFAULT 1`).catch(()=>{})
  await db.query(`ALTER TABLE mapa_config ADD COLUMN IF NOT EXISTS nombre TEXT DEFAULT 'Plano 1'`).catch(()=>{})
  // Asegurar que existe al menos el slot 1
  const r = await db.query('SELECT id FROM mapa_config WHERE slot=1 LIMIT 1')
  if (r.rows.length === 0) {
    const any = await db.query('SELECT id FROM mapa_config LIMIT 1')
    if (any.rows.length > 0) {
      await db.query('UPDATE mapa_config SET slot=1 WHERE id=$1', [any.rows[0].id])
    } else {
      await db.query("INSERT INTO mapa_config (slot, nombre, puntos_ctrl) VALUES (1,'Plano 1','[]')")
    }
  }
  // Crear slots 2 y 3 si no existen
  for (let s = 2; s <= 3; s++) {
    const rs = await db.query('SELECT id FROM mapa_config WHERE slot=$1 LIMIT 1', [s])
    if (rs.rows.length === 0) {
      await db.query(
        "INSERT INTO mapa_config (slot, nombre, puntos_ctrl) VALUES ($1,$2,'[]')",
        [s, `Plano ${s}`]
      )
    }
  }
}
ensureTable().catch(console.error)

// GET /api/mapa/config — todos los slots
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT id, slot, nombre, imagen_b64, imagen_tipo, imagen_w, imagen_h, puntos_ctrl FROM mapa_config ORDER BY slot'
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/mapa/upload/:slot — subir imagen a un slot (solo ADMIN)
router.post('/upload/:slot', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const slot = parseInt(req.params.slot) || 1
    if (slot < 1 || slot > 3) return res.status(400).json({ error: 'Slot inválido (1-3)' })
    const { base64, mimeType, width, height } = req.body
    if (!base64) return res.status(400).json({ error: 'No se recibió imagen' })
    await db.query(
      `UPDATE mapa_config SET imagen_b64=$1, imagen_tipo=$2, imagen_w=$3, imagen_h=$4, puntos_ctrl='[]', updated_at=NOW() WHERE slot=$5`,
      [base64, mimeType || 'image/png', parseInt(width)||0, parseInt(height)||0, slot]
    )
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/mapa/nombre/:slot — renombrar plano (solo ADMIN)
router.put('/nombre/:slot', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const slot = parseInt(req.params.slot) || 1
    const { nombre } = req.body
    await db.query('UPDATE mapa_config SET nombre=$1, updated_at=NOW() WHERE slot=$2', [nombre||`Plano ${slot}`, slot])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/mapa/puntos/:slot (solo ADMIN)
router.put('/puntos/:slot', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const slot = parseInt(req.params.slot) || 1
    const { puntos } = req.body
    await db.query('UPDATE mapa_config SET puntos_ctrl=$1, updated_at=NOW() WHERE slot=$2', [JSON.stringify(puntos), slot])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/mapa/imagen/:slot (solo ADMIN)
router.delete('/imagen/:slot', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const slot = parseInt(req.params.slot) || 1
    await db.query(
      "UPDATE mapa_config SET imagen_b64=NULL, imagen_tipo=NULL, imagen_w=NULL, imagen_h=NULL, puntos_ctrl='[]', updated_at=NOW() WHERE slot=$1",
      [slot]
    )
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Keep old endpoints as aliases for slot 1 (backward compatibility)
router.post('/upload', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  req.params = { slot: '1' }
  router.handle({ ...req, url: '/upload/1', params: { slot: '1' } }, res, () => {})
})
router.put('/puntos', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { puntos } = req.body
    await db.query('UPDATE mapa_config SET puntos_ctrl=$1, updated_at=NOW() WHERE slot=1', [JSON.stringify(puntos)])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
router.delete('/imagen', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    await db.query("UPDATE mapa_config SET imagen_b64=NULL, imagen_tipo=NULL, imagen_w=NULL, imagen_h=NULL, puntos_ctrl='[]', updated_at=NOW() WHERE slot=1")
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
