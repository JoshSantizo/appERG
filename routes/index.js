const express = require('express');
const router = express.Router();

// Importación de todos los enrutadores individuales
const authRoutes = require('./authRoutes');
const catalogosRoutes = require('./catalogosRoutes');
const liderRoutes = require('./liderRoutes');
const lsrRoutes = require('./lsrRoutes');
const adminRoutes = require('./adminRoutes');
const memberRoutes = require('./memberRoutes');
const reportRoutes = require('./reportRoutes');

// Importación de middlewares necesarios aquí
const { verifyToken } = require('../middlewares/authMiddleware');
const liderController = require('../controllers/liderController');

// ---------------------------------------------------------
// ASIGNACIÓN DE RUTAS AL ENRUTADOR PRINCIPAL
// ---------------------------------------------------------

// Rutas de desarrollo o pruebas
router.use('/test-envio', reportRoutes);

// Rutas de autenticación y catálogos
router.use('/auth', authRoutes);
router.use('/catalogos', catalogosRoutes);

// Rutas de módulos específicos
router.use('/lider', liderRoutes);
router.use('/lsr', lsrRoutes);
router.use('/admin', adminRoutes);
router.use('/miembros', memberRoutes);

// Rutas globales o compartidas que estaban sueltas en server.js
router.get('/ministerios', verifyToken, liderController.getMinisteriosLista);
router.get('/miembros-universal', verifyToken, liderController.getMiembrosUniversal);

module.exports = router;