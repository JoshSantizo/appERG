const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const reportController = require('../controllers/reportController');
const ROLES = require('../constants/roles');
const reportingController = require('../controllers/reportingController');

// Roles con permisos para crear reportes (Líder, LSR, Admin, Super Admin)
const REPORTER_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

// Roles para adjuntar asistencia (Líder, LSR, Admin, Super Admin)
const ATTENDANCE_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

const VISIT_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

// Roles para ver historial de reportes
const VIEW_HISTORY_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

// Roles para Seguimiento (Líder, LSR, Admin, Super Admin)
const SEGUIMIENTO_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

// Roles para Reporte de Supervisión (Solo LSR, Admin, Super Admin)
const SUPERVISION_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
    ROLES.LSR 
];

// Roles para Reporte de Servicio (Solo Líder de Servicio, Admin, Super Admin)
const SERVICE_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION,
    ROLES.LIDER_SERVICIO // Asumimos Rol ID 3
];

// Roles solo para Administradores
const ADMIN_ANALYTICS_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION
];

// --------------------------------------------------------------------------
// 1. GESTIÓN DE REPORTES DE CASA DE PAZ
// --------------------------------------------------------------------------

// [POST] /api/reportes/cdp/crear - Crea un nuevo reporte de CdP
router.post(
    '/cdp/crear', 
    verifyToken, 
    authorizeRoles(REPORTER_ROLES), 
    reportController.createCdpReport
);

// [POST] /api/reportes/asistencia/detalle - Adjunta la lista de asistencia de miembros
router.post(
    '/asistencia/detalle', 
    verifyToken, 
    authorizeRoles(ATTENDANCE_ROLES), 
    reportController.createAttendanceDetail
);

// [POST] /api/reportes/visita/crear - Adjunta la lista de visitas
router.post(
    '/visita/crear', 
    verifyToken, 
    authorizeRoles(VISIT_ROLES), 
    reportController.createCdpVisit
);

// --------------------------------------------------------------------------
// 2. GESTIÓN DE CONSULTAS (Lectura/Reporting)
// --------------------------------------------------------------------------

// [GET] /api/reportes/cdp/historial - Obtiene todos los reportes según el rol
router.get(
    '/cdp/historial', 
    verifyToken, 
    authorizeRoles(VIEW_HISTORY_ROLES), 
    reportingController.getLeaderReports
);

// --------------------------------------------------------------------------
// 3. GESTIÓN DE SEGUIMIENTO DE VISITAS
// --------------------------------------------------------------------------

// [POST] /api/reportes/seguimiento/iniciar - Crea el registro inicial de seguimiento
router.post(
    '/seguimiento/iniciar', 
    verifyToken, 
    authorizeRoles(SEGUIMIENTO_ROLES), 
    reportController.startSeguimiento
);

// [POST] /api/reportes/seguimiento/nota/crear - Agrega una nota al seguimiento
router.post(
    '/seguimiento/nota/crear', 
    verifyToken, 
    authorizeRoles(SEGUIMIENTO_ROLES), 
    reportController.createSeguimientoNote
);

// --------------------------------------------------------------------------
// 4. GESTIÓN DE SUPERVISIÓN (LSR)
// --------------------------------------------------------------------------

// [POST] /api/reportes/supervision/crear - Crea un nuevo reporte de supervisión
router.post(
    '/supervision/crear', 
    verifyToken, 
    authorizeRoles(SUPERVISION_ROLES), 
    reportController.createSupervisionReport
);

// --------------------------------------------------------------------------
// 5. GESTIÓN DE REPORTE DE SERVICIO (Líder de Servicio)
// --------------------------------------------------------------------------

// [POST] /api/reportes/servicio/crear - Crea un nuevo reporte de servicio
router.post(
    '/servicio/crear', 
    verifyToken, 
    authorizeRoles(SERVICE_ROLES), 
    reportController.createServiceReport
);

// [GET] /api/reportes/seguimiento/pendientes - Lista las visitas sin seguimiento
router.get(
    '/seguimiento/pendientes', 
    verifyToken, 
    authorizeRoles(VIEW_HISTORY_ROLES), // Usamos los mismos roles para ver historial/seguimiento
    reportingController.getPendingSeguimiento
);

// [GET] /api/reportes/cdp/detalle/:id_reporte_cdp - Obtiene el detalle completo de un reporte
router.get(
    '/cdp/detalle/:id_reporte_cdp', 
    verifyToken, 
    authorizeRoles(VIEW_HISTORY_ROLES), 
    reportingController.getCdpReportDetail
);

// [GET] /api/reporting/miembros/inconstantes - Lista a los miembros sin asistencia reciente
router.get(
    '/miembros/inconstantes', 
    verifyToken, 
    authorizeRoles(VIEW_HISTORY_ROLES), // Los mismos roles que ven el historial
    reportingController.getInconsistentMembers
);

// [GET] /api/reporting/seguimiento/detalle/:id_seguimiento - Obtiene la info base y todas las notas de un seguimiento
router.get(
    '/seguimiento/detalle/:id_seguimiento', 
    verifyToken, 
    authorizeRoles(VIEW_HISTORY_ROLES), 
    reportingController.getSeguimientoDetail
);

// --------------------------------------------------------------------------
// 6. ANALÍTICA DE ADMINISTRACIÓN (ROLES 1 & 2)
// --------------------------------------------------------------------------

// [GET] /api/reporting/admin/vision/resumen - Cuenta miembros por fase de visión
router.get(
    '/admin/vision/resumen', 
    verifyToken, 
    authorizeRoles(ADMIN_ANALYTICS_ROLES), 
    reportingController.getVisionPhaseSummary
);

// [GET] /api/reporting/admin/ofrendas/resumen - Consolidado de ofrendas por CdP
router.get(
    '/admin/ofrendas/resumen', 
    verifyToken, 
    authorizeRoles(ADMIN_ANALYTICS_ROLES), 
    reportingController.getOfferingsSummary
);
// [GET] /api/reporting/admin/asistencia/global - Consolidado de asistencia y frutos por periodo
router.get(
    '/admin/asistencia/global', 
    verifyToken, 
    authorizeRoles(ADMIN_ANALYTICS_ROLES), 
    reportingController.getGlobalAttendanceSummary
);

module.exports = router;

