import React, { useState, useEffect } from 'react'
import { DEFS, NUM_COLS, REQUIRED, validateClient, computeAuto, today } from '../utils/tableDefs'
import { useAuth } from '../context/AuthContext'

export default function RowModal({ tkey, onClose, onSave, initData, existingRows, ddhids }) {
  const { user } = useAuth()
  const def = DEFS[tkey]

  // Usar formCols para saber qué campos mostrar en el formulario
  const formCols = def.formCols || def.cols.filter(c => c !== 'Geologo')

  // Campos auto (no editables, solo mostrar preview)
  const AUTO_READONLY = new Set(['Turno_Dia','Turno_Noche','Total_Dia','Acumulado','Avance','AVANCE','Metros','Minutos','Horas','TOTAL'])

  const buildInit = () => {
    const f = {}
    formCols.forEach(c => {
      f[c] = initData ? (initData[c] ?? '') : (c === 'Fecha' ? today() : c === 'HORA' ? new Date().toTimeString().slice(0,5) : '')
    })
    return f
  }

  const [form, setForm]     = useState(buildInit)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [autoVals, setAutoVals] = useState({})

  // Recalcula automáticos en tiempo real
  useEffect(() => {
    setAutoVals(computeAuto(tkey, form))
  }, [form, tkey])

  // Valida solo campos tocados
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
    // Marcar todos tocados para mostrar errores
    const allTouched = {}
    formCols.forEach(c => { allTouched[c] = true })
    setTouched(allTouched)

    const errs = validateClient(tkey, form, existingRows, initData?.id)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    // Merge form + auto + geo
    const finalData = { ...form, ...autoVals }
    if (def.geo) finalData.Geologo = user.name
    onSave(finalData)
  }

  function fieldFor(col) {
    const isErr = !!errors[col]
    const cls   = isErr ? 'err' : ''
    const base  = {
      className: cls,
      value: form[col] ?? '',
      onChange: e => set(col, e.target.value),
      onBlur: () => setTouched(p => ({ ...p, [col]: true })),
    }

    if (col === 'DDHID' || col === 'Sondaje') {
      return (
        <select {...base}>
          <option value="">— Seleccionar DDHID —</option>
          {(ddhids || []).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      )
    }
    if (col === 'Fecha' || col === 'F_Envio' || col === 'F_Solicitud' || col === 'F_Resultados') {
      return <input type="date" {...base} />
    }
    if (col === 'HORA' || col === 'Desde' || col === 'Hasta') {
      return <input type="time" {...base} />
    }
    if (col === 'Comentarios' || col === 'Observaciones') {
      return <textarea rows={2} style={{ resize: 'vertical' }} {...base} />
    }
    return (
      <input
        type={NUM_COLS.has(col) ? 'number' : 'text'}
        step="0.01"
        {...base}
      />
    )
  }

  // Campos auto que aplican a esta tabla (para mostrar preview)
  const autoPreview = []
  if (tkey === 'perforacion') {
    if (autoVals.Turno_Dia  !== undefined) autoPreview.push({ label: 'Turno Día (auto)',   val: autoVals.Turno_Dia + ' m',   hint: 'TO_Día − From_Día' })
    if (autoVals.Turno_Noche!== undefined) autoPreview.push({ label: 'Turno Noche (auto)', val: autoVals.Turno_Noche + ' m', hint: 'To_Noche − From_Noche' })
    if (autoVals.Total_Dia  !== undefined) autoPreview.push({ label: 'Total Día (auto)',   val: autoVals.Total_Dia + ' m',   hint: 'Turno Día + Turno Noche' })
  }
  if (def.av && autoVals.Avance !== undefined) {
    autoPreview.push({ label: 'Avance (auto)', val: autoVals.Avance + ' m', hint: 'TO − FROM' })
  }
  if (tkey === 'recepcion' && autoVals.Metros !== undefined) {
    autoPreview.push({ label: 'Metros (auto)', val: autoVals.Metros + ' m', hint: 'TO − FROM' })
  }
  if (tkey === 'tormentas') {
    if (autoVals.Minutos !== undefined) autoPreview.push({ label: 'Minutos (auto)', val: autoVals.Minutos, hint: 'Hasta − Desde' })
    if (autoVals.Horas   !== undefined) autoPreview.push({ label: 'Horas (auto)',   val: autoVals.Horas,   hint: 'Minutos ÷ 60' })
  }

  const totalErrors = Object.keys(validateClient(tkey, form, existingRows, initData?.id)).length

  return (
    <div className="m-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-box">
        <div className="m-title">{initData ? '✏️ Editar' : '➕ Nuevo'} — {def.label}</div>

        {Object.keys(touched).length > 0 && totalErrors > 0 && (
          <div className="alert a-err" style={{ marginBottom: 14 }}>
            ⚠️ {totalErrors} campo{totalErrors > 1 ? 's' : ''} con error
          </div>
        )}

        <div className="fgrid">
          {/* Campos editables del formulario */}
          {formCols.map(col => (
            <div key={col} className="fg">
              <label>
                {col}
                {REQUIRED[tkey]?.includes(col) && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
              </label>
              {fieldFor(col)}
              {errors[col] && <span className="ferr">⚠ {errors[col]}</span>}
            </div>
          ))}

          {/* Campos automáticos (preview readonly) */}
          {autoPreview.map(a => (
            <div key={a.label} className="fg">
              <label>{a.label}</label>
              <input readOnly value={a.val} style={{ color: 'var(--grn)' }} />
              <span className="fauto">✓ {a.hint}</span>
            </div>
          ))}

          {/* Geólogo siempre auto */}
          {def.geo && (
            <div className="fg">
              <label>Geólogo</label>
              <input readOnly value={user.name} style={{ color: 'var(--grn)' }} />
              <span className="fauto">✓ Usuario activo</span>
            </div>
          )}
        </div>

        <div className="m-actions">
          <button className="btn btn-acc" onClick={handleSave}>💾 Guardar</button>
          <button className="btn btn-out" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
