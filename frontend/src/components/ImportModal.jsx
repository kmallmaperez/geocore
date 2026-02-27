import React, { useState, useRef } from 'react'
import { DEFS } from '../utils/tableDefs'
import api from '../utils/api'

// Parser CSV simple (maneja comillas y comas dentro de campos)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseLine(line) {
    const result = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = '' }
      else cur += c
    }
    result.push(cur.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1)
    .filter(l => l.trim())
    .map(l => {
      const vals = parseLine(l)
      const obj = {}
      headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
      return obj
    })
  return { headers, rows }
}

export default function ImportModal({ tkey, onClose, onImported }) {
  const def = DEFS[tkey]
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)   // { headers, rows }
  const [result, setResult]   = useState(null)   // { imported, skipped, errors }
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  function handleFile(e) {
    setError(''); setResult(null); setPreview(null)
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) { setError('Solo se aceptan archivos .csv'); return }

    const reader = new FileReader()
    reader.onload = ev => {
      const { headers, rows } = parseCSV(ev.target.result)
      if (rows.length === 0) { setError('El archivo está vacío o no tiene datos'); return }
      setPreview({ headers, rows })
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (!preview) return
    setLoading(true); setError('')
    try {
      const r = await api.post(`/import/${tkey}`, { rows: preview.rows })
      setResult(r.data)
      if (r.data.imported > 0) onImported()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al importar')
    } finally { setLoading(false) }
  }

  return (
    <div className="m-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-box" style={{ maxWidth: 700 }}>
        <div className="m-title">📥 Importar CSV — {def.label}</div>

        {/* Instrucciones */}
        <div className="alert a-warn" style={{ marginBottom: 14 }}>
          El CSV debe tener estos encabezados en la primera fila:<br />
          <code style={{ fontSize: 11, color: 'var(--acc)', wordBreak: 'break-all' }}>
            {def.cols.filter(c => c !== 'Geologo').join(', ')}
          </code>
        </div>

        {/* Selector de archivo */}
        {!result && (
          <div
            style={{ border: '2px dashed var(--brd)', borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer', marginBottom: 14 }}
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <div style={{ color: 'var(--mut)', fontSize: 13 }}>
              {preview ? `✓ ${preview.rows.length} filas cargadas — haz clic para cambiar` : 'Haz clic para seleccionar un archivo .csv'}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
          </div>
        )}

        {error && <div className="alert a-err">{error}</div>}

        {/* Preview de los primeros 5 registros */}
        {preview && !result && (
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              Vista previa ({preview.rows.length} filas)
            </div>
            <div className="ox" style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 14 }}>
              <table className="tbl">
                <thead><tr>{preview.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>{preview.headers.map(h => <td key={h}>{row[h] ?? ''}</td>)}</tr>
                  ))}
                  {preview.rows.length > 5 && (
                    <tr><td colSpan={preview.headers.length} style={{ textAlign: 'center', color: 'var(--mut)' }}>
                      ... y {preview.rows.length - 5} filas más
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resultado de importación */}
        {result && (
          <div>
            <div className="alert a-ok">
              ✅ <strong>{result.imported}</strong> registros importados correctamente
            </div>
            {result.skipped > 0 && (
              <div className="alert a-err">
                ⚠ <strong>{result.skipped}</strong> filas omitidas por errores de validación
              </div>
            )}
            {result.errors?.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--red)', padding: '4px 0', borderBottom: '1px solid var(--brd)' }}>
                    <strong>Fila {e.row}:</strong> {e.messages.join(' | ')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="m-actions">
          {!result && preview && (
            <button className="btn btn-acc" onClick={handleImport} disabled={loading}>
              {loading ? 'Importando...' : `⬆ Importar ${preview.rows.length} filas`}
            </button>
          )}
          <button className="btn btn-out" onClick={onClose}>
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}
