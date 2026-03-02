// ── VALIDACIONES SERVER-SIDE ─────────────────────────────────────

const FROM_TO_COLS = {
  recepcion:    ['FROM',  'TO'],
  recuperacion: ['From',  'To'],
  fotografia:   ['From',  'To'],
  l_geotecnico: ['From',  'To'],
  l_geologico:  ['From',  'To'],
  muestreo:     ['DE',    'HASTA'],
  corte:        ['DE',    'A'],
}

const AVANCE_TABLES = ['recuperacion','fotografia','l_geotecnico','l_geologico','corte']

const REQUIRED_FIELDS = {
  programa_general: ['PLATAFORMA','ESTE','NORTE','ELEV','LENGTH'],
  perforacion:      ['DDHID','Fecha'],
  recepcion:        ['Fecha','HORA','DDHID','CAJAS'],
  recuperacion:     ['Fecha','DDHID'],
  fotografia:       ['Fecha','DDHID','N_Foto'],
  l_geotecnico:     ['Fecha','DDHID','PLT','UCS'],
  l_geologico:      ['Fecha','DDHID'],
  muestreo:         ['Fecha','DDHID','DE','HASTA','MUESTRAS'],
  corte:            ['Fecha','DDHID','CAJAS','MAQUINAS'],
  envios:           ['Fecha','Envio_N','Total_muestras'],
  batch:            ['Envio','Batch','Sondaje'],
  tormentas:        ['Fecha','Desde','Hasta'],
}

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== ''
}

function validateRow(tableName, row, existingRows = [], editId = null) {
  const errors = []

  // 1. Campos obligatorios
  ;(REQUIRED_FIELDS[tableName] || []).forEach(field => {
    if (!hasValue(row[field]))
      errors.push({ field, message: `"${field}" es obligatorio` })
  })

  // 2. Perforación: validaciones de turnos + traslapes
  if (tableName === 'perforacion') {
    const fd = parseFloat(row.From_Dia),  td = parseFloat(row.TO_Dia)
    const fn = parseFloat(row.From_Noche), tn = parseFloat(row.To_Noche)
    const hasDia   = hasValue(row.From_Dia)   && hasValue(row.TO_Dia)   && !isNaN(fd) && !isNaN(td)
    const hasNoche = hasValue(row.From_Noche) && hasValue(row.To_Noche) && !isNaN(fn) && !isNaN(tn)

    // A. From <= To dentro de cada turno
    if (hasDia) {
      if (fd > td)
        errors.push({ field:'TO_Dia', message:`TO_Día (${td}) debe ser ≥ From_Día (${fd})` })
      else
        row.Turno_Dia = parseFloat((td - fd).toFixed(2))
    }
    if (hasNoche) {
      if (fn > tn)
        errors.push({ field:'To_Noche', message:`To_Noche (${tn}) debe ser ≥ From_Noche (${fn})` })
      else
        row.Turno_Noche = parseFloat((tn - fn).toFixed(2))
    }

    // B. Traslape entre turno DÍA y turno NOCHE del mismo registro
    if (hasDia && hasNoche && fd < td && fn < tn) {
      // Se superponen si los intervalos [fd,td] y [fn,tn] se cruzan
      if (fd < tn && td > fn) {
        errors.push({
          field: 'From_Noche',
          message: `Traslape entre Turno Día (${fd}–${td}) y Turno Noche (${fn}–${tn}) en el mismo reporte`
        })
      }
    }

    // C. Traslape con registros históricos del mismo sondaje
    if (errors.length === 0) {
      const historico = existingRows.filter(r => r.DDHID === row.DDHID && r.id !== editId)
      for (const r of historico) {
        const rfd = parseFloat(r.From_Dia),  rtd = parseFloat(r.TO_Dia)
        const rfn = parseFloat(r.From_Noche), rtn = parseFloat(r.To_Noche)
        const rHasDia   = !isNaN(rfd) && !isNaN(rtd) && rfd < rtd
        const rHasNoche = !isNaN(rfn) && !isNaN(rtn) && rfn < rtn

        // Día nuevo vs Día histórico
        if (hasDia && fd < td && rHasDia) {
          if (fd < rtd && td > rfd) {
            errors.push({ field:'From_Dia', message:`Traslape Turno Día (${fd}–${td}) con registro existente (${rfd}–${rtd}) en ${row.DDHID}` })
            break
          }
        }
        // Noche nuevo vs Noche histórica
        if (hasNoche && fn < tn && rHasNoche) {
          if (fn < rtn && tn > rfn) {
            errors.push({ field:'From_Noche', message:`Traslape Turno Noche (${fn}–${tn}) con registro existente (${rfn}–${rtn}) en ${row.DDHID}` })
            break
          }
        }
        // Día nuevo vs Noche histórica
        if (hasDia && fd < td && rHasNoche) {
          if (fd < rtn && td > rfn) {
            errors.push({ field:'From_Dia', message:`Traslape Turno Día (${fd}–${td}) con Turno Noche histórico (${rfn}–${rtn}) en ${row.DDHID}` })
            break
          }
        }
        // Noche nuevo vs Día histórico
        if (hasNoche && fn < tn && rHasDia) {
          if (fn < rtd && tn > rfd) {
            errors.push({ field:'From_Noche', message:`Traslape Turno Noche (${fn}–${tn}) con Turno Día histórico (${rfd}–${rtd}) en ${row.DDHID}` })
            break
          }
        }
        if (errors.length > 0) break
      }
    }

    // D. Totales y acumulado (solo si no hay errores de traslape)
    const turnoD = parseFloat(row.Turno_Dia) || 0
    const turnoN = parseFloat(row.Turno_Noche) || 0
    row.Total_Dia = parseFloat((turnoD + turnoN).toFixed(2))

    const prev = existingRows
      .filter(r => r.DDHID === row.DDHID && r.id !== editId)
      .reduce((s, r) => s + (parseFloat(r.Total_Dia) || 0), 0)
    row.Acumulado = parseFloat((prev + row.Total_Dia).toFixed(2))
  }

  // 3. Recepción: Metros = TO - FROM (auto)
  if (tableName === 'recepcion') {
    const f = parseFloat(row.FROM), t = parseFloat(row.TO)
    if (!isNaN(f) && !isNaN(t) && t >= f) row.Metros = parseFloat((t - f).toFixed(2))
  }

  // 4. Tormentas: calcular Minutos y Horas
  if (tableName === 'tormentas' && row.Desde && row.Hasta) {
    const [hd, md] = row.Desde.split(':').map(Number)
    const [hh, mh] = row.Hasta.split(':').map(Number)
    if (!isNaN(hd) && !isNaN(hh)) {
      const mins = (hh * 60 + mh) - (hd * 60 + md)
      if (mins >= 0) { row.Minutos = mins; row.Horas = parseFloat((mins/60).toFixed(2)); row.TOTAL = mins }
      else errors.push({ field:'Hasta', message:'"Hasta" debe ser posterior a "Desde"' })
    }
  }

  // 5. FROM <= TO genérico
  //    Vacíos = OK (no se loggeó ese intervalo)
  //    Iguales = OK (avance 0)
  //    FROM > TO = ERROR
  const ftCols = FROM_TO_COLS[tableName]
  if (ftCols) {
    const [fc, tc] = ftCols
    if (hasValue(row[fc]) && hasValue(row[tc])) {
      const f = parseFloat(row[fc]), t = parseFloat(row[tc])
      if (!isNaN(f) && !isNaN(t)) {
        if (f < 0) {
          errors.push({ field: fc, message: `"${fc}" no puede ser negativo` })
        } else if (f > t) {
          errors.push({ field: tc, message: `"${tc}" (${t}) debe ser ≥ "${fc}" (${f})` })
        } else {
          // Avance auto
          if (AVANCE_TABLES.includes(tableName)) row.Avance = parseFloat((t - f).toFixed(2))
          // Overlap solo cuando hay avance real (f < t)
          if (f < t) {
            const same = existingRows.filter(r => r.DDHID === row.DDHID && r.id !== editId)
            for (const r of same) {
              const rf = parseFloat(r[fc]), rt = parseFloat(r[tc])
              if (!isNaN(rf) && !isNaN(rt) && rf < rt && f < rt && t > rf) {
                errors.push({ field: fc, message: `Overlap: ${f}–${t} se superpone con ${rf}–${rt} en ${row.DDHID}` })
                break
              }
            }
          }
        }
      }
    }
  }

  // 6. Fechas
  ;['Fecha','F_Envio','F_Solicitud','F_Resultados'].forEach(field => {
    if (hasValue(row[field]) && isNaN(new Date(row[field]).getTime()))
      errors.push({ field, message: `"${field}" no es fecha válida (YYYY-MM-DD)` })
  })

  // 7. Horas
  ;['HORA','Desde','Hasta'].forEach(field => {
    if (hasValue(row[field]) && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(row[field]))
      errors.push({ field, message: `"${field}" debe tener formato HH:MM` })
  })

  return errors
}

module.exports = { validateRow, FROM_TO_COLS, AVANCE_TABLES, REQUIRED_FIELDS }
