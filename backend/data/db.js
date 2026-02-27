const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// Test de conexión al iniciar
pool.connect()
  .then(client => {
    console.log('✅ Base de datos conectada')
    client.release()
  })
  .catch(err => console.error('❌ Error BD:', err.message))

module.exports = pool
