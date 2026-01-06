const db = require('../config/db');
const ROLES = require('../constants/roles');
const { query } = require('express');

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
// LÓGICA DE LISTADO DE MIEMBROS
// --------------------------------------------------------------------------

/**
 * [GET] /api/admin/miembros/todos
 * Obtiene la lista COMPLETA de todos los miembros en el sistema (Roles: Super Admin, Admin).
 */

const getAllMiembros = async (req, res) => {
    try {
        const query = `
            SELECT
                m.id_miembro,
                m.nombre,
                m.telefono,
                m.fecha_nacimiento,
                m.estado,
                c.nombre_lider_cdp AS cdp_asignada,
                u_lider.nombre AS nombre_lider,
                u_lsr.nombre AS nombre_lsr
            FROM "Miembros" m
            JOIN "CasasDePaz" c ON m.id_cdp = c.id_cdp
            JOIN "Usuarios" u_lider ON c.id_lider = u_lider.id_usuario
            JOIN "Usuarios" u_lsr ON c.id_lsr = u_lsr.id_usuario
            ORDER BY m.nombre ASC;
        `;

        const result = await db.query(query);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No hay miembros registrados en todo el sistema.' });
        }

        const miembrosConEdad = result.rows.map(miembro => ({
            ...miembro,
            edad: calcularEdad(miembro.fecha_nacimiento)
        }));

        return res.status(200).json({
            mensaje: `Total de ${miembrosConEdad.length} miembros registrados.`,
            miembros: miembrosConEdad
        });

    } catch (error) {
        console.error('❌ Error al obtener todos los miembros (Admin):', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar todos los miembros.' });
    }
};


// --------------------------------------------------------------------------
// LÓGICA DE LISTADO DE CASAS DE PAZ
// --------------------------------------------------------------------------

/**
 * [GET] /api/admin/cdp/todas
 * Obtiene la lista COMPLETA de todas las Casas de Paz (Roles: Super Admin, Administración).
 */
const getAllCasasDePaz = async (req, res) => {
    try {
        // Consulta para obtener todas las CdP con sus líderes y supervisores
        const query = `
            SELECT
                c.id_cdp,
                c.nombre_lider_cdp,
                c.id_lider,
                u_lider.nombre AS nombre_lider,
                c.id_lsr,
                u_lsr.nombre AS nombre_lsr,
                COUNT(m.id_miembro) AS total_miembros
            FROM "CasasDePaz" c
            JOIN "Usuarios" u_lider ON c.id_lider = u_lider.id_usuario
            JOIN "Usuarios" u_lsr ON c.id_lsr = u_lsr.id_usuario
            LEFT JOIN "Miembros" m ON c.id_cdp = m.id_cdp
            GROUP BY c.id_cdp, u_lider.nombre, u_lsr.nombre
            ORDER BY c.nombre_lider_cdp ASC;
        `;

        const result = await db.query(query);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No hay Casas de Paz registradas.' });
        }

        return res.status(200).json({
            mensaje: `Total de ${result.rows.length} Casas de Paz.`,
            casas_de_paz: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener todas las Casas de Paz (Admin):', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar CdP.' });
    }
};

// --------------------------------------------------------------------------
// LÓGICA DE ASIGNACIÓN DE LÍDER A CdP (Fase 2.14 - Se mantiene)
// --------------------------------------------------------------------------

/**
 * [PUT] /api/admin/cdp/:id_cdp/asignar-lider
 */
const assignLiderToCdP = async (req, res) => {
    const { id_cdp } = req.params;
    const { id_lider } = req.body; 

    if (!id_lider) {
        return res.status(400).json({ mensaje: 'Debe proporcionar el ID del líder (id_lider) a asignar.' });
    }

    try {
        // 1. Verificar que el usuario a asignar sea un Líder (Rol 5)
        const liderCheckQuery = `
            SELECT nombre, id_rol FROM "Usuarios" WHERE id_usuario = $1
        `;
        const liderResult = await db.query(liderCheckQuery, [id_lider]);

        if (liderResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'El ID de usuario proporcionado para líder no existe.' });
        }

        if (liderResult.rows[0].id_rol !== ROLES.LIDER) {
            return res.status(403).json({ mensaje: `El usuario ${liderResult.rows[0].nombre} (Rol ${liderResult.rows[0].id_rol}) no tiene el Rol de Líder (ID ${ROLES.LIDER}).` });
        }

        // 2. Ejecutar la actualización de la Casa de Paz
        const updateQuery = `
            UPDATE "CasasDePaz" SET id_lider = $1
            WHERE id_cdp = $2
            RETURNING nombre_lider_cdp, id_cdp;
        `;

        const updateResult = await db.query(updateQuery, [id_lider, id_cdp]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Casa de Paz no encontrada.' });
        }

        return res.status(200).json({
            mensaje: `El usuario ${liderResult.rows[0].nombre} (ID ${id_lider}) ha sido asignado como líder de la Casa de Paz ID ${id_cdp} exitosamente.`,
            cdp_actualizada: updateResult.rows[0]
        });

    } catch (error) {
        console.error('❌ Error al asignar líder a Casa de Paz:', error);
        return res.status(500).json({
            mensaje: 'Error interno del servidor al asignar el líder.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// LÓGICA DE CREACIÓN DE CdP
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/cdp/crear
 * Permite al Super Admin crear una nueva Casa de Paz.
 */
const createCdP = async (req, res) => {
    // Campos requeridos por el esquema de DB:
    const {
        nombre_lider_cdp,
        id_lider,
        id_lsr,
        id_red,
        direccion,
        latitud,
        longitud,
        dia_reunion,
        hora_reunion,
        referencia
    } = req.body;

    if (!nombre_lider_cdp || !id_lider || !id_lsr || !id_red || !direccion || latitud === undefined || longitud === undefined || !dia_reunion || !hora_reunion) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios para crear la Casa de Paz (nombre, id_lider, id_lsr, id_red, dirección, latitud, longitud, dia_reunion, hora_reunion).' });
    }

    try {
        // 1. Verificar la existencia y rol del Líder (Rol 5)
        const liderCheckQuery = `SELECT nombre, id_rol FROM "Usuarios" WHERE id_usuario = $1`;
        const liderResult = await db.query(liderCheckQuery, [id_lider]);
        if (liderResult.rows.length === 0 || liderResult.rows[0].id_rol !== ROLES.LIDER) {
            return res.status(403).json({ mensaje: 'ID de líder no válido o no tiene el Rol de Líder (ID 5).' });
        }

        // 2. Verificar la existencia y rol del Líder de Subred (Rol 4)
        const lsrCheckQuery = `SELECT nombre, id_rol FROM "Usuarios" WHERE id_usuario = $1`;
        const lsrResult = await db.query(lsrCheckQuery, [id_lsr]);
        if (lsrResult.rows.length === 0 || lsrResult.rows[0].id_rol !== ROLES.LSR) {
            return res.status(403).json({ mensaje: 'ID de Líder de Subred no válido o no tiene el Rol de LSR (ID 4).' });
        }

        // 3. Verificar que la Red exista (Asumimos una tabla "Redes")
        const redCheckQuery = `SELECT 1 FROM "Redes" WHERE id_red = $1`;
        const redResult = await db.query(redCheckQuery, [id_red]);
        if (redResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'ID de Red no existente.' });
        }

        // 4. Insertar la nueva Casa de Paz
        const insertQuery = `
            INSERT INTO "CasasDePaz" (
                nombre_lider_cdp,
                id_lider,
                id_lsr,
                id_red,
                direccion,
                referencia,
                latitud,
                longitud,
                dia_reunion,
                hora_reunion
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id_cdp, nombre_lider_cdp;
        `;

        const values = [
            nombre_lider_cdp,
            id_lider,
            id_lsr,
            id_red,
            direccion,
            referencia || null, // Opcional
            latitud,
            longitud,
            dia_reunion,
            hora_reunion
        ];

        const result = await db.query(insertQuery, values);
        const newCdP = result.rows[0];

        return res.status(201).json({
            mensaje: `Casa de Paz "${newCdP.nombre_lider_cdp}" creada exitosamente.`,
            id_cdp: newCdP.id_cdp
        });

    } catch (error) {
        console.error('❌ Error al crear Casa de Paz:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear la Casa de Paz.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// Roles con permisos para gestión de Redes (Super Admin y Administrador)
// --------------------------------------------------------------------------
const NETWORK_MANAGEMENT_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION
];

// --------------------------------------------------------------------------
// [POST] /api/admin/redes/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/redes/crear
 * Crea una nueva Red (ej. Hombres, Mujeres, Jóvenes).
 */
const createNetwork = async (req, res) => {
    const { nombre_red } = req.body;

    if (!nombre_red) {
        return res.status(400).json({ mensaje: 'El campo nombre_red es obligatorio.' });
    }

    try {
        // Verificar si ya existe una red con ese nombre
        const existingQuery = `SELECT id_red FROM "Redes" WHERE nombre_red = $1`;
        const existingResult = await db.query(existingQuery, [nombre_red]);

        if (existingResult.rows.length > 0) {
            return res.status(409).json({ mensaje: `Ya existe una Red con el nombre '${nombre_red}'.` });
        }

        const insertQuery = `
            INSERT INTO "Redes" (nombre_red)
            VALUES ($1)
            RETURNING id_red;
        `;

        const result = await db.query(insertQuery, [nombre_red]);

        return res.status(201).json({
            mensaje: `Red '${nombre_red}' creada exitosamente.`,
            id_red: result.rows[0].id_red
        });

    } catch (error) {
        console.error('❌ Error al crear Red:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al crear la Red.' });
    }
};

// --------------------------------------------------------------------------
// [PUT] /api/admin/redes/:id_red
// --------------------------------------------------------------------------

/**
 * [PUT] /api/admin/redes/:id_red
 * Actualiza el nombre de una Red.
 */
const updateNetwork = async (req, res) => {
    const { id_red } = req.params;
    const { nombre_red } = req.body;
    const networkId = parseInt(id_red);

    if (isNaN(networkId) || !nombre_red) {
        return res.status(400).json({ mensaje: 'ID de Red inválido o nombre_red faltante.' });
    }

    try {
        const updateQuery = `
            UPDATE "Redes"
            SET nombre_red = $1
            WHERE id_red = $2
            RETURNING nombre_red;
        `;

        const result = await db.query(updateQuery, [nombre_red, networkId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Red no encontrada.' });
        }

        return res.status(200).json({
            mensaje: `Red (ID ${networkId}) actualizada a '${result.rows[0].nombre_red}' exitosamente.`,
            id_red: networkId
        });

    } catch (error) {
        // Conflictos por nombre duplicado
        if (error.code === '23505') {
            return res.status(409).json({ mensaje: `Ya existe otra Red con el nombre '${nombre_red}'.` });
        }
        console.error('❌ Error al actualizar Red:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al actualizar la Red.' });
    }
};

// --------------------------------------------------------------------------
// [DELETE] /api/admin/redes/:id_red
// --------------------------------------------------------------------------

/**
 * [DELETE] /api/admin/redes/:id_red
 * Elimina permanentemente una Red.
 */
const deleteNetwork = async (req, res) => {
    const { id_red } = req.params;
    const networkId = parseInt(id_red);

    if (isNaN(networkId)) {
        return res.status(400).json({ mensaje: 'ID de Red inválido.' });
    }

    try {
        // Obtener nombre antes de eliminar (para el mensaje de respuesta)
        const checkQuery = `SELECT nombre_red FROM "Redes" WHERE id_red = $1`;
        const checkResult = await db.query(checkQuery, [networkId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Red no encontrada.' });
        }

        const networkName = checkResult.rows[0].nombre_red;

        const deleteQuery = `
            DELETE FROM "Redes"
            WHERE id_red = $1;
        `;

        await db.query(deleteQuery, [networkId]);

        return res.status(200).json({
            mensaje: `Red '${networkName}' (ID ${networkId}) eliminada permanentemente.`,
        });

    } catch (error) {
        // Si la eliminación falla por una llave foránea (ej. 23503)
        if (error.code === '23503') {
            return res.status(409).json({
                mensaje: 'Conflicto: No se puede eliminar la Red porque tiene Casas de Paz asociadas.',
                solucion: 'Reasigne las Casas de Paz existentes a otra Red antes de eliminar esta.'
            });
        }
        console.error('❌ Error al eliminar Red:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al eliminar la Red.' });
    }
};

// --------------------------------------------------------------------------
// Roles con permisos para gestión de CdP (Super Admin y Administrador)
// --------------------------------------------------------------------------
const CDP_MANAGEMENT_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMINISTRACION
];

// --------------------------------------------------------------------------
// [POST] /api/admin/cdp/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/cdp/crear
 * Crea una nueva Casa de Paz y la asigna a un Líder, LSR y Red.
 */
const createCdp = async (req, res) => {
    const {
        id_lider,
        id_lsr,
        id_red,
        direccion,
        latitud,
        longitud
    } = req.body;

    // 1. Validación de campos obligatorios
    if (!id_lider || !id_lsr || !id_red || !direccion || !latitud || !longitud) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios: id_lider, id_lsr, id_red, direccion, latitud, longitud.' });
    }

    // Convertir IDs a enteros
    const leaderId = parseInt(id_lider);
    const lsrId = parseInt(id_lsr);
    const networkId = parseInt(id_red);

    if (isNaN(leaderId) || isNaN(lsrId) || isNaN(networkId)) {
        return res.status(400).json({ mensaje: 'Los IDs (lider, lsr, red) deben ser números válidos.' });
    }

    try {
        // 2. Verificaciones de existencia y roles

        // A. Verificar que el ID_LIDER sea un Líder (Rol 5) y no esté ya asignado a otra CdP
        const leaderCheckQuery = `
            SELECT nombre, id_rol
            FROM "Usuarios"
            WHERE id_usuario = $1
        `;
        const leaderResult = await db.query(leaderCheckQuery, [leaderId]);

        if (leaderResult.rows.length === 0 || leaderResult.rows[0].id_rol !== ROLES.LIDER) {
            return res.status(400).json({ mensaje: 'ID_LIDER inválido o el usuario no tiene el rol de Líder de Casa de Paz.' });
        }
        const leaderName = leaderResult.rows[0].nombre;

        const existingCdpQuery = `
            SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $1
        `;
        const existingCdpResult = await db.query(existingCdpQuery, [leaderId]);
        if (existingCdpResult.rows.length > 0) {
            return res.status(409).json({ mensaje: `El usuario '${leaderName}' ya es Líder de la CdP ${existingCdpResult.rows[0].id_cdp}.` });
        }

        // B. Verificar que el ID_LSR sea un LSR (Rol 4)
        const lsrCheckQuery = `
            SELECT id_rol
            FROM "Usuarios"
            WHERE id_usuario = $1
        `;
        const lsrResult = await db.query(lsrCheckQuery, [lsrId]);
        if (lsrResult.rows.length === 0 || lsrResult.rows[0].id_rol !== ROLES.LSR) {
            return res.status(400).json({ mensaje: 'ID_LSR inválido o el usuario no tiene el rol de Líder de Subred.' });
        }

        // C. Verificar que la Red exista
        const networkCheckQuery = `
            SELECT nombre_red
            FROM "Redes"
            WHERE id_red = $1
        `;
        const networkResult = await db.query(networkCheckQuery, [networkId]);
        if (networkResult.rows.length === 0) {
            return res.status(400).json({ mensaje: 'ID_RED inválido o la Red no existe.' });
        }

        // 3. Inserción de la nueva Casa de Paz
        const cdpName = `CdP ${leaderName}`; // Nombre por defecto

        const insertQuery = `
            INSERT INTO "CasasDePaz" (
                id_lider, id_lsr, id_red, nombre_lider_cdp,
                direccion, latitud, longitud
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id_cdp;
        `;

        const values = [
            leaderId, lsrId, networkId, cdpName,
            direccion, parseFloat(latitud), parseFloat(longitud)
        ];

        const result = await db.query(insertQuery, values);
        const newCdpId = result.rows[0].id_cdp;

        return res.status(201).json({
            mensaje: `Casa de Paz '${cdpName}' creada y asignada exitosamente.`,
            id_cdp: newCdpId,
            id_lider: leaderId,
            id_lsr: lsrId,
            id_red: networkId
        });

    } catch (error) {
        console.error('❌ Error al crear Casa de Paz:', error);
        return res.status(500).json({
            mensaje: 'Error interno del servidor al crear la Casa de Paz.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [PUT] /api/admin/cdp/:id_cdp
// --------------------------------------------------------------------------

/**
 * [PUT] /api/admin/cdp/:id_cdp
 * Actualiza los detalles o asignaciones de una Casa de Paz.
 */
const updateCdp = async (req, res) => {
    const { id_cdp } = req.params;
    const updates = req.body;
    const cdpId = parseInt(id_cdp);

    if (isNaN(cdpId) || Object.keys(updates).length === 0) {
        return res.status(400).json({ mensaje: 'ID de Casa de Paz inválido o no se proporcionaron campos.' });
    }

    try {
        // Validación de reasignación de Líder
        if (updates.id_lider) {
            const newLeaderId = parseInt(updates.id_lider);
            if (isNaN(newLeaderId)) {
                return res.status(400).json({ mensaje: 'ID de Líder inválido para la actualización.' });
            }
            // 1. Verificar que el nuevo líder tenga el Rol 5
            const leaderCheckQuery = `SELECT id_rol FROM "Usuarios" WHERE id_usuario = $1`;
            const leaderResult = await db.query(leaderCheckQuery, [newLeaderId]);
            if (leaderResult.rows.length === 0 || leaderResult.rows[0].id_rol !== ROLES.LIDER) {
                return res.status(400).json({ mensaje: 'El nuevo ID_LIDER no tiene el rol de Líder de Casa de Paz.' });
            }
            // 2. Verificar que el nuevo líder no esté ya asignado a OTRA CdP
            const existingCdpQuery = `SELECT id_cdp FROM "CasasDePaz" WHERE id_lider = $1 AND id_cdp != $2`;
            const existingCdpResult = await db.query(existingCdpQuery, [newLeaderId, cdpId]);
            if (existingCdpResult.rows.length > 0) {
                return res.status(409).json({ mensaje: `El usuario (ID ${newLeaderId}) ya es Líder de la CdP ${existingCdpResult.rows[0].id_cdp}.` });
            }
        }

        // Validación de reasignación de LSR
        if (updates.id_lsr) {
            const newLsrId = parseInt(updates.id_lsr);
            // Verificar que el nuevo LSR tenga el Rol 4
            const lsrCheckQuery = `SELECT id_rol FROM "Usuarios" WHERE id_usuario = $1`;
            const lsrResult = await db.query(lsrCheckQuery, [newLsrId]);
            if (lsrResult.rows.length === 0 || lsrResult.rows[0].id_rol !== ROLES.LSR) {
                return res.status(400).json({ mensaje: 'El nuevo ID_LSR no tiene el rol de Líder de Subred.' });
            }
        }

        // Validación de reasignación de Red
        if (updates.id_red) {
            const newNetworkId = parseInt(updates.id_red);
            // Verificar que la Red exista
            const networkCheckQuery = `SELECT id_red FROM "Redes" WHERE id_red = $1`;
            const networkResult = await db.query(networkCheckQuery, [newNetworkId]);
            if (networkResult.rows.length === 0) {
                return res.status(400).json({ mensaje: 'ID_RED inválido o la Red no existe.' });
            }
        }

        // 4. Construcción de la consulta de actualización dinámica
        const setClauses = [];
        const updateValues = [];
        let index = 1;

        for (const key in updates) {
            if (key !== 'id_cdp' && updates.hasOwnProperty(key)) {
                // Conversión de tipo para latitud/longitud
                let value = updates[key];
                if (key === 'latitud' || key === 'longitud') {
                    value = parseFloat(value);
                }

                setClauses.push(`${key} = $${index}`);
                updateValues.push(value);
                index++;
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ mensaje: 'No hay campos válidos para actualizar.' });
        }
        
        updateValues.push(cdpId); // El último valor es el ID de la CdP
        
        const updateQuery = `
            UPDATE "CasasDePaz" 
            SET ${setClauses.join(', ')} 
            WHERE id_cdp = $${index}
            RETURNING nombre_lider_cdp;
        `;
        
        const updateResult = await db.query(updateQuery, updateValues);
        
        if (updateResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Casa de Paz no encontrada para actualizar.' });
        }
        
        return res.status(200).json({
            mensaje: `Casa de Paz '${updateResult.rows[0].nombre_lider_cdp}' (ID ${cdpId}) actualizada exitosamente.`,
            id_cdp: cdpId
        });

    } catch (error) {
        console.error('❌ Error al actualizar Casa de Paz:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al actualizar la Casa de Paz.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [DELETE] /api/admin/cdp/:id_cdp
// --------------------------------------------------------------------------

/**
 * [DELETE] /api/admin/cdp/:id_cdp
 * Elimina permanentemente una Casa de Paz.
 */
const deleteCdp = async (req, res) => {
    const { id_cdp } = req.params;
    const cdpId = parseInt(id_cdp);

    if (isNaN(cdpId)) {
        return res.status(400).json({ mensaje: 'ID de Casa de Paz inválido.' });
    }

    try {
        // Obtener nombre antes de eliminar
        const checkQuery = `SELECT nombre_lider_cdp FROM "CasasDePaz" WHERE id_cdp = $1`;
        const checkResult = await db.query(checkQuery, [cdpId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Casa de Paz no encontrada.' });
        }
        
        const cdpName = checkResult.rows[0].nombre_lider_cdp;

        const deleteQuery = `
            DELETE FROM "CasasDePaz" 
            WHERE id_cdp = $1;
        `;
        
        await db.query(deleteQuery, [cdpId]);

        return res.status(200).json({
            mensaje: `Casa de Paz '${cdpName}' (ID ${cdpId}) eliminada permanentemente.`,
        });

    } catch (error) {
        // Si la eliminación falla por una llave foránea (ej. 23503)
        if (error.code === '23503') { 
             return res.status(409).json({ 
                mensaje: 'Conflicto: No se puede eliminar la Casa de Paz porque tiene registros dependientes (Miembros o Reportes de CdP).',
                solucion: 'Reasigne a todos los Miembros a otra CdP y elimine los Reportes de CdP/Asistencias asociados antes de eliminar esta Casa de Paz.'
            });
        }
        console.error('❌ Error al eliminar Casa de Paz:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al eliminar la Casa de Paz.' });
    }
};


// --------------------------------------------------------------------------
// Roles con permisos para gestión de Miembros (Super Admin, Administrador, LSR)
// --------------------------------------------------------------------------
const MIEMBRO_MANAGEMENT_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION,
    ROLES.LSR // Líder de Subred puede crear miembros
];


// --------------------------------------------------------------------------
// [POST] /api/admin/miembro/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/miembro/crear
 * Crea un registro de Miembro en la tabla "Miembros" con todos sus datos personales.
 */
const createMiembro = async (req, res) => {
    // Campos requeridos según tu esquema
    const {
        nombre,
        telefono,
        direccion,
        referencia,
        sexo,
        fecha_nacimiento,
        fecha_conversion,
        fecha_bautizo,
        fecha_boda,
        estado,
        id_cdp
    } = req.body;
    
    // 1. Validación de campos obligatorios
    if (!nombre || !id_cdp || !fecha_nacimiento) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios: nombre, id_cdp, fecha_nacimiento.' });
    }
    
    const cdpId = parseInt(id_cdp);
    if (isNaN(cdpId)) {
        return res.status(400).json({ mensaje: 'El ID de la Casa de Paz debe ser un número válido.' });
    }
    
    try {
        // 2. Verificar si la CdP existe
        const cdpCheckQuery = `
            SELECT nombre_lider_cdp 
            FROM "CasasDePaz" 
            WHERE id_cdp = $1
        `;
        const cdpResult = await db.query(cdpCheckQuery, [cdpId]);

        if (cdpResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'ID_CDP inválido: La Casa de Paz especificada no existe.' });
        }
        
        // 3. Inserción directa en la tabla "Miembros"
        const insertMiembroQuery = `
            INSERT INTO "Miembros" (
                id_cdp, nombre, telefono, direccion, referencia, sexo, 
                fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda, estado
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id_miembro;
        `;
        
        const values = [
            cdpId, 
            nombre, 
            telefono || null, 
            direccion || null, 
            referencia || null, 
            sexo || null, 
            fecha_nacimiento, // Obligatorio
            fecha_conversion || null, 
            fecha_bautizo || null, 
            fecha_boda || null, 
            estado || 'Activo' // Por defecto 'Activo' si no se envía
        ];

        const result = await db.query(insertMiembroQuery, values);
        const newMemberId = result.rows[0].id_miembro;

        return res.status(201).json({
            mensaje: `Miembro '${nombre}' creado y asignado a CdP ${cdpId} exitosamente.`,
            id_miembro: newMemberId,
        });

    } catch (error) {
        console.error('❌ Error al crear Miembro:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear el Miembro.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/admin/miembro/fase
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/miembro/fase
 * Registra o actualiza la fecha de aprobación de un miembro en una fase de la visión.
 * Solo para Administradores y Super Admins.
 */
const updateMemberPhase = async (req, res) => {
    const { 
        id_miembro, 
        id_fase, 
        fecha_aprobacion // Opcional: si no se envía, usa la fecha actual
    } = req.body;
    
    const requesterRole = req.user.id_rol;

    // 1. Validación de Rol (Ya está manejada por el middleware, pero la reconfirmamos si es necesario)
    if (requesterRole !== ROLES.ADMINISTRACION && requesterRole !== ROLES.SUPER_ADMIN) {
        return res.status(403).json({ mensaje: 'Acceso prohibido. Solo roles de Administración pueden modificar las fases del miembro.' });
    }

    // 2. Validación de campos
    if (!id_miembro || !id_fase) {
        return res.status(400).json({ mensaje: 'ID de Miembro e ID de Fase son obligatorios.' });
    }

    const memberId = parseInt(id_miembro);
    const faseId = parseInt(id_fase);
    const approvedDate = fecha_aprobacion || new Date().toISOString().split('T')[0]; // Usa fecha actual si no se provee
    
    try {
        // Opcional: Verificar que la fase y el miembro existan (no implementado aquí para mantener el foco en el upsert)

        // 3. Inserción/Actualización (UPSERT) en MiembroFase
        // Usamos ON CONFLICT para manejar si el miembro ya tiene registrada esa fase (solo actualiza la fecha)
        const query = `
            INSERT INTO "MiembroFase" (id_miembro, id_fase, fecha_aprobacion)
            VALUES ($1, $2, $3)
            ON CONFLICT (id_miembro, id_fase) DO UPDATE
            SET fecha_aprobacion = EXCLUDED.fecha_aprobacion
            RETURNING id_miembro, id_fase;
        `;

        const result = await db.query(query, [memberId, faseId, approvedDate]);
        
        return res.status(201).json({
            mensaje: `Fase ${faseId} (Visión) registrada/actualizada para el Miembro ID ${memberId} con fecha ${approvedDate}.`,
            id_miembro: result.rows[0].id_miembro,
            id_fase: result.rows[0].id_fase
        });

    } catch (error) {
        // Error de clave foránea, p. ej. si id_miembro o id_fase no existen
        if (error.code === '23503') { 
            return res.status(404).json({ mensaje: 'El Miembro o la Fase de Visión especificada no existe.' });
        }
        console.error('❌ Error al actualizar la fase del miembro:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al procesar la fase del miembro.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/admin/redes
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/redes
 * Crea una nueva Red en el sistema. Exclusivo para Super Admin.
 */
const createRed = async (req, res) => {
    const { nombre_red } = req.body;
    
    // Asumimos que la validación de rol (Solo Super Admin) se hace en el middleware.

    if (!nombre_red) {
        return res.status(400).json({ mensaje: 'El nombre de la Red es obligatorio.' });
    }

    try {
        const query = `
            INSERT INTO "Redes" (nombre_red)
            VALUES ($1)
            RETURNING id_red, nombre_red;
        `;
        
        const result = await db.query(query, [nombre_red]);

        return res.status(201).json({
            mensaje: 'Red creada exitosamente.',
            red: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error al crear la Red:', error);
        // Si el error es de violación de unicidad o similar, podrías manejarlo aquí.
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear la Red.',
            error: error.message 
        });
    }
};


// --------------------------------------------------------------------------
// [GET] /api/admin/redes
// --------------------------------------------------------------------------

/**
 * [GET] /api/admin/redes
 * Lista todas las Redes existentes. Exclusivo para Super Admin.
 */
const getAllRedes = async (req, res) => {
    try {
        // Contar las CdPs asignadas a cada Red
        const query = `
            SELECT 
                r.id_red, 
                r.nombre_red,
                COUNT(cdp.id_cdp) AS total_cdp
            FROM "Redes" r
            LEFT JOIN "CasasDePaz" cdp ON r.id_red = cdp.id_red
            GROUP BY r.id_red, r.nombre_red
            ORDER BY r.id_red;
        `;
        
        const result = await db.query(query);

        return res.status(200).json({
            mensaje: `Listado de ${result.rows.length} Redes.`,
            redes: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener Redes:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener las Redes.',
            error: error.message 
        });
    }
};

// --------------------------------------------------------------------------
// [PUT] /api/admin/redes/:id_red
// --------------------------------------------------------------------------

/**
 * [PUT] /api/admin/redes/:id_red
 * Actualiza el nombre de una Red. Exclusivo para Super Admin.
 */
const updateRed = async (req, res) => {
    const id_red = parseInt(req.params.id_red);
    const { nombre_red } = req.body;

    if (isNaN(id_red) || !nombre_red) {
        return res.status(400).json({ mensaje: 'ID de Red y nuevo nombre son obligatorios.' });
    }

    try {
        const query = `
            UPDATE "Redes"
            SET nombre_red = $1
            WHERE id_red = $2
            RETURNING id_red, nombre_red;
        `;
        
        const result = await db.query(query, [nombre_red, id_red]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Red no encontrada.' });
        }

        return res.status(200).json({
            mensaje: 'Red actualizada exitosamente.',
            red: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error al actualizar la Red:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al actualizar la Red.',
            error: error.message 
        });
    }
};

// --------------------------------------------------------------------------
// [POST] /api/admin/lsr/rol
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/lsr/rol
 * Promueve o degrada un Usuario a Líder de Subred (Rol 4). Exclusivo para Super Admin.
 */
const manageLsrRole = async (req, res) => {
    const { id_usuario, action } = req.body; // action: 'promote' o 'demote'
    const LSR_ROLE_ID = 4;
    const MIEMBRO_ROLE_ID = 6; // Rol base si se degrada

    if (!id_usuario || !action || !['promote', 'demote'].includes(action)) {
        return res.status(400).json({ mensaje: 'ID de usuario y acción (promote/demote) son obligatorios.' });
    }

    const new_role = action === 'promote' ? LSR_ROLE_ID : MIEMBRO_ROLE_ID;

    try {
        const query = `
            UPDATE "Usuarios"
            SET id_rol = $1
            WHERE id_usuario = $2
            RETURNING id_usuario, nombre, id_rol;
        `;
        
        const result = await db.query(query, [new_role, id_usuario]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
        }

        const action_msg = action === 'promote' ? 'promovido a LSR' : 'degradado';

        return res.status(200).json({
            mensaje: `Usuario ${result.rows[0].nombre} ${action_msg} exitosamente.`,
            usuario: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error al gestionar rol de LSR:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al gestionar el rol.',
            error: error.message 
        });
    }
};


// --------------------------------------------------------------------------
// [GET] /api/admin/lsr/todos
// --------------------------------------------------------------------------

/**
 * [GET] /api/admin/lsr/todos
 * Lista todos los Líderes de Subred (Rol 4) con las Redes y número de CdPs que supervisan.
 * (La supervisión de Redes es implícita a través de la asignación de CdPs en la tabla CasasDePaz).
 */

const getAllLsrs = async (req, res) => {
    const LSR_ROLE_ID = 4;
    // 💡 SOLUCIÓN: Declarar la variable aquí, fuera del bloque IF
    let loneLsrs = { rows: [] }; 

    try {
        const query = `
            SELECT 
                u.id_usuario AS id_lsr,
                u.nombre AS nombre_lsr,
                r.nombre_red,
                r.id_red,
                -- Contar CdPs en esa Red que este LSR tiene asignadas
                (
                    SELECT COUNT(cdp.id_cdp)
                    FROM "CasasDePaz" cdp
                    WHERE cdp.id_lsr = u.id_usuario AND cdp.id_red = r.id_red
                ) AS total_cdp_supervisadas_en_red
            FROM "Usuarios" u
            JOIN "CasasDePaz" cdp ON u.id_usuario = cdp.id_lsr 
            JOIN "Redes" r ON cdp.id_red = r.id_red
            WHERE u.id_rol = $1
            GROUP BY u.id_usuario, u.nombre, r.nombre_red, r.id_red
            ORDER BY u.nombre, r.nombre_red;
        `;
        
        const result = await db.query(query, [LSR_ROLE_ID]);

        if (result.rows.length === 0) {
            // Caso especial: LSRs que existen (Rol 4) pero aún no tienen CdPs asignadas.
            // Sobrescribimos loneLsrs con los datos obtenidos.
            loneLsrs = await db.query(`
                SELECT id_usuario AS id_lsr, nombre AS nombre_lsr
                FROM "Usuarios"
                WHERE id_rol = $1 AND id_usuario NOT IN (SELECT DISTINCT id_lsr FROM "CasasDePaz" WHERE id_lsr IS NOT NULL)
            `, [LSR_ROLE_ID]);
            
            // Si no hay LSRs con CdP y tampoco sin CdP, retornamos 404
            if (loneLsrs.rows.length === 0) {
                return res.status(404).json({ mensaje: 'No se encontraron Líderes de Subred (LSR).' });
            }

            // Si solo hay LSRs sin CdP, retornamos el formato consolidado simplificado y salimos
            const lsrsWithoutCdp = loneLsrs.rows.map(lsr => ({
                id_lsr: lsr.id_lsr,
                nombre_lsr: lsr.nombre_lsr,
                redes_supervisadas: [],
                total_cdp_global: 0
            }));
            return res.status(200).json({
                mensaje: `Listado de Líderes de Subred (${lsrsWithoutCdp.length} LSRs encontrados sin CdP).`,
                lsrs: lsrsWithoutCdp
            });
        }

        // --- Post-procesamiento: Agrupar por LSR (id_lsr) ---
        const lsrsConsolidated = result.rows.reduce((acc, row) => {
            if (!acc[row.id_lsr]) {
                acc[row.id_lsr] = {
                    id_lsr: row.id_lsr,
                    nombre_lsr: row.nombre_lsr,
                    redes_supervisadas: [],
                    total_cdp_global: 0
                };
            }

            const cdp_count = parseInt(row.total_cdp_supervisadas_en_red || 0);

            acc[row.id_lsr].redes_supervisadas.push({
                id_red: row.id_red,
                nombre_red: row.nombre_red,
                total_cdp: cdp_count
            });
            
            acc[row.id_lsr].total_cdp_global += cdp_count; 
            
            return acc;
        }, {});
        
        // Agregar LSRs que existen pero no tienen CdPs asignadas (si es que se consultaron)
        if (loneLsrs.rows.length > 0) { // Ahora podemos acceder a loneLsrs
            loneLsrs.rows.forEach(lsr => {
                if (!lsrsConsolidated[lsr.id_lsr]) {
                    lsrsConsolidated[lsr.id_lsr] = {
                        id_lsr: lsr.id_lsr,
                        nombre_lsr: lsr.nombre_lsr,
                        redes_supervisadas: [],
                        total_cdp_global: 0
                    };
                }
            });
        }


        return res.status(200).json({
            mensaje: `Listado de Líderes de Subred (${Object.keys(lsrsConsolidated).length} LSRs encontrados).`,
            lsrs: Object.values(lsrsConsolidated)
        });

    } catch (error) {
        console.error('❌ Error al obtener LSRs:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al obtener la lista de LSRs.',
            error: error.message 
        });
    }
};

module.exports = {
    getAllMiembros,
    getAllCasasDePaz,
    assignLiderToCdP,
    createCdP,
    createNetwork,
    updateNetwork,
    deleteNetwork,
    createCdp,
    updateCdp,
    deleteCdp,
    createMiembro,
    updateMemberPhase,
    createRed,
    getAllRedes,
    updateRed,
    manageLsrRole,
    getAllLsrs
};

