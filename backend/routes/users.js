const express = require('express')
const bcrypt  = require('bcryptjs')
const db      = require('../data/db')
const { authMiddleware, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const r = await db.query('SELECT id,name,email,role,tables,active FROM users ORDER BY id')
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const { name, email, password, role, tables } = req.body
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'Nombre, email, contraseña y rol son requeridos' })
  try {
    const hash = bcrypt.hashSync(password, 8)
    const tbls = (role === 'ADMIN' || role === 'SUPERVISOR') ? ['all'] : (tables || [])
    const r = await db.query(
      `INSERT INTO users (name,email,password,role,tables,active) VALUES ($1,$2,$3,$4,$5,true) RETURNING id,name,email,role,tables,active`,
      [name, email, hash, role, tbls]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese email' })
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const { name, email, password, role, tables, active } = req.body
  const id = parseInt(req.params.id)
  try {
    const curr = await db.query('SELECT * FROM users WHERE id=$1', [id])
    if (!curr.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' })
    const u = curr.rows[0]
    const hash = password ? bcrypt.hashSync(password, 8) : u.password
    const tbls = role
      ? ((role === 'ADMIN' || role === 'SUPERVISOR') ? ['all'] : (tables || u.tables))
      : u.tables
    const r = await db.query(
      `UPDATE users SET name=$1,email=$2,password=$3,role=$4,tables=$5,active=$6 WHERE id=$7 RETURNING id,name,email,role,tables,active`,
      [name||u.name, email||u.email, hash, role||u.role, tbls, active!==undefined?active:u.active, id]
    )
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
