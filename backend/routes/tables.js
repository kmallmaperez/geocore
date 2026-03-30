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
  muestreo:         ['Fecha','DDHID','BATCH','DE','HASTA','MUESTRAS','Geologo'],
  corte:            ['Fecha','DDHID','DE','A','AVANCE','CAJAS','MAQUINAS','OBSERVACIONES','Geologo'],
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
  if (u.role === 'VIEWER') return res.status(403).json({ error: 'Los visualizadores no pueden modificar datos' })
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

// GET /api/tables/ddhids/:tkey
// Devuelve los DDHID activos (no completados) filtrados por profundidad alcanzada en esa tabla.
// Si max(To) >= PROGRAMADO el sondaje ya no aparece en el dropdown de esa tabla.
router.get('/ddhids/:tkey', authMiddleware, async (req, res) => {
  const { tkey } = req.params

  // Campo "To" por tabla
  const TO_FIELD = {
    perforacion:  null,          // especial: max(TO_Dia, To_Noche)
    recepcion:    '"TO"',
    recuperacion: '"To"',
    fotografia:   '"To"',
    l_geotecnico: '"To"',
    l_geologico:  '"To"',
    // muestreo: no filtrar por profundidad — las muestras pueden tomarse en cualquier momento
    corte:        '"A"',
  }

  try {
    // 1. Todos los sondajes con su PROGRAMADO (no completados)
    const progRes = await db.query(`
      SELECT pg."DDHID", COALESCE(pg."LENGTH", 0) AS programado
      FROM programa_general pg
      WHERE pg."DDHID" IS NOT NULL AND pg."DDHID" <> ''
      ORDER BY pg."DDHID"
    `)

    // 2. Calcular profundidad máxima registrada en la tabla para cada DDHID
    let alcanzado = {}   // { DDHID: maxTo }

    if (tkey === 'perforacion') {
      const r = await db.query(`
        SELECT "DDHID",
               MAX(GREATEST(
                 COALESCE("TO_Dia"::numeric,   0),
                 COALESCE("To_Noche"::numeric, 0)
               )) AS max_to
        FROM perforacion
        WHERE "DDHID" IS NOT NULL
        GROUP BY "DDHID"
      `)
      r.rows.forEach(x => { alcanzado[x.DDHID] = parseFloat(x.max_to) || 0 })

    } else if (TO_FIELD[tkey]) {
      const field = TO_FIELD[tkey]
      const r = await db.query(`
        SELECT "DDHID", MAX(NULLIF(TRIM(${field}::text),'')::numeric) AS max_to
        FROM ${tkey}
        WHERE "DDHID" IS NOT NULL
        GROUP BY "DDHID"
      `)
      r.rows.forEach(x => { alcanzado[x.DDHID] = parseFloat(x.max_to) || 0 })
    }
    // Para tablas sin campo To (envios, batch, tormentas) alcanzado queda vacío → todos aparecen

    // 3. Filtrar: sondaje aparece si max_alcanzado < programado (o no tiene registros aún)
    const result = progRes.rows
      .filter(s => {
        const prog = parseFloat(s.programado) || 0
        const alc  = alcanzado[s.DDHID] ?? -1   // -1 = sin registros → siempre aparece
        if (prog <= 0) return true               // sin programado definido → siempre aparece
        return alc < prog
      })
      .map(s => s.DDHID)

    res.json(result)
  } catch (e) {
    console.error('ddhids/:tkey error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// GET /api/tables/resumen/general
router.get('/resumen/general', authMiddleware, async (req, res) => {
  try {
    const prog = await db.query('SELECT * FROM programa_general ORDER BY id')
    const perf = await db.query('SELECT * FROM perforacion ORDER BY id')
    const ov   = await db.query('SELECT * FROM estado_overrides')
    let platRows = []
    try { const pr = await db.query('SELECT * FROM plataforma_info'); platRows = pr.rows } catch(_){}
    const platMap = {}
    platRows.forEach(r => {
      if (r.DDHID) platMap[r.DDHID] = r
      if (r.PLATAFORMA && !r.DDHID) platMap['__PLAT__' + String(r.PLATAFORMA).trim()] = r
    })
    const overrides = {}
    ov.rows.forEach(r => { overrides[r.ddhid] = r.estado })

    // Helper: convierte fecha de BD a string YYYY-MM-DD
    function toISO(f) {
      if (!f) return null
      if (f instanceof Date) {
        const y = f.getUTCFullYear()
        const m = String(f.getUTCMonth()+1).padStart(2,'0')
        const d = String(f.getUTCDate()).padStart(2,'0')
        return `${y}-${m}-${d}`
      }
      return String(f).slice(0,10)
    }

    const resumen = prog.rows.map(p => {
      const programado = parseFloat(p.LENGTH) || 0
      const mp = perf.rows.filter(x => x.DDHID === p.DDHID)

      // Ordenar registros por fecha asc para calcular acumulado incremental
      const mpOrdenado = [...mp]
        .map(x => ({ fecha: toISO(x.Fecha), total: parseFloat(x.Total_Dia) || 0, acum: parseFloat(x.Acumulado) || 0 }))
        .filter(x => x.fecha)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))

      const ej = mpOrdenado.reduce((s, x) => s + x.total, 0)

      // ── FECHA_INICIO: primera fecha donde Total_Dia > 0 ──────────
      const inicioRow = mpOrdenado.find(x => x.total > 0)
      const fechaInicio = inicioRow?.fecha || null

      // ── FECHA_FIN: depende de si el sondaje está completo o no ───
      let fechaFin = null

      if (ej < programado) {
        // Condición 1: aún no completo → fecha max de cualquier registro
        const conFecha = mpOrdenado.map(x => x.fecha).filter(Boolean)
        fechaFin = conFecha.length ? conFecha[conFecha.length - 1] : null
      } else {
        // Condición 2: acumulado >= programado → fecha max donde Total_Dia > 0
        // (excluir registros de "ajuste" con 0m que vengan después de completar)
        const rowsConAvance = mpOrdenado.filter(x => x.total > 0).map(x => x.fecha)
        fechaFin = rowsConAvance.length ? rowsConAvance[rowsConAvance.length - 1] : null
      }

      const pct = programado > 0 ? Math.round(ej / programado * 100) : 0
      const estadoCalc = pct >= 100 ? 'Completado' : ej > 0 ? 'En Proceso' : 'Pendiente'

      return {
        DDHID:        p.DDHID, EQUIPO: p.EQUIPO || '',
        PLATAFORMA:   p.PLATAFORMA, PROGRAMADO: programado,
        EJECUTADO:    parseFloat(ej.toFixed(2)), ESTADO: overrides[p.DDHID] || estadoCalc,
        FECHA_INICIO: fechaInicio || '—',
        FECHA_FIN:    fechaFin    || '—',
        FECHA_ENTREGA_PLAT:  (platMap[p.DDHID] || platMap['__PLAT__' + String(p.PLATAFORMA||'').trim()])?.fecha_entrega_plataforma    || null,
        FECHA_PREINICIO:     (platMap[p.DDHID] || platMap['__PLAT__' + String(p.PLATAFORMA||'').trim()])?.fecha_preinicio_perforacion  || null,
        FECHA_CIERRE_PLAT:   (platMap[p.DDHID] || platMap['__PLAT__' + String(p.PLATAFORMA||'').trim()])?.fecha_cierre_plataforma      || null,
        STATUS_PLATAFORMA:   (platMap[p.DDHID] || platMap['__PLAT__' + String(p.PLATAFORMA||'').trim()])?.status_plataforma            || '',
        FORMATO_CHECKLIST:   (platMap[p.DDHID] || platMap['__PLAT__' + String(p.PLATAFORMA||'').trim()])?.formato_checklist            || '',
        ENTREGADO_POR:       (platMap[p.DDHID] || platMap['__PLAT__' + String(p.PLATAFORMA||'').trim()])?.entregado_por                || '',
        PCT: pct, _estadoManual: !!overrides[p.DDHID],
        ESTE:  parseFloat(p.ESTE  ?? p.este)  || null,
        NORTE: parseFloat(p.NORTE ?? p.norte) || null,
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
      db.query('SELECT "DDHID", "Fecha", "Turno_Dia", "Turno_Noche", "Total_Dia", "Acumulado" FROM perforacion ORDER BY "Fecha"'),
      db.query('SELECT "DDHID", MAX(NULLIF(TRIM("TO" ::text),\'\')::numeric) AS max_to FROM recepcion    GROUP BY "DDHID"'),
      db.query('SELECT "DDHID", MAX(NULLIF(TRIM("To" ::text),\'\')::numeric) AS max_to, MAX("Fecha") AS ultima_fecha FROM recuperacion  GROUP BY "DDHID"'),
      db.query('SELECT "DDHID", MAX(NULLIF(TRIM("To" ::text),\'\')::numeric) AS max_to, MAX("Fecha") AS ultima_fecha FROM fotografia    GROUP BY "DDHID"'),
      db.query('SELECT "DDHID", MAX(NULLIF(TRIM("To" ::text),\'\')::numeric) AS max_to, MAX("Fecha") AS ultima_fecha FROM l_geotecnico  GROUP BY "DDHID"'),
      db.query('SELECT "DDHID", MAX(NULLIF(TRIM("To" ::text),\'\')::numeric) AS max_to, MAX("Fecha") AS ultima_fecha FROM l_geologico   GROUP BY "DDHID"'),
      db.query('SELECT * FROM estado_overrides'),
    ])

    const overrides = {}
    ov.rows.forEach(r => { overrides[r.ddhid] = r.estado })

    // MAX(To) por DDHID helper — cada tabla viene agrupada
    function maxBy(rows, ddhid) {
      const row = rows.find(r => r.DDHID === ddhid)
      return parseFloat(row?.max_to || 0)
    }

    // Tabla de resumen por sondaje
    const porSondaje = prog.rows
      .filter(p => p.DDHID && String(p.DDHID).trim() !== '')
      .map(p => {
        const perfRows = perf.rows.filter(x => x.DDHID === p.DDHID)
        // Usar MAX(Acumulado) del sondaje como metros reales perforados
        const maxAcum = perfRows.reduce((max, x) => {
          const a = parseFloat(x.Acumulado) || 0
          return a > max ? a : max
        }, 0)
        // Fallback: si no hay Acumulado, usar suma de Total_Dia
        const sumTotal = perfRows.reduce((s, x) => s + (parseFloat(x.Total_Dia) || 0), 0)
        const perfTotal = maxAcum > 0 ? maxAcum : sumTotal
        const fechas = perfRows.map(x => x.Fecha).filter(Boolean).map(f => {
          if (f instanceof Date) {
            const y = f.getUTCFullYear(), m = String(f.getUTCMonth()+1).padStart(2,'0'), d = String(f.getUTCDate()).padStart(2,'0')
            return `${y}-${m}-${d}`
          }
          return String(f).slice(0,10)
        }).sort()
        const programado2 = parseFloat(p.LENGTH || 0)
        const pct = programado2 > 0 ? Math.round(perfTotal / programado2 * 100) : 0
        const estadoCalc = pct >= 100 ? 'Completado' : perfTotal > 0 ? 'En Proceso' : 'Pendiente'

        // FECHA_INICIO: primera fecha con Total_Dia > 0
        const perfOrd = perfRows
          .map(x => ({ fecha: (() => { const f=x.Fecha; if(!f) return null; if(f instanceof Date){const y=f.getUTCFullYear(),m=String(f.getUTCMonth()+1).padStart(2,'0'),d=String(f.getUTCDate()).padStart(2,'0');return `${y}-${m}-${d}`} return String(f).slice(0,10) })(), total: parseFloat(x.Total_Dia)||0 }))
          .filter(x => x.fecha)
          .sort((a,b) => a.fecha.localeCompare(b.fecha))
        const inicioRow2 = perfOrd.find(x => x.total > 0)
        const fechaInicio2 = inicioRow2?.fecha || null
        // FECHA_FIN: misma lógica que resumen/general
        let fechaFin2 = null
        if (perfTotal < programado2) {
          const cf = perfOrd.map(x=>x.fecha).filter(Boolean)
          fechaFin2 = cf.length ? cf[cf.length-1] : null
        } else {
          const cf2 = perfOrd.filter(x=>x.total>0).map(x=>x.fecha)
          fechaFin2 = cf2.length ? cf2[cf2.length-1] : null
        }

        return {
          DDHID: p.DDHID,
          EQUIPO: p.EQUIPO ? String(p.EQUIPO).trim() : '',
          PROGRAMADO: programado2,
          PERFORADO:  parseFloat(perfTotal.toFixed(2)),
          RECEPCION:    parseFloat(maxBy(recep.rows,  p.DDHID).toFixed(2)),
          RECUPERADO:   parseFloat(maxBy(recup.rows,  p.DDHID).toFixed(2)),
          FOTOGRAFIADO: parseFloat(maxBy(foto.rows,   p.DDHID).toFixed(2)),
          GEOTECNICO:   parseFloat(maxBy(geotec.rows, p.DDHID).toFixed(2)),
          GEOLOGICO:    parseFloat(maxBy(geolog.rows, p.DDHID).toFixed(2)),
          ESTADO: overrides[p.DDHID] || estadoCalc,
          PCT: pct,
          FECHA_INICIO: fechaInicio2 || null,
          FECHA_FIN:    fechaFin2    || null,
        }
      })

    // Helper: última fecha de una tabla
    function ultimaFecha(rows, col = 'Fecha') {
      const fechas = rows.map(r => r[col]).filter(Boolean).map(f => {
        if (f instanceof Date) {
          const y=f.getUTCFullYear(),m=String(f.getUTCMonth()+1).padStart(2,'0'),d=String(f.getUTCDate()).padStart(2,'0')
          return `${y}-${m}-${d}`
        }
        return String(f).slice(0,10)
      }).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort()
      return fechas[fechas.length-1] || ''
    }

    // Totales globales — suma de MAX(To) por sondaje (ya vienen agrupados)
    const totales = {
      // Total perforado = suma del MAX(Acumulado) por DDHID
      // Acumulado refleja la profundidad real alcanzada; Total_Dia es solo el incremento diario
      perforado: (() => {
        const maxAcumPorDDHID = {}
        perf.rows.forEach(r => {
          const acum = parseFloat(r.Acumulado) || 0
          if (!maxAcumPorDDHID[r.DDHID] || acum > maxAcumPorDDHID[r.DDHID]) {
            maxAcumPorDDHID[r.DDHID] = acum
          }
        })
        return parseFloat(Object.values(maxAcumPorDDHID).reduce((s,v) => s+v, 0).toFixed(2))
      })(),
      recepcion:    parseFloat(recep.rows.reduce((s,r) => s+(parseFloat(r.max_to)||0),0).toFixed(2)),
      recuperado:   parseFloat(recup.rows.reduce((s,r) => s+(parseFloat(r.max_to)||0),0).toFixed(2)),
      fotografiado: parseFloat(foto.rows.reduce((s,r) => s+(parseFloat(r.max_to)||0),0).toFixed(2)),
      geotecnico:   parseFloat(geotec.rows.reduce((s,r) => s+(parseFloat(r.max_to)||0),0).toFixed(2)),
      geologico:    parseFloat(geolog.rows.reduce((s,r) => s+(parseFloat(r.max_to)||0),0).toFixed(2)),
    }

    // Últimas fechas de reporte por tabla
    function maxFechaDeGrupo(rows) {
      const fechas = rows.map(r => r.ultima_fecha).filter(Boolean).map(f => {
        if (f instanceof Date) {
          const y=f.getUTCFullYear(),m=String(f.getUTCMonth()+1).padStart(2,'0'),d=String(f.getUTCDate()).padStart(2,'0')
          return `${y}-${m}-${d}`
        }
        return String(f).slice(0,10)
      }).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort()
      return fechas[fechas.length-1] || ''
    }
    const ultimasFechas = {
      perf:  ultimaFecha(perf.rows),
      recup: maxFechaDeGrupo(recup.rows),
      foto:  maxFechaDeGrupo(foto.rows),
      geot:  maxFechaDeGrupo(geotec.rows),
      geol:  maxFechaDeGrupo(geolog.rows),
    }

    // Serie temporal de perforación para gráfico acumulado
    // Calcular cuántas máquinas perforaron cada día
    // equipoInicio: solo equipos con nombre asignado (no vacíos)
    // Cada equipo físico (máquina) → fecha en que empezó a perforar por primera vez
    const equipoInicio = {}
    perf.rows.forEach(r => {
      const pg = prog.rows.find(p => p.DDHID === r.DDHID)
      const equipo = pg?.EQUIPO ? String(pg.EQUIPO).trim() : null
      if (!equipo) return // sin equipo asignado, no cuenta para el ideal
      const f = r.Fecha instanceof Date
        ? (() => { const d=r.Fecha; return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` })()
        : String(r.Fecha).slice(0,10)
      if (!equipoInicio[equipo] || f < equipoInicio[equipo]) equipoInicio[equipo] = f
    })

    // ── Programa semanal fijo ────────────────────────────────────────
    const PROGRAMA = [
      {f:'2025-12-31',a:2196},{f:'2026-01-04',a:2621},{f:'2026-01-11',a:3365},
      {f:'2026-01-18',a:4109},{f:'2026-01-25',a:4853},{f:'2026-01-31',a:5490},
      {f:'2026-02-01',a:5608},{f:'2026-02-08',a:6431},{f:'2026-02-15',a:7254},
      {f:'2026-02-22',a:8077},{f:'2026-02-28',a:8784},{f:'2026-03-01',a:8908},
      {f:'2026-03-08',a:9776},{f:'2026-03-15',a:10644},{f:'2026-03-22',a:11512},
      {f:'2026-03-29',a:12380},{f:'2026-03-31',a:12627},{f:'2026-04-05',a:13451},
      {f:'2026-04-12',a:14604},{f:'2026-04-19',a:15757},{f:'2026-04-26',a:16910},
      {f:'2026-04-30',a:17569},{f:'2026-05-03',a:18100},{f:'2026-05-10',a:19340},
      {f:'2026-05-17',a:20580},{f:'2026-05-24',a:21820},{f:'2026-05-31',a:23059},
      {f:'2026-06-07',a:23828},{f:'2026-06-14',a:24597},{f:'2026-06-21',a:25366},
      {f:'2026-06-28',a:26135},{f:'2026-06-30',a:26353},{f:'2026-07-05',a:26619},
      {f:'2026-07-12',a:26991},{f:'2026-07-19',a:27363},{f:'2026-07-26',a:27735},
      {f:'2026-07-31',a:28000},
    ]

    // ── Acumulado real diario ─────────────────────────────────────
    // Para cada fecha: MAX(Acumulado) de todos los sondajes activos hasta esa fecha
    // Usamos el Acumulado (profundidad real por sondaje) en lugar de Total_Dia
    // para evitar inconsistencias por registros duplicados o correcciones
    const perfPorFecha = {}
    // Primero agrupamos por DDHID+Fecha para obtener el Acumulado máximo de ese día por sondaje
    const acumPorDDHIDFecha = {}
    perf.rows.forEach(r => {
      const f = r.Fecha instanceof Date
        ? (() => { const d=r.Fecha; return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` })()
        : String(r.Fecha).slice(0,10)
      const key = r.DDHID + '|' + f
      const acum = parseFloat(r.Acumulado) || 0
      const totalDia = parseFloat(r.Total_Dia) || 0
      if (!acumPorDDHIDFecha[key]) acumPorDDHIDFecha[key] = { ddhid: r.DDHID, fecha: f, acum: 0, total: 0 }
      if (acum > acumPorDDHIDFecha[key].acum) acumPorDDHIDFecha[key].acum = acum
      acumPorDDHIDFecha[key].total += totalDia
    })
    // Para el gráfico diario, calculamos el incremento real usando Acumulado:
    // incremento del día = Acumulado(hoy) - Acumulado(día_anterior) por DDHID
    const maxAcumPorDDHID = {}  // máximo Acumulado conocido por DDHID hasta cada fecha
    const fechasConDatos = [...new Set(Object.values(acumPorDDHIDFecha).map(x => x.fecha))].sort()
    fechasConDatos.forEach(f => {
      let incrementoTotal = 0
      const registrosDelDia = Object.values(acumPorDDHIDFecha).filter(x => x.fecha === f)
      registrosDelDia.forEach(reg => {
        const prevMax = maxAcumPorDDHID[reg.ddhid] || 0
        if (reg.acum > 0) {
          // Tenemos Acumulado: el incremento es la diferencia con el máximo anterior
          const inc = reg.acum - prevMax
          if (inc > 0) incrementoTotal += inc
          if (reg.acum > prevMax) maxAcumPorDDHID[reg.ddhid] = reg.acum
        } else {
          // Sin Acumulado: usar Total_Dia como fallback
          incrementoTotal += reg.total
          maxAcumPorDDHID[reg.ddhid] = prevMax + reg.total
        }
      })
      perfPorFecha[f] = incrementoTotal
    })

    // Serie diaria (para CSV diario)
    const fechasOrdenadas = Object.keys(perfPorFecha).sort()
    let _acum = 0
    const serieDiaria = fechasOrdenadas.map(f => {
      _acum += perfPorFecha[f]
      const maq = Object.values(equipoInicio).filter(ini => ini <= f).length || 1
      return { fecha: f, real: parseFloat(_acum.toFixed(2)), maquinas: maq }
    })

    // ── Serie sobre fechas del PROGRAMA ──────────────────────────
    // Para cada fecha del programa: acumulado real hasta esa fecha
    // e ideal acumulado (35m × máquinas activas × días desde fecha anterior del programa)
    let acumRealProg  = 0
    let acumIdealProg = 0
    let fechaAnt = null

    const serieProg = PROGRAMA.map(({ f, a: acumProg }) => {
      // Real: suma de todo lo perforado hasta esta fecha (inclusive)
      acumRealProg = serieDiaria
        .filter(d => d.fecha <= f)
        .reduce((s, d) => s + (perfPorFecha[d.fecha] || 0), 0)

      // Ideal: 35m × máquinas activas × días transcurridos en este período
      if (fechaAnt !== null) {
        const dias = Math.round((new Date(f) - new Date(fechaAnt)) / 86400000)
        // Usar promedio de máquinas activas en el período
        const maqEnPeriodo = Object.values(equipoInicio).filter(ini => ini <= f).length || 1
        acumIdealProg += 35 * maqEnPeriodo * dias
      }
      fechaAnt = f

      return {
        fecha:     f,
        acumProg:  acumProg,
        acumReal:  parseFloat(acumRealProg.toFixed(2)),
        acumIdeal: parseFloat(acumIdealProg.toFixed(2)),
        maquinas:  Object.values(equipoInicio).filter(ini => ini <= f).length || 1,
      }
    })

    // ── Agregar la fecha del último reporte real si no está en el programa ──
    // Garantiza que la línea ejecutada siempre llegue hasta el último dato disponible
    const fechasProgSet = new Set(PROGRAMA.map(p => p.f))
    const ultimaFechaReal = fechasOrdenadas[fechasOrdenadas.length - 1] // última fecha con datos reales

    if (ultimaFechaReal && !fechasProgSet.has(ultimaFechaReal)) {
      // Calcular acumulado real hasta esa fecha
      const acumRealUlt = serieDiaria
        .filter(d => d.fecha <= ultimaFechaReal)
        .reduce((s, d) => s + (perfPorFecha[d.fecha] || 0), 0)

      const maqUlt = Object.values(equipoInicio).filter(ini => ini <= ultimaFechaReal).length || 1

      // Interpolar acumulado programado entre los puntos del programa que la rodean
      const anterior  = [...serieProg].reverse().find(p => p.fecha < ultimaFechaReal)
      const siguiente = serieProg.find(p => p.fecha > ultimaFechaReal)
      let acumProgUlt = anterior?.acumProg ?? 0
      if (anterior && siguiente) {
        const diasTotal = Math.round((new Date(siguiente.fecha) - new Date(anterior.fecha)) / 86400000)
        const diasUlt   = Math.round((new Date(ultimaFechaReal) - new Date(anterior.fecha)) / 86400000)
        const ratio = diasTotal > 0 ? diasUlt / diasTotal : 0
        acumProgUlt = parseFloat((anterior.acumProg + (siguiente.acumProg - anterior.acumProg) * ratio).toFixed(2))
      }

      // Acumulado ideal: tomar el ideal del punto anterior del programa y sumar días transcurridos
      const diasDesdeAnt = anterior ? Math.round((new Date(ultimaFechaReal) - new Date(anterior.fecha)) / 86400000) : 0
      const acumIdealAnt = anterior ? serieProg.find(p => p.fecha === anterior.fecha)?.acumIdeal ?? 0 : 0
      const acumIdealUlt = parseFloat((acumIdealAnt + 35 * maqUlt * diasDesdeAnt).toFixed(2))

      // Insertar en la posición correcta (orden cronológico)
      const insertIdx = serieProg.findIndex(p => p.fecha > ultimaFechaReal)
      const puntoExtra = {
        fecha:     ultimaFechaReal,
        acumProg:  acumProgUlt,
        acumReal:  parseFloat(acumRealUlt.toFixed(2)),
        acumIdeal: acumIdealUlt,
        maquinas:  maqUlt,
        esExtra:   true,
      }
      if (insertIdx === -1) serieProg.push(puntoExtra)
      else serieProg.splice(insertIdx, 0, puntoExtra)
    }

    // 2 últimos sondajes completados (por FECHA_FIN desc)
    const completados = porSondaje
      .filter(s => s.ESTADO === 'Completado' && s.FECHA_FIN)
      .sort((a, b) => (b.FECHA_FIN||'').localeCompare(a.FECHA_FIN||''))
      .slice(0, 2)

    res.json({
      porSondaje, totales, ultimasFechas,
      serieProg,       // serie sobre fechas del programa (gráfico principal)
      serieDiaria,     // serie diaria (CSV detalle)
      fechasOrdenadas, // fechas con dato real
      completadosRecientes: completados
    })
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

// PUT /api/tables/resumen/plataforma
router.put('/resumen/plataforma', authMiddleware, async (req, res) => {
  if (!['ADMIN','SUPERVISOR'].includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos' })
  const { DDHID, campo, valor } = req.body
  if (!DDHID || !campo) return res.status(400).json({ error: 'DDHID y campo requeridos' })
  const VALIDOS = ['fecha_entrega_plataforma','fecha_preinicio_perforacion','fecha_cierre_plataforma',
                   'status_plataforma','formato_checklist','entregado_por']
  if (!VALIDOS.includes(campo)) return res.status(400).json({ error: 'Campo no válido' })
  try {
    // Migración completa: manejar tabla vieja (DDHID TEXT PRIMARY KEY) o nueva (id SERIAL)
    await db.query(`
      CREATE TABLE IF NOT EXISTS plataforma_info (
        "DDHID" TEXT PRIMARY KEY,
        fecha_entrega_plataforma    DATE,
        fecha_preinicio_perforacion DATE,
        fecha_cierre_plataforma     DATE,
        status_plataforma           TEXT,
        formato_checklist           TEXT,
        entregado_por               TEXT,
        updated_at                  TIMESTAMP DEFAULT NOW()
      )
    `)
    // Agregar columnas nuevas si no existen
    await db.query(`ALTER TABLE plataforma_info ADD COLUMN IF NOT EXISTS "PLATAFORMA" TEXT`).catch(()=>{})
    await db.query(`ALTER TABLE plataforma_info ADD COLUMN IF NOT EXISTS id SERIAL`).catch(()=>{})
    // Permitir DDHID nulo (para plataformas sin sondaje)
    await db.query(`ALTER TABLE plataforma_info ALTER COLUMN "DDHID" DROP NOT NULL`).catch(()=>{})
    // Quitar PRIMARY KEY de DDHID si existe (para permitir nulos)
    await db.query(`ALTER TABLE plataforma_info DROP CONSTRAINT IF EXISTS plataforma_info_pkey`).catch(()=>{})

    const val = (valor === '' || valor === null) ? null : valor

    // DDHID puede ser 'PLAT:NombrePlataforma' cuando no hay sondaje asignado
    let realDDHID = DDHID, realPLAT = null
    if (String(DDHID).startsWith('PLAT:')) {
      realPLAT  = String(DDHID).slice(5)
      realDDHID = null
    }

    if (realDDHID) {
      // Con DDHID: buscar si existe y hacer UPDATE o INSERT
      const existeDDHID = await db.query(
        `SELECT id FROM plataforma_info WHERE "DDHID"=$1`, [realDDHID]
      )
      if (existeDDHID.rows.length > 0) {
        await db.query(
          `UPDATE plataforma_info SET "${campo}"=$1, updated_at=NOW() WHERE "DDHID"=$2`,
          [val, realDDHID]
        )
      } else {
        await db.query(
          `INSERT INTO plataforma_info ("DDHID", "${campo}", updated_at) VALUES ($1,$2,NOW())`,
          [realDDHID, val]
        )
      }
    } else {
      // Sin DDHID: upsert por PLATAFORMA
      const existing = await db.query(
        `SELECT id FROM plataforma_info WHERE "PLATAFORMA"=$1 AND "DDHID" IS NULL`,
        [realPLAT]
      )
      if (existing.rows.length > 0) {
        await db.query(
          `UPDATE plataforma_info SET "${campo}"=$1, updated_at=NOW() WHERE "PLATAFORMA"=$2 AND "DDHID" IS NULL`,
          [val, realPLAT]
        )
      } else {
        await db.query(
          `INSERT INTO plataforma_info ("PLATAFORMA", "${campo}", updated_at) VALUES ($1,$2,NOW())`,
          [realPLAT, val]
        )
      }
    }
    res.json({ success:true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// GET /api/tables/resumen/plataforma — todos los registros de plataforma_info
router.get('/resumen/plataforma', authMiddleware, async (req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS plataforma_info (
        id                          SERIAL PRIMARY KEY,
        "DDHID"                     TEXT,
        "PLATAFORMA"                TEXT,
        fecha_entrega_plataforma    DATE,
        fecha_preinicio_perforacion DATE,
        fecha_cierre_plataforma     DATE,
        status_plataforma           TEXT,
        formato_checklist           TEXT,
        entregado_por               TEXT,
        updated_at                  TIMESTAMP DEFAULT NOW()
      )
    `)
    const r = await db.query('SELECT * FROM plataforma_info ORDER BY id')
    res.json(r.rows)
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// GET /api/tables/duplicados — escanea todas las tablas buscando DDHID+FROM+TO repetidos
router.get('/duplicados', authMiddleware, async (req, res) => {
  if (req.user.role !== 'ADMIN')
    return res.status(403).json({ error: 'Solo administradores' })

  // Definición: tabla → campos DDHID, from, to
  const TABLAS = [
    { key:'recuperacion', ddhid:'"DDHID"', from:'"From"',  to:'"To"'   },
    { key:'fotografia',   ddhid:'"DDHID"', from:'"From"',  to:'"To"'   },
    { key:'l_geotecnico', ddhid:'"DDHID"', from:'"From"',  to:'"To"'   },
    { key:'l_geologico',  ddhid:'"DDHID"', from:'"From"',  to:'"To"'   },
    { key:'muestreo',     ddhid:'"DDHID"', from:'"DE"',    to:'"HASTA"'},
    { key:'corte',        ddhid:'"DDHID"', from:'"DE"',    to:'"A"'    },
    { key:'recepcion',    ddhid:'"DDHID"', from:'"FROM"',  to:'"TO"'   },
  ]

  const result = {}

  try {
    // Tablas regulares
    for (const t of TABLAS) {
      // Encontrar grupos con más de 1 registro con mismo DDHID+from+to
      const dupQ = await db.query(`
        SELECT ${t.ddhid} AS ddhid,
               ${t.from}::text  AS from_val,
               ${t.to}::text    AS to_val,
               array_agg(id ORDER BY id) AS ids,
               COUNT(*) AS cnt
        FROM ${t.key}
        WHERE ${t.ddhid} IS NOT NULL
          AND ${t.from} IS NOT NULL
          AND ${t.to}   IS NOT NULL
        GROUP BY ${t.ddhid}, ${t.from}, ${t.to}
        HAVING COUNT(*) > 1
      `)
      if (dupQ.rows.length === 0) { result[t.key] = []; continue }

      // Traer todos los registros de esos grupos
      const grupos = []
      for (const dup of dupQ.rows) {
        const regsQ = await db.query(
          `SELECT * FROM ${t.key} WHERE id = ANY($1) ORDER BY id`,
          [dup.ids]
        )
        grupos.push({
          key:       `${dup.ddhid}_${dup.from_val}_${dup.to_val}`,
          ddhid:     dup.ddhid,
          from_val:  dup.from_val,
          to_val:    dup.to_val,
          registros: regsQ.rows,
        })
      }
      result[t.key] = grupos
    }

    // Quick Log (campos diferentes)
    try {
      const dupQL = await db.query(`
        SELECT "DDHID" AS ddhid,
               from_m::text AS from_val,
               to_m::text   AS to_val,
               array_agg(id ORDER BY id) AS ids,
               COUNT(*) AS cnt
        FROM quick_log
        WHERE "DDHID" IS NOT NULL AND from_m IS NOT NULL AND to_m IS NOT NULL
        GROUP BY "DDHID", from_m, to_m
        HAVING COUNT(*) > 1
      `)
      if (dupQL.rows.length === 0) { result.quicklog = []; }
      else {
        const grupos = []
        for (const dup of dupQL.rows) {
          const regsQ = await db.query(
            `SELECT * FROM quick_log WHERE id = ANY($1) ORDER BY id`,
            [dup.ids]
          )
          grupos.push({
            key:       `${dup.ddhid}_${dup.from_val}_${dup.to_val}`,
            ddhid:     dup.ddhid,
            from_val:  dup.from_val,
            to_val:    dup.to_val,
            registros: regsQ.rows,
          })
        }
        result.quicklog = grupos
      }
    } catch(_) { result.quicklog = [] }

    res.json(result)
  } catch(err) {
    console.error('duplicados error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── CRUD GENÉRICO ────────────────────────────────────────────────

// GET /api/tables/:table
router.get('/:table', authMiddleware, checkTable, async (req, res) => {
  try {
    const table = req.params.table
    let q = `SELECT * FROM ${table} ORDER BY id`
    const r = await db.query(q)
    const rows = r.rows.map(toRow)
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
      // Solo puede editar si es dueño del registro (campo Geologo)
      const geologo = curr.rows[0].Geologo || curr.rows[0].geologo
      if (geologo && geologo !== req.user.name)
        return res.status(403).json({ error: 'Solo puedes editar tus propios registros' })
      // Restricción de tiempo: últimos 10 días
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
  try {
    const table = req.params.table
    const id    = parseInt(req.params.id)
    // Verificar que el registro existe
    const curr = await db.query(`SELECT * FROM ${table} WHERE id=$1`, [id])
    if (!curr.rows[0]) return res.status(404).json({ error: 'Registro no encontrado' })

    // ADMIN y SUPERVISOR pueden eliminar cualquier registro
    if (!['ADMIN','SUPERVISOR'].includes(req.user.role)) {
      // USER: solo puede eliminar si es dueño del registro
      const geologo = curr.rows[0].Geologo || curr.rows[0].geologo
      if (!geologo || geologo !== req.user.name)
        return res.status(403).json({ error: 'Solo puedes eliminar tus propios registros' })
    }

    const r = await db.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
