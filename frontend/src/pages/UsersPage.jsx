import React, { useState, useEffect } from 'react'
import { DEFS, inits, roleCls } from '../utils/tableDefs'
import Toast, { useToast } from '../components/Toast'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'

// Tablas regulares + quicklog como opción especial
const ALL_TABLE_KEYS = Object.keys(DEFS)
const TABLE_LABELS = { ...Object.fromEntries(Object.entries(DEFS).map(([k,v])=>[k,v.label])), quicklog: '📋 Quick Log' }

function UserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    name:     user?.name     || '',
    email:    user?.email    || '',
    password: '',
    role:     user?.role     || 'USER',
    tables:   user?.tables   || [],
  })

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function togTable(k) {
    setForm(p => ({
      ...p,
      tables: p.tables.includes(k) ? p.tables.filter(x => x !== k) : [...p.tables, k]
    }))
  }

  const isAllAccess = form.role === 'ADMIN' || form.role === 'SUPERVISOR'
  const isViewer    = form.role === 'VIEWER'
  const assignableKeys = [...ALL_TABLE_KEYS, 'quicklog']

  return (
    <div className="m-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="m-box">
        <div className="m-title">{user ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}</div>
        <div className="fgrid">
          <div className="fg"><label>Nombre Completo *</label><input value={form.name} onChange={e=>set('name',e.target.value)}/></div>
          <div className="fg"><label>Email *</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
          <div className="fg"><label>Contraseña {user?'(vacío = sin cambio)':'*'}</label><input type="password" value={form.password} onChange={e=>set('password',e.target.value)}/></div>
          <div className="fg">
            <label>Rol *</label>
            <select value={form.role} onChange={e=>set('role',e.target.value)}>
              <option value="ADMIN">ADMIN</option>
              <option value="SUPERVISOR">SUPERVISOR</option>
              <option value="USER">USER</option>
              <option value="VIEWER">VIEWER</option>
            </select>
          </div>
        </div>

        {isViewer && (
          <div className="alert a-ok" style={{marginTop:12}}>
            👁 Acceso de solo lectura — puede ver todas las tablas y exportar Excel, pero no puede crear, editar ni eliminar registros.
          </div>
        )}
        {form.role === 'USER' && (
          <div style={{marginTop:14}}>
            <label style={{fontSize:10,fontWeight:600,color:'var(--mut)',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:8}}>
              Tablas Asignadas <span style={{fontWeight:400,textTransform:'none',fontSize:11}}>(el usuario solo puede escribir en las seleccionadas)</span>
            </label>

            {/* Quick Log primero, destacado */}
            <div style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid var(--brd)'}}>
              <span style={{fontSize:11,color:'var(--mut)',display:'block',marginBottom:6}}>Módulos especiales</span>
              <span
                className={`chip ${form.tables.includes('quicklog') ? 'on' : ''}`}
                onClick={()=>togTable('quicklog')}
                style={{fontSize:13}}>
                📋 Quick Log
              </span>
            </div>

            {/* Tablas regulares */}
            <div>
              <span style={{fontSize:11,color:'var(--mut)',display:'block',marginBottom:6}}>Tablas de registro</span>
              {assignableKeys.filter(k=>k!=='quicklog').map(k => (
                <span key={k} className={`chip ${form.tables.includes(k)?'on':''}`} onClick={()=>togTable(k)}>
                  {TABLE_LABELS[k]}
                </span>
              ))}
            </div>
          </div>
        )}

        {isAllAccess && (
          <div className="alert a-ok" style={{marginTop:12}}>✓ Acceso completo a todas las tablas y módulos</div>
        )}

        <div className="m-actions">
          <button className="btn btn-acc" onClick={()=>onSave(form)}>💾 Guardar</button>
          <button className="btn btn-out" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const { toast, show } = useToast()
  const [users,     setUsers]     = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editUser,  setEditUser]  = useState(null)

  useEffect(() => {
    api.get('/users').then(r=>setUsers(r.data)).catch(()=>show('Error al cargar usuarios','err'))
  }, [])

  async function handleSave(data) {
    try {
      if (editUser) {
        const r = await api.put(`/users/${editUser.id}`, data)
        setUsers(prev => prev.map(u => u.id === editUser.id ? r.data : u))
        show('Usuario actualizado ✓')
      } else {
        const r = await api.post('/users', data)
        setUsers(prev => [...prev, r.data])
        show('Usuario creado ✓')
      }
      setShowModal(false); setEditUser(null)
    } catch(err) {
      show(err.response?.data?.error || 'Error al guardar','err')
    }
  }

  async function toggleActive(u) {
    try {
      const r = await api.put(`/users/${u.id}`, { active: !u.active })
      setUsers(prev => prev.map(x => x.id === u.id ? r.data : x))
      show(r.data.active ? 'Usuario activado' : 'Usuario desactivado','warn')
    } catch { show('Error','err') }
  }

  // Qué puede escribir este usuario
  function permisoLabel(u) {
    if (u.role === 'ADMIN' || u.role === 'SUPERVISOR') return <span className="tag">Todas</span>
    if (!u.tables?.length) return <span style={{color:'var(--mut)',fontSize:12}}>—</span>
    return u.tables.map(t => (
      <span key={t} className="tag" style={t==='quicklog'?{background:'var(--acc)22',color:'var(--acc)',border:'1px solid var(--acc)44'}:{}}>
        {TABLE_LABELS[t] || t}
      </span>
    ))
  }

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div className="ph-top">
        <div>
          <div className="page-title">Gestión de Usuarios</div>
          <div className="page-desc">{users.length} usuarios registrados</div>
        </div>
        <button className="btn btn-acc" onClick={()=>{setEditUser(null);setShowModal(true)}}>+&nbsp;Nuevo Usuario</button>
      </div>
      <div className="t-wrap">
        <div className="ox">
          <table className="tbl">
            <thead>
              <tr>{['Nombre','Email','Rol','Permisos de escritura','Estado','Acc.'].map(c=><th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div className="u-av" style={{width:26,height:26,fontSize:10}}>{inits(u.name)}</div>
                      {u.name}
                    </div>
                  </td>
                  <td style={{color:'var(--mut)'}}>{u.email}</td>
                  <td><span className={`bdg ${roleCls(u.role)}`}>{u.role}</span></td>
                  <td style={{maxWidth:320}}>{permisoLabel(u)}</td>
                  <td><span className={`bdg ${u.active?'b-act':'b-ina'}`}>{u.active?'Activo':'Inactivo'}</span></td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button className="btn btn-blu btn-sm" onClick={()=>{setEditUser(u);setShowModal(true)}}>✏</button>
                      {u.id !== me.id && (
                        <button className={`btn btn-sm ${u.active?'btn-red':'btn-grn'}`} onClick={()=>toggleActive(u)}>
                          {u.active?'🔒':'🔓'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && <UserModal user={editUser} onClose={()=>{setShowModal(false);setEditUser(null)}} onSave={handleSave}/>}
    </div>
  )
}
