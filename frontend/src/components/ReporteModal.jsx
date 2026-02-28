import React from 'react'
import ReporteWhatsApp from './ReporteWhatsApp'

export default function ReporteModal({ tkey, row, onClose }) {
  return (
    <div className="m-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-box">
        <div className="m-title">📋 Reporte para WhatsApp</div>
        <ReporteWhatsApp tkey={tkey} row={row} />
        <div className="m-actions" style={{ marginTop: 14 }}>
          <button className="btn btn-out" style={{ flex:1, padding:13, fontSize:14, borderRadius:10 }} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
