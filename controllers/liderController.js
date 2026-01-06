const db = require('../config/db');
const ROLES = require('../constants/roles');

// Función auxiliar para calcular la edad (reutilizada)
const calcularEdad = (fechaNacimiento) => {
    const birthDate = new Date(fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

// --------------------------------------------------------------------------
// LÓGICA DE LISTADO DE MIEMBROS POR LÍDER (ROL 5)
// --------------------------------------------------------------------------

/**
 * [GET] /api/lider/miembros
 * Obtiene solo los miembros de la Casa de Paz que lidera el usuario loggeado (Rol 5).
 */
const getMiembrosByLider = async (req, res) => {
    const idLider = req.user.id; 
    
    try {
        const query = `
            SELECT 
                m.id_miembro, 
                m.nombre, 
                m.telefono, 
                m.fecha_nacimiento,
                m.estado
            FROM "Miembros" m
            JOIN "CasasDePaz" c ON m.id_cdp = c.id_cdp
            WHERE c.id_lider = $1
            ORDER BY m.fecha_nacimiento ASC;
        `;
        
        const result = await db.query(query, [idLider]);
        
        const miembrosConEdad = result.rows.map(miembro => ({
            ...miembro,
            edad: calcularEdad(miembro.fecha_nacimiento)
        }));

        return res.status(200).json({ 
            mensaje: `Lista de ${miembrosConEdad.length} miembros de su CdP.`,
            miembros: miembrosConEdad
        });

    } catch (error) {
        console.error('❌ Error al obtener miembros por líder:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar miembros.' });
    }
};

// --------------------------------------------------------------------------
// LÓGICA DE LISTADO DE MIEMBROS POR LSR (ROL 4)
// --------------------------------------------------------------------------

/**
 * [GET] /api/lsr/miembros
 * Obtiene todos los miembros de todas las Casas de Paz supervisadas por el LSR (Rol 4).
 */
const getMiembrosByLSR = async (req, res) => {
    const idLSR = req.user.id; 
    
    try {
        const query = `
            SELECT 
                m.id_miembro, 
                m.nombre, 
                m.telefono, 
                m.fecha_nacimiento,
                m.estado,
                c.nombre_lider_cdp as cdp_asignada
            FROM "Miembros" m
            JOIN "CasasDePaz" c ON m.id_cdp = c.id_cdp
            WHERE c.id_lsr = $1
            ORDER BY c.nombre_lider_cdp, m.nombre ASC;
        `;
        
        const result = await db.query(query, [idLSR]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No hay miembros registrados en las Casas de Paz bajo su supervisión.' });
        }

        const miembrosConEdad = result.rows.map(miembro => ({
            ...miembro,
            edad: calcularEdad(miembro.fecha_nacimiento)
        }));

        return res.status(200).json({ 
            mensaje: `Lista de ${miembrosConEdad.length} miembros supervisados.`,
            miembros: miembrosConEdad
        });

    } catch (error) {
        console.error('❌ Error al obtener miembros por LSR:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar miembros (LSR).' });
    }
};


// --------------------------------------------------------------------------
// LÓGICA DE REGISTRO DE MIEMBRO (CREATE)
// --------------------------------------------------------------------------

/**
 * [POST] /api/lider/miembros
 * Permite al Líder registrar un nuevo miembro en su propia CdP.
 */
const createMiembro = async (req, res) => {
    const idLider = req.user.id; 

    const { 
        nombre, telefono, direccion, referencia, sexo, 
        fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda 
    } = req.body;

    if (!nombre || !telefono || !sexo || !fecha_nacimiento) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios: nombre, telefono, sexo y fecha_nacimiento.' });
    }

    try {
        const cdpResult = await db.query('SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $1', [idLider]);

        if (cdpResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Error: El usuario no tiene una Casa de Paz asignada.' });
        }
        
        const id_cdp = cdpResult.rows[0].id_cdp;

        const insertQuery = `
            INSERT INTO "Miembros" (
                id_cdp, nombre, telefono, direccion, referencia, sexo, 
                fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda, estado
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Activo'
            ) RETURNING id_miembro, nombre;
        `;
        
        const values = [
            id_cdp, nombre, telefono, direccion, referencia, sexo, 
            fecha_nacimiento, fecha_conversion || null, fecha_bautizo || null, fecha_boda || null
        ];

        const result = await db.query(insertQuery, values);
        const nuevoMiembro = result.rows[0];

        return res.status(201).json({
            mensaje: `Miembro ${nuevoMiembro.nombre} registrado exitosamente en CdP ID ${id_cdp}.`,
            miembro_id: nuevoMiembro.id_miembro,
            edad_calculada: calcularEdad(fecha_nacimiento)
        });

    } catch (error) {
        console.error('❌ Error al crear nuevo miembro:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al registrar el miembro.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// LÓGICA DE MODIFICACIÓN DE MIEMBRO (UPDATE)
// --------------------------------------------------------------------------

/**
 * [PUT] /api/lider/miembros/:id
 * Permite actualizar los datos de un miembro.
 */
const updateMiembro = async (req, res) => {
    const { id: idMiembro } = req.params; 
    const idUsuario = req.user.id;      
    const rolUsuario = req.user.id_rol;  
    
    const { 
        nombre, telefono, direccion, referencia, sexo, 
        fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda,
        estado 
    } = req.body;

    if (!nombre && !telefono && !estado) {
        return res.status(400).json({ mensaje: 'Debe proporcionar al menos un campo para actualizar.' });
    }

    try {
        // 1. Obtener la CdP del miembro objetivo
        const miembroQuery = `SELECT id_cdp FROM "Miembros" WHERE id_miembro = $1`;
        const miembroResult = await db.query(miembroQuery, [idMiembro]);

        if (miembroResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Miembro no encontrado.' });
        }
        const id_cdp_objetivo = miembroResult.rows[0].id_cdp;

        
        // 2. Lógica de Permisos (Autorización compleja)
        let tienePermisoTotal = rolUsuario === ROLES.SUPER_ADMIN || rolUsuario === ROLES.LSR || rolUsuario === ROLES.ADMINISTRACION;
        
        if (!tienePermisoTotal) {
            if (rolUsuario === ROLES.LIDER) {
                const liderCdpQuery = `SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $1`;
                const liderCdpResult = await db.query(liderCdpQuery, [idUsuario]);

                if (liderCdpResult.rows.length === 0 || liderCdpResult.rows[0].id_cdp !== id_cdp_objetivo) {
                    return res.status(403).json({ mensaje: 'Acceso denegado. Solo puede actualizar miembros de su propia Casa de Paz.' });
                }
            } else {
                return res.status(403).json({ mensaje: 'Acceso denegado. Rol no autorizado para modificar miembros.' });
            }
        }
        
        // 3. Construir la consulta de UPDATE dinámicamente
        // *** ESTA SECCIÓN FUE CORREGIDA PARA EVITAR EL ERROR DE SINTAXIS SQL PREVIO ***
        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (nombre) {fields.push(`nombre = $${paramIndex++}`); values.push(nombre);}
        if (telefono) {fields.push(`telefono = $${paramIndex++}`); values.push(telefono);}
        if (direccion) {fields.push(`direccion = $${paramIndex++}`); values.push(direccion);}
        if (referencia) {fields.push(`referencia = $${paramIndex++}`); values.push(referencia);}
        if (sexo) {fields.push(`sexo = $${paramIndex++}`); values.push(sexo);}
        if (fecha_nacimiento) {fields.push(`fecha_nacimiento = $${paramIndex++}`); values.push(fecha_nacimiento);}
        if (fecha_conversion) {fields.push(`fecha_conversion = $${paramIndex++}`); values.push(fecha_conversion);}
        if (fecha_bautizo) {fields.push(`fecha_bautizo = $${paramIndex++}`); values.push(fecha_bautizo);}
        if (fecha_boda) {fields.push(`fecha_boda = $${paramIndex++}`); values.push(fecha_boda);}
        if (estado) {fields.push(`estado = $${paramIndex++}`); values.push(estado);}
        
        if (fields.length === 0) {
            return res.status(400).json({ mensaje: 'Debe proporcionar al menos un campo para actualizar.' });
        }
        
        // El ID del miembro siempre es el último parámetro
        values.push(idMiembro);
        
        const updateQuery = `
            UPDATE "Miembros" SET ${fields.join(', ')} 
            WHERE id_miembro = $${paramIndex}
            RETURNING *;
        `;
        
        const result = await db.query(updateQuery, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ mensaje: 'Error al actualizar: Miembro no encontrado o sin cambios.' });
        }

        return res.status(200).json({
            mensaje: `Miembro ${result.rows[0].nombre} (ID ${idMiembro}) actualizado exitosamente.`,
            miembro_actualizado: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error al actualizar miembro:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al actualizar el miembro.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// LÓGICA DE ELIMINACIÓN LÓGICA DE MIEMBRO (NUEVA FUNCIÓN)
// --------------------------------------------------------------------------

/**
 * [DELETE] /api/lider/miembros/:id
 * Realiza una eliminación lógica (cambia estado a 'Inactivo').
 * Restricción: Líder solo puede desactivar miembros de su propia CdP.
 * Permiso Total: LSR y Super Admin pueden desactivar cualquier miembro.
 */
const deleteMiembro = async (req, res) => {
    const { id: idMiembro } = req.params; 
    const idUsuario = req.user.id;      
    const rolUsuario = req.user.id_rol;  

    try {
        // 1. Obtener la CdP del miembro objetivo y su estado actual
        const miembroQuery = `
            SELECT id_cdp, estado FROM "Miembros" WHERE id_miembro = $1
        `;
        const miembroResult = await db.query(miembroQuery, [idMiembro]);

        if (miembroResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Miembro no encontrado.' });
        }
        
        const id_cdp_objetivo = miembroResult.rows[0].id_cdp;
        const estado_actual = miembroResult.rows[0].estado;

        if (estado_actual === 'Inactivo') {
            return res.status(200).json({ mensaje: `El miembro ID ${idMiembro} ya está inactivo.` });
        }
        
        // 2. Lógica de Permisos (La misma que en el UPDATE)
        let tienePermisoTotal = rolUsuario === ROLES.SUPER_ADMIN || rolUsuario === ROLES.LSR || rolUsuario === ROLES.ADMINISTRACION;
        
        if (!tienePermisoTotal) {
            if (rolUsuario === ROLES.LIDER) {
                const liderCdpQuery = `SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $1`;
                const liderCdpResult = await db.query(liderCdpQuery, [idUsuario]);

                if (liderCdpResult.rows.length === 0 || liderCdpResult.rows[0].id_cdp !== id_cdp_objetivo) {
                    return res.status(403).json({ mensaje: 'Acceso denegado. Solo puede desactivar miembros de su propia Casa de Paz.' });
                }
            } else {
                return res.status(403).json({ mensaje: 'Acceso denegado. Rol no autorizado para desactivar miembros.' });
            }
        }
        
        // 3. Ejecutar la Eliminación Lógica (UPDATE del campo 'estado')
        const updateQuery = `
            UPDATE "Miembros" SET estado = 'Inactivo' 
            WHERE id_miembro = $1
            RETURNING nombre;
        `;
        
        const result = await db.query(updateQuery, [idMiembro]);

        return res.status(200).json({
            mensaje: `Miembro ${result.rows[0].nombre} (ID ${idMiembro}) ha sido marcado como 'Inactivo'.`,
        });

    } catch (error) {
        console.error('❌ Error al realizar la eliminación lógica del miembro:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al desactivar el miembro.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/lider/reporte/crear
// Crea la entrada principal en la tabla "ReporteCdP".
// --------------------------------------------------------------------------
const createReporteCdP = async (req, res) => {
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
    const idLiderReportado = parseInt(id_lider);

    // 1. Validación de Autorización
    if (idLiderReportado !== requesterId) {
        return res.status(403).json({ mensaje: 'Acceso prohibido. No puede crear reportes para otro líder.' });
    }

    // 2. Validación de Campos Mínimos
    if (!id_lider || !latitud || !longitud || !fecha_reporte) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios para crear el reporte principal (id_lider, fecha_reporte, latitud, longitud).' });
    }
    
    try {
        const insertQuery = `
            INSERT INTO "ReporteCdP" (
                id_lider, 
                fecha_reporte, 
                latitud, 
                longitud, 
                ofrendas, 
                diezmos, 
                pactos, 
                primicias, 
                comentarios
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id_reporte_cdp, fecha_reporte;
        `;
        
        const values = [
            idLiderReportado, 
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
            mensaje: `Reporte principal (Financiero/Logístico) creado exitosamente. Proceda a registrar la asistencia.`,
            id_reporte_cdp: newReportId,
            fecha_reporte: fecha_reporte
        });

    } catch (error) {
        if (error.code === '23505') { 
            // Esto solo ocurrirá si añades un UNIQUE(id_lider, fecha_reporte) a tu tabla ReporteCdP
            return res.status(409).json({ mensaje: `Ya existe un reporte para el líder ${id_lider} en la fecha ${fecha_reporte}.` });
        }
        console.error('❌ Error al crear reporte principal de CdP:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear el reporte principal.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/lider/asistencia/registrar
// Registra la asistencia detallada en la tabla "AsistenciaCdP".
// --------------------------------------------------------------------------
const registerAttendance = async (req, res) => {
    const { id_reporte_cdp, asistencias } = req.body; // asistencias es un array: [{id_miembro: N, asistio: true/false}]
    const requesterId = parseInt(req.user.id);
    const reporteId = parseInt(id_reporte_cdp);

    // 1. Validación de campos
    if (!reporteId || !Array.isArray(asistencias) || asistencias.length === 0) {
        return res.status(400).json({ mensaje: 'Datos de asistencia incompletos o en formato incorrecto.' });
    }

    try {
        // 2. Validación de Liderazgo sobre el Reporte
        const reportCheckQuery = `
            SELECT id_lider 
            FROM "ReporteCdP" 
            WHERE id_reporte_cdp = $1
        `;
        const reportResult = await db.query(reportCheckQuery, [reporteId]);

        if (reportResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Reporte principal no encontrado.' });
        }
        
        const reportLiderId = reportResult.rows[0].id_lider;

        if (reportLiderId !== requesterId) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No es el líder que creó este reporte.' });
        }
        
        // 3. Preparación de la consulta batch para AsistenciaCdP
        const insertValues = asistencias.map(item => {
            // Aseguramos que solo los miembros presentes se inserten
            if (item.asistio === true) {
                return `(${reporteId}, ${parseInt(item.id_miembro)}, TRUE)`;
            }
            return null;
        }).filter(v => v !== null); // Filtramos los que no asistieron

        if (insertValues.length === 0) {
            return res.status(200).json({ mensaje: 'Registro de asistencia completado, pero no se registraron asistentes.' });
        }
        
        // Construcción de la consulta de inserción masiva
        const insertAttendanceQuery = `
            INSERT INTO "AsistenciaCdP" (id_reporte_cdp, id_miembro, asistio)
            VALUES ${insertValues.join(', ')}
            ON CONFLICT (id_reporte_cdp, id_miembro) 
            DO UPDATE SET asistio = EXCLUDED.asistio;
        `;
        
        await db.query(insertAttendanceQuery);

        return res.status(201).json({
            mensaje: `Registro de asistencia detallada completado exitosamente para ${insertValues.length} miembro(s).`,
            id_reporte_cdp: reporteId,
            asistentes_registrados: insertValues.length
        });

    } catch (error) {
        console.error('❌ Error al registrar asistencia detallada:', error);
        // El error 23503 (Foreign Key Violation) podría saltar si el id_miembro no existe
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al registrar la asistencia.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/lider/mi-cdp-id
// Obtiene el ID de la Casa de Paz que lidera el usuario loggeado.
// --------------------------------------------------------------------------
const getLiderCdpId = async (req, res) => {
    const requesterId = parseInt(req.user.id);

    try {
        const query = `
            SELECT id_cdp, nombre_lider_cdp
            FROM "CasasDePaz"
            WHERE id_lider = $1
        `;
        const result = await db.query(query, [requesterId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontró una Casa de Paz asociada a este Líder.' });
        }

        return res.status(200).json({
            mensaje: 'ID de Casa de Paz obtenido exitosamente.',
            id_cdp: result.rows[0].id_cdp,
            nombre_cdp: result.rows[0].nombre_lider_cdp
        });
        
    } catch (error) {
        console.error('❌ Error al obtener ID de CdP del líder:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar la Casa de Paz.' });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/lider/miembros-asistencia
// Obtiene la lista de miembros de la CdP del líder loggeado.
// --------------------------------------------------------------------------
const getMembersForAttendance = async (req, res) => {
    const requesterId = parseInt(req.user.id);

    try {
        // Paso 1: Obtener el ID de la Casa de Paz del líder
        const cdpIdQuery = `
            SELECT id_cdp
            FROM "CasasDePaz"
            WHERE id_lider = $1
        `;
        const cdpResult = await db.query(cdpIdQuery, [requesterId]);

        if (cdpResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontró la Casa de Paz del líder.' });
        }
        const cdpId = cdpResult.rows[0].id_cdp;

        // Paso 2: Obtener la lista de miembros de esa CdP
        const membersQuery = `
            SELECT 
                id_miembro, 
                nombre, 
                estado, 
                telefono
            FROM "Miembros"
            WHERE id_cdp = $1
            ORDER BY nombre ASC;
        `;
        
        const membersResult = await db.query(membersQuery, [cdpId]);
        
        return res.status(200).json({
            mensaje: `Listado de ${membersResult.rows.length} miembros para el registro de asistencia.`,
            id_cdp: cdpId,
            miembros: membersResult.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener miembros para asistencia:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar la lista de miembros.' });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/lsr/vision/resumen
// Resumen de miembros por Fase de la Visión para la subred del LSR loggeado.
// --------------------------------------------------------------------------

const getSubredVisionSummary = async (req, res) => {
    // El id_usuario del LSR se obtiene del token verificado por el middleware
    const id_lsr = req.user.id; 
    
    try {
        // Subconsulta para encontrar la fase más reciente (MAX(fecha_aprobacion)) de cada miembro
        const currentPhaseQuery = `
            WITH UltimaFase AS (
                SELECT
                    mf.id_miembro,
                    mf.id_fase,
                    ROW_NUMBER() OVER(PARTITION BY mf.id_miembro ORDER BY mf.fecha_aprobacion DESC) as rn
                FROM "MiembroFase" mf
            )
            SELECT 
                fv.nombre_fase,
                COUNT(m.id_miembro) AS total_miembros
            FROM "Miembros" m
            JOIN "CasasDePaz" cdp ON m.id_cdp = cdp.id_cdp
            LEFT JOIN UltimaFase uf ON m.id_miembro = uf.id_miembro AND uf.rn = 1 -- Unir con la fase más reciente
            JOIN "FasesVision" fv ON uf.id_fase = fv.id_fase
            WHERE cdp.id_lsr = $1 -- Filtrar solo por las CdPs de este LSR
            AND m.estado = 'Activo' -- Considerar solo miembros activos
            GROUP BY fv.nombre_fase
            ORDER BY fv.nombre_fase;
        `;
        
        const result = await db.query(currentPhaseQuery, [id_lsr]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron miembros activos en las Casas de Paz supervisadas con una fase de visión registrada.' });
        }

        // Formatear el resultado
        const summary = result.rows.map(row => ({
            fase: row.nombre_fase, // Usamos nombre_fase
            total: parseInt(row.total_miembros)
        }));

        return res.status(200).json({
            mensaje: 'Resumen de miembros por fase de la Visión para la subred.',
            resumen_vision: summary
        });

    } catch (error) {
        console.error('❌ Error al obtener el resumen de Visión para LSR:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al procesar la analítica de subred.',
            error: error.message 
        });
    }
};

module.exports = {
    getMiembrosByLider,
    getMiembrosByLSR,
    createMiembro,
    updateMiembro,
    deleteMiembro,
    createReporteCdP,
    registerAttendance,
    getLiderCdpId,
    getMembersForAttendance,
    getSubredVisionSummary,
};


