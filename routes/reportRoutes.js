const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken } = require('../middlewares/authMiddleware');

// La ruta final será: /api/reportes-nuevos/crear
router.post('/crear', reportController.createReporteCompleto);

module.exports = router;
