require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes   = require('./routes/auth');
const usersRoutes  = require('./routes/users');
const tablesRoutes = require('./routes/tables');
const importRoutes = require('./routes/import');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',   authRoutes);
app.use('/api/users',  usersRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/import', importRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/', (req, res) => res.json({ message: 'GeoCore API activa', version: '2.0' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ GeoCore API corriendo en http://localhost:${PORT}`);
});
