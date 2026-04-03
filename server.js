const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/db');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const helmet = require('helmet');

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

// --- 3. IMPORTACIÓN DEL ENRUTADOR CENTRAL ---
const apiRouter = require('./routes/index'); // Traemos el hub de rutas

// --- 4. DEFINICIÓN DE RUTAS ---

// Conectamos todas las rutas bajo el prefijo global /api
app.use('/api', apiRouter);

// Ruta de prueba de vida del servidor
app.get('/', (req, res) => {
    res.send('API SistemaERG en funcionamiento.');
});

// --- 5. INICIO DEL SERVIDOR ---
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});