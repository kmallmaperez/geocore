import React, { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // proyectoActivo: Ambos | <nombre de proyecto>
  const [proyectoActivo, setProyectoActivoState] = useState(
    () => localStorage.getItem('proyectoActivo') || 'Ambos'
  )

  // Lista dinámica de proyectos cargada desde la API
  const [proyectos, setProyectos] = useState(['Mina', 'Exploraciones'])

  function loadProyectos(u) {
    if (u.role === 'ADMIN' || !u.proyectos_acceso || u.proyectos_acceso.length === 0) {
      api.get('/proyectos').then(r => setProyectos(r.data)).catch(() => {})
    } else {
      setProyectos(u.proyectos_acceso)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.get('/auth/me')
        .then(r => {
          const u = r.data.user
          setUser(u)
          initProyecto(u)
          loadProyectos(u)
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

  function addProyecto(nombre) {
    setProyectos(prev => prev.includes(nombre) ? prev : [...prev, nombre])
  }

  async function login(loginField, password) {
    const r = await api.post('/auth/login', { login: loginField, password })
    localStorage.setItem('token', r.data.token)
    setUser(r.data.user)
    initProyecto(r.data.user)
    loadProyectos(r.data.user)
    return r.data.user
  }

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthCtx.Provider value={{ user, login, logout, loading, proyectoActivo, setProyectoActivo, proyectos, addProyecto }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() { return useContext(AuthCtx) }
