const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const liderController = require('../controllers/liderController');
const ROLES = require('../constants/roles'); // <--- IMPORTAR CONSTANTES


// Roles permitidos: Rol 4 (LSR), Rol 2 (Admin), Rol 1 (Super Admin)
const LSR_ACCESS_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.LSR]; 

// --- ANALÍTICA DE SUBRED ---
// Usamos el controlador del archivo 'liderController.js'
router.get('/vision/resumen', verifyToken, authorizeRoles(LSR_ACCESS_ROLES), liderController.getSubredVisionSummary);



module.exports = router;