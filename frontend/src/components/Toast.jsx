import React, { useState, useCallback } from 'react'

const colors = {
  ok:   'rgba(16,185,129,.93)',
  err:  'rgba(239,68,68,.93)',
  warn: 'rgba(245,158,11,.93)',
}

export default function Toast({ msg, type = 'ok' }) {
  if (!msg) return null
  return (
    <div className="toast" style={{ background: colors[type] || colors.ok, color: '#fff' }}>
      {msg}
    </div>
  )
}

// Hook para usar toast fácilmente
export function useToast() {
  const [toast, setToast] = useState(null)
  const show = useCallback((msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])
  return { toast, show }
}
