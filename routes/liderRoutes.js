const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const liderController = require('../controllers/liderController');
const ROLES = require('../constants/roles'); 

// Roles que tienen permiso para CRUD (Crear, Leer, Modificar, Desactivar)
const ROLES_CRUD_PERMITIDOS = [
    ROLES.LIDER, 
    ROLES.LSR, 
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION
];

// Rol permitido: Solo Líder de Casa de Paz
const ROLES_LIDER = [ROLES.LIDER];

// --------------------------------------------------------------------------
// RUTAS DE LECTURA Y CREACIÓN (Líder)
// --------------------------------------------------------------------------

// [GET] /api/lider/miembros - LISTAR MIEMBROS DE SU CDP
router.get(
    '/miembros', 
    verifyToken, 
    authorizeRoles([ROLES.LIDER]), 
    liderController.getMiembrosByLider
);

// [POST] /api/lider/miembros - CREAR NUEVO MIEMBRO
router.post(
    '/miembros',
    verifyToken,
    authorizeRoles([ROLES.LIDER]),
    liderController.createMiembro
);

// --------------------------------------------------------------------------
// RUTAS DE MODIFICACIÓN Y ELIMINACIÓN (CRUD Completo)
// --------------------------------------------------------------------------

// [PUT] /api/lider/miembros/:id - MODIFICAR MIEMBRO
router.put(
    '/miembros/:id', 
    verifyToken, 
    authorizeRoles(ROLES_CRUD_PERMITIDOS), 
    liderController.updateMiembro
);

// [DELETE] /api/lider/miembros/:id - ELIMINACIÓN LÓGICA (Cambia estado a 'Inactivo')
router.delete(
    '/miembros/:id', 
    verifyToken, 
    authorizeRoles(ROLES_CRUD_PERMITIDOS), 
    liderController.deleteMiembro
);

// --------------------------------------------------------------------------
// 1. GESTIÓN DE REPORTES Y ASISTENCIA (Solo Líder)
// --------------------------------------------------------------------------

// [POST] /api/lider/reporte/crear - Crear la entrada principal en ReporteCdP
router.post(
    '/reporte/crear', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.createReporteCdP
);

// [POST] /api/lider/asistencia/registrar - Registrar la asistencia detallada en AsistenciaCdP
router.post(
    '/asistencia/registrar', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.registerAttendance
);

// --------------------------------------------------------------------------
// 2. UTILIDADES DE CONSULTA (Solo Líder)
// --------------------------------------------------------------------------

// [GET] /api/lider/mi-cdp-id - Obtiene el ID de la CdP del líder loggeado
router.get(
    '/mi-cdp-id', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.getLiderCdpId
);

// [GET] /api/lider/miembros-asistencia - Obtiene la lista de miembros para registro de asistencia (NUEVA RUTA)
router.get(
    '/miembros-asistencia', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.getMembersForAttendance
);


module.exports = router;