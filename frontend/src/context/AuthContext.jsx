import React, { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // proyectoActivo: Mina | Exploraciones | Ambos
  // Si el usuario tiene tipo_acceso != 'Ambos' queda bloqueado a ese valor.
  // Si tiene 'Ambos', puede alternar y se persiste en localStorage.
  const [proyectoActivo, setProyectoActivoState] = useState(
    () => localStorage.getItem('proyectoActivo') || 'Ambos'
  )

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.get('/auth/me')
        .then(r => {
          const u = r.data.user
          setUser(u)
          initProyecto(u)
        })
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  function initProyecto(u) {
    const acceso = u?.tipo_acceso || 'Ambos'
    if (acceso !== 'Ambos') {
      // Acceso fijo: ignorar lo que haya en localStorage
      setProyectoActivoState(acceso)
    } else {
      // Acceso libre: recuperar preferencia guardada
      const saved = localStorage.getItem('proyectoActivo') || 'Ambos'
      setProyectoActivoState(saved)
    }
  }

  function setProyectoActivo(tipo) {
    localStorage.setItem('proyectoActivo', tipo)
    setProyectoActivoState(tipo)
  }

  async function login(loginField, password) {
    const r = await api.post('/auth/login', { login: loginField, password })
    localStorage.setItem('token', r.data.token)
    setUser(r.data.user)
    initProyecto(r.data.user)
    return r.data.user
  }

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthCtx.Provider value={{ user, login, logout, loading, proyectoActivo, setProyectoActivo }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() { return useContext(AuthCtx) }
