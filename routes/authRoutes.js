const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');


// [POST] /api/auth/login
router.post('/login', authController.login);

// Ruta protegida para cualquier usuario logueado
router.put('/update-password', verifyToken, authController.updatePassword);

module.exports = router;