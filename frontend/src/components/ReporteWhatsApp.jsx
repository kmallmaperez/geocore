import React, { useState } from 'react'
import { DEFS } from '../utils/tableDefs'

// Formatos de reporte por tabla
const REPORTES = {
  l_geologico: (row) => `📋 *REPORTE LOGUEO GEOLÓGICO*
• Fecha: ${fmtFecha(row.Fecha)}
• Sondaje: ${row.DDHID || '—'}
• From: ${row.From ?? '—'} m
• To: ${row.To ?? '—'} m
• Avance: ${row.Avance ?? '—'} m
• SG Muestras: ${row.SG ?? '—'}
• Geólogo: ${row.Geologo || '—'}
${row.Observaciones ? `• Obs: ${row.Observaciones}` : ''}`.trim(),

  perforacion: (row) => `⛏ *REPORTE PERFORACIÓN*
• Fecha: ${fmtFecha(row.Fecha)}
• Sondaje: ${row.DDHID || '—'}
• Turno Día: ${row.From_Dia ?? '—'} → ${row.TO_Dia ?? '—'} m (${row.Turno_Dia ?? 0} m)
• Turno Noche: ${row.From_Noche ?? '—'} → ${row.To_Noche ?? '—'} m (${row.Turno_Noche ?? 0} m)
• Total Día: ${row.Total_Dia ?? '—'} m
• Acumulado: ${row.Acumulado ?? '—'} m
• Geólogo: ${row.Geologo || '—'}
${row.Comentarios ? `• Comentarios: ${row.Comentarios}` : ''}`.trim(),

  recepcion: (row) => `📦 *REPORTE RECEPCIÓN*
• Fecha: ${fmtFecha(row.Fecha)} ${row.HORA ? '| Hora: ' + row.HORA : ''}
• Sondaje: ${row.DDHID || '—'}
• From: ${row.FROM ?? '—'} m | To: ${row.TO ?? '—'} m
• Metros recibidos: ${row.Metros ?? '—'} m
• Cajas: ${row.CAJAS ?? '—'}
• Geólogo: ${row.Geologo || '—'}`.trim(),

  recuperacion: (row) => `🧪 *REPORTE RECUPERACIÓN*
• Fecha: ${fmtFecha(row.Fecha)}
• Sondaje: ${row.DDHID || '—'}
• From: ${row.From ?? '—'} m | To: ${row.To ?? '—'} m
• Avance: ${row.Avance ?? '—'} m
• Geólogo: ${row.Geologo || '—'}`.trim(),

  fotografia: (row) => `📷 *REPORTE FOTOGRAFÍA*
• Fecha: ${fmtFecha(row.Fecha)}
• Sondaje: ${row.DDHID || '—'}
• From: ${row.From ?? '—'} m | To: ${row.To ?? '—'} m
• Avance: ${row.Avance ?? '—'} m
• N° Foto: ${row.N_Foto ?? '—'}
• Geólogo: ${row.Geologo || '—'}`.trim(),

  l_geotecnico: (row) => `🪨 *REPORTE L. GEOTÉCNICO*
• Fecha: ${fmtFecha(row.Fecha)}
• Sondaje: ${row.DDHID || '—'}
• From: ${row.From ?? '—'} m | To: ${row.To ?? '—'} m
• Avance: ${row.Avance ?? '—'} m
• PLT: ${row.PLT ?? '—'} | UCS: ${row.UCS ?? '—'}
• Geólogo: ${row.Geologo || '—'}`.trim(),

  muestreo: (row) => `🧫 *REPORTE MUESTREO*
• Fecha: ${fmtFecha(row.Fecha)}
• Sondaje: ${row.DDHID || '—'}
• DE: ${row.DE ?? '—'} m | HASTA: ${row.HASTA ?? '—'} m
• Muestras: ${row.MUESTRAS ?? '—'}
• Geólogo: ${row.Geologo || '—'}`.trim(),

  corte: (row) => `✂️ *REPORTE CORTE*
• Fecha: ${fmtFecha(row.Fecha)}
• Sondaje: ${row.DDHID || '—'}
• DE: ${row.DE ?? '—'} m | A: ${row.A ?? '—'} m
• Avance: ${row.AVANCE ?? '—'} m
• Cajas: ${row.CAJAS ?? '—'} | Máquinas: ${row.MAQUINAS ?? '—'}
• Geólogo: ${row.Geologo || '—'}`.trim(),

  tormentas: (row) => `⛈ *REPORTE TORMENTA ELÉCTRICA*
• Fecha: ${fmtFecha(row.Fecha)}
• Desde: ${row.Desde || '—'} | Hasta: ${row.Hasta || '—'}
• Duración: ${row.Minutos ?? '—'} min (${row.Horas ?? '—'} h)
• Geólogo: ${row.Geologo || '—'}`.trim(),

  envios: (row) => `📮 *REPORTE ENVÍO DE MUESTRAS*
• Fecha: ${fmtFecha(row.Fecha)}
• Envío N°: ${row.Envio_N ?? '—'}
• Total muestras: ${row.Total_muestras ?? '—'}
• Geólogo: ${row.Geologo || '—'}`.trim(),
}

function fmtFecha(f) {
  if (!f) return '—'
  const s = String(f).slice(0,10)
  const [y,m,d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function ReporteWhatsApp({ tkey, row }) {
  const [copied, setCopied] = useState(false)

  const generador = REPORTES[tkey]
  if (!generador) return null

  const texto = generador(row)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback para navegadores sin clipboard API
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        background: 'var(--sur2)', border: '1px solid var(--brd)',
        borderRadius: 10, padding: 14, marginBottom: 10
      }}>
        <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Vista previa del reporte
        </div>
        <pre style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--txt)',
          whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0
        }}>
          {texto}
        </pre>
      </div>
      <button
        className="btn btn-grn"
        style={{ width: '100%', padding: '12px', fontSize: 14, borderRadius: 10, justifyContent: 'center' }}
        onClick={copiar}
      >
        {copied ? '✅ ¡Copiado! Pégalo en WhatsApp' : '📋 Copiar reporte para WhatsApp'}
      </button>
    </div>
  )
}
