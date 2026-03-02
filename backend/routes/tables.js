const express = require('express')
const db      = require('../data/db')
const { authMiddleware } = require('../middleware/auth')
const { validateRow }    = require('../middleware/validate')

const router = express.Router()

// Tablas válidas
const VALID_TABLES = [
  'programa_general','perforacion','recepcion','recuperacion',
  'fotografia','l_geotecnico','l_geologico','muestreo',
  'corte','envios','batch','tormentas'
]

// Mapeo tabla → columnas (para SELECT ordenado)
const TABLE_COLS = {
  programa_general: ['PLATAFORMA','DDHID','ESTE','NORTE','ELEV','LENGTH'],
  perforacion:      ['DDHID','Fecha','From_Dia','TO_Dia','Turno_Dia','From_Noche','To_Noche','Turno_Noche','Total_Dia','Acumulado','Comentarios','Geologo'],
  recepcion:        ['Fecha','HORA','DDHID','FROM','TO','Metros','CAJAS','Geologo'],
  recuperacion:     ['Fecha','DDHID','From','To','Avance','Geologo'],
  fotografia:       ['Fecha','DDHID','From','To','Avance','N_Foto','Geologo'],
  l_geotecnico:     ['Fecha','DDHID','From','To','Avance','PLT','UCS','Geologo'],
  l_geologico:      ['Fecha','DDHID','From','To','Avance','Geologo','SG','Observaciones'],
  muestreo:         ['Fecha','DDHID','DE','HASTA','MUESTRAS','Geologo'],
  corte:            ['Fecha','DDHID','DE','A','AVANCE','CAJAS','MAQUINAS','Geologo'],
  envios:           ['Fecha','Envio_N','Total_muestras','Geologo'],
  batch:            ['Envio','Batch','Sondaje','Qty_Mina','Qty_Lab','Muestras_Dens','Cod_Cert','F_Envio','F_Solicitud','F_Resultados','Tiempo_dias','Geologo'],
  tormentas:        ['Fecha','Desde','Hasta','TOTAL','Minutos','Horas','Geologo'],
}

function checkTable(req, res, next) {
  if (!VALID_TABLES.includes(req.params.table))
    return res.status(404).json({ error: `Tabla "${req.params.table}" no existe` })
  next()
}
function canWrite(req, res, next) {
  const u = req.user
  if (u.role === 'ADMIN' || u.role === 'SUPERVISOR') return next()
  if (u.tables.includes('all') || u.tables.includes(req.params.table)) return next()
  return res.status(403).json({ error: 'Sin permiso para escribir en esta tabla' })
}

// Convierte fila de DB a objeto limpio
function toRow(dbRow) {
  const out = { id: dbRow.id }
  Object.keys(dbRow).forEach(k => { if (k !== 'id' && k !== 'created_at') out[k] = dbRow[k] })
  return out
}

// ── RUTAS ESPECIALES (antes de /:table) ──────────────────────────

// GET /api/tables/resumen/general
router.get('/resumen/general', authMiddleware, async (req, res) => {
  try {
    const prog = await db.query('SELECT * FROM programa_general ORDER BY id')
    const perf = await db.query('SELECT * FROM perforacion ORDER BY id')
    const ov   = await db.query('SELECT * FROM estado_overrides')
    const overrides = {}
    ov.rows.forEach(r => { overrides[r.ddhid] = r.estado })

    const resumen = prog.rows.map(p => {
      const mp   = perf.rows.filter(x => x.DDHID === p.DDHID)
      const ej   = mp.reduce((s, x) => s + (parseFloat(x.Total_Dia) || 0), 0)
      const fechas = mp.map(x => x.Fecha).filter(Boolean).map(f => {
        // PostgreSQL returns Date objects; convert to YYYY-MM-DD
        if (f instanceof Date) {
          const y = f.getUTCFullYear()
          const m = String(f.getUTCMonth()+1).padStart(2,'0')
          const d = String(f.getUTCDate()).padStart(2,'0')
          return `${y}-${m}-${d}`
        }
        return String(f).slice(0,10)
      }).sort()
      const pct  = p.LENGTH > 0 ? Math.round(ej / p.LENGTH * 100) : 0
      const estadoCalc = pct >= 100 ? 'Completado' : pct > 0 ? 'En Proceso' : 'Pendiente'
      return {
        DDHID:        p.DDHID, EQUIPO: p.EQUIPO || '',
        PLATAFORMA:   p.PLATAFORMA, PROGRAMADO: p.LENGTH,
        EJECUTADO:    parseFloat(ej.toFixed(1)), ESTADO: overrides[p.DDHID] || estadoCalc,
        FECHA_INICIO: fechas[0] || '—', FECHA_FIN: fechas[fechas.length-1] || '—',
        PCT: pct, _estadoManual: !!overrides[p.DDHID],
      }
    })
    res.json(resumen)
  } catch (err) { res.status(500).json({ error: err.message }) }
})



// GET /api/tables/dashboard/stats — stats completos para dashboard y tabla resumen
router.get('/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const [prog, perf, recep, recup, foto, geotec, geolog, ov] = await Promise.all([
      db.query('SELECT * FROM programa_general'),
      db.query('SELECT "DDHID", "Fecha", "Turno_Dia", "Turno_Noche", "Total_Dia" FROM perforacion ORDER BY "Fecha"'),
      db.query('SELECT "DDHID", "Metros" FROM recepcion'),
      db.query('SELECT "DDHID", "Avance" FROM recuperacion'),
      db.query('SELECT "DDHID", "Avance" FROM fotografia'),
      db.query('SELECT "DDHID", "Avance" FROM l_geotecnico'),
      db.query('SELECT "DDHID", "Avance" FROM l_geologico'),
      db.query('SELECT * FROM estado_overrides'),
    ])

    const overrides = {}
    ov.rows.forEach(r => { overrides[r.ddhid] = r.estado })

    // Suma por DDHID helper
    function sumBy(rows, ddhid, col) {
      return rows.filter(r => r.DDHID === ddhid).reduce((s, r) => s + (parseFloat(r[col]) || 0), 0)
    }

    // Tabla de resumen por sondaje
    const porSondaje = prog.rows
      .filter(p => p.DDHID && String(p.DDHID).trim() !== '')
      .map(p => {
        const perfRows = perf.rows.filter(x => x.DDHID === p.DDHID)
        const perfTotal = perfRows.reduce((s, x) => s + (parseFloat(x.Total_Dia) || 0), 0)
        const fechas = perfRows.map(x => x.Fecha).filter(Boolean).map(f => {
          if (f instanceof Date) {
            const y = f.getUTCFullYear(), m = String(f.getUTCMonth()+1).padStart(2,'0'), d = String(f.getUTCDate()).padStart(2,'0')
            return `${y}-${m}-${d}`
          }
          return String(f).slice(0,10)
        }).sort()
        const pct = p.LENGTH > 0 ? Math.round(perfTotal / p.LENGTH * 100) : 0
        const estadoCalc = pct >= 100 ? 'Completado' : perfTotal > 0 ? 'En Proceso' : 'Pendiente'
        return {
          DDHID: p.DDHID,
          PROGRAMADO: parseFloat(p.LENGTH || 0),
          PERFORADO:  parseFloat(perfTotal.toFixed(1)),
          RECEPCION:  parseFloat(sumBy(recep.rows,  p.DDHID, 'Metros').toFixed(1)),
          RECUPERADO: parseFloat(sumBy(recup.rows,  p.DDHID, 'Avance').toFixed(1)),
          FOTOGRAFIADO: parseFloat(sumBy(foto.rows, p.DDHID, 'Avance').toFixed(1)),
          GEOTECNICO: parseFloat(sumBy(geotec.rows, p.DDHID, 'Avance').toFixed(1)),
          GEOLOGICO:  parseFloat(sumBy(geolog.rows, p.DDHID, 'Avance').toFixed(1)),
          ESTADO: overrides[p.DDHID] || estadoCalc,
          PCT: pct,
          FECHA_INICIO: fechas[0] || null,
          FECHA_FIN: fechas[fechas.length-1] || null,
        }
      })

    // Totales globales
    const totales = {
      perforado:    parseFloat(perf.rows.reduce((s,r) => s+(parseFloat(r.Total_Dia)||0),0).toFixed(1)),
      recepcion:    parseFloat(recep.rows.reduce((s,r) => s+(parseFloat(r.Metros)||0),0).toFixed(1)),
      recuperado:   parseFloat(recup.rows.reduce((s,r) => s+(parseFloat(r.Avance)||0),0).toFixed(1)),
      fotografiado: parseFloat(foto.rows.reduce((s,r) => s+(parseFloat(r.Avance)||0),0).toFixed(1)),
      geotecnico:   parseFloat(geotec.rows.reduce((s,r) => s+(parseFloat(r.Avance)||0),0).toFixed(1)),
      geologico:    parseFloat(geolog.rows.reduce((s,r) => s+(parseFloat(r.Avance)||0),0).toFixed(1)),
    }

    // Serie temporal de perforación para gráfico acumulado
    // Calcular cuántas máquinas perforaron cada día
    const equipoInicio = {} // equipo → primera fecha que perforó
    perf.rows.forEach(r => {
      // Necesitamos saber el equipo — lo sacamos de programa_general
      const pg = prog.rows.find(p => p.DDHID === r.DDHID)
      const equipo = pg?.EQUIPO || r.DDHID // fallback al DDHID
      const f = r.Fecha instanceof Date
        ? (() => { const d=r.Fecha; return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` })()
        : String(r.Fecha).slice(0,10)
      if (!equipoInicio[equipo] || f < equipoInicio[equipo]) equipoInicio[equipo] = f
    })

    // Acumulado real por fecha
    const perfPorFecha = {}
    perf.rows.forEach(r => {
      const f = r.Fecha instanceof Date
        ? (() => { const d=r.Fecha; return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` })()
        : String(r.Fecha).slice(0,10)
      perfPorFecha[f] = (perfPorFecha[f] || 0) + (parseFloat(r.Total_Dia) || 0)
    })

    // Generar serie acumulada real + ideal acumulada
    const fechasOrdenadas = Object.keys(perfPorFecha).sort()
    let acumReal  = 0
    let acumIdeal = 0
    let maqPrevias = 0
    const serieReal  = []
    const serieIdeal = []

    fechasOrdenadas.forEach(f => {
      // Real acumulado
      acumReal += perfPorFecha[f]
      serieReal.push({ fecha: f, valor: parseFloat(acumReal.toFixed(1)) })

      // Ideal: cuántas máquinas han iniciado hasta este día (incluyendo hoy)
      // Una vez que una máquina inicia, se cuenta siempre aunque no reporte ese día
      const maqActivas = Object.values(equipoInicio).filter(ini => ini <= f).length
      // Si arrancó una nueva máquina hoy, el acumulado ideal salta
      // Sumamos 35 * maqActivas por cada día
      acumIdeal += 35 * maqActivas
      serieIdeal.push({ fecha: f, valor: parseFloat(acumIdeal.toFixed(1)) })
      maqPrevias = maqActivas
    })

    res.json({ porSondaje, totales, serieReal, serieIdeal, fechasOrdenadas })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/tables/resumen/equipo — actualiza EQUIPO en programa_general
router.put('/resumen/equipo', authMiddleware, async (req, res) => {
  if (!['ADMIN','SUPERVISOR'].includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos' })
  const { DDHID, EQUIPO } = req.body
  if (!DDHID) return res.status(400).json({ error: 'DDHID requerido' })
  try {
    await db.query(`UPDATE programa_general SET "EQUIPO"=$1 WHERE "DDHID"=$2`, [EQUIPO || '', DDHID])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/tables/resumen/estado
router.put('/resumen/estado', authMiddleware, async (req, res) => {
  if (!['ADMIN','SUPERVISOR'].includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos' })
  const { DDHID, ESTADO } = req.body
  if (!['En Proceso','Completado'].includes(ESTADO))
    return res.status(400).json({ error: 'Estado inválido' })
  try {
    await db.query(
      `INSERT INTO estado_overrides (ddhid,estado,updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (ddhid) DO UPDATE SET estado=$2, updated_at=NOW()`,
      [DDHID, ESTADO]
    )
    res.json({ DDHID, ESTADO })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/tables/resumen/estado/:ddhid
router.delete('/resumen/estado/:ddhid', authMiddleware, async (req, res) => {
  if (!['ADMIN','SUPERVISOR'].includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos' })
  try {
    await db.query('DELETE FROM estado_overrides WHERE ddhid=$1', [req.params.ddhid])
    res.json({ message: 'Restablecido' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── CRUD GENÉRICO ────────────────────────────────────────────────

// GET /api/tables/:table
router.get('/:table', authMiddleware, checkTable, async (req, res) => {
  try {
    const table = req.params.table
    let q = `SELECT * FROM ${table} ORDER BY id`
    const r = await db.query(q)
    let rows = r.rows.map(toRow)
    if (req.user.role === 'USER') {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 10)
      rows = rows.filter(row => !row.Fecha || new Date(row.Fecha) >= cutoff)
    }
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/tables/:table
router.post('/:table', authMiddleware, checkTable, canWrite, async (req, res) => {
  const table = req.params.table
  const row   = { ...req.body }
  row.Geologo = req.user.name

  try {
    // Obtener filas existentes para validar overlaps
    const existing = await db.query(`SELECT * FROM ${table}`)
    const errs = validateRow(table, row, existing.rows.map(toRow), null)
    if (errs.length) return res.status(400).json({ errors: errs })

    const cols = TABLE_COLS[table].filter(c => row[c] !== undefined && row[c] !== '')
    const vals = cols.map(c => row[c])
    const placeholders = cols.map((_, i) => `$${i+1}`).join(',')
    const colNames = cols.map(c => `"${c}"`).join(',')

    const r = await db.query(
      `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) RETURNING *`,
      vals
    )
    res.status(201).json(toRow(r.rows[0]))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/tables/:table/:id
router.put('/:table/:id', authMiddleware, checkTable, canWrite, async (req, res) => {
  const table = req.params.table
  const id    = parseInt(req.params.id)
  const row   = { ...req.body }
  row.Geologo = req.user.name

  try {
    const curr = await db.query(`SELECT * FROM ${table} WHERE id=$1`, [id])
    if (!curr.rows[0]) return res.status(404).json({ error: 'Registro no encontrado' })

    if (req.user.role === 'USER') {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 10)
      if (curr.rows[0].Fecha && new Date(curr.rows[0].Fecha) < cutoff)
        return res.status(403).json({ error: 'Solo puedes editar registros de los últimos 10 días' })
    }

    const existing = await db.query(`SELECT * FROM ${table}`)
    const errs = validateRow(table, row, existing.rows.map(toRow), id)
    if (errs.length) return res.status(400).json({ errors: errs })

    const cols = TABLE_COLS[table].filter(c => row[c] !== undefined)
    const sets = cols.map((c, i) => `"${c}"=$${i+1}`).join(',')
    const vals = [...cols.map(c => row[c] !== '' ? row[c] : null), id]

    const r = await db.query(
      `UPDATE ${table} SET ${sets} WHERE id=$${cols.length+1} RETURNING *`,
      vals
    )
    res.json(toRow(r.rows[0]))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/tables/:table/:id
router.delete('/:table/:id', authMiddleware, checkTable, async (req, res) => {
  if (!['ADMIN','SUPERVISOR'].includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos para eliminar' })
  try {
    const table = req.params.table
    const r = await db.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [parseInt(req.params.id)])
    if (!r.rows[0]) return res.status(404).json({ error: 'Registro no encontrado' })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
