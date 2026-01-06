const db = require('../config/db');
const ROLES = require('../constants/roles');

// --------------------------------------------------------------------------
// [GET] Reporte de Métricas por LSR
// --------------------------------------------------------------------------

/**
 * [GET] /api/reportes/metricas-lsr
 */
const getLsrMetrics = async (req, res) => {
    const requesterId = parseInt(req.user.id); 
    const requesterRole = req.user.id_rol;
    
    const isLsr = requesterRole === ROLES.LSR;
    const filterCondition = isLsr ? `u.id_usuario = ${requesterId}` : 'TRUE';

    try {
        const query = `
            WITH LsrCdpStats AS (
                SELECT
                    cdp.id_lsr,
                    COUNT(cdp.id_cdp) AS total_cdp
                FROM "CasasDePaz" cdp
                GROUP BY cdp.id_lsr
            ),
            LsrMiembroStats AS (
                SELECT
                    cdp.id_lsr,
                    COUNT(m.id_miembro) AS total_miembros,
                    SUM(CASE WHEN m.estado = 'Activo' THEN 1 ELSE 0 END) AS miembros_activos,
                    SUM(CASE WHEN m.estado = 'Inactivo' THEN 1 ELSE 0 END) AS miembros_inactivos
                FROM "Miembros" m
                JOIN "CasasDePaz" cdp ON m.id_cdp = cdp.id_cdp
                GROUP BY cdp.id_lsr
            )
            SELECT
                u.id_usuario AS id_lsr,
                u.nombre AS nombre_lsr,
                COALESCE(s.total_cdp, 0)::int AS total_casas_de_paz,
                COALESCE(ms.total_miembros, 0)::int AS total_miembros,
                COALESCE(ms.miembros_activos, 0)::int AS miembros_activos,
                COALESCE(ms.miembros_inactivos, 0)::int AS miembros_inactivos,
                CASE
                    WHEN COALESCE(ms.total_miembros, 0) = 0 THEN 0.0
                    ELSE ROUND((COALESCE(ms.miembros_inactivos, 0)::numeric / ms.total_miembros) * 100, 2)
                END AS tasa_inactividad_porcentaje
            FROM 
                "Usuarios" u
            LEFT JOIN 
                LsrCdpStats s ON u.id_usuario = s.id_lsr
            LEFT JOIN 
                LsrMiembroStats ms ON u.id_usuario = ms.id_lsr
            WHERE 
                u.id_rol = ${ROLES.LSR} 
                AND ${filterCondition} 
            ORDER BY u.nombre;
        `;

        const result = await db.query(query);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron métricas de LSR.' });
        }

        return res.status(200).json({
            mensaje: `Métricas de ${isLsr ? 'su Subred' : 'todas las Subredes'} generadas exitosamente.`,
            reporte: result.rows
        });

    } catch (error) {
        console.error('❌ Error al generar el reporte de métricas LSR:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al generar el reporte.' });
    }
};

// --------------------------------------------------------------------------
// [GET] Reporte de Miembros por Casa de Paz
// --------------------------------------------------------------------------

/**
 * [GET] /api/reportes/miembros/cdp/:id_cdp
 */
const getMembersByCdP = async (req, res) => {
    const { id_cdp } = req.params;
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    const cdpId = parseInt(id_cdp);

    if (isNaN(cdpId)) {
        return res.status(400).json({ mensaje: 'ID de Casa de Paz inválido.' });
    }

    try {
        let permissionGranted = false;
        
        // 1. Verificar la existencia de la CdP y obtener información
        const cdpQuery = `SELECT id_lider, id_lsr, nombre_lider_cdp FROM "CasasDePaz" WHERE id_cdp = $1`;
        const cdpResult = await db.query(cdpQuery, [cdpId]);

        if (cdpResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Casa de Paz no encontrada.' });
        }
        
        const cdpInfo = cdpResult.rows[0];

        // 2. Verificación de Permisos
        if (requesterRole === ROLES.SUPER_ADMIN || requesterRole === ROLES.ADMINISTRACION) {
            permissionGranted = true; // Acceso total
        } else if (requesterRole === ROLES.LIDER) {
            if (cdpInfo.id_lider == requesterId) { 
                permissionGranted = true; 
            }
        } else if (requesterRole === ROLES.LSR) {
            if (cdpInfo.id_lsr == requesterId) {
                permissionGranted = true; 
            }
        }
        
        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para consultar esta Casa de Paz.' });
        }

        // 3. Ejecutar la consulta de Miembros
        const membersQuery = `
            SELECT 
                id_miembro, 
                nombre, 
                telefono, 
                direccion, 
                sexo, 
                estado, 
                fecha_nacimiento, 
                fecha_conversion,
                fecha_bautizo,
                fecha_boda
            FROM "Miembros"
            WHERE id_cdp = $1
            ORDER BY nombre ASC;
        `;
        
        const result = await db.query(membersQuery, [cdpId]);
        
        return res.status(200).json({
            mensaje: `Listado de ${result.rows.length} miembros para la Casa de Paz ID ${cdpId}.`,
            nombre_cdp: cdpInfo.nombre_lider_cdp,
            miembros: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener miembros por Casa de Paz:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar miembros.' });
    }
};

// --------------------------------------------------------------------------
// [GET] Reporte de Estatus de Miembros por Red (NUEVO)
// --------------------------------------------------------------------------

/**
 * [GET] /api/reportes/red/:id_red/status
 * Genera el estatus consolidado (Activos/Inactivos) para una Red específica.
 */
const getNetworkStatus = async (req, res) => {
    const { id_red } = req.params;
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    const redId = parseInt(id_red);

    if (isNaN(redId)) {
        return res.status(400).json({ mensaje: 'ID de Red inválido.' });
    }

    try {
        let permissionGranted = false;

        // 1. Verificación de existencia de la Red y permisos
        
        // CORRECCIÓN: Usamos nombre_red
        const redCheckQuery = `SELECT nombre_red FROM "Redes" WHERE id_red = $1`;
        const redResult = await db.query(redCheckQuery, [redId]);

        if (redResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Red no encontrada.' });
        }
        const nombreRed = redResult.rows[0].nombre_red; // <-- CORRECCIÓN: Usamos nombre_red

        // Verificar permisos
        if (requesterRole === ROLES.SUPER_ADMIN) {
            permissionGranted = true; // Super Admin siempre tiene acceso
        } else if (requesterRole === ROLES.LSR) {
            // Un LSR solo tiene permiso si tiene al menos una CdP en esta Red.
            const lsrRedCheckQuery = `
                SELECT 1 
                FROM "CasasDePaz" 
                WHERE id_lsr = $1 AND id_red = $2 
                LIMIT 1
            `;
            const lsrRedResult = await db.query(lsrRedCheckQuery, [requesterId, redId]);
            if (lsrRedResult.rows.length > 0) {
                permissionGranted = true;
            }
        }

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para consultar esta Red.' });
        }

        // 2. Ejecutar la consulta de estatus consolidado
        const statusQuery = `
            SELECT 
                COUNT(m.id_miembro) AS total_miembros,
                SUM(CASE WHEN m.estado = 'Activo' THEN 1 ELSE 0 END) AS miembros_activos,
                SUM(CASE WHEN m.estado = 'Inactivo' THEN 1 ELSE 0 END) AS miembros_inactivos
            FROM "Miembros" m
            JOIN "CasasDePaz" cdp ON m.id_cdp = cdp.id_cdp
            WHERE cdp.id_red = $1;
        `;
        
        const result = await db.query(statusQuery, [redId]);
        const stats = result.rows[0];
        
        // Convertir strings de conteo a números para cálculos en JS
        const total = parseInt(stats.total_miembros) || 0;
        const activos = parseInt(stats.miembros_activos) || 0;
        const inactivos = parseInt(stats.miembros_inactivos) || 0;
        
        const tasaInactividad = total > 0 ? ((inactivos / total) * 100).toFixed(2) : "0.00";

        return res.status(200).json({
            mensaje: `Estatus de miembros para la Red: ${nombreRed}.`,
            red: {
                id: redId,
                nombre: nombreRed
            },
            stats: {
                total_miembros: total,
                miembros_activos: activos,
                miembros_inactivos: inactivos,
                tasa_inactividad_porcentaje: tasaInactividad
            }
        });

    } catch (error) {
        console.error('❌ Error al obtener estatus de la Red:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar el estatus de la Red.' });
    }
};

// --------------------------------------------------------------------------
// [GET] Reporte de Asistencia y Crecimiento por CdP (NUEVO)
// --------------------------------------------------------------------------

/**
 * [GET] /api/reportes/asistencia/cdp/:id_cdp
 * Calcula métricas de asistencia, retención y crecimiento para una CdP.
 */
const getCdpAttendanceMetrics = async (req, res) => {
    const { id_cdp } = req.params;
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    const cdpId = parseInt(id_cdp);

    if (isNaN(cdpId)) {
        return res.status(400).json({ mensaje: 'ID de Casa de Paz inválido.' });
    }

    try {
        let permissionGranted = false;
        
        // 1. Verificar existencia y permisos (similar a getMembersByCdP)
        const cdpQuery = `
            SELECT id_lider, id_lsr, nombre_lider_cdp 
            FROM "CasasDePaz" 
            WHERE id_cdp = $1
        `;
        const cdpResult = await db.query(cdpQuery, [cdpId]);

        if (cdpResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Casa de Paz no encontrada.' });
        }
        
        const cdpInfo = cdpResult.rows[0];

        // Se requiere acceso si es Super Admin, LSR de la subred, o Líder de la CdP.
        if (requesterRole === ROLES.SUPER_ADMIN || requesterRole === ROLES.ADMINISTRACION) {
            permissionGranted = true;
        } else if (requesterRole === ROLES.LIDER && cdpInfo.id_lider == requesterId) {
            permissionGranted = true;
        } else if (requesterRole === ROLES.LSR && cdpInfo.id_lsr == requesterId) {
            permissionGranted = true;
        }
        
        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para consultar las métricas de esta Casa de Paz.' });
        }

        // 2. Consulta SQL compleja para calcular métricas
        const metricsQuery = `
            WITH MiembrosActivos AS (
                -- Total de miembros activos actualmente en la CdP
                SELECT COUNT(id_miembro) AS total_miembros_activos
                FROM "Miembros"
                WHERE id_cdp = $1 AND estado = 'Activo'
            ),
            ReportesAsistencia AS (
                -- Número total de reportes de asistencia creados
                SELECT COUNT(id_reporte_cdp) AS total_reportes
                FROM "ReporteCdP" 
                WHERE id_lider = ${cdpInfo.id_lider}
            ),
            AsistenciaConsolidada AS (
                -- Asistencia total de miembros
                SELECT 
                    COUNT(a.id_miembro) AS asistencias_registradas,
                    COUNT(DISTINCT r.id_reporte_cdp) AS reportes_con_asistencia
                FROM "AsistenciaCdP" a
                JOIN "ReporteCdP" r ON a.id_reporte_cdp = r.id_reporte_cdp
                WHERE r.id_lider = ${cdpInfo.id_lider}
            )
            SELECT 
                COALESCE(ma.total_miembros_activos, 0) AS total_miembros_activos,
                COALESCE(ra.total_reportes, 0) AS total_reportes,
                COALESCE(ac.asistencias_registradas, 0) AS asistencias_registradas,
                COALESCE(ac.reportes_con_asistencia, 0) AS reportes_con_asistencia,
                -- Cálculo de Asistencia Promedio: (Asistencias Registradas) / (Total Reportes * Miembros Activos)
                CASE 
                    WHEN COALESCE(ra.total_reportes, 0) = 0 OR COALESCE(ma.total_miembros_activos, 0) = 0 THEN 0.00
                    ELSE ROUND((COALESCE(ac.asistencias_registradas, 0)::numeric / (ra.total_reportes * ma.total_miembros_activos)) * 100, 2)
                END AS tasa_retencion_promedio
            FROM MiembrosActivos ma, ReportesAsistencia ra, AsistenciaConsolidada ac;
        `;

        const result = await db.query(metricsQuery, [cdpId]);
        const metrics = result.rows[0];

        if (metrics.total_reportes == 0) {
             return res.status(200).json({
                mensaje: `Métricas de asistencia para la CdP "${cdpInfo.nombre_lider_cdp}" calculadas.`,
                cdp: cdpInfo.nombre_lider_cdp,
                metrics: {
                    total_miembros_activos: parseInt(metrics.total_miembros_activos),
                    total_reportes: 0,
                    asistencia_promedio: "0.00%",
                    asistencias_registradas_totales: 0,
                    tasa_retencion_promedio: "0.00%"
                }
            });
        }
        
        return res.status(200).json({
            mensaje: `Métricas de asistencia para la CdP "${cdpInfo.nombre_lider_cdp}" calculadas.`,
            cdp: cdpInfo.nombre_lider_cdp,
            metrics: {
                total_miembros_activos: parseInt(metrics.total_miembros_activos),
                total_reportes: parseInt(metrics.total_reportes),
                // Asistencia promedio por reporte: Total asistencias registradas / Total reportes
                asistencia_promedio_por_reporte: (parseInt(metrics.asistencias_registradas) / parseInt(metrics.total_reportes)).toFixed(2),
                asistencias_registradas_totales: parseInt(metrics.asistencias_registradas),
                tasa_retencion_promedio: `${metrics.tasa_retencion_promedio}%`
            }
        });

    } catch (error) {
        console.error('❌ Error al obtener métricas de asistencia por CdP:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar métricas de CdP.' });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reportes/cdp-por-lsr
// Obtiene la lista de Casas de Paz asignadas al LSR loggeado.
// --------------------------------------------------------------------------
const getCdPsByLsr = async (req, res) => {
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;

    // 1. Autorización de Rol: Solo LSR puede usar esta función
    if (requesterRole !== ROLES.LSR) {
         return res.status(403).json({ mensaje: 'Acceso prohibido. Solo los LSR pueden consultar esta lista.' });
    }

    try {
        const query = `
            SELECT 
                cdp.id_cdp,
                cdp.nombre_lider_cdp AS nombre_cdp,
                u.nombre AS nombre_lider,
                r.nombre_red
            FROM "CasasDePaz" cdp
            JOIN "Usuarios" u ON cdp.id_lider = u.id_usuario
            JOIN "Redes" r ON cdp.id_red = r.id_red
            WHERE cdp.id_lsr = $1
            ORDER BY cdp.nombre_lider_cdp ASC;
        `;
        
        const result = await db.query(query, [requesterId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron Casas de Paz asignadas a su Subred.' });
        }

        return res.status(200).json({
            mensaje: `Lista de ${result.rows.length} Casas de Paz asociadas a su Subred.`,
            casas_de_paz: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener Casas de Paz por LSR:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar las Casas de Paz.' });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reportes/cdp/historial
// --------------------------------------------------------------------------

/**
 * [GET] /api/reportes/cdp/historial
 * Obtiene el historial de Reportes de CdP para el usuario loggeado (Líder o LSR).
 */
const getLeaderReports = async (req, res) => {
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;

    // 1. Determinar el filtro de jerarquía
    let hierarchyCondition = 'TRUE'; // Condición por defecto (Admin/SuperAdmin)
    let filterValue = [requesterId];

    if (requesterRole === ROLES.LIDER) {
        // Un Líder solo ve miembros de SU CdP
        hierarchyCondition = `cdp.id_lider = $1`;
    } else if (requesterRole === ROLES.LSR) {
        // Un LSR ve miembros de TODAS las CdPs de SU subred
        hierarchyCondition = `cdp.id_lsr = $1`;
    } else if (requesterRole === ROLES.ADMINISTRACION || requesterRole === ROLES.SUPER_ADMIN) {
        filterValue = []; // Admin ve todos
    } else {
        return res.status(403).json({ mensaje: 'Rol no autorizado para acceder al historial de reportes.' });
    }

    try {
        const query = `
            SELECT
                rc.id_reporte_cdp,
                u.nombre AS nombre_lider,
                cdp.nombre_lider_cdp AS nombre_cdp,
                rc.fecha_reporte,
                rc.ofrendas,
                rc.diezmos,
                rc.comentarios,
                rc.estado_revision,
                (SELECT COUNT(*) FROM "VisitasCdP" v WHERE v.id_reporte_cdp = rc.id_reporte_cdp) AS total_visitas,
                (SELECT COUNT(*) FROM "VisitasCdP" v WHERE v.id_reporte_cdp = rc.id_reporte_cdp AND v.decision = 'Conversion') AS total_conversiones
            FROM 
                "ReporteCdP" rc
            JOIN 
                "Usuarios" u ON rc.id_lider = u.id_usuario
            JOIN 
                "CasasDePaz" cdp ON u.id_usuario = cdp.id_lider
            WHERE 
                ${filterCondition} 
            ORDER BY rc.fecha_reporte DESC;
        `;
        
        const result = await db.query(query, filterValue ? [filterValue] : []);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron reportes asociados a su rol.' });
        }

        return res.status(200).json({
            mensaje: `Historial de ${result.rows.length} reportes generado exitosamente.`,
            reportes: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener el historial de reportes de CdP:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al generar el historial.',
            error: error.message 
        });
    }
};


// --------------------------------------------------------------------------
// [GET] /api/reporting/seguimiento/pendientes
// --------------------------------------------------------------------------

/**
 * [GET] /api/reporting/seguimiento/pendientes
 * Obtiene la lista de visitas recientes que no han iniciado un seguimiento, 
 * o aquellas con seguimiento 'Activo' sin notas recientes.
 */
const getPendingSeguimiento = async (req, res) => {
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;

    // Define el filtro de seguridad basado en el rol
    let filterCondition = '';
    let filterValue = [requesterId]; // Por defecto, es el ID del solicitante

    if (requesterRole === ROLES.LIDER) {
        filterCondition = `rc.id_lider = $1`;
    } else if (requesterRole === ROLES.LSR) {
        filterCondition = `cdp.id_lsr = $1`;
    } else if (requesterRole === ROLES.ADMINISTRACION || requesterRole === ROLES.SUPER_ADMIN) {
        filterCondition = `TRUE`; // Ver todos
        filterValue = [];
    } else {
        return res.status(403).json({ mensaje: 'Rol no autorizado para acceder a reportes de seguimiento.' });
    }
    
    try {
        // Consulta para obtener todas las visitas que NO tienen seguimiento INICIADO (Seguimiento.estado IS NULL)
        // o que su último estado de seguimiento no sea 'Finalizado'.
        const query = `
            SELECT
                v.id_visita,
                v.nombre,
                v.telefono,
                v.decision,
                rc.fecha_reporte,
                s.id_seguimiento,
                s.estado,
                cdp.nombre_lider_cdp AS cdp_asociada
            FROM 
                "VisitasCdP" v
            JOIN 
                "ReporteCdP" rc ON v.id_reporte_cdp = rc.id_reporte_cdp
            JOIN 
                "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            LEFT JOIN 
                "Seguimiento" s ON v.id_visita = s.id_visita
            WHERE 
                ${filterCondition}
                AND (s.estado IS NULL OR s.estado = 'Activo') -- Incluye las que no tienen seguimiento (s.estado IS NULL) y las Activas
            ORDER BY rc.fecha_reporte DESC;
        `;

        //  SAQUE ESTA LINEA COMO SEGUNDA CONDICIÓN DE LA CONSULTA
        // DEBIDO A QUE SI NECESITO VER TAMBIEN LOS REPORTES QUE NO TOMARON DECISIONES
        // AND v.decision != 'Ninguna' -- Solo visitas que tomaron una decisión (Conversión, Reconciliación, etc.)

        
        const result = await db.query(query, filterValue);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron visitas pendientes de seguimiento en su jerarquía.' });
        }

        return res.status(200).json({
            mensaje: `Lista de ${result.rows.length} registros de seguimiento pendientes o activos.`,
            seguimientos: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener el listado de seguimiento pendiente:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener el listado de seguimiento.',
            error: error.message 
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reportes/cdp/detalle/:id_reporte_cdp
// --------------------------------------------------------------------------

/**
 * [GET] /api/reportes/cdp/detalle/:id_reporte_cdp
 * Obtiene todos los datos detallados (ofrendas, asistencia, visitas) de un reporte.
 */
const getCdpReportDetail = async (req, res) => {
    const reporteId = parseInt(req.params.id_reporte_cdp);
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;

    if (isNaN(reporteId)) {
        return res.status(400).json({ mensaje: 'ID de reporte inválido.' });
    }

    try {
        // 1. Verificar existencia del Reporte y Permisos de Acceso
        const permissionQuery = `
            SELECT 
                rc.id_lider, 
                cdp.id_lsr, 
                u.nombre AS nombre_lider,
                rc.fecha_reporte,
                rc.ofrendas,
                rc.diezmos,
                rc.pactos,
                rc.primicias,
                rc.comentarios,
                rc.estado_revision
            FROM "ReporteCdP" rc
            JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            JOIN "Usuarios" u ON rc.id_lider = u.id_usuario
            WHERE rc.id_reporte_cdp = $1;
        `;
        const mainResult = await db.query(permissionQuery, [reporteId]);

        if (mainResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Reporte de Casa de Paz no encontrado.' });
        }
        
        const reportData = mainResult.rows[0];
        const { id_lider, id_lsr } = reportData;

        // Regla de Permisos: Líder propio, LSR, Admin/SuperAdmin
        let permissionGranted = (
            requesterId === id_lider || 
            requesterId === id_lsr || 
            requesterRole === ROLES.SUPER_ADMIN || 
            requesterRole === ROLES.ADMINISTRACION
        );

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para ver este reporte detallado.' });
        }
        
        // --- 2. Obtener Asistencia Detallada ---
        // Trae todos los miembros de la CdP, marcando si asistieron o no.
        const attendanceQuery = `
            SELECT 
                m.id_miembro,
                m.nombre,
                acdp.asistio,
                acdp.id_reporte_cdp IS NOT NULL AS registrado_asistencia -- Bandera para saber si se procesó la asistencia
            FROM "Miembros" m
            LEFT JOIN "AsistenciaCdP" acdp ON m.id_miembro = acdp.id_miembro AND acdp.id_reporte_cdp = $1
            WHERE m.id_cdp = (SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $2)
            ORDER BY m.nombre;
        `;
        const attendanceResult = await db.query(attendanceQuery, [reporteId, id_lider]);

        // --- 3. Obtener Visitas Registradas ---
        const visitQuery = `
            SELECT 
                v.id_visita, 
                v.nombre, 
                v.telefono, 
                v.decision, 
                v.tipo,
                s.id_seguimiento,
                s.estado AS estado_seguimiento,
                (SELECT COUNT(*) FROM "NotasSeguimiento" ns WHERE ns.id_seguimiento = s.id_seguimiento) AS total_notas
            FROM "VisitasCdP" v
            LEFT JOIN "Seguimiento" s ON v.id_visita = s.id_visita
            WHERE v.id_reporte_cdp = $1
            ORDER BY v.id_visita;
        `;
        const visitResult = await db.query(visitQuery, [reporteId]);

        // 4. Construir la Respuesta Final
        return res.status(200).json({
            mensaje: `Detalle completo del Reporte CDP ${reporteId} obtenido exitosamente.`,
            reporte: {
                ...reportData,
                detalle_asistencia: attendanceResult.rows,
                visitas_registradas: visitResult.rows
            }
        });

    } catch (error) {
        console.error('❌ Error al obtener el detalle del reporte CdP:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener el detalle del reporte.',
            error: error.message 
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reporting/miembros/inconstantes
// --------------------------------------------------------------------------

/**
 * [GET] /api/reporting/miembros/inconstantes
 * Identifica a los miembros que no asistieron en los últimos N reportes de su CdP.
 * Por defecto, N = 3.
 */
const getInconsistentMembers = async (req, res) => {
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    // N = Número de reportes a evaluar (configurable via query param, por defecto 3)
    const nReports = parseInt(req.query.n || 3); 

    // 1. Determinar el filtro de jerarquía
    let hierarchyCondition = 'TRUE'; // Condición por defecto (Admin/SuperAdmin)
    let filterValue = [requesterId]; 
    
    if (requesterRole === ROLES.LIDER) {
        // Un Líder solo ve miembros de SU CdP
        hierarchyCondition = `cdp.id_lider = $1`;
    } else if (requesterRole === ROLES.LSR) {
        // Un LSR ve miembros de TODAS las CdPs de SU subred
        hierarchyCondition = `cdp.id_lsr = $1`;
    } else if (requesterRole === ROLES.ADMINISTRACION || requesterRole === ROLES.SUPER_ADMIN) {
        // Admin ve todos
        filterValue = [];
    } else {
        return res.status(403).json({ mensaje: 'Rol no autorizado para acceder a esta analítica de retención.' });
    }

    try {
        // El último valor del array de valores es el número N de reportes.
        // Se añade 'nReports' al final de 'filterValue' (que puede estar vacío o tener el requesterId)
        const finalValues = [...filterValue, nReports];
        
        // El placeholder para N siempre será el último: $${filterValue.length + 1}
        const nPlaceholder = `$${filterValue.length + 1}`; 

        // 2. Consulta para identificar a los miembros inconstantes
        const query = `
            WITH RecentReports AS (
                -- Obtiene los IDs de los N reportes más recientes para cada CdP en la jerarquía
                SELECT
                    rc.id_reporte_cdp,
                    rc.id_lider,
                    ROW_NUMBER() OVER(PARTITION BY rc.id_lider ORDER BY rc.fecha_reporte DESC) as rn
                FROM "ReporteCdP" rc
                JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
                WHERE ${hierarchyCondition}
            )
            SELECT
                m.id_miembro,
                m.nombre, 
                m.telefono,
                cdp.nombre_lider_cdp,
                SUM(CASE WHEN acdp.asistio = TRUE THEN 1 ELSE 0 END) AS asistencias_positivas
            FROM "Miembros" m
            JOIN "CasasDePaz" cdp ON m.id_cdp = cdp.id_cdp
            LEFT JOIN "ReporteCdP" rc ON cdp.id_lider = rc.id_lider
            LEFT JOIN "AsistenciaCdP" acdp ON rc.id_reporte_cdp = acdp.id_reporte_cdp AND m.id_miembro = acdp.id_miembro
            WHERE rc.id_reporte_cdp IN (SELECT id_reporte_cdp FROM RecentReports WHERE rn <= ${nPlaceholder})
            AND ${hierarchyCondition} 
            GROUP BY m.id_miembro, m.nombre, m.telefono, cdp.nombre_lider_cdp
            HAVING SUM(CASE WHEN acdp.asistio = TRUE THEN 1 ELSE 0 END) = 0
            ORDER BY cdp.nombre_lider_cdp, m.nombre;
        `;
        
        const result = await db.query(query, finalValues);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: '¡Felicidades! No se encontraron miembros inconstantes en los últimos reportes.' });
        }

        return res.status(200).json({
            mensaje: `Lista de ${result.rows.length} miembros inconstantes (0 asistencias en los últimos ${nReports} reportes).`,
            miembros_inconstantes: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener miembros inconstantes:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener la analítica de retención.',
            error: error.message 
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reporting/seguimiento/detalle/:id_seguimiento
// --------------------------------------------------------------------------

/**
 * [GET] /api/reporting/seguimiento/detalle/:id_seguimiento
 * Obtiene el detalle de la visita asociada y el historial de notas de seguimiento.
 */
const getSeguimientoDetail = async (req, res) => {
    const seguimientoId = parseInt(req.params.id_seguimiento);
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;

    if (isNaN(seguimientoId)) {
        return res.status(400).json({ mensaje: 'ID de Seguimiento inválido.' });
    }

    try {
        // 1. Obtener la información base del Seguimiento y verificar Permisos
        const baseQuery = `
            SELECT 
                s.id_seguimiento, 
                s.estado,
                v.nombre AS nombre_visita,
                v.telefono,
                v.decision,
                rc.id_reporte_cdp,
                rc.id_lider,
                cdp.id_lsr
            FROM "Seguimiento" s
            JOIN "VisitasCdP" v ON s.id_visita = v.id_visita
            JOIN "ReporteCdP" rc ON v.id_reporte_cdp = rc.id_reporte_cdp
            JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            WHERE s.id_seguimiento = $1;
        `;
        const baseResult = await db.query(baseQuery, [seguimientoId]);

        if (baseResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Seguimiento no encontrado.' });
        }
        
        const seguimientoData = baseResult.rows[0];
        const { id_lider, id_lsr } = seguimientoData;

        // Regla de Permisos: Líder propio, LSR, Admin/SuperAdmin
        let permissionGranted = (
            requesterId === id_lider || 
            requesterId === id_lsr || 
            requesterRole === ROLES.SUPER_ADMIN || 
            requesterRole === ROLES.ADMINISTRACION
        );

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para ver este seguimiento.' });
        }
        
        // --- 2. Obtener Notas Detalladas ---
        const notesQuery = `
            SELECT 
                ns.id_nota,
                ns.contenido,
                ns.fecha_nota,
                u.nombre AS nombre_usuario_creador,
                u.id_rol
            FROM "NotasSeguimiento" ns
            JOIN "Usuarios" u ON ns.id_usuario = u.id_usuario
            WHERE ns.id_seguimiento = $1
            ORDER BY ns.fecha_nota ASC;
        `;
        const notesResult = await db.query(notesQuery, [seguimientoId]);

        // 3. Construir la Respuesta Final
        return res.status(200).json({
            mensaje: `Detalle del Seguimiento ID ${seguimientoId} obtenido exitosamente.`,
            detalle_seguimiento: {
                ...seguimientoData,
                historial_notas: notesResult.rows
            }
        });

    } catch (error) {
        console.error('❌ Error al obtener el detalle del seguimiento:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener el detalle del seguimiento.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reporting/admin/vision/resumen
// --------------------------------------------------------------------------

/**
 * [GET] /api/reporting/admin/vision/resumen
 * Obtiene el total de miembros agrupados por cada Fase de la Visión.
 * Exclusivo para Super Admin y Administración.
 */
const getVisionPhaseSummary = async (req, res) => {
    const requesterRole = req.user.id_rol;

    // 1. Validación de Rol
    if (requesterRole !== ROLES.SUPER_ADMIN && requesterRole !== ROLES.ADMINISTRACION) {
        return res.status(403).json({ mensaje: 'Acceso prohibido. Solo Administradores pueden acceder a las métricas globales.' });
    }

    try {
        // La consulta busca contar cuántos registros existen para cada fase.
        const query = `
            SELECT
                fv.id_fase,
                fv.nombre_fase,
                COUNT(mf.id_miembro) AS total_miembros
            FROM "FasesVision" fv
            LEFT JOIN "MiembroFase" mf ON fv.id_fase = mf.id_fase
            GROUP BY fv.id_fase, fv.nombre_fase
            ORDER BY fv.id_fase;
        `;
        
        const result = await db.query(query);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron fases de visión o métricas registradas.' });
        }

        return res.status(200).json({
            mensaje: `Resumen global de miembros por fase de la visión.`,
            resumen_fases: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener el resumen de fases de visión:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener las métricas de visión.',
            error: error.message 
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reporting/admin/ofrendas/resumen
// --------------------------------------------------------------------------
const getOfferingsSummary = async (req, res) => {
    const requesterRole = req.user.id_rol;
    const { fecha_inicio, fecha_fin } = req.query;

    // ... (Validaciones de Rol y Fechas se mantienen igual) ...
    if (requesterRole !== ROLES.SUPER_ADMIN && requesterRole !== ROLES.ADMINISTRACION) {
        return res.status(403).json({ mensaje: 'Acceso prohibido. Solo Administradores pueden acceder a las métricas financieras.' });
    }

    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ mensaje: 'Las fechas de inicio y fin son obligatorias.' });
    }

    try {
        const query = `
            SELECT
                rc.id_lider,
                u.nombre AS nombre_lider,
                -- Se une a la tabla Usuarios (lsr) a través de id_lsr para obtener el nombre de la subred (LSR)
                lsr.nombre AS nombre_lsr, 
                SUM(CAST(rc.ofrendas AS numeric)) AS total_ofrendas,
                SUM(CAST(rc.diezmos AS numeric)) AS total_diezmos,
                SUM(CAST(rc.pactos AS numeric)) AS total_pactos,
                SUM(CAST(rc.primicias AS numeric)) AS total_primicias,
                COUNT(rc.id_reporte_cdp) AS total_reportes
            FROM "ReporteCdP" rc
            JOIN "Usuarios" u ON rc.id_lider = u.id_usuario
            JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            LEFT JOIN "Usuarios" lsr ON cdp.id_lsr = lsr.id_usuario -- ¡JOIN CORREGIDO!
            WHERE rc.fecha_reporte BETWEEN $1 AND $2
            GROUP BY rc.id_lider, u.nombre, lsr.nombre -- Agrupamos por el nuevo campo lsr.nombre
            ORDER BY total_ofrendas DESC;
        `;
        
        const values = [fecha_inicio, fecha_fin];
        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron reportes de ofrendas en el rango de fechas especificado.' });
        }

        return res.status(200).json({
            mensaje: `Consolidado de ofrendas por Casa de Paz entre ${fecha_inicio} y ${fecha_fin}.`,
            consolidado_ofrendas: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener el resumen de ofrendas:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener las métricas financieras.',
            error: error.message 
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/reporting/admin/asistencia/global
// --------------------------------------------------------------------------

/**
 * [GET] /api/reporting/admin/asistencia/global
 * Obtiene la asistencia total, conversiones y reconciliaciones por periodo (semana, mes, año).
 */
const getGlobalAttendanceSummary = async (req, res) => {
    const requesterRole = req.user.id_rol;
    const { periodo = 'month', fecha_inicio, fecha_fin } = req.query; // periodo puede ser 'week', 'month', 'year'
    
    // 1. Validación de Rol
    if (requesterRole !== ROLES.SUPER_ADMIN && requesterRole !== ROLES.ADMINISTRACION) {
        return res.status(403).json({ mensaje: 'Acceso prohibido. Solo Administradores pueden acceder a las métricas globales.' });
    }

    // 2. Validación de Fechas
    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ mensaje: 'Las fechas de inicio y fin son obligatorias.' });
    }

    // 3. Definición de la función de agrupación de fechas (PostgreSQL)
    let dateGroupFunction;
    switch (periodo) {
        case 'week':
            // Agrupar por el inicio de la semana (ISO week date, 1 = Lunes)
            dateGroupFunction = `TO_CHAR(rc.fecha_reporte, 'YYYY-IW')`; 
            break;
        case 'month':
            dateGroupFunction = `TO_CHAR(rc.fecha_reporte, 'YYYY-MM')`;
            break;
        case 'year':
            dateGroupFunction = `TO_CHAR(rc.fecha_reporte, 'YYYY')`;
            break;
        default:
            return res.status(400).json({ mensaje: 'El parámetro "periodo" debe ser "week", "month" o "year".' });
    }

    try {
        const query = `
            SELECT
                ${dateGroupFunction} AS periodo,
                -- 1. Contar Asistencia (Miembros de la CdP)
                (
                    SELECT COUNT(acdp.id_miembro)
                    FROM "AsistenciaCdP" acdp
                    WHERE acdp.id_reporte_cdp = rc.id_reporte_cdp AND acdp.asistio = TRUE
                ) AS total_asistencia_miembros,
                -- 2. Contar Conversiones (Visitas)
                (
                    SELECT COUNT(v.id_visita)
                    FROM "VisitasCdP" v
                    WHERE v.id_reporte_cdp = rc.id_reporte_cdp AND v.decision = 'Conversion'
                ) AS total_visitas_conversion,
                -- 3. Contar Reconciliaciones (Visitas)
                (
                    SELECT COUNT(v.id_visita)
                    FROM "VisitasCdP" v
                    WHERE v.id_reporte_cdp = rc.id_reporte_cdp AND v.decision = 'Reconciliacion'
                ) AS total_visitas_reconciliacion
            FROM "ReporteCdP" rc
            WHERE rc.fecha_reporte BETWEEN $1 AND $2
            GROUP BY periodo, rc.id_reporte_cdp -- Agrupamos por periodo y reporte para el conteo
            ORDER BY periodo;
        `;
        
        const values = [fecha_inicio, fecha_fin];
        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron métricas de asistencia en el rango especificado.' });
        }

        // --- 4. Post-procesamiento: Consolidar por Periodo ---
        // Ya que las subconsultas se ejecutan por Reporte, necesitamos sumar los resultados
        // para agruparlos por el periodo final (Ej: todos los reportes de '2025-12')
        const consolidatedData = result.rows.reduce((acc, row) => {
            if (!acc[row.periodo]) {
                acc[row.periodo] = {
                    periodo: row.periodo,
                    total_asistencia_miembros: 0,
                    total_visitas_conversion: 0,
                    total_visitas_reconciliacion: 0,
                    total_reportes: 0
                };
            }
            acc[row.periodo].total_asistencia_miembros += parseInt(row.total_asistencia_miembros);
            acc[row.periodo].total_visitas_conversion += parseInt(row.total_visitas_conversion);
            acc[row.periodo].total_visitas_reconciliacion += parseInt(row.total_visitas_reconciliacion);
            acc[row.periodo].total_reportes += 1;
            return acc;
        }, {});


        return res.status(200).json({
            mensaje: `Métricas globales consolidadas por ${periodo} entre ${fecha_inicio} y ${fecha_fin}.`,
            periodo,
            metrics: Object.values(consolidatedData)
        });

    } catch (error) {
        console.error('❌ Error al obtener el resumen global de asistencia:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener las métricas de asistencia.',
            error: error.message 
        });
    }
};

module.exports = {
    getLsrMetrics,
    getMembersByCdP,
    getNetworkStatus,
    getCdpAttendanceMetrics,
    getCdPsByLsr,
    getLeaderReports,
    getPendingSeguimiento,
    getCdpReportDetail,
    getInconsistentMembers,
    getSeguimientoDetail,
    getVisionPhaseSummary,
    getOfferingsSummary,
    getGlobalAttendanceSummary
};

