const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/db');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const helmet = require('helmet');

// --- 1. CONFIGURACIÓN INICIAL ---
dotenv.config();
const app = express(); // Movemos la inicialización al principio
app.use(helmet());
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 4000;

// Importación de controladores y middlewares
const { verifyToken } = require('./middlewares/authMiddleware');
const liderController = require('./controllers/liderController');
const adminController = require('./controllers/adminController');

// --- 2. DOCUMENTACIÓN SWAGGER/OPENAPI ---
const swaggerDocument = YAML.load('./docs/swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- 3. IMPORTACIÓN DE RUTAS ---
const authRoutes = require('./routes/authRoutes');
const liderRoutes = require('./routes/liderRoutes');
const lsrRoutes = require('./routes/lsrRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportingRoutes = require('./routes/reportingRoutes');
const memberRoutes = require('./routes/memberRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { crearMiembroUniversal } = require('./controllers/liderController');

// --- 4. DEFINICIÓN DE RUTAS ---

// Esta es la ruta universal que definimos para Daniela y todos los roles
app.use('/api/ministerios',verifyToken,liderController.getMinisteriosLista)
app.use('/api/miembros-universal', verifyToken, liderController.getMiembrosUniversal);
app.use('/api/auth', authRoutes);
app.use('/api/lider', liderRoutes);
app.use('/api/lsr', lsrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reportes', reportingRoutes);
app.use('/api/miembros', memberRoutes); // Nota: Si memberRoutes tiene un GET '/', podría chocar con la de arriba
app.use('/api/reportes', reportRoutes);
app.post('/api/miembros', crearMiembroUniversal);
app.use('/api', liderRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('API SistemaERG en funcionamiento. Visite /api-docs para la documentación.');
});

// --- 5. INICIO DEL SERVIDOR ---
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Documentación de API disponible en http://localhost:${PORT}/api-docs`);
});