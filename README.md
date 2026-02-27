# GeoCore — Sistema de Gestión de Sondajes

## Desarrollo local

### Terminal 1 — Backend
```
cd backend
npm install
npm run dev
```

### Terminal 2 — Frontend
```
cd frontend
npm install
npm run dev
```
Abre http://localhost:5173 · Login: admin@geocore.pe / admin123

---

## Deploy en internet (GRATIS)

### PASO 1 — Supabase (base de datos)
1. Crea cuenta en https://supabase.com
2. New Project → nombre: geocore → región: South America
3. Ve a SQL Editor → pega el contenido de backend/schema.sql → Run
4. Ve a Settings → Database → copia la "Connection string (URI)"

### PASO 2 — GitHub (necesario para Render y Vercel)
1. Crea cuenta en https://github.com
2. New repository → nombre: geocore → público o privado
3. En VS Code, abre terminal y ejecuta:
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TU_USUARIO/geocore.git
   git push -u origin main

### PASO 3 — Render (backend)
1. Crea cuenta en https://render.com con GitHub
2. New → Web Service → conecta tu repo
3. Configuración:
   - Name: geocore-api
   - Root Directory: backend
   - Build Command: npm install
   - Start Command: npm start
4. Environment Variables (Add):
   - DATABASE_URL = (pega la URL de Supabase)
   - JWT_SECRET = cualquier_frase_secreta_larga
   - NODE_ENV = production
5. Clic Deploy → espera ~3 min
6. Copia la URL que te da Render: https://geocore-api.onrender.com

### PASO 4 — Vercel (frontend)
1. Crea cuenta en https://vercel.com con GitHub
2. New Project → importa tu repo
3. Configuración:
   - Root Directory: frontend
   - Framework: Vite
4. Environment Variables:
   - VITE_API_URL = https://geocore-api.onrender.com/api
     (usa la URL de Render del paso anterior)
5. Deploy → tu app estará en https://geocore.vercel.app

---

## Credenciales iniciales
- Email: admin@geocore.pe
- Contraseña: admin123
- El admin crea los demás usuarios desde la sección "Usuarios"

## Notas
- Render (gratis) duerme después de 15 min sin uso → primer request tarda ~30s
- Para que no duerma: usa Render plan Starter ($7/mes) o configura un ping cada 10min
- Supabase gratis: 500MB de almacenamiento, suficiente para años de datos de sondajes
