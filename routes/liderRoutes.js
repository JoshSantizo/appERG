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
// RUTAS DE MIEMBROS (Gestión)
// --------------------------------------------------------------------------

// Esta ruta la usan todos: Admins, LSR y Líderes
router.get('/miembros-universal', verifyToken, authorizeRoles([1, 2, 4, 5]), liderController.getMiembrosUniversal);

// Solo los roles que pueden crear (Líder, Admin, SuperAdmin)
// Y usa la función así:
router.post('/miembros', verifyToken, authorizeRoles([1, 2, 5]), liderController.createMiembro);



// [DELETE] /api/lider/miembros/:id - ELIMINACIÓN LÓGICA (Cambia estado a 'Inactivo')
router.delete(
    '/miembros/:id', 
    verifyToken, 
    authorizeRoles(ROLES_CRUD_PERMITIDOS), 
    liderController.deleteMiembro
);
// Asegúrate de que esta línea esté presente y use la función correcta
router.post('/miembros', verifyToken, authorizeRoles([1, 2, 5]), liderController.crearMiembroUniversal);

// --------------------------------------------------------------------------
// GESTIÓN DE REPORTES
// --------------------------------------------------------------------------

// [POST] /api/lider/reporte-completo - Procesa Reporte, Asistencia y Visitas en una Transacción
router.post(
    '/reporte-completo', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.createReporteCompleto
);

// --- Rutas de legado/soporte (Se mantienen por compatibilidad) ---



// --------------------------------------------------------------------------
// UTILIDADES DE CONSULTA (Preparación de Formularios)
// --------------------------------------------------------------------------

// [GET] /api/lider/mi-cdp-id - Obtiene el ID de la CdP del líder loggeado
router.get(
    '/mi-cdp-id', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.getLiderCdpId
);

// [GET] /api/lider/miembros-asistencia - Lista de miembros para el formulario de asistencia
router.get(
    '/miembros-asistencia', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.getMembersForAttendance
);

// --------------------------------------------------------------------------
// ANALÍTICA Y CONSULTAS PARA LSR (ROL 4)
// --------------------------------------------------------------------------



// [GET] /api/lider/lsr/vision/resumen - Analítica de visión para LSR
router.get(
    '/lsr/vision/resumen', 
    verifyToken, 
    authorizeRoles([ROLES.LSR]), 
    liderController.getSubredVisionSummary
);

// [GET] /api/lider/reportes-historial - Listado simple de fechas y montos
router.get(
    '/reportes-historial', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.getHistorialReportes
);

// [GET] /api/lider/reporte-detalle/:id - Detalle completo con lista de asistentes/faltantes
router.get(
    '/reporte-detalle/:id', 
    verifyToken, 
    authorizeRoles(ROLES_LIDER), 
    liderController.getDetalleReporte
);

// [GET] /api/lider/lsr/seguimientos - Bandeja de entrada para el supervisor
router.get(
    '/lsr/seguimientos', 
    verifyToken, 
    authorizeRoles([ROLES.LSR]), 
    liderController.getSeguimientosLSR
);

// Seguimientos y Notas
router.get('/mis-seguimientos', verifyToken, liderController.getMisSeguimientos);
router.get('/seguimiento-detalle/:id', verifyToken, liderController.getSeguimientoCompleto);
router.post('/seguimiento-nota', verifyToken, liderController.addNotaSeguimiento);
router.post('/miembros', liderController.crearMiembroUniversal);

module.exports = router;