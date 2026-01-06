const db = require('../config/db');
const ROLES = require('../constants/roles');

// --------------------------------------------------------------------------
// Roles con permisos para crear y gestionar miembros
// --------------------------------------------------------------------------
const MEMBER_MANAGEMENT_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION, 
    ROLES.LSR, 
    ROLES.LIDER
];

// --------------------------------------------------------------------------
// [POST] /api/miembros/crear
// --------------------------------------------------------------------------

/**
 * [POST] /api/miembros/crear
 * Crea un nuevo miembro en una Casa de Paz.
 */
const createMember = async (req, res) => {
    const { 
        nombre, 
        telefono, 
        direccion, 
        sexo, 
        estado, 
        id_cdp,
        fecha_nacimiento,
        fecha_conversion,
        fecha_bautizo,
        fecha_boda 
    } = req.body;

    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    const cdpId = parseInt(id_cdp);

    // 1. Validación de campos obligatorios
    if (!nombre || !telefono || !id_cdp || !estado || !fecha_nacimiento) {
    return res.status(400).json({ mensaje: 'Campos obligatorios faltantes: nombre, telefono, id_cdp, estado, fecha_nacimiento.' });
    }

    if (isNaN(cdpId)) {
        return res.status(400).json({ mensaje: 'ID de Casa de Paz inválido.' });
    }

    try {
        // 2. Verificación de Permisos Jerárquicos
        // Validar si el solicitante tiene permiso para crear un miembro en ESTA CdP.
        let permissionGranted = false;

        const cdpQuery = `SELECT id_lider, id_lsr FROM "CasasDePaz" WHERE id_cdp = $1`;
        const cdpResult = await db.query(cdpQuery, [cdpId]);

        if (cdpResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Casa de Paz de destino no encontrada.' });
        }
        
        const cdpInfo = cdpResult.rows[0];
        
        // Roles Superiores (Admin, Super Admin)
        if (requesterRole === ROLES.SUPER_ADMIN || requesterRole === ROLES.ADMINISTRACION) {
            permissionGranted = true;
        } 
        // Líder (solo puede crear miembros en su propia CdP)
        else if (requesterRole === ROLES.LIDER && cdpInfo.id_lider == requesterId) {
            permissionGranted = true;
        } 
        // LSR (solo puede crear miembros en CdP de su subred)
        else if (requesterRole === ROLES.LSR && cdpInfo.id_lsr == requesterId) {
            permissionGranted = true;
        }

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para crear miembros en esta Casa de Paz.' });
        }

        // 3. Inserción del nuevo Miembro
        const insertQuery = `
            INSERT INTO "Miembros" (
                nombre, telefono, direccion, sexo, estado, id_cdp, 
                fecha_nacimiento, fecha_conversion, fecha_bautizo, fecha_boda
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id_miembro;
        `;
        
        const values = [
            nombre, 
            telefono, 
            direccion || null, 
            sexo || null, 
            estado, 
            cdpId, 
            fecha_nacimiento || null, 
            fecha_conversion || null, 
            fecha_bautizo || null, 
            fecha_boda || null
        ];

        const result = await db.query(insertQuery, values);
        const newMemberId = result.rows[0].id_miembro;

        return res.status(201).json({
            mensaje: `Miembro '${nombre}' creado exitosamente en la CdP ${cdpId}.`,
            id_miembro: newMemberId
        });

    } catch (error) {
        console.error('❌ Error al crear nuevo miembro:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al crear el miembro.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [GET] /api/miembros/:id_miembro
// --------------------------------------------------------------------------

/**
 * [GET] /api/miembros/:id_miembro
 * Obtiene los detalles de un miembro específico, aplicando validación jerárquica.
 */
const getMemberById = async (req, res) => {
    const { id_miembro } = req.params;
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    const memberId = parseInt(id_miembro);

    if (isNaN(memberId)) {
        return res.status(400).json({ mensaje: 'ID de Miembro inválido.' });
    }

    try {
        // 1. Consulta del Miembro y su Jerarquía (CdP, LSR)
        const memberQuery = `
            SELECT 
                m.*,
                cdp.nombre_lider_cdp AS nombre_cdp,
                cdp.id_lider,
                cdp.id_lsr
            FROM "Miembros" m
            JOIN "CasasDePaz" cdp ON m.id_cdp = cdp.id_cdp
            WHERE m.id_miembro = $1;
        `;
        const result = await db.query(memberQuery, [memberId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Miembro no encontrado.' });
        }
        
        const memberData = result.rows[0];
        
        // 2. Verificación de Permisos
        let permissionGranted = false;

        // Roles Superiores (Admin, Super Admin)
        if (requesterRole === ROLES.SUPER_ADMIN || requesterRole === ROLES.ADMINISTRACION) {
            permissionGranted = true;
        } 
        // Líder (solo puede ver miembros de su CdP)
        else if (requesterRole === ROLES.LIDER && memberData.id_lider == requesterId) {
            permissionGranted = true;
        } 
        // LSR (solo puede ver miembros de su subred)
        else if (requesterRole === ROLES.LSR && memberData.id_lsr == requesterId) {
            permissionGranted = true;
        }

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para consultar este miembro.' });
        }

        // 3. Devolver datos (limpiamos campos de jerarquía para el cliente)
        delete memberData.id_lider;
        delete memberData.id_lsr;

        return res.status(200).json({
            mensaje: `Detalles del miembro ${memberData.nombre} consultados exitosamente.`,
            miembro: memberData
        });

    } catch (error) {
        console.error('❌ Error al obtener miembro por ID:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar el miembro.' });
    }
};

// --------------------------------------------------------------------------
// [PUT] /api/miembros/:id_miembro
// --------------------------------------------------------------------------

/**
 * [PUT] /api/miembros/:id_miembro
 * Actualiza los detalles de un miembro existente.
 */
const updateMember = async (req, res) => {
    const { id_miembro } = req.params;
    const updates = req.body;
    const requesterId = parseInt(req.user.id);
    const requesterRole = req.user.id_rol;
    
    const memberId = parseInt(id_miembro);

    if (isNaN(memberId)) {
        return res.status(400).json({ mensaje: 'ID de Miembro inválido.' });
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ mensaje: 'No se proporcionaron campos para actualizar.' });
    }

    try {
        // 1. Obtener la Jerarquía actual del Miembro
        const currentMemberQuery = `
        SELECT
            m.id_cdp, -- <--- CORREGIDO: Especificamos que queremos el id_cdp de la tabla Miembros (m)
            cdp.id_lider,
            cdp.id_lsr
        FROM "Miembros" m
        JOIN "CasasDePaz" cdp ON m.id_cdp = cdp.id_cdp
        WHERE m.id_miembro = $1;
        `;

        const currentResult = await db.query(currentMemberQuery, [memberId]);

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Miembro no encontrado.' });
        }
        
        const currentInfo = currentResult.rows[0];
        
        // 2. Verificación de Permisos (Origen)
        let permissionGranted = false;
        
        // Roles Superiores (Admin, Super Admin)
        if (requesterRole === ROLES.SUPER_ADMIN || requesterRole === ROLES.ADMINISTRACION) {
            permissionGranted = true;
        } 
        // Líder (debe ser el líder de la CdP actual)
        else if (requesterRole === ROLES.LIDER && currentInfo.id_lider == requesterId) {
            permissionGranted = true;
        } 
        // LSR (debe ser el LSR de la subred actual)
        else if (requesterRole === ROLES.LSR && currentInfo.id_lsr == requesterId) {
            permissionGranted = true;
        }

        if (!permissionGranted) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. No tiene permisos para modificar este miembro.' });
        }
        
        // 3. Manejo de Reasignación de CdP (id_cdp)
        if (updates.id_cdp !== undefined && updates.id_cdp != currentInfo.id_cdp) {
            const newCdpId = parseInt(updates.id_cdp);
            
            if (isNaN(newCdpId)) {
                return res.status(400).json({ mensaje: 'Nuevo ID de Casa de Paz inválido.' });
            }
            
            // Si el solicitante no es Super Admin/Admin, debe tener permiso en la CdP de destino
            if (requesterRole !== ROLES.SUPER_ADMIN && requesterRole !== ROLES.ADMINISTRACION) {
                const newCdpQuery = `SELECT id_lider, id_lsr FROM "CasasDePaz" WHERE id_cdp = $1`;
                const newCdpResult = await db.query(newCdpQuery, [newCdpId]);

                if (newCdpResult.rows.length === 0) {
                    return res.status(404).json({ mensaje: 'Casa de Paz de destino no encontrada.' });
                }
                const newCdpInfo = newCdpResult.rows[0];

                let reassignmentPermitted = false;
                
                // Líder (solo puede transferir a su CdP si es el líder, pero la lógica de este caso es compleja,
                // por lo que simplificamos: LSR/Admin pueden mover entre sus CdP/subredes)

                // LSR: puede mover miembros entre CdP DENTRO de su subred.
                if (requesterRole === ROLES.LSR && 
                    currentInfo.id_lsr == requesterId && 
                    newCdpInfo.id_lsr == requesterId) {
                    reassignmentPermitted = true;
                }
                
                // Si la reasignación no es permitida (ej. líder moviendo a otra CdP, o LSR moviendo fuera de su subred)
                if (!reassignmentPermitted && requesterRole !== ROLES.LIDER) {
                    return res.status(403).json({ mensaje: 'Acceso prohibido. Solo Super Admin/Admin pueden reasignar miembros entre subredes.' });
                }
                
                // Si es un Líder, solo permitimos cambios de datos, NO reasignación de CdP. 
                // La reasignación debe ser gestionada por el LSR o Admin.
                if (requesterRole === ROLES.LIDER) {
                    return res.status(403).json({ mensaje: 'Acceso prohibido. Los líderes no pueden reasignar miembros a otra Casa de Paz.' });
                }
            }
        }
        
        // 4. Construcción de la consulta de actualización dinámica
        const setClauses = [];
        const updateValues = [];
        let index = 1;

        for (const key in updates) {
            // Previene inyección SQL y la actualización del id_miembro
            if (key !== 'id_miembro' && updates.hasOwnProperty(key)) {
                setClauses.push(`${key} = $${index}`);
                updateValues.push(updates[key] === '' ? null : updates[key]); // Permite limpiar campos
                index++;
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ mensaje: 'No hay campos válidos para actualizar.' });
        }
        
        updateValues.push(memberId); // El último valor es el ID del miembro
        
        const updateQuery = `
            UPDATE "Miembros" 
            SET ${setClauses.join(', ')} 
            WHERE id_miembro = $${index}
            RETURNING nombre;
        `;
        
        const updateResult = await db.query(updateQuery, updateValues);
        
        return res.status(200).json({
            mensaje: `Miembro '${updateResult.rows[0].nombre}' (ID ${memberId}) actualizado exitosamente.`,
            id_miembro: memberId
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
// Roles con permisos para ELIMINAR miembros (estrictos)
// --------------------------------------------------------------------------
const DELETE_MEMBER_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION
];

// --------------------------------------------------------------------------
// [DELETE] /api/miembros/:id_miembro
// --------------------------------------------------------------------------

/**
 * [DELETE] /api/miembros/:id_miembro
 * Elimina permanentemente un miembro (solo Super Admin/Admin).
 */
const deleteMember = async (req, res) => {
    const { id_miembro } = req.params;
    const requesterRole = req.user.id_rol;
    
    const memberId = parseInt(id_miembro);

    if (isNaN(memberId)) {
        return res.status(400).json({ mensaje: 'ID de Miembro inválido.' });
    }

    // 1. Autorización de Rol: Solo Super Admin/Admin pueden eliminar
    if (!DELETE_MEMBER_ROLES.includes(requesterRole)) {
         return res.status(403).json({ mensaje: 'Acceso prohibido. Solo Super Administradores o Administradores pueden eliminar miembros.' });
    }

    try {
        // 2. Comprobar si el miembro existe antes de intentar eliminar
        const checkQuery = `SELECT nombre FROM "Miembros" WHERE id_miembro = $1`;
        const checkResult = await db.query(checkQuery, [memberId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Miembro no encontrado.' });
        }
        
        const memberName = checkResult.rows[0].nombre;

        // 3. Ejecutar la eliminación
        // IMPORTANTE: Esto fallará si existen registros dependientes en AsistenciaCdP (Foreign Key Constraint).
        // En un sistema real, se debería usar 'ON DELETE CASCADE' en la FK, o borrar las dependencias primero.
        // Asumiendo que la DB está configurada para manejar o bloquear la eliminación de datos relacionados:
        const deleteQuery = `
            DELETE FROM "Miembros" 
            WHERE id_miembro = $1;
        `;
        
        await db.query(deleteQuery, [memberId]);

        return res.status(200).json({
            mensaje: `Miembro '${memberName}' (ID ${memberId}) eliminado permanentemente.`,
        });

    } catch (error) {
        // Si la eliminación falla por una llave foránea (ej. 23503)
        if (error.code === '23503') {
             return res.status(409).json({ 
                mensaje: 'Conflicto: No se puede eliminar el miembro porque tiene registros de asistencia asociados.',
                solucion: 'Cambie el estado del miembro a "Inactivo" en su lugar, o contacte al administrador para eliminar los registros dependientes.'
            });
        }
        console.error('❌ Error al eliminar miembro:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al eliminar el miembro.',
            error: error.message
        });
    }
};


module.exports = {
    createMember,
    getMemberById,
    updateMember,
    deleteMember,
};

