const express  = require('express')
const multer   = require('multer')
const db       = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')
const { createClient } = require('@supabase/supabase-js')

const router  = express.Router()
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )
}

// ── Crear tabla si no existe ─────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mapa_config (
      id           SERIAL PRIMARY KEY,
      imagen_url   TEXT,
      imagen_w     INTEGER,
      imagen_h     INTEGER,
      puntos_ctrl  JSONB DEFAULT '[]',
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW()
    )
  `)
  // Asegurar que hay al menos una fila
  const r = await db.query('SELECT id FROM mapa_config LIMIT 1')
  if (r.rows.length === 0) {
    await db.query(`INSERT INTO mapa_config (puntos_ctrl) VALUES ('[]')`)
  }
}
ensureTable().catch(console.error)

// GET /api/mapa/config — obtener configuración actual
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM mapa_config ORDER BY id LIMIT 1')
    res.json(r.rows[0] || { imagen_url: null, imagen_w: null, imagen_h: null, puntos_ctrl: [] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/mapa/upload — subir imagen (solo ADMIN), multipart/form-data
router.post('/upload', authMiddleware, requireRole('ADMIN'), upload.single('plano'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' })

    const { width, height } = req.body
    const supabase  = getSupabase()
    const ext       = req.file.originalname.split('.').pop()
    const filePath  = `plano_${Date.now()}.${ext}`

    // Eliminar imagen anterior si existe
    const prev = await db.query('SELECT imagen_url FROM mapa_config ORDER BY id LIMIT 1')
    if (prev.rows[0]?.imagen_url) {
      const oldPath = prev.rows[0].imagen_url.split('/planos/')[1]
      if (oldPath) await supabase.storage.from('planos').remove([oldPath])
    }

    const { error: upErr } = await supabase.storage
      .from('planos')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true })
    if (upErr) throw new Error(upErr.message)

    const { data: { publicUrl } } = supabase.storage.from('planos').getPublicUrl(filePath)

    await db.query(
      `UPDATE mapa_config SET imagen_url=$1, imagen_w=$2, imagen_h=$3, puntos_ctrl='[]', updated_at=NOW()`,
      [publicUrl, parseInt(width)||0, parseInt(height)||0]
    )
    res.json({ url: publicUrl })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/mapa/puntos — guardar puntos de control (solo ADMIN)
router.put('/puntos', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { puntos } = req.body
    await db.query(
      'UPDATE mapa_config SET puntos_ctrl=$1, updated_at=NOW()',
      [JSON.stringify(puntos)]
    )
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/mapa/imagen — eliminar plano (solo ADMIN)
router.delete('/imagen', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const prev = await db.query('SELECT imagen_url FROM mapa_config ORDER BY id LIMIT 1')
    const url  = prev.rows[0]?.imagen_url
    if (url) {
      const supabase = getSupabase()
      const oldPath  = url.split('/planos/')[1]
      if (oldPath) await supabase.storage.from('planos').remove([oldPath])
    }
    await db.query(
      "UPDATE mapa_config SET imagen_url=NULL, imagen_w=NULL, imagen_h=NULL, puntos_ctrl='[]', updated_at=NOW()"
    )
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
