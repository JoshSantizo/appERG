const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const adminController = require('../controllers/adminController'); 
const userAdminController = require('../controllers/userAdminController');
const memberController = require('../controllers/memberController'); // <--- Importar MemberController
const ROLES = require('../constants/roles');
const liderController = require('../controllers/liderController'); // <--- AÑADE ESTO


// Roles de Nivel Superior (quienes pueden ver métricas generales)
const ROLES_ACCESO_TOTAL = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION, 
    ROLES.LSR 
];

// Roles para Eliminación (Super Admin, Administrador)
const DELETE_MEMBER_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMINISTRACION];

// Solo el Super Admin puede gestionar otros usuarios
const ROLES_SUPER_ADMIN = [ROLES.SUPER_ADMIN];

// Roles con permisos de Administración global (Super Admin y Admin)
const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMINISTRACION];

// Roles permitidos para gestión administrativa de alto nivel (Solo Super Admin)
const SUPER_ADMIN_ROLE = [ROLES.SUPER_ADMIN]; // Rol 1

// --- GESTIÓN DE REDES ---
router.post('/redes', verifyToken, authorizeRoles(SUPER_ADMIN_ROLE), adminController.createRed);
router.get('/redes', verifyToken, authorizeRoles(SUPER_ADMIN_ROLE), adminController.getAllRedes);
router.put('/redes/:id_red', verifyToken, authorizeRoles(SUPER_ADMIN_ROLE), adminController.updateRed);


// --------------------------------------------------------------------------
// 1. RUTAS DE REPORTES (Se mantienen iguales)
// --------------------------------------------------------------------------

// [GET] /api/admin/miembros/todos
router.get(
    '/miembros/todos', 
    verifyToken, 
    authorizeRoles([ROLES.SUPER_ADMIN, ROLES.LSR]), 
    adminController.getAllMiembros
);

// [GET] /api/admin/cdp/todas
router.get(
    '/cdp/todas', 
    verifyToken, 
    authorizeRoles(ROLES_ACCESO_TOTAL), 
    adminController.getAllCasasDePaz
);

// --------------------------------------------------------------------------
// 2. RUTAS DE GESTIÓN DE USUARIOS (Solo SUPER ADMIN: Rol 1)
// --------------------------------------------------------------------------

// [GET] /api/admin/usuarios/todos - Listar todos los usuarios
router.get(
    '/usuarios/todos', 
    verifyToken, 
    authorizeRoles(ROLES_SUPER_ADMIN), 
    userAdminController.getAllUsuarios
);

// [POST] /api/admin/usuarios/crear - Crear nuevo usuario
router.post(
    '/usuarios/crear', 
    verifyToken, 
    authorizeRoles(ROLES_SUPER_ADMIN), 
    userAdminController.createUser
);

// [PUT] /api/admin/usuarios/:id - MODIFICAR usuario (NUEVA RUTA)
router.put(
    '/usuarios/:id', 
    verifyToken, 
    authorizeRoles(ROLES_SUPER_ADMIN), 
    userAdminController.updateUser
);

// [DELETE] /api/admin/usuarios/:id - Desactivación lógica (NUEVA RUTA)
router.delete(
    '/usuarios/:id', 
    verifyToken, 
    authorizeRoles(ROLES_SUPER_ADMIN), 
    userAdminController.deleteUser
);

// --------------------------------------------------------------------------
// 3. RUTAS DE GESTIÓN DE ESTRUCTURA (Solo SUPER ADMIN: Rol 1)
// --------------------------------------------------------------------------

// [POST] /api/admin/cdp/crear - Crear Casa de Paz (NUEVA RUTA)
router.post(
    '/cdp/crear', 
    verifyToken, 
    authorizeRoles(ROLES_SUPER_ADMIN), 
    adminController.createCdP
);

// [PUT] /api/admin/cdp/:id_cdp/asignar-lider - Asignar líder (Fase 2.14)
router.put(
    '/cdp/:id_cdp/asignar-lider', 
    verifyToken, 
    authorizeRoles(ROLES_SUPER_ADMIN), 
    adminController.assignLiderToCdP
);

// --------------------------------------------------------------------------
// 4. GESTIÓN DE REDES (NUEVAS RUTAS)
// --------------------------------------------------------------------------

// [POST] /api/admin/redes/crear - Crea una nueva Red
router.post(
    '/redes/crear', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.createNetwork
);

// [PUT] /api/admin/redes/:id_red - Actualiza el nombre de una Red
router.put(
    '/redes/:id_red', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.updateNetwork
);

// [DELETE] /api/admin/redes/:id_red - Elimina una Red
router.delete(
    '/redes/:id_red', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.deleteNetwork
);

// --------------------------------------------------------------------------
// 5. GESTIÓN DE CASAS DE PAZ
// --------------------------------------------------------------------------

// [POST] /api/admin/cdp/crear - Crea una nueva Casa de Paz
router.post(
    '/cdp/crear', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.createCdp
);

// [PUT] /api/admin/cdp/:id_cdp - Actualiza una Casa de Paz
router.put(
    '/cdp/:id_cdp', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.updateCdp
);

// [DELETE] /api/admin/cdp/:id_cdp - Elimina una Casa de Paz
router.delete(
    '/cdp/:id_cdp', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.deleteCdp
);

// Roles para modificar fases de visión
const PHASE_UPDATE_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
];

// Roles con permisos para gestión de Miembros (Super Admin, Administrador, LSR)
const MIEMBRO_MANAGEMENT_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMINISTRACION, ROLES.LSR]; 

// --------------------------------------------------------------------------
// 6. GESTIÓN DE MIEMBROS (NUEVA RUTA)
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// 4. GESTIÓN DE MIEMBROS
// --------------------------------------------------------------------------

// [POST] /api/admin/miembro/crear - Crea un nuevo Miembro (Ya implementado en adminController)
router.post(
    '/miembro/crear', 
    verifyToken, 
    authorizeRoles(MIEMBRO_MANAGEMENT_ROLES), 
    adminController.createMiembro
);

// [PUT] /api/admin/miembro/:id_miembro - Actualiza un Miembro (Reutilizando MemberController)
router.put(
    '/miembro/:id_miembro', 
    verifyToken, 
    authorizeRoles(MIEMBRO_MANAGEMENT_ROLES), // Permitimos a Líderes de Subred (LSR) editar
    memberController.updateMember // <--- Función reutilizada
);

// [DELETE] /api/admin/miembro/:id_miembro - Elimina un Miembro (Reutilizando MemberController)
router.delete(
    '/miembro/:id_miembro', 
    verifyToken, 
    authorizeRoles(DELETE_MEMBER_ROLES), // Solo Super Admin/Admin
    memberController.deleteMember // <--- Función reutilizada
);

// --------------------------------------------------------------------------
// 5. GESTIÓN DE FASES DE VISIÓN
// --------------------------------------------------------------------------

// [POST] /api/admin/miembro/fase - Registra/Actualiza el progreso de un miembro en una fase
router.post(
    '/miembro/fase',
    verifyToken,
    authorizeRoles(PHASE_UPDATE_ROLES),
    adminController.updateMemberPhase
);

// --- GESTIÓN DE LSRS (ROLES 4) ---
router.post('/lsr/rol', verifyToken, authorizeRoles(SUPER_ADMIN_ROLE), adminController.manageLsrRole);
router.get('/lsr/todos', verifyToken, authorizeRoles(SUPER_ADMIN_ROLE), adminController.getAllLsrs);

router.post('/seguimiento-nota', verifyToken, authorizeRoles(ADMIN_ROLES), liderController.addNotaSeguimiento);

// --- GESTIÓN AVANZADA DE VISITAS (Solo Admin) ---

// [PUT] Editar datos de la visita
router.put(
    '/visita/:id', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.updateVisitaAdmin
);

// [DELETE] Eliminar visita y su seguimiento
router.delete(
    '/visita/:id', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.deleteVisitaAdmin
);

router.get('/seguimientos/todos', verifyToken, authorizeRoles(ADMIN_ROLES), adminController.getAllSeguimientosAdmin);

router.post(
    '/visita-manual', 
    verifyToken, 
    authorizeRoles(ADMIN_ROLES), 
    adminController.createVisitaAdministrativa
);

// Resetear contraseña de otros (Solo Admin)
router.put('/reset-password-lider', verifyToken, authorizeRoles([1, 2]), adminController.resetPasswordByAdmin);

module.exports = router;



