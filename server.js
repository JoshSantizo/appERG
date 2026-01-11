const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/db');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const helmet = require('helmet');
const reportingRoutes = require('./routes/reportingRoutes');
const memberRoutes = require('./routes/memberRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');

// --- 1. CONFIGURACIÓN INICIAL ---
dotenv.config();
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 4000;


// --- 2. DOCUMENTACIÓN SWAGGER/OPENAPI ---
const swaggerDocument = YAML.load('./docs/swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// --- 3. IMPORTACIÓN DE RUTAS ---
const authRoutes = require('./routes/authRoutes');
const liderRoutes = require('./routes/liderRoutes');
const lsrRoutes = require('./routes/lsrRoutes');


// --- 4. DEFINICIÓN DE RUTAS ---
app.use('/api/auth', authRoutes);
app.use('/api/lider', liderRoutes);
app.use('/api/lsr', lsrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reportes', reportingRoutes);
app.use('/api/miembros', memberRoutes);
app.use('/api/reportes', reportRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('API SistemaERG en funcionamiento. Visite /api-docs para la documentación.');
});


// --- 5. INICIO DEL SERVIDOR ---
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Documentación de API disponible en http://localhost:${PORT}/api-docs`);
});