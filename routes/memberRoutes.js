const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const memberController = require('../controllers/memberController');
const ROLES = require('../constants/roles'); 

// Roles con permisos para crear y gestionar miembros
const MEMBER_MANAGEMENT_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION, 
    ROLES.LSR, 
    ROLES.LIDER
];

// Roles con permisos para ELIMINAR miembros (DELETE estricto)
const DELETE_MEMBER_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION
];

// --------------------------------------------------------------------------
// 1. CRUD DE MIEMBROS
// --------------------------------------------------------------------------

// [POST] /api/miembros/crear - Crea un nuevo miembro
router.post(
    '/crear', 
    verifyToken, 
    authorizeRoles(MEMBER_MANAGEMENT_ROLES), 
    memberController.createMember
);

// [GET] /api/miembros/:id_miembro - Consulta un miembro específico (Lectura)
router.get(
    '/:id_miembro', 
    verifyToken, 
    authorizeRoles(MEMBER_MANAGEMENT_ROLES), 
    memberController.getMemberById
);



// [DELETE] /api/miembros/:id_miembro - Elimina un miembro (Solo Admin/Super Admin)
router.delete(
    '/:id_miembro', 
    verifyToken, 
    authorizeRoles(DELETE_MEMBER_ROLES), 
    memberController.deleteMember
);

module.exports = router;
