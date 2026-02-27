const bcrypt = require('bcryptjs')

// ── USUARIOS: solo admin al inicio ───────────────────────────────
const users = [
  {
    id: 1,
    name: 'Administrador',
    email: 'admin@geocore.pe',
    password: bcrypt.hashSync('admin123', 8),
    role: 'ADMIN',
    tables: ['all'],
    active: true
  },
]

// ── TABLAS: todas vacías ─────────────────────────────────────────
const tableData = {
  programa_general: [],
  perforacion:      [],
  recepcion:        [],
  recuperacion:     [],
  fotografia:       [],
  l_geotecnico:     [],
  l_geologico:      [],
  muestreo:         [],
  corte:            [],
  envios:           [],
  batch:            [],
  tormentas:        [],
}

// Estado manual por DDHID
const estadoOverrides = {}

let nextId = 1
function genId() { return ++nextId }

module.exports = { users, tableData, genId, estadoOverrides }
