import React, { useState, useEffect } from 'react'
import { DEFS, NUM_COLS, REQUIRED, validateClient, computeAuto, today } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'

export default function RowModal({ tkey, onClose, onSave, initData, existingRows, ddhids }) {
  const { user } = useAuth()
  const def = DEFS[tkey]
  const formCols = def.formCols || def.cols.filter(c => c !== 'Geologo')

  const AUTO_LABELS = {
    Turno_Dia: { label: 'Turno Día (auto)', hint: 'TO_Día − From_Día' },
    Turno_Noche: { label: 'Turno Noche (auto)', hint: 'To_Noche − From_Noche' },
    Total_Dia: { label: 'Total Día (auto)', hint: 'Turno Día + Turno Noche' },
    Avance: { label: 'Avance (auto)', hint: 'TO − FROM' },
    Metros: { label: 'Metros (auto)', hint: 'TO − FROM' },
    Minutos: { label: 'Minutos (auto)', hint: 'Hasta − Desde' },
    Horas: { label: 'Horas (auto)', hint: 'Minutos ÷ 60' },
  }

  const DATE_FIELDS = ['Fecha','F_Envio','F_Solicitud','F_Resultados']

  // Limpia fechas ISO a YYYY-MM-DD puro para que el input type="date" funcione
  function cleanDate(v) {
    if (!v) return ''
    const s = String(v)
    // Si viene como ISO timestamp (2026-03-02T00:00:00.000Z) tomar solo YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return v
  }

  const buildInit = () => {
    const f = {}
    formCols.forEach(c => {
      if (initData) {
        f[c] = DATE_FIELDS.includes(c) ? cleanDate(initData[c]) : (initData[c] ?? '')
      } else {
        f[c] = DATE_FIELDS.includes(c) ? today() : c === 'HORA' ? new Date().toTimeString().slice(0,5) : ''
      }
    })
    return f
  }

  const [form, setForm]     = useState(buildInit)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [autoVals, setAutoVals] = useState({})

  useEffect(() => { setAutoVals(computeAuto(tkey, form)) }, [form, tkey])

  // Auto-fill FROM con el máximo TO del sondaje seleccionado (solo en nuevo registro)
  useEffect(() => {
    if (initData) return        // edición: no tocar
    if (!form.DDHID) return     // sin sondaje seleccionado aún

    const mismo = existingRows.filter(r => r.DDHID === form.DDHID)
    if (!mismo.length) return   // primer registro de este sondaje, no hay historial

    // Pares FROM→TO según tabla
    const pares = [
      ['From_Dia',   'TO_Dia'],     // perforacion turno día
      ['From_Noche', 'To_Noche'],   // perforacion turno noche
      ['FROM',       'TO'],         // recepcion
      ['From',       'To'],         // recuperacion, fotografia, geotecnico, geologico
      ['DE',         'HASTA'],      // muestreo
      ['DE',         'A'],          // corte
    ]

    const updates = {}
    pares.forEach(([fromCol, toCol]) => {
      if (!formCols.includes(fromCol)) return  // esta tabla no tiene este campo

      // Máximo TO de todos los registros del mismo sondaje
      const maxTo = mismo.reduce((mx, r) => {
        // Para perforacion, el max global es el mayor entre ambos turnos
        const candidatos = [r[toCol], r['TO_Dia'], r['To_Noche']].filter(v => v !== undefined && v !== null && v !== '')
        const maxLocal = Math.max(...candidatos.map(v => parseFloat(v) || -Infinity))
        return maxLocal > mx ? maxLocal : mx
      }, -Infinity)

      if (isFinite(maxTo) && maxTo >= 0) {
        updates[fromCol] = String(maxTo)
      }
    })

    if (Object.keys(updates).length > 0) {
      setForm(prev => ({ ...prev, ...updates }))
    }
  }, [form.DDHID, existingRows])  // re-ejecutar si cambia DDHID o llegan nuevos datos

  useEffect(() => {
    if (Object.keys(touched).length === 0) return
    const errs = validateClient(tkey, form, existingRows, initData?.id)
    const visible = {}
    Object.keys(errs).forEach(k => { if (touched[k]) visible[k] = errs[k] })
    setErrors(visible)
  }, [form, touched])

  function set(col, val) {
    setForm(p => ({ ...p, [col]: val }))
    setTouched(p => ({ ...p, [col]: true }))
  }

  function handleSave() {
    const allTouched = {}
    formCols.forEach(c => { allTouched[c] = true })
    setTouched(allTouched)
    const errs = validateClient(tkey, form, existingRows, initData?.id)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const finalData = { ...form, ...autoVals }
    if (def.geo) finalData.Geologo = user.name
    onSave(finalData)
  }

  function fieldFor(col) {
    const isErr = !!errors[col]
    const base  = {
      className: isErr ? 'err' : '',
      value: form[col] ?? '',
      onChange: e => set(col, e.target.value),
      onBlur: () => setTouched(p => ({ ...p, [col]: true })),
    }
    if (col === 'DDHID' || col === 'Sondaje') {
      // Programa General: texto libre (es la tabla origen de los sondajes)
      if (tkey === 'programa_general') {
        return <input type="text" placeholder="Ej: MR26004-11" {...base} />
      }
      // Resto de tablas: dropdown con sondajes de Programa General
      return (
        <select {...base}>
          <option value="">— Seleccionar DDHID —</option>
          {(ddhids||[]).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      )
    }
    if (['Fecha','F_Envio','F_Solicitud','F_Resultados'].includes(col))
      return <input type="date" {...base} />
    if (['HORA','Desde','Hasta'].includes(col))
      return <input type="time" {...base} />
    if (['Comentarios','Observaciones'].includes(col))
      return <textarea rows={2} style={{ resize:'vertical' }} {...base} />
    return <input type={NUM_COLS.has(col) ? 'number' : 'text'} step="0.01" {...base} />
  }

  // Campos automáticos a mostrar
  const autoPreview = []
  if (tkey === 'perforacion') {
    if (autoVals.Turno_Dia  !== undefined) autoPreview.push({ key:'Turno_Dia',  val: autoVals.Turno_Dia + ' m' })
    if (autoVals.Turno_Noche!== undefined) autoPreview.push({ key:'Turno_Noche',val: autoVals.Turno_Noche + ' m' })
    if (autoVals.Total_Dia  !== undefined) autoPreview.push({ key:'Total_Dia',  val: autoVals.Total_Dia + ' m' })
  }
  if (def.av && autoVals.Avance !== undefined) autoPreview.push({ key:'Avance', val: autoVals.Avance + ' m' })
  if (tkey === 'recepcion' && autoVals.Metros !== undefined) autoPreview.push({ key:'Metros', val: autoVals.Metros + ' m' })
  if (tkey === 'tormentas') {
    if (autoVals.Minutos !== undefined) autoPreview.push({ key:'Minutos', val: autoVals.Minutos + ' min' })
    if (autoVals.Horas   !== undefined) autoPreview.push({ key:'Horas',   val: autoVals.Horas + ' h' })
  }

  const totalErrors = Object.keys(validateClient(tkey, form, existingRows, initData?.id)).length

  return (
    <div className="m-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-box">

        {/* Título sticky */}
        <div className="m-title">
          {initData ? '✏️ Editar' : '➕ Nuevo'} — {def.label}
        </div>

        {/* Errores */}
        {Object.keys(touched).length > 0 && totalErrors > 0 && (
          <div className="alert a-err" style={{ margin:'12px 16px 0' }}>
            ⚠️ {totalErrors} campo{totalErrors > 1 ? 's' : ''} con error
          </div>
        )}

        {/* Campos editables */}
        <div className="fgrid">
          {formCols.map(col => (
            <div key={col} className="fg">
              <label>
                {col}
                {REQUIRED[tkey]?.includes(col) && <span style={{ color:'var(--red)', marginLeft:2 }}>*</span>}
              </label>
              {fieldFor(col)}
              {errors[col] && <span className="ferr">⚠ {errors[col]}</span>}
            </div>
          ))}

          {/* Campos automáticos (readonly) */}
          {autoPreview.map(a => (
            <div key={a.key} className="fg">
              <label>{AUTO_LABELS[a.key]?.label || a.key}</label>
              <input readOnly value={a.val} style={{ color:'var(--grn)' }} />
              <span className="fauto">✓ {AUTO_LABELS[a.key]?.hint}</span>
            </div>
          ))}

          {/* Geólogo */}
          {def.geo && (
            <div className="fg">
              <label>Geólogo</label>
              <input readOnly value={user.name} style={{ color:'var(--grn)' }} />
              <span className="fauto">✓ Usuario activo</span>
            </div>
          )}
        </div>

        {/* Acciones sticky al fondo */}
        <div className="m-actions">
          <button className="btn btn-acc" onClick={handleSave}>💾 Guardar</button>
          <button className="btn btn-out" onClick={onClose}>Cancelar</button>
        </div>

      </div>
    </div>
  )
}
