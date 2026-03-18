import React, { useState } from 'react'
import api from '../utils/api'
import Toast, { useToast } from '../components/Toast'

const ENTREGADO_OPTIONS = ['MCP','Alex Bautista','Juan Churi','Willy Ascencio','Otro']

export default function PlataformaModal({ ddhid, initial = {}, onClose, onSaved }) {
  const { toast, show } = useToast()

  const isOtroInit = initial.entregado_por && !ENTREGADO_OPTIONS.slice(0,-1).includes(initial.entregado_por)

  const [form, setForm] = useState({
    fecha_entrega_plataforma:    initial.fecha_entrega_plataforma    ? String(initial.fecha_entrega_plataforma).slice(0,10) : '',
    fecha_preinicio_perforacion: initial.fecha_preinicio_perforacion ? String(initial.fecha_preinicio_perforacion).slice(0,10) : '',
    fecha_cierre_plataforma:     initial.fecha_cierre_plataforma     ? String(initial.fecha_cierre_plataforma).slice(0,10) : '',
    status_plataforma:           initial.status_plataforma    || '',
    formato_checklist:           initial.formato_checklist    || '',
    entregado_por_sel:           isOtroInit ? 'Otro' : (initial.entregado_por || ''),
    entregado_por_otro:          isOtroInit ? initial.entregado_por : '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(p => ({...p, [k]: v})) }

  async function handleSave() {
    setSaving(true)
    const entregado_por = form.entregado_por_sel === 'Otro'
      ? form.entregado_por_otro.trim()
      : form.entregado_por_sel

    const campos = {
      fecha_entrega_plataforma:    form.fecha_entrega_plataforma    || null,
      fecha_preinicio_perforacion: form.fecha_preinicio_perforacion || null,
      fecha_cierre_plataforma:     form.fecha_cierre_plataforma     || null,
      status_plataforma:           form.status_plataforma           || null,
      formato_checklist:           form.formato_checklist           || null,
      entregado_por:               entregado_por                    || null,
    }

    try {
      // Guardar campo por campo (reutiliza el endpoint existente)
      for (const [campo, valor] of Object.entries(campos)) {
        await api.put('/tables/resumen/plataforma', { DDHID: ddhid, campo, valor: valor || '' })
      }
      show('Guardado ✓', 'ok')
      onSaved && onSaved({ ...campos, entregado_por })
      setTimeout(onClose, 600)
    } catch(e) {
      show(e.response?.data?.error || 'Error al guardar', 'err')
    } finally { setSaving(false) }
  }

  const labelStyle = { fontSize:11, fontWeight:600, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }
  const inputStyle = { width:'100%', background:'var(--bg)', border:'1px solid var(--brd)', borderRadius:7, padding:'8px 12px', color:'var(--txt)', fontSize:13, outline:'none' }

  return (
    <div className="m-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-box" style={{maxWidth:480}}>
        <Toast msg={toast?.msg} type={toast?.type}/>
        <div className="m-title">📋 Plataforma — {ddhid}</div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {/* Fechas */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={labelStyle}>F. Entrega Plataforma</label>
              <input type="date" style={inputStyle} value={form.fecha_entrega_plataforma}
                onChange={e=>set('fecha_entrega_plataforma',e.target.value)}/>
            </div>
            <div>
              <label style={labelStyle}>F. Pre-inicio Perforación</label>
              <input type="date" style={inputStyle} value={form.fecha_preinicio_perforacion}
                onChange={e=>set('fecha_preinicio_perforacion',e.target.value)}/>
            </div>
          </div>
          <div>
            <label style={labelStyle}>F. Cierre Plataforma</label>
            <input type="date" style={inputStyle} value={form.fecha_cierre_plataforma}
              onChange={e=>set('fecha_cierre_plataforma',e.target.value)}/>
          </div>

          {/* Status */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={labelStyle}>Status Plataforma</label>
              <select style={inputStyle} value={form.status_plataforma}
                onChange={e=>set('status_plataforma',e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option value="Entregado">Entregado</option>
                <option value="Construida">Construida</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Checklist</label>
              <select style={inputStyle} value={form.formato_checklist}
                onChange={e=>set('formato_checklist',e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option value="Ok">Ok</option>
                <option value="Por Regularizar">Por Regularizar</option>
              </select>
            </div>
          </div>

          {/* Entregado por */}
          <div>
            <label style={labelStyle}>Entregado Por</label>
            <select style={inputStyle} value={form.entregado_por_sel}
              onChange={e=>set('entregado_por_sel',e.target.value)}>
              <option value="">— Seleccionar —</option>
              {ENTREGADO_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
            {form.entregado_por_sel === 'Otro' && (
              <input style={{...inputStyle,marginTop:8}} placeholder="Nombre del responsable..."
                value={form.entregado_por_otro}
                onChange={e=>set('entregado_por_otro',e.target.value)}/>
            )}
          </div>
        </div>

        <div className="m-actions">
          <button className="btn btn-acc" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Guardando...' : '💾 Guardar'}
          </button>
          <button className="btn btn-out" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
