const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Definimos el endpoint
router.post('/crear', reportController.createReporteCompleto);

module.exports = router;