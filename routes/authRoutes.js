const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController'); // <--- DEBE EXISTIR

// [POST] /api/auth/login
// Permite al usuario iniciar sesión y recibir un token JWT
router.post('/login', authController.login); // <--- authController.login AHORA ES UNA FUNCIÓN

module.exports = router;