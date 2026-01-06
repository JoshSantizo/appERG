const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const reportingController = require('../controllers/reportingController');
const ROLES = require('../constants/roles'); 

// Roles con acceso a reportes de alto nivel (LSR Metrics y Network Status)
const ROLES_REPORTE_ALTO_NIVEL = [
    ROLES.SUPER_ADMIN, 
    ROLES.LSR 
];

// Roles con acceso a la gestión de miembros
const ROLES_MIEMBROS = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION, 
    ROLES.LSR, 
    ROLES.LIDER
];

const ROLES_DETALLE_CDP = [ // <--- DEFINICIÓN AÑADIDA O MOVIDA AQUÍ
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION, 
    ROLES.LSR, 
    ROLES.LIDER
];



// [GET] /api/reportes/metricas-lsr 
router.get(
    '/metricas-lsr', 
    verifyToken, 
    authorizeRoles(ROLES_REPORTE_ALTO_NIVEL), 
    reportingController.getLsrMetrics
);

// [GET] /api/reportes/miembros/cdp/:id_cdp 
router.get(
    '/miembros/cdp/:id_cdp', 
    verifyToken, 
    authorizeRoles(ROLES_MIEMBROS), 
    reportingController.getMembersByCdP
);

// [GET] /api/reportes/red/:id_red/status - Estatus de Miembros por Red
router.get(
    '/red/:id_red/status', 
    verifyToken, 
    authorizeRoles(ROLES_REPORTE_ALTO_NIVEL), 
    reportingController.getNetworkStatus
);

// [GET] /api/reportes/red/:id_red/status - Estatus de Miembros por Red
router.get(
    '/red/:id_red/status', 
    verifyToken, 
    authorizeRoles(ROLES_REPORTE_ALTO_NIVEL), 
    reportingController.getNetworkStatus
);

// [GET] /api/reportes/asistencia/cdp/:id_cdp - Métricas de Crecimiento y Asistencia (NUEVA RUTA)
router.get(
    '/asistencia/cdp/:id_cdp', 
    verifyToken, 
    authorizeRoles(ROLES_DETALLE_CDP), 
    reportingController.getCdpAttendanceMetrics
);

// [GET] /api/reportes/asistencia/cdp/:id_cdp 
router.get(
    '/asistencia/cdp/:id_cdp', 
    verifyToken, 
    authorizeRoles(ROLES_DETALLE_CDP), 
    reportingController.getCdpAttendanceMetrics
);

// [GET] /api/reportes/cdp-por-lsr - Lista de CdP por LSR loggeado (NUEVA RUTA)
router.get(
    '/cdp-por-lsr', 
    verifyToken, 
    authorizeRoles([ROLES.LSR]), // Solo LSR
    reportingController.getCdPsByLsr
);

module.exports = router;