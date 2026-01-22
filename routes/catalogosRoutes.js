const catalogosController = require('../controllers/catalogosController');
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Para llenar los Selectores del Front
router.get('/catalogos/filtros', verifyToken, catalogosController.getCatalogosFiltros);

module.exports = router;
