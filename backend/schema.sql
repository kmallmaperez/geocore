-- ── GEOCORE: Schema completo ────────────────────────────────────

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  password     TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'USER',
  tables       TEXT[] DEFAULT '{}',
  active       BOOLEAN DEFAULT true,
  tipo_acceso  TEXT DEFAULT 'Ambos',     -- 'Mina' | 'Exploraciones' | 'Ambos'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- Migración aplicada en runtime por users.js: ALTER TABLE users ADD COLUMN IF NOT EXISTS tipo_acceso TEXT DEFAULT 'Ambos'

-- Programa General
CREATE TABLE IF NOT EXISTS programa_general (
  id              SERIAL PRIMARY KEY,
  "PLATAFORMA"    TEXT,
  "DDHID"         TEXT,
  "ESTE"          NUMERIC,
  "NORTE"         NUMERIC,
  "ELEV"          NUMERIC,
  "LENGTH"        NUMERIC,
  "tipo_proyecto" TEXT DEFAULT 'Mina',   -- 'Mina' | 'Exploraciones'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Migración aplicada en runtime por tables.js: ALTER TABLE programa_general ADD COLUMN IF NOT EXISTS "tipo_proyecto" TEXT DEFAULT 'Mina'

-- Perforación
CREATE TABLE IF NOT EXISTS perforacion (
  id           SERIAL PRIMARY KEY,
  "DDHID"      TEXT,
  "Fecha"      DATE,
  "From_Dia"   NUMERIC,
  "TO_Dia"     NUMERIC,
  "Turno_Dia"  NUMERIC,
  "From_Noche" NUMERIC,
  "To_Noche"   NUMERIC,
  "Turno_Noche" NUMERIC,
  "Total_Dia"  NUMERIC,
  "Acumulado"  NUMERIC,
  "Comentarios" TEXT,
  "Geologo"    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Recepción
CREATE TABLE IF NOT EXISTS recepcion (
  id       SERIAL PRIMARY KEY,
  "Fecha"  DATE,
  "HORA"   TEXT,
  "DDHID"  TEXT,
  "FROM"   NUMERIC,
  "TO"     NUMERIC,
  "Metros" NUMERIC,
  "CAJAS"  NUMERIC,
  "Geologo" TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recuperación
CREATE TABLE IF NOT EXISTS recuperacion (
  id        SERIAL PRIMARY KEY,
  "Fecha"   DATE,
  "DDHID"   TEXT,
  "From"    NUMERIC,
  "To"      NUMERIC,
  "Avance"  NUMERIC,
  "Geologo" TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fotografía
CREATE TABLE IF NOT EXISTS fotografia (
  id        SERIAL PRIMARY KEY,
  "Fecha"   DATE,
  "DDHID"   TEXT,
  "From"    NUMERIC,
  "To"      NUMERIC,
  "Avance"  NUMERIC,
  "N_Foto"  NUMERIC,
  "Geologo" TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- L_Geotécnico
CREATE TABLE IF NOT EXISTS l_geotecnico (
  id        SERIAL PRIMARY KEY,
  "Fecha"   DATE,
  "DDHID"   TEXT,
  "From"    NUMERIC,
  "To"      NUMERIC,
  "Avance"  NUMERIC,
  "PLT"     NUMERIC,
  "UCS"     NUMERIC,
  "Geologo" TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- L_Geológico
CREATE TABLE IF NOT EXISTS l_geologico (
  id             SERIAL PRIMARY KEY,
  "Fecha"        DATE,
  "DDHID"        TEXT,
  "From"         NUMERIC,
  "To"           NUMERIC,
  "Avance"       NUMERIC,
  "Geologo"      TEXT,
  "SG"           NUMERIC,
  "Observaciones" TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Muestreo
CREATE TABLE IF NOT EXISTS muestreo (
  id         SERIAL PRIMARY KEY,
  "Fecha"    DATE,
  "DDHID"    TEXT,
  "DE"       NUMERIC,
  "HASTA"    NUMERIC,
  "MUESTRAS" NUMERIC,
  "Geologo"  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Corte
CREATE TABLE IF NOT EXISTS corte (
  id          SERIAL PRIMARY KEY,
  "Fecha"     DATE,
  "DDHID"     TEXT,
  "DE"        NUMERIC,
  "A"         NUMERIC,
  "AVANCE"    NUMERIC,
  "CAJAS"     NUMERIC,
  "MAQUINAS"  NUMERIC,
  "Geologo"   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Envíos
CREATE TABLE IF NOT EXISTS envios (
  id              SERIAL PRIMARY KEY,
  "Fecha"         DATE,
  "Envio_N"       NUMERIC,
  "Total_muestras" NUMERIC,
  "Geologo"       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Batch
CREATE TABLE IF NOT EXISTS batch (
  id              SERIAL PRIMARY KEY,
  "Envio"         TEXT,
  "Batch"         TEXT,
  "Sondaje"       TEXT,
  "Qty_Mina"      NUMERIC,
  "Qty_Lab"       NUMERIC,
  "Muestras_Dens" NUMERIC,
  "Cod_Cert"      TEXT,
  "F_Envio"       DATE,
  "F_Solicitud"   DATE,
  "F_Resultados"  DATE,
  "Tiempo_dias"   NUMERIC,
  "Geologo"       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tormentas
CREATE TABLE IF NOT EXISTS tormentas (
  id        SERIAL PRIMARY KEY,
  "Fecha"   DATE,
  "Desde"   TEXT,
  "Hasta"   TEXT,
  "TOTAL"   NUMERIC,
  "Minutos" NUMERIC,
  "Horas"   NUMERIC,
  "Geologo" TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Estado manual por sondaje
CREATE TABLE IF NOT EXISTS estado_overrides (
  ddhid  TEXT PRIMARY KEY,
  estado TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Programa de perforación (plan semanal por tipo de proyecto)
-- Creado y sembrado automáticamente por routes/programaPerf.js al arrancar el servidor
CREATE TABLE IF NOT EXISTS programa_perforacion (
  id            SERIAL PRIMARY KEY,
  tipo_proyecto TEXT NOT NULL DEFAULT 'Mina',   -- 'Mina' | 'Exploraciones'
  fecha         DATE NOT NULL,
  acum_prog     NUMERIC NOT NULL,               -- metros acumulados programados a esa fecha
  descripcion   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tipo_proyecto, fecha)
);

-- ── USUARIO ADMIN INICIAL ─────────────────────────────────────────
-- Contraseña: admin123 (hash bcrypt)
INSERT INTO users (name, email, password, role, tables, active)
VALUES (
  'Administrador',
  'admin@geocore.pe',
  '$2a$08$jHMt7sBjFW1X5NMjsKZ6a.9Qk8vL3mP2nR7wY4xE6dC1oI0uG5hAe',
  'ADMIN',
  ARRAY['all'],
  true
)
ON CONFLICT (email) DO NOTHING;
