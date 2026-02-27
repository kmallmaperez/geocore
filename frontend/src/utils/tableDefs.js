// ── DEFINICIONES DE TABLAS ───────────────────────────────────────
// formCols = campos visibles en el formulario (según imagen columna "VISIBLE EN FORMULARIOS")
// cols     = todas las columnas que se guardan y muestran en la tabla

export const DEFS = {
  programa_general: {
    label: 'Programa General',
    cols:     ['PLATAFORMA','DDHID','ESTE','NORTE','ELEV','LENGTH'],
    formCols: ['PLATAFORMA','DDHID','ESTE','NORTE','ELEV','LENGTH'], // todas visibles
  },
  perforacion: {
    label: 'Perforación',
    cols:     ['DDHID','Fecha','From_Dia','TO_Dia','Turno_Dia','From_Noche','To_Noche','Turno_Noche','Total_Dia','Acumulado','Comentarios','Geologo'],
    formCols: ['DDHID','Fecha','From_Dia','TO_Dia','From_Noche','To_Noche','Comentarios'],
    // Turno_Dia, Turno_Noche, Total_Dia, Acumulado, Geologo → NO visibles (calculados)
    geo: true,
    ftDia:   ['From_Dia',   'TO_Dia'],
    ftNoche: ['From_Noche', 'To_Noche'],
  },
  recepcion: {
    label: 'Recepción',
    cols:     ['Fecha','HORA','DDHID','FROM','TO','Metros','CAJAS','Geologo'],
    formCols: ['Fecha','HORA','DDHID','FROM','TO','CAJAS'],
    // Metros → auto (TO-FROM), Geologo → auto
    geo: true, ft: ['FROM','TO'],
  },
  recuperacion: {
    label: 'Recuperación',
    cols:     ['Fecha','DDHID','From','To','Avance','Geologo'],
    formCols: ['Fecha','DDHID','From','To'],
    // Avance → auto, Geologo → auto (NO visible)
    geo: true, ft: ['From','To'], av: true,
  },
  fotografia: {
    label: 'Fotografía',
    cols:     ['Fecha','DDHID','From','To','Avance','N_Foto','Geologo'],
    formCols: ['Fecha','DDHID','From','To','N_Foto'],
    // Avance → auto, Geologo → auto (NO visible)
    geo: true, ft: ['From','To'], av: true,
  },
  l_geotecnico: {
    label: 'L_Geotécnico',
    cols:     ['Fecha','DDHID','From','To','Avance','PLT','UCS','Geologo'],
    formCols: ['Fecha','DDHID','From','To','PLT','UCS'],
    // Avance → auto, Geologo → auto (NO visible)
    geo: true, ft: ['From','To'], av: true,
  },
  l_geologico: {
    label: 'L_Geológico',
    cols:     ['Fecha','DDHID','From','To','Avance','Geologo','SG','Observaciones'],
    formCols: ['Fecha','DDHID','From','To','SG','Observaciones'],
    // Avance → auto, Geologo → auto (NO visible)
    geo: true, ft: ['From','To'], av: true,
  },
  muestreo: {
    label: 'Muestreo',
    cols:     ['Fecha','DDHID','DE','HASTA','MUESTRAS','Geologo'],
    formCols: ['Fecha','DDHID','DE','HASTA','MUESTRAS'],
    // Geologo → auto
    geo: true, ft: ['DE','HASTA'],
  },
  corte: {
    label: 'Corte',
    cols:     ['Fecha','DDHID','DE','A','AVANCE','CAJAS','MAQUINAS','Geologo'],
    formCols: ['Fecha','DDHID','DE','A','CAJAS','MAQUINAS'],
    // AVANCE → auto, Geologo → auto
    geo: true, ft: ['DE','A'], av: true,
  },
  envios: {
    label: 'Envíos',
    cols:     ['Fecha','Envio_N','Total_muestras','Geologo'],
    formCols: ['Fecha','Envio_N','Total_muestras'],
    geo: true,
  },
  batch: {
    label: 'Batch',
    cols:     ['Envio','Batch','Sondaje','Qty_Mina','Qty_Lab','Muestras_Dens','Cod_Cert','F_Envio','F_Solicitud','F_Resultados','Tiempo_dias','Geologo'],
    formCols: ['Envio','Batch','Sondaje','Qty_Mina','Qty_Lab','Muestras_Dens','Cod_Cert','F_Envio','F_Solicitud','F_Resultados','Tiempo_dias'],
    geo: true,
  },
  tormentas: {
    label: 'Tormentas Eléctricas',
    cols:     ['Fecha','Desde','Hasta','TOTAL','Minutos','Horas','Geologo'],
    formCols: ['Fecha','Desde','Hasta'],
    // TOTAL, Minutos, Horas → auto, Geologo → auto
    geo: true,
  },
}

// Columnas numéricas
export const NUM_COLS = new Set([
  'ESTE','NORTE','ELEV','LENGTH','From','To','FROM','TO','DE','HASTA','A',
  'Avance','AVANCE','Total_Dia','Turno_Dia','Turno_Noche','From_Dia','TO_Dia',
  'From_Noche','To_Noche','Acumulado','Metros','CAJAS','MUESTRAS','MAQUINAS',
  'Minutos','Horas','TOTAL','PLT','UCS','SG','N_Foto','Qty_Mina','Qty_Lab',
  'Muestras_Dens','Tiempo_dias','Envio_N','Total_muestras',
])

// Campos requeridos por tabla
export const REQUIRED = {
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

// Validación CLIENT-SIDE
export function validateClient(tkey, form, existingRows = [], editId = null) {
  const def = DEFS[tkey]
  const errors = {}

  // 1. Campos obligatorios
  const req = REQUIRED[tkey] || []
  req.forEach(f => {
    const v = form[f]
    if (v === undefined || v === null || String(v).trim() === '') {
      errors[f] = 'Campo obligatorio'
    }
  })

  // 2. Perforación: validación especial de turnos (FROM <= TO, vacíos permitidos)
  if (tkey === 'perforacion') {
    const fd = form.From_Dia, td = form.TO_Dia
    const fn = form.From_Noche, tn = form.To_Noche
    // Solo validar si AMBOS campos tienen valor
    if (fd !== '' && fd !== undefined && td !== '' && td !== undefined) {
      const fv = parseFloat(fd), tv = parseFloat(td)
      if (!isNaN(fv) && !isNaN(tv) && fv > tv)
        errors.TO_Dia = `TO_Día (${tv}) debe ser ≥ From_Día (${fv})`
    }
    if (fn !== '' && fn !== undefined && tn !== '' && tn !== undefined) {
      const fv = parseFloat(fn), tv = parseFloat(tn)
      if (!isNaN(fv) && !isNaN(tv) && fv > tv)
        errors.To_Noche = `To_Noche (${tv}) debe ser ≥ From_Noche (${fv})`
    }
  }

  // 3. FROM <= TO genérico (vacíos y valores iguales PERMITIDOS = avance 0)
  if (def.ft) {
    const [fc, tc] = def.ft
    const fv = form[fc], tv = form[tc]
    // Solo validar si ambos tienen valor
    if (fv !== '' && fv !== undefined && tv !== '' && tv !== undefined) {
      const f = parseFloat(fv), t = parseFloat(tv)
      if (isNaN(f)) errors[fc] = 'Debe ser un número'
      else if (isNaN(t)) errors[tc] = 'Debe ser un número'
      else if (f < 0) errors[fc] = 'No puede ser negativo'
      else if (f > t) errors[tc] = `Debe ser ≥ ${fc} (${f})`
      else if (f < t) {
        // Overlap solo cuando hay avance real (f < t)
        const same = existingRows.filter(r => r.DDHID === form.DDHID && r.id !== editId)
        for (const r of same) {
          const rf = parseFloat(r[fc]), rt = parseFloat(r[tc])
          if (!isNaN(rf) && !isNaN(rt) && rf < rt && f < rt && t > rf) {
            errors[fc] = `Overlap con ${rf}–${rt} en ${form.DDHID}`
            break
          }
        }
      }
      // f === t → avance 0, permitido sin error
    }
  }

  // 4. Fechas
  ;['Fecha','F_Envio','F_Solicitud','F_Resultados'].forEach(col => {
    if (form[col] && isNaN(new Date(form[col]).getTime()))
      errors[col] = 'Fecha inválida (YYYY-MM-DD)'
  })

  // 5. Horas
  ;['HORA','Desde','Hasta'].forEach(col => {
    if (form[col] && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(form[col]))
      errors[col] = 'Formato HH:MM (ej: 14:30)'
  })

  return errors
}

// Calcula campos automáticos (mostrar en tiempo real en el form)
export function computeAuto(tkey, form) {
  const def = DEFS[tkey]
  const auto = {}

  // Avance = To - From (0 si iguales, vacío si alguno falta)
  if (def.av && def.ft) {
    const [fc, tc] = def.ft
    const f = parseFloat(form[fc]), t = parseFloat(form[tc])
    if (!isNaN(f) && !isNaN(t) && t >= f) {
      auto.Avance = (t - f).toFixed(2)  // puede ser "0.00"
    }
  }

  // Perforación: Turno_Dia, Turno_Noche, Total_Dia
  if (tkey === 'perforacion') {
    const fd = parseFloat(form.From_Dia),  td = parseFloat(form.TO_Dia)
    const fn = parseFloat(form.From_Noche), tn = parseFloat(form.To_Noche)
    const turnoD = (!isNaN(fd) && !isNaN(td) && td >= fd) ? td - fd : 0
    const turnoN = (!isNaN(fn) && !isNaN(tn) && tn >= fn) ? tn - fn : 0
    auto.Turno_Dia   = turnoD.toFixed(2)
    auto.Turno_Noche = turnoN.toFixed(2)
    auto.Total_Dia   = (turnoD + turnoN).toFixed(2)
  }

  // Recepción: Metros = TO - FROM
  if (tkey === 'recepcion') {
    const f = parseFloat(form.FROM), t = parseFloat(form.TO)
    if (!isNaN(f) && !isNaN(t) && t >= f) auto.Metros = (t - f).toFixed(2)
  }

  // Tormentas: Minutos y Horas
  if (tkey === 'tormentas' && form.Desde && form.Hasta) {
    const [hd, md] = form.Desde.split(':').map(Number)
    const [hh, mh] = form.Hasta.split(':').map(Number)
    if (!isNaN(hd) && !isNaN(hh)) {
      const mins = (hh * 60 + mh) - (hd * 60 + md)
      if (mins >= 0) {
        auto.Minutos = mins
        auto.Horas   = (mins / 60).toFixed(2)
        auto.TOTAL   = mins
      }
    }
  }

  return auto
}

// Helpers UI
export function today() { return new Date().toISOString().split('T')[0] }
export function inits(n) { return n.split(' ').map(x => x[0]).join('').slice(0,2).toUpperCase() }
export function roleCls(r) { return {ADMIN:'b-adm',SUPERVISOR:'b-sup',USER:'b-usr'}[r]||'b-usr' }
export function statCls(s) { return s==='Completado'?'b-act':s==='En Progreso'?'b-pro':'b-pen' }
