import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]     = useState({ login: 'admin@geocore.pe', password: 'admin123' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.login, form.password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-logo">⛏ GeoCore</div>
        <div className="auth-sub">Sistema de Gestión de Sondajes · v2.0</div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Usuario o correo electrónico</label>
            <input
              type="text"
              placeholder="nombre o correo@empresa.pe"
              value={form.login}
              onChange={e => setForm(p => ({ ...p, login: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              required
            />
          </div>
          {error && <div className="alert a-err">{error}</div>}
          <button type="submit" className="btn-acc-full" disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión →'}
          </button>
        </form>
        <div className="auth-hint">
          <b>Cuentas demo:</b><br />
          admin@geocore.pe / admin123 (ADMIN)<br />
          sup@geocore.pe / sup123 (SUPERVISOR)<br />
          geo@geocore.pe / geo123 (USER)
        </div>
      </div>
    </div>
  )
}
