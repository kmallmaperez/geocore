const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const db       = require('../data/db')

const router = express.Router()

router.post('/login', async (req, res) => {
  const { login, password } = req.body
  if (!login || !password)
    return res.status(400).json({ error: 'Usuario/correo y contraseña requeridos' })

  try {
    const term = login.trim().toLowerCase()
    const result = await db.query(
      `SELECT * FROM users WHERE active = true AND (LOWER(email) = $1 OR LOWER(name) = $1) LIMIT 1`,
      [term]
    )
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    if (!bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, tables: user.tables },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, tables: user.tables } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

router.get('/me', (req, res) => {
  const header = req.headers['authorization']
  if (!header) return res.status(401).json({ error: 'No autorizado' })
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
    res.json({ user: decoded })
  } catch {
    res.status(401).json({ error: 'Token inválido' })
  }
})

module.exports = router
