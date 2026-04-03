const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken } = require('../middlewares/authMiddleware');


// Ruta para obtener reportes filtrados
router.get('/listar', verifyToken, reportController.getReportesPorRol);

// Definimos el endpoint
router.post('/crear', reportController.createReporteCompleto);

module.exports = router;