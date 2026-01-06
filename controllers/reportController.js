const db = require('../config/db');
const ROLES = require('../constants/roles');

// Roles permitidos para crear reportes
const REPORTER_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

// --------------------------------------------------------------------------
// [POST] /api/reportes/cdp/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/reportes/cdp/crear
 * Crea un reporte semanal de Casa de Paz (ReporteCdP).
 */
const createCdpReport = async (req, res) => {
    // Campos basados en el esquema ReporteCdP
    const { 
        id_lider,
        fecha_reporte,
        latitud, 
        longitud, 
        ofrendas, 
        diezmos, 
        pactos, 
        primicias, 
        comentarios 
    } = req.body;
    
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    // 1. Validación de campos obligatorios
    if (!id_lider || !fecha_reporte || !latitud || !longitud) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios: id_lider, fecha_reporte, latitud, longitud.' });
    }
    
    const leaderId = parseInt(id_lider);

    try {
        // 2. Obtener información de la jerarquía de la CdP y del Líder
        const cdpQuery = `
            SELECT id_cdp, id_lider, id_lsr, nombre_lider_cdp
            FROM "CasasDePaz"
            WHERE id_lider = $1;
        `;
        const cdpResult = await db.query(cdpQuery, [leaderId]);

        if (cdpResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'El ID de Líder especificado no está asignado a ninguna Casa de Paz.' });
        }
        const cdpInfo = cdpResult.rows[0];
        
        // 3. Verificación de Permisos Jerárquicos
        let permissionGranted = false;
        
        // Líder: Debe reportar para SÍ MISMO (es el líder reportado)
        if (requesterRole === ROLES.LIDER && leaderId == requesterId) {
            permissionGranted = true;
        } 
        // LSR: Puede reportar para un Líder dentro de su Subred
        else if (requesterRole === ROLES.LSR && cdpInfo.id_lsr == requesterId) {
            permissionGranted = true;
        } 
        // Admin/Super Admin: Permiso total
        else if (requesterRole === ROLES.SUPER_ADMIN || requesterRole === ROLES.ADMINISTRACION) {
            permissionGranted = true;
        }
        
        if (!permissionGranted) {
            return res.status(403).json({ mensaje: `Acceso prohibido. No tiene permisos para reportar sobre el Líder ID ${leaderId}.` });
        }

        // 4. Inserción del Reporte
        const insertQuery = `
            INSERT INTO "ReporteCdP" (
                id_lider, fecha_reporte, latitud, longitud, 
                ofrendas, diezmos, pactos, primicias, comentarios
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id_reporte_cdp;
        `;
        
        const values = [
            leaderId, 
            fecha_reporte, 
            parseFloat(latitud), 
            parseFloat(longitud), 
            parseFloat(ofrendas) || 0.00,
            parseFloat(diezmos) || 0.00,
            parseFloat(pactos) || 0.00,
            parseFloat(primicias) || 0.00,
            comentarios || null
        ];

        const result = await db.query(insertQuery, values);
        const newReportId = result.rows[0].id_reporte_cdp;

        return res.status(201).json({
            mensaje: `Reporte de Casa de Paz creado exitosamente para el Líder ${cdpInfo.nombre_lider_cdp} (CdP ${cdpInfo.id_cdp}).`,
            id_reporte_cdp: newReportId
        });

    } catch (error) {
        console.error('❌ Error al crear reporte de CdP:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear el reporte.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/reportes/asistencia/detalle
// --------------------------------------------------------------------------

/**
 * [POST] /api/reportes/asistencia/detalle
 * Registra la lista de asistencia de miembros para un reporte de CdP específico.
 */
const createAttendanceDetail = async (req, res) => {
    const { 
        id_reporte_cdp, 
        detalle_asistencia // Array: [{ id_miembro: 15, asistio: true }, ...]
    } = req.body;
    
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    // 1. Validación de campos
    if (!id_reporte_cdp || !Array.isArray(detalle_asistencia) || detalle_asistencia.length === 0) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios o el detalle de asistencia está vacío.' });
    }
    
    const reporteId = parseInt(id_reporte_cdp);

    try {
        // 2. Verificar existencia del Reporte y permisos
        const reportQuery = `
            SELECT rc.id_lider, cdp.id_lsr 
            FROM "ReporteCdP" rc
            JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            WHERE rc.id_reporte_cdp = $1;
        `;
        const reportResult = await db.query(reportQuery, [reporteId]);

        if (reportResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Reporte de Casa de Paz no encontrado.' });
        }
        
        const { id_lider, id_lsr } = reportResult.rows[0];

        // Solo el líder que creó el reporte, su LSR o un Admin puede modificar/adjuntar la lista de asistencia.
        let permissionGranted = (
            requesterId === id_lider || 
            requesterId === id_lsr || 
            requesterRole === ROLES.SUPER_ADMIN || 
            requesterRole === ROLES.ADMINISTRACION
        );

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para adjuntar asistencia a este reporte.' });
        }
        
        // 3. Construcción de la consulta de inserción masiva
        const insertValues = [];
        let placeholderCounter = 1;
        
        // Validar que todos los miembros pertenezcan a la CdP
        const memberCheckQuery = `
            SELECT id_miembro 
            FROM "Miembros" m
            JOIN "CasasDePaz" cdp ON m.id_cdp = cdp.id_cdp
            WHERE cdp.id_lider = $1 AND id_miembro = ANY($2::int[])
        `;
        
        const memberIds = detalle_asistencia.map(d => d.id_miembro);
        const memberCheckResult = await db.query(memberCheckQuery, [id_lider, memberIds]);

        if (memberCheckResult.rows.length !== memberIds.length) {
            return res.status(400).json({ mensaje: 'Uno o más IDs de Miembro no pertenecen a la CdP de este reporte o son inválidos.' });
        }

        // Preparar valores para inserción masiva
        const valuesToInsert = [];
        detalle_asistencia.forEach(item => {
            const asistioBool = !!item.asistio; // Asegurar que sea booleano
            insertValues.push(`($${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++})`);
            valuesToInsert.push(reporteId, item.id_miembro, asistioBool);
        });

        const bulkInsertQuery = `
            INSERT INTO "AsistenciaCdP" (id_reporte_cdp, id_miembro, asistio)
            VALUES ${insertValues.join(', ')}
        `;

        // Ejecutamos la inserción, pero no obtenemos un resultado con .rows
        await db.query(bulkInsertQuery, valuesToInsert);
        const createdCount = detalle_asistencia.length; // Contamos los registros creados a partir del input

        return res.status(201).json({
            mensaje: `Lista de asistencia de ${createdCount} registros adjuntada al Reporte ${reporteId}.`,
            registros_creados: createdCount // Devolvemos el conteo del input
});

        return res.status(201).json({
            mensaje: `Lista de asistencia de ${result.rows.length} registros adjuntada al Reporte ${reporteId}.`,
            registros_creados: result.rows.length
        });

    } catch (error) {
        console.error('❌ Error al crear detalle de asistencia:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al adjuntar el detalle de asistencia.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/reportes/visita/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/reportes/visita/crear
 * Registra múltiples visitas y su decisión para un reporte de CdP específico.
 */
const createCdpVisit = async (req, res) => {
    const { 
        id_reporte_cdp, 
        visitas // Array: [{ nombre: "Juan Perez", telefono: "...", decision: "Conversion", ... }, ...]
    } = req.body;
    
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    // 1. Validación de campos
    if (!id_reporte_cdp || !Array.isArray(visitas) || visitas.length === 0) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios o la lista de visitas está vacía.' });
    }
    
    const reporteId = parseInt(id_reporte_cdp);

    try {
        // 2. Verificar existencia del Reporte y permisos (Mismos permisos que para asistencia)
        const reportQuery = `
            SELECT rc.id_lider, cdp.id_lsr 
            FROM "ReporteCdP" rc
            JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            WHERE rc.id_reporte_cdp = $1;
        `;
        const reportResult = await db.query(reportQuery, [reporteId]);

        if (reportResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Reporte de Casa de Paz no encontrado.' });
        }
        
        const { id_lider, id_lsr } = reportResult.rows[0];

        let permissionGranted = (
            requesterId === id_lider || 
            requesterId === id_lsr || 
            requesterRole === ROLES.SUPER_ADMIN || 
            requesterRole === ROLES.ADMINISTRACION
        );

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para registrar visitas en este reporte.' });
        }
        
        // 3. Construcción de la consulta de inserción masiva para VisitasCdP
        const insertColumns = [
            "id_reporte_cdp", "nombre", "telefono", "direccion", "referencia", 
            "nombre_invitador", "asiste_otra_iglesia", "nombre_otra_iglesia", 
            "tipo", "decision"
        ];
        
        const valuesToInsert = [];
        const placeholders = [];
        let placeholderCounter = 1;

        visitas.forEach(() => {
            placeholders.push(`($${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++}, $${placeholderCounter++})`);
        });

        visitas.forEach(v => {
            // Asegurar que los campos NOT NULL estén presentes
            if (!v.nombre || !v.tipo || !v.decision) {
                throw new Error(`Visita inválida: nombre, tipo y decision son obligatorios. Falta en ${JSON.stringify(v)}`);
            }
            
            // Llenar la lista de valores en el orden de las columnas
            valuesToInsert.push(
                reporteId, 
                v.nombre, 
                v.telefono || null, 
                v.direccion || null, 
                v.referencia || null, 
                v.nombre_invitador || null, 
                !!v.asiste_otra_iglesia, // Convierte a booleano
                v.nombre_otra_iglesia || null, 
                v.tipo, 
                v.decision
            );
        });

        const bulkInsertQuery = `
            INSERT INTO "VisitasCdP" (${insertColumns.join(', ')})
            VALUES ${placeholders.join(', ')}
            RETURNING id_visita;
        `;
        
        const result = await db.query(bulkInsertQuery, valuesToInsert);
        const createdCount = result.rows.length; 
        
        return res.status(201).json({
            mensaje: `Registro de ${createdCount} visitas adjuntado al Reporte ${reporteId}.`,
            registros_creados: createdCount,
            visitas_ids: result.rows.map(row => row.id_visita)
        });

    } catch (error) {
        console.error('❌ Error al crear registro de visitas:', error);
        // Si el error es una violación de NOT NULL (throw anterior)
        const errorMessage = error.message.includes('Visita inválida') ? error.message : 'Error interno del servidor al adjuntar el registro de visitas.';

        return res.status(500).json({
            mensaje: errorMessage,
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/reportes/seguimiento/iniciar
// --------------------------------------------------------------------------

/**
 * [POST] /api/reportes/seguimiento/iniciar
 * Inicia el seguimiento para una visita específica (VisitasCdP).
 */
const startSeguimiento = async (req, res) => {
    const { id_visita } = req.body;
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    if (!id_visita) {
        return res.status(400).json({ mensaje: 'El ID de visita es obligatorio.' });
    }
    
    const visitaId = parseInt(id_visita);

    try {
        // 1. Verificar existencia de la Visita y permisos (debe pertenecer al Líder/LSR)
        const visitQuery = `
            SELECT v.id_visita, rc.id_lider, cdp.id_lsr
            FROM "VisitasCdP" v
            JOIN "ReporteCdP" rc ON v.id_reporte_cdp = rc.id_reporte_cdp
            JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            WHERE v.id_visita = $1;
        `;
        const visitResult = await db.query(visitQuery, [visitaId]);

        if (visitResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Visita no encontrada.' });
        }
        
        const { id_lider, id_lsr } = visitResult.rows[0];

        let permissionGranted = (
            requesterId === id_lider || 
            requesterId === id_lsr || 
            requesterRole === ROLES.SUPER_ADMIN || 
            requesterRole === ROLES.ADMINISTRACION
        );

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para iniciar seguimiento de esta visita.' });
        }

        // 2. Insertar en la tabla Seguimiento
        // El estado por defecto es 'Activo'
        const insertQuery = `
            INSERT INTO "Seguimiento" (id_visita)
            VALUES ($1)
            RETURNING id_seguimiento;
        `;
        
        const result = await db.query(insertQuery, [visitaId]);
        const idSeguimiento = result.rows[0].id_seguimiento;
        
        return res.status(201).json({
            mensaje: `Seguimiento iniciado exitosamente para la Visita ID ${visitaId}.`,
            id_seguimiento: idSeguimiento
        });

    } catch (error) {
        // La restricción UNIQUE en id_visita (Seguimiento_id_visita_key) atrapará duplicados.
        if (error.code === '23505') { // Código de violación de restricción única
            return res.status(409).json({ mensaje: 'El seguimiento para esta visita ya ha sido iniciado.' });
        }
        console.error('❌ Error al iniciar seguimiento:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al iniciar el seguimiento.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/reportes/seguimiento/nota/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/reportes/seguimiento/nota/crear
 * Agrega una nota de seguimiento a un registro existente.
 */
const createSeguimientoNote = async (req, res) => {
    const { id_seguimiento, contenido } = req.body;
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol; // <--- AGREGAR ESTA LÍNEA
    
    if (!id_seguimiento || !contenido) {
        return res.status(400).json({ mensaje: 'ID de seguimiento y contenido de la nota son obligatorios.' });
    }
    
    const seguimientoId = parseInt(id_seguimiento);

    try {
        // 1. Verificar si el seguimiento pertenece a la jerarquía del usuario (Líder/LSR)
        // Hacemos un join de 4 tablas para la validación
        const checkQuery = `
            SELECT s.id_seguimiento
            FROM "Seguimiento" s
            JOIN "VisitasCdP" v ON s.id_visita = v.id_visita
            JOIN "ReporteCdP" rc ON v.id_reporte_cdp = rc.id_reporte_cdp
            JOIN "CasasDePaz" cdp ON rc.id_lider = cdp.id_lider
            WHERE s.id_seguimiento = $1 
            AND (rc.id_lider = $2 OR cdp.id_lsr = $2 OR $3 IN (${ROLES.SUPER_ADMIN}, ${ROLES.ADMINISTRACION}));
        `;
        
        const checkResult = await db.query(checkQuery, [seguimientoId, requesterId, requesterRole]);

        if (checkResult.rows.length === 0) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. El seguimiento no existe o no pertenece a su jerarquía.' });
        }

        // 2. Insertar la nota
        const insertQuery = `
            INSERT INTO "NotasSeguimiento" (id_seguimiento, id_usuario, contenido)
            VALUES ($1, $2, $3)
            RETURNING id_nota;
        `;
        
        const result = await db.query(insertQuery, [seguimientoId, requesterId, contenido]);
        
        return res.status(201).json({
            mensaje: `Nota de seguimiento agregada exitosamente al ID ${seguimientoId}.`,
            id_nota: result.rows[0].id_nota
        });

    } catch (error) {
        console.error('❌ Error al crear nota de seguimiento:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear la nota de seguimiento.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/reportes/supervision/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/reportes/supervision/crear
 * Registra el reporte de supervisión de un LSR sobre un Líder de CdP.
 */
const createSupervisionReport = async (req, res) => {
    const { 
        id_lider_supervisado, 
        fecha_reporte, 
        latitud, 
        longitud, 
        checkboxes_json, 
        comentarios 
    } = req.body;
    
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;

    // 1. Validaciones
    if (requesterRole !== ROLES.LSR && requesterRole !== ROLES.SUPER_ADMIN && requesterRole !== ROLES.ADMINISTRACION) {
         return res.status(403).json({ mensaje: 'Acceso prohibido. Solo LSR y Admins pueden crear reportes de supervisión.' });
    }

    if (!id_lider_supervisado || !fecha_reporte || !latitud || !longitud || !checkboxes_json) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios para el reporte de supervisión (id_lider_supervisado, fecha_reporte, latitud, longitud, checkboxes_json).' });
    }

    const liderSupervisadoId = parseInt(id_lider_supervisado);
    
    try {
        // 2. Validación de Jerarquía (Solo para LSR)
        if (requesterRole === ROLES.LSR) {
            // Un LSR solo puede supervisar a un líder que esté en su subred (CdPs asignadas a él)
            const hierarchyCheckQuery = `
                SELECT 1
                FROM "CasasDePaz" cdp
                WHERE cdp.id_lider = $1 AND cdp.id_lsr = $2
                LIMIT 1;
            `;
            const hierarchyResult = await db.query(hierarchyCheckQuery, [liderSupervisadoId, requesterId]);

            if (hierarchyResult.rows.length === 0) {
                return res.status(403).json({ mensaje: 'Acceso prohibido. El Líder supervisado no está asignado a su Subred.' });
            }
        }
        
        // 3. Inserción del Reporte de Supervisión
        const query = `
            INSERT INTO "ReporteSupervision" (
                id_lsr, 
                id_lider_supervisado, 
                fecha_reporte, 
                latitud, 
                longitud, 
                checkboxes_json, 
                comentarios
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id_reporte_supervision;
        `;

        const values = [
            requesterId,
            liderSupervisadoId,
            fecha_reporte,
            latitud,
            longitud,
            checkboxes_json, // PostgreSQL manejará la inserción del objeto JSON/JSONB
            comentarios || null
        ];

        const result = await db.query(query, values);
        
        return res.status(201).json({
            mensaje: `Reporte de Supervisión creado exitosamente por LSR ID ${requesterId} para Líder ID ${liderSupervisadoId}.`,
            id_reporte_supervision: result.rows[0].id_reporte_supervision
        });

    } catch (error) {
        console.error('❌ Error al crear reporte de supervisión:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear el reporte de supervisión.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/reportes/servicio/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/reportes/servicio/crear
 * Registra el reporte de servicio dominical o central.
 */
const createServiceReport = async (req, res) => {
    const { 
        fecha_reporte, 
        total, 
        convertidos, 
        reconciliados, 
        datos_areas_json 
    } = req.body;
    
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;

    // 1. Validaciones de Rol
    if (requesterRole !== ROLES.LIDER_SERVICIO && requesterRole !== ROLES.SUPER_ADMIN && requesterRole !== ROLES.ADMINISTRACION) {
         return res.status(403).json({ mensaje: 'Acceso prohibido. Solo Líderes de Servicio y Admins pueden crear reportes de servicio.' });
    }

    // 2. Validación de campos obligatorios
    if (!fecha_reporte || total === undefined || !datos_areas_json) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios para el reporte de servicio (fecha_reporte, total, datos_areas_json).' });
    }

    // Asegurar que los campos numéricos sean enteros
    const totalAttendance = parseInt(total);
    const convertedCount = parseInt(convertidos) || 0;
    const reconciledCount = parseInt(reconciliados) || 0;

    if (isNaN(totalAttendance) || totalAttendance < 0) {
        return res.status(400).json({ mensaje: 'El campo "total" debe ser un número entero positivo.' });
    }
    
    try {
        // 3. Inserción del Reporte de Servicio
        const query = `
            INSERT INTO "ReporteServicio" (
                id_lider_servicio, 
                fecha_reporte, 
                total, 
                convertidos, 
                reconciliados, 
                datos_areas_json
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id_reporte_servicio;
        `;

        const values = [
            requesterId,
            fecha_reporte,
            totalAttendance,
            convertedCount,
            reconciledCount,
            datos_areas_json 
        ];

        const result = await db.query(query, values);
        
        return res.status(201).json({
            mensaje: `Reporte de Servicio creado exitosamente por Líder de Servicio ID ${requesterId}.`,
            id_reporte_servicio: result.rows[0].id_reporte_servicio
        });

    } catch (error) {
        console.error('❌ Error al crear reporte de servicio:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear el reporte de servicio.',
            error: error.message
        });
    }
};

module.exports = {
    createCdpReport,
    createAttendanceDetail,
    createCdpVisit,
    startSeguimiento,
    createSeguimientoNote,
    createSupervisionReport,
    createServiceReport
};


