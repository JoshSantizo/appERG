const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// La ruta absoluta será: /api/test-envio/crear
router.post('/crear', reportController.createReporteCompleto);

module.exports = router;