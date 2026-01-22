const db = require('../config/db');
const ROLES = require('../constants/roles');
const pool = require('../config/db');

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
// LÓGICA DE REGISTRO DE MIEMBRO (CREATE)
// --------------------------------------------------------------------------

/**
 * [POST] /api/lider/miembros
 * Permite al Líder y Administación registrar un nuevo miembro.
 */

const createMiembro = async (req, res) => {
    const { 
        id_cdp, nombre, telefono, direccion, referencia, sexo, 
        fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda,
        ministerios // Array de IDs [1, 2]
    } = req.body;
    
    const idUsuarioLogueado = req.user.id;
    const rolUsuario = req.user.id_rol; // 1: SuperAdmin, 2: Admin, 5: Líder

    // Validación mínima
    if (!nombre || !sexo || !fecha_nacimiento) {
        return res.status(400).json({ mensaje: 'Nombre, sexo y fecha de nacimiento son obligatorios.' });
    }

    const client = await db.getClient(); // Usar getClient para transacciones

    try {
        await client.query('BEGIN');

        // 1. Lógica de asignación de Casa de Paz (CDP)
        let cdpFinal = id_cdp;

        if (rolUsuario === 5) { // Si es LÍDER
            const cdpRes = await client.query('SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $1', [idUsuarioLogueado]);
            if (cdpRes.rows.length === 0) {
                throw new Error('No tienes una Casa de Paz asignada para registrar miembros.');
            }
            cdpFinal = cdpRes.rows[0].id_cdp;
        } 
        // Si es Admin, usa el id_cdp que venga en el body (puede ser null)

        // 2. Insertar Miembro
        const miembroQuery = `
            INSERT INTO "Miembros" 
            (id_cdp, nombre, telefono, direccion, referencia, sexo, fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id_miembro;
        `;
        const miembroRes = await client.query(miembroQuery, [
            cdpFinal || null, nombre, telefono, direccion, referencia, sexo, 
            fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda
        ]);
        const id_miembro = miembroRes.rows[0].id_miembro;

        // 3. Insertar Ministerios (si vienen en la petición)
        if (ministerios && Array.isArray(ministerios)) {
            for (const id_min of ministerios) {
                await client.query(
                    'INSERT INTO "MiembroMinisterio" (id_miembro, id_ministerio) VALUES ($1, $2)',
                    [id_miembro, id_min]
                );
            }
        }

        // 4. Insertar TODAS las Fases como "false" (Pendientes)
        const fasesMaster = await client.query('SELECT id_fase FROM "FasesVision"');
        for (const fase of fasesMaster.rows) {
            await client.query(
                'INSERT INTO "MiembroFase" (id_miembro, id_fase, aprobado) VALUES ($1, $2, $3)',
                [id_miembro, fase.id_fase, false]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ 
            mensaje: 'Miembro creado exitosamente con sus fases y ministerios.',
            id_miembro 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Error en createMiembro:", error.message);
        res.status(500).json({ mensaje: error.message || 'Error al crear el miembro.' });
    } finally {
        client.release();
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

// --------------------------------------------------------------------------
// LÓGICA DE REPORTE INTEGRADO (Cabecera + Asistencia + Visitas)
// --------------------------------------------------------------------------
/**
 * [POST] /api/lider/reporte-completo
 * Procesa todo el reporte en una sola transacción para evitar datos huérfanos.
 */

const createReporteCompleto = async (req, res) => {
    const id_lider = req.user.id;
    const { 
        fecha_reporte, latitud, longitud, ofrendas, diezmos, pactos, primicias, 
        metodo_entrega_ofrenda, comentarios, asistencia, visitas 
    } = req.body;

    // USAMOS getClient() que es como lo tienes en db.js
    const client = await db.getClient(); 

    try {
        await client.query('BEGIN');

        // 0. Obtener el LSR del líder para la jerarquía
        const redQuery = 'SELECT id_lsr FROM "CasasDePaz" WHERE id_lider = $1';
        const redRes = await client.query(redQuery, [id_lider]);
        const id_lsr = redRes.rows[0]?.id_lsr;

        // 1. Insertar Cabecera
        const reportQuery = `
            INSERT INTO public."ReporteCdP" 
            (id_lider, fecha_reporte, latitud, longitud, ofrendas, diezmos, pactos, primicias, metodo_entrega_ofrenda, comentarios)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id_reporte_cdp;
        `;
        const reportRes = await client.query(reportQuery, [
            id_lider, fecha_reporte, latitud, longitud, 
            ofrendas || 0, diezmos || 0, pactos || 0, primicias || 0, 
            metodo_entrega_ofrenda || 'En el servicio', comentarios
        ]);
        const id_reporte = reportRes.rows[0].id_reporte_cdp;

        // 2. Insertar Asistencia
        if (asistencia && asistencia.length > 0) {
            for (const persona of asistencia) {
                if (persona.asistio) {
                    await client.query(
                        'INSERT INTO public."AsistenciaCdP" (id_reporte_cdp, id_miembro, asistio) VALUES ($1, $2, TRUE)',
                        [id_reporte, persona.id_miembro]
                    );
                }
            }
        }

        // 3. Insertar Visitas y Seguimiento
        if (visitas && visitas.length > 0) {
            for (const v of visitas) {
                const visitaQuery = `
                    INSERT INTO public."VisitasCdP" 
                    (id_reporte_cdp, nombre, telefono, direccion, referencia, nombre_invitador, asiste_otra_iglesia, nombre_otra_iglesia, tipo, decision)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id_visita;
                `;
                const visitaRes = await client.query(visitaQuery, [
                    id_reporte, v.nombre, v.telefono, v.direccion, v.referencia, v.nombre_invitador, 
                    v.asiste_otra_iglesia || false, v.nombre_otra_iglesia, v.tipo, v.decision
                ]);

                const id_visita = visitaRes.rows[0].id_visita;

                await client.query(
                    `INSERT INTO public."Seguimiento" (id_visita, estado, id_lsr_responsable, id_lider_responsable) 
                     VALUES ($1, 'Activo', $2, $3)`,
                    [id_visita, id_lsr, id_lider]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ mensaje: 'Reporte y seguimientos creados con éxito', id_reporte_cdp: id_reporte });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', error);
        res.status(500).json({ mensaje: 'Error al procesar reporte completo' });
    } finally {
        client.release(); // LIBERAR EL CLIENTE SIEMPRE
    }
};


/**
 * [GET] /api/lider/reporte-detalle/:id
 * Obtiene el detalle financiero, asistentes y ausentes de un reporte.
 */
const getDetalleReporte = async (req, res) => {
    const id_reporte = req.params.id;
    const id_lider = req.user.id;

    try {
        // 1. Obtener datos generales y financieros
        const infoQuery = `SELECT * FROM "ReporteCdP" WHERE id_reporte_cdp = $1 AND id_lider = $2`;
        const infoRes = await db.query(infoQuery, [id_reporte, id_lider]);

        if (infoRes.rows.length === 0) {
            return res.status(404).json({ mensaje: "Reporte no encontrado." });
        }

        // 2. Obtener lista de asistentes y ausentes en una sola consulta
        // Usamos un LEFT JOIN entre todos los miembros de la CdP y la tabla de asistencia
        const asistenciaQuery = `
            SELECT 
                m.id_miembro, 
                m.nombre,
                CASE WHEN a.id_miembro IS NOT NULL THEN TRUE ELSE FALSE END as asistio
            FROM "Miembros" m
            JOIN "CasasDePaz" c ON m.id_cdp = c.id_cdp
            LEFT JOIN "AsistenciaCdP" a ON m.id_miembro = a.id_miembro AND a.id_reporte_cdp = $1
            WHERE c.id_lider = $2 AND m.estado = 'Activo'
            ORDER BY m.nombre ASC;
        `;
        
        const asistenciaRes = await db.query(asistenciaQuery, [id_reporte, id_lider]);

        // Separamos en el backend para facilitarle el trabajo al Frontend
        const asistentes = asistenciaRes.rows.filter(p => p.asistio);
        const ausentes = asistenciaRes.rows.filter(p => !p.asistio);

        return res.status(200).json({
            reporte: infoRes.rows[0],
            resumen_asistencia: {
                total_miembros: asistenciaRes.rows.length,
                presentes: asistentes.length,
                ausentes: ausentes.length
            },
            asistentes,
            ausentes
        });

    } catch (error) {
        console.error('❌ Error al obtener detalle del reporte:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

/**
 * [GET] /api/lider/reportes-historial
 * Lista todos los reportes pasados del líder.
 */
const getHistorialReportes = async (req, res) => {
    const id_lider = req.user.id;
    try {
        const query = `
            SELECT id_reporte_cdp, fecha_reporte, ofrendas, estado_revision 
            FROM "ReporteCdP" 
            WHERE id_lider = $1 
            ORDER BY fecha_reporte DESC;
        `;
        const result = await db.query(query, [id_lider]);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener historial.' });
    }
};

const getDetalleAsistenciaReporte = async (req, res) => {
    const { id_reporte } = req.params;
    const id_lider = req.user.id;

    try {
        const query = `
            SELECT 
                m.id_miembro, 
                m.nombre, 
                CASE 
                    WHEN a.id_miembro IS NOT NULL THEN true 
                    ELSE false 
                END as asistio
            FROM "Miembros" m
            JOIN "CasasDePaz" c ON m.id_cdp = c.id_cdp
            LEFT JOIN "AsistenciaCdP" a ON m.id_miembro = a.id_miembro AND a.id_reporte_cdp = $1
            WHERE c.id_lider = $2 AND m.estado = 'Activo'
            ORDER BY m.nombre ASC;
        `;
        const result = await db.query(query, [id_reporte, id_lider]);
        
        // Separamos para que el front solo renderice dos listas
        const presentes = result.rows.filter(r => r.asistio);
        const ausentes = result.rows.filter(r => !r.asistio);

        res.status(200).json({ presentes, ausentes });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener detalle de asistencia.' });
    }
};

const getDetalleAsistenciaHistorial = async (req, res) => {
    const { id_reporte } = req.params;
    const id_lider = req.user.id;

    try {
        const query = `
            SELECT 
                m.id_miembro, 
                m.nombre, 
                CASE WHEN a.id_miembro IS NOT NULL THEN true ELSE false END as asistio
            FROM "Miembros" m
            JOIN "CasasDePaz" c ON m.id_cdp = c.id_cdp
            LEFT JOIN "AsistenciaCdP" a ON m.id_miembro = a.id_miembro AND a.id_reporte_cdp = $1
            WHERE c.id_lider = $2 AND m.estado = 'Activo'
            ORDER BY m.nombre ASC;
        `;
        const result = await db.query(query, [id_reporte, id_lider]);
        
        const asistentes = result.rows.filter(r => r.asistio);
        const faltantes = result.rows.filter(r => !r.asistio);

        res.status(200).json({ asistentes, faltantes });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al consultar detalle.' });
    }
};

/**
 * [POST] /api/admin/visita-manual
 * Permite a administración registrar una visita y asignar responsables de red.
 */
const createVisitaAdministrativa = async (req, res) => {
    const { 
        nombre, telefono, direccion, referencia, nombre_invitador,
        asiste_otra_iglesia, nombre_otra_iglesia, tipo, decision,
        id_lsr_responsable, 
        id_lider_responsable 
    } = req.body;

    // Validación básica
    if (!nombre || !id_lsr_responsable) {
        return res.status(400).json({ mensaje: 'El nombre de la visita y el LSR responsable son obligatorios.' });
    }

    // Usamos getClient() de tu db.js
    const client = await db.getClient(); 

    try {
        await client.query('BEGIN');

        // 1. Insertar la visita (id_reporte_cdp queda en NULL porque no viene de una CdP)
        const visitaQuery = `
            INSERT INTO public."VisitasCdP" 
            (id_reporte_cdp, nombre, telefono, direccion, referencia, nombre_invitador, asiste_otra_iglesia, nombre_otra_iglesia, tipo, decision)
            VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id_visita;
        `;
        const visitaRes = await client.query(visitaQuery, [
            nombre, telefono, direccion, referencia, nombre_invitador,
            asiste_otra_iglesia || false, nombre_otra_iglesia, tipo, decision
        ]);
        const id_visita = visitaRes.rows[0].id_visita;

        // 2. Crear el seguimiento con los responsables asignados manualmente
        // Si id_lider_responsable no viene, queda asignado solo al LSR (Rol 4)
        await client.query(
            `INSERT INTO public."Seguimiento" (id_visita, estado, id_lsr_responsable, id_lider_responsable) 
             VALUES ($1, 'Activo', $2, $3)`,
            [id_visita, id_lsr_responsable, id_lider_responsable || null]
        );

        await client.query('COMMIT');
        res.status(201).json({ 
            mensaje: 'Visita registrada por Administración y seguimiento asignado con éxito.',
            id_visita: id_visita 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error en registro administrativo:', error);
        res.status(500).json({ mensaje: 'Error interno al registrar la visita desde administración.' });
    } finally {
        // MUY IMPORTANTE: Liberar el cliente para evitar el error de "too many clients"
        client.release(); 
    }
};

/**
 * [GET] /api/lider/lsr/seguimientos
 * Obtiene todos los seguimientos pendientes de la subred del LSR logueado.
 */
const getSeguimientosLSR = async (req, res) => {
    const id_lsr = req.user.id;

    try {
        const query = `
            SELECT 
                s.id_seguimiento,
                s.estado,
                s.fecha_creacion,
                v.nombre AS nombre_visita,
                v.telefono,
                v.tipo AS tipo_visita,
                u.nombre AS responsable_lider,
                c.nombre_lider_cdp AS cdp_origen
            FROM "Seguimiento" s
            JOIN "VisitasCdP" v ON s.id_visita = v.id_visita
            LEFT JOIN "Usuarios" u ON s.id_lider_responsable = u.id_usuario
            LEFT JOIN "ReporteCdP" r ON v.id_reporte_cdp = r.id_reporte_cdp
            LEFT JOIN "CasasDePaz" c ON r.id_lider = c.id_lider
            WHERE s.id_lsr_responsable = $1
            ORDER BY s.fecha_creacion DESC;
        `;
        
        const result = await db.query(query, [id_lsr]);

        res.status(200).json({
            mensaje: `Se encontraron ${result.rows.length} seguimientos en su red.`,
            seguimientos: result.rows
        });
    } catch (error) {
        console.error('❌ Error al obtener seguimientos para LSR:', error);
        res.status(500).json({ mensaje: 'Error al consultar la bandeja de seguimientos.' });
    }
};

/**
 * [GET] /api/lider/mis-seguimientos
 * Lista los seguimientos asignados al usuario logueado (Líder o LSR).
 */
const getMisSeguimientos = async (req, res) => {
    const id_usuario = req.user.id;
    try {
        const query = `
            SELECT 
                s.id_seguimiento, 
                s.estado, 
                v.nombre AS nombre_visita, 
                v.tipo AS tipo_visita
            FROM public."Seguimiento" s
            JOIN public."VisitasCdP" v ON s.id_visita = v.id_visita
            WHERE s.id_lider_responsable = $1 OR s.id_lsr_responsable = $1
            ORDER BY s.id_seguimiento DESC;
        `;
        const result = await db.query(query, [id_usuario]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("ERROR EN A:", error); // Esto imprimirá el error real en tu consola
        res.status(500).json({ mensaje: 'Error al obtener seguimientos.', detalle: error.message });
    }
};

/**
 * [GET] /api/lider/seguimiento-detalle/:id
 * Obtiene toda la información de la visita y las notas asociadas.
 */

const getSeguimientoCompleto = async (req, res) => {
    const { id } = req.params; 

    // Validación de seguridad: Evita que el servidor falle si el ID no es numérico
    if (!id || isNaN(id)) {
        return res.status(400).json({ 
            mensaje: "El ID de seguimiento proporcionado no es válido." 
        });
    }

    try {
        // 1. Obtener datos de la visita y estado del seguimiento
        const visitaQuery = `
            SELECT v.*, s.estado AS estado_seguimiento, s.id_seguimiento
            FROM public."VisitasCdP" v
            JOIN public."Seguimiento" s ON v.id_visita = s.id_visita
            WHERE s.id_seguimiento = $1;
        `;
        const visita = await db.query(visitaQuery, [id]);

        if (visita.rows.length === 0) {
            return res.status(404).json({ mensaje: "El seguimiento no existe." });
        }

        // 2. Obtener el historial de notas con el autor
        const notasQuery = `
            SELECT 
                n.id_nota, n.comentario, n.fecha_creacion,
                u.nombre AS autor_nombre,
                r.nombre_rol AS autor_rol
            FROM public."NotasSeguimiento" n
            JOIN public."Usuarios" u ON n.id_autor = u.id_usuario
            JOIN public."Roles" r ON u.id_rol = r.id_rol
            WHERE n.id_seguimiento = $1
            ORDER BY n.fecha_creacion DESC;
        `;
        const notas = await db.query(notasQuery, [id]);

        res.status(200).json({
            detalle: visita.rows[0],
            notas: notas.rows
        });
    } catch (error) {
        console.error("❌ Error en getSeguimientoCompleto:", error.message);
        res.status(500).json({ mensaje: 'Error interno al obtener el detalle.' });
    }
};

/**
 * [POST] /api/lider/seguimiento-nota
 * Permite a cualquier rol con acceso agregar una nota al seguimiento.
 */
const addNotaSeguimiento = async (req, res) => {
    const id_autor = req.user.id;
    const { id_seguimiento, comentario } = req.body;

    if (!comentario) return res.status(400).json({ mensaje: 'El comentario no puede estar vacío.' });

    try {
        await db.query(
            'INSERT INTO "NotasSeguimiento" (id_seguimiento, id_autor, comentario) VALUES ($1, $2, $3)',
            [id_seguimiento, id_autor, comentario]
        );
        res.status(201).json({ mensaje: 'Nota agregada con éxito.' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al guardar la nota.' });
    }
};

const getMiembrosUniversal = async (req, res) => {
    // Extraemos los datos del usuario loggeado (puestos por tu middleware de JWT)
    const { id: userId, rol } = req.user; 
    
    try {
        // Tu lógica de normalización que ya funciona
        const rolNormalizado = rol.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

        // Mantenemos EXACTAMENTE tu misma consulta base
        let query = `
    SELECT 
        m.id_miembro as id, m.nombre, m.telefono, m.direccion, m.referencia, m.sexo,
        m.fecha_nacimiento as "fechaNacimiento",
        m.fecha_conversion as "fechaConversion",
        m.fecha_bautizo as "fechaBautizo",
        m.fecha_boda as "fechaBoda",
        m.estado,
        m.id_cdp, 
        EXTRACT(YEAR FROM AGE(m.fecha_nacimiento))::int as edad,
        COALESCE(u_lider.nombre, 'Sin asignar') as lider,
        COALESCE(u_lsr.nombre, 'Sin asignar') as "liderSubred", -- Ajustado para coincidir con la interfaz del Front
        COALESCE((
            SELECT json_agg(min.nombre_ministerio)::jsonb
            FROM "MiembroMinisterio" mm
            JOIN "Ministerios" min ON mm.id_ministerio = min.id_ministerio
            WHERE mm.id_miembro = m.id_miembro
        ), '[]'::jsonb) as ministerios,
        COALESCE((
            SELECT json_object_agg(fase_data.n, fase_data.e ORDER BY fase_data.id)::jsonb
            FROM (
                SELECT fv.id_fase as id, fv.nombre_fase as n, 
                CASE WHEN mf.aprobado THEN 'Completado' ELSE 'Pendiente' END as e
                FROM "MiembroFase" mf
                JOIN "FasesVision" fv ON mf.id_fase = fv.id_fase
                WHERE mf.id_miembro = m.id_miembro
                ORDER BY fv.id_fase ASC
            ) as fase_data
        ), '{}'::jsonb) as "procesoVision"
    FROM "Miembros" m
    LEFT JOIN "CasasDePaz" c ON m.id_cdp = c.id_cdp
    LEFT JOIN "Usuarios" u_lider ON c.id_lider = u_lider.id_usuario 
    LEFT JOIN "Usuarios" u_lsr ON c.id_lsr = u_lsr.id_usuario 
`;
        const params = [];
        
        // --- AQUÍ APLICAMOS LOS FILTROS POR ROL ---
        if (rolNormalizado === 'lider') {
            // Caso 1: Líder de Casa de Paz
            query += ` WHERE c.id_lider = $1`;
            params.push(userId);
        } 
        else if (rolNormalizado === 'lider de subred' || rolNormalizado === 'lsr') {
            // Caso 2: Líder de Subred (ve todas sus casas asignadas)
            query += ` WHERE c.id_lsr = $1`;
            params.push(userId);
        }
        else if (rolNormalizado === 'administracion' || rolNormalizado === 'administrador') {
            // Caso 3: Administración (no agregamos WHERE, ve todo)
        }

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Endpoint para traer ministerios reales para el formulario
const getMinisteriosLista = async (req, res) => {
    try {
        const result = await db.query(`SELECT id_ministerio as id, nombre_ministerio as nombre FROM "Ministerios" ORDER BY nombre_ministerio ASC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const crearMiembroUniversal = async (req, res) => {
    // Obtenemos el cliente desde el Pool (tu método getClient)
    const client = await db.getClient();
    
    try {
        // INICIO DE LA TRANSACCIÓN
        // Si algo falla después de este punto, nada se guarda en ninguna tabla
        await client.query('BEGIN');

        const { 
            nombre, 
            id_lider, // Recibido desde el frontend (ID del usuario loggeado)
            telefono, 
            direccion, 
            referencia, 
            sexo, 
            fecha_nacimiento, 
            fecha_conversion,
            fecha_bautizo,
            fecha_boda, 
            ministeriosSeleccionados 
        } = req.body;

        // 1. BUSCAR LA CASA DE PAZ (CDP) ASOCIADA AL LÍDER
        let id_cdp_real = null;

        if (id_lider && id_lider !== "none") {
            const resCDP = await client.query(
                'SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $1',
                [id_lider]
            );

            // Si el líder tiene CDP, asignamos el ID real. 
            // Si no tiene (como en el caso de Admin creando miembros sueltos), se queda como null.
            if (resCDP.rows.length > 0) {
                id_cdp_real = resCDP.rows[0].id_cdp;
            }
        }

        // Normalizar el sexo para que quepa en character(1)
        const sexoInicial = sexo ? sexo.charAt(0).toUpperCase() : 'M';

        // 2. INSERTAR EN LA TABLA "Miembros"
        // id_cdp_real puede ser un ID o NULL, permitiendo la creación sin casa de paz
        const resMiembro = await client.query(
            `INSERT INTO "Miembros" 
            (nombre, id_cdp, telefono, direccion, referencia, sexo, fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Activo') RETURNING id_miembro`,
            [
                nombre, 
                id_cdp_real, 
                telefono, 
                direccion, 
                referencia, 
                sexoInicial, 
                fecha_nacimiento, 
                fecha_conversion || null, 
                fecha_bautizo || null, 
                fecha_boda || null
            ]
        );
        
        const nuevoIdMiembro = resMiembro.rows[0].id_miembro;

        // 3. ASIGNAR MINISTERIOS (Si el usuario seleccionó alguno)
        if (ministeriosSeleccionados && ministeriosSeleccionados.length > 0) {
            for (const id_min of ministeriosSeleccionados) {
                await client.query(
                    `INSERT INTO "MiembroMinisterio" (id_miembro, id_ministerio) VALUES ($1, $2)`,
                    [nuevoIdMiembro, id_min]
                );
            }
        }

        // 4. INICIALIZAR FASES DE LA VISIÓN
        // Buscamos todas las fases que existen en la iglesia
        const fasesExistentes = await client.query(`SELECT id_fase FROM "FasesVision" ORDER BY id_fase ASC`);
        
        // Las insertamos todas para el nuevo miembro, marcadas como 'false' (Pendiente)
        for (const f of fasesExistentes.rows) {
            await client.query(
                `INSERT INTO "MiembroFase" (id_miembro, id_fase, aprobado) VALUES ($1, $2, false)`,
                [nuevoIdMiembro, f.id_fase]
            );
        }

        // SI TODO SALIÓ BIEN, CONFIRMAMOS LOS CAMBIOS
        await client.query('COMMIT');
        
        res.status(201).json({ 
            mensaje: "Miembro creado, ministerios asignados y fases de visión inicializadas correctamente.",
            id: nuevoIdMiembro 
        });

    } catch (e) {
        // SI HUBO ERROR, DESHACEMOS TODO (Rollback)
        await client.query('ROLLBACK');
        console.error("Error en crearMiembroUniversal:", e.message);
        res.status(500).json({ error: e.message });
    } finally {
        // Liberamos el cliente para que el Pool pueda reusarlo
        client.release();
    }
};

module.exports = {
    // Mimebros y Casas de Paz
    getMiembrosUniversal,
    crearMiembroUniversal,
    getMinisteriosLista,
    createMiembro,
    deleteMiembro,
    getLiderCdpId,
    getMembersForAttendance,
    // Reportes e Historial
    createReporteCompleto,
    getDetalleReporte,
    getHistorialReportes,
    getDetalleAsistenciaReporte,
    getDetalleAsistenciaHistorial,
    //Seguimientos y notas
    getSeguimientosLSR,
    addNotaSeguimiento,
    getMisSeguimientos,
    getSeguimientoCompleto,
    //Analitica
    getSubredVisionSummary
};



