const db = require('../config/db');
const bcrypt = require('bcrypt');
const saltRounds = 10; 

// --------------------------------------------------------------------------
// [GET] Listar Todos los Usuarios (Se mantiene igual)
// --------------------------------------------------------------------------

/**
 * [GET] /api/admin/usuarios/todos
 */
const getAllUsuarios = async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id_usuario, 
                u.nombre, 
                r.nombre_rol,
                u.estado,
                u.fecha_creacion,
                c.nombre_lider_cdp AS cdp_asignada
            FROM "Usuarios" u
            JOIN "Roles" r ON u.id_rol = r.id_rol
            LEFT JOIN "CasasDePaz" c ON u.id_usuario = c.id_lider
            ORDER BY u.id_usuario ASC;
        `;
        
        const result = await db.query(query);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No hay usuarios registrados en el sistema.' });
        }

        return res.status(200).json({ 
            mensaje: `Total de ${result.rows.length} usuarios registrados.`,
            usuarios: result.rows
        });

    } catch (error) {
        console.error('❌ Error al obtener todos los usuarios (Admin):', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor al consultar usuarios.' });
    }
};

// --------------------------------------------------------------------------
// [POST] Crear Nuevo Usuario (Se mantiene igual, solo se añade una nota)
// --------------------------------------------------------------------------

/**
 * [POST] /api/admin/usuarios/crear
 */
const createUser = async (req, res) => {
    // Nota: El campo 'estado' en la DB es BOOLEAN
    const { nombre, contraseña, id_rol } = req.body; 
    
    if (!nombre || !contraseña || !id_rol) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios: nombre, contraseña, id_rol.' });
    }

    try {
        const existingUser = await db.query('SELECT 1 FROM "Usuarios" WHERE nombre = $1', [nombre]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ mensaje: 'El nombre de usuario ya está en uso.' });
        }
        
        const hash = await bcrypt.hash(contraseña, saltRounds);

        const insertQuery = `
            INSERT INTO "Usuarios" (nombre, contraseña_hash, id_rol, estado)  
            VALUES ($1, $2, $3, TRUE)  
            RETURNING id_usuario, nombre, id_rol;
        `;
        
        const result = await db.query(insertQuery, [nombre, hash, id_rol]);
        const newUser = result.rows[0];

        return res.status(201).json({
            mensaje: `Usuario ${newUser.nombre} creado exitosamente con Rol ID ${newUser.id_rol}.`,
            usuario_id: newUser.id_usuario,
            nombre_usuario: newUser.nombre
        });

    } catch (error) {
        console.error('❌ Error al crear nuevo usuario (Admin):', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al registrar el usuario.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [PUT] Modificar Usuario (UPDATE)
// --------------------------------------------------------------------------

/**
 * [PUT] /api/admin/usuarios/:id
 * Permite modificar el nombre, id_rol, contraseña y estado (Super Admin).
 */
const updateUser = async (req, res) => {
    const { id: idUsuario } = req.params; 
    const { nombre, contraseña, id_rol, estado } = req.body;

    if (!nombre && !contraseña && !id_rol && estado === undefined) {
        return res.status(400).json({ mensaje: 'Debe proporcionar al menos un campo para actualizar.' });
    }

    try {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        // 1. Manejar el Hashing de Contraseña si se proporciona
        if (contraseña) {
            const hash = await bcrypt.hash(contraseña, saltRounds);
            fields.push(`contraseña_hash = $${paramIndex++}`);
            values.push(hash);
        }
        
        // 2. Añadir otros campos dinámicamente
        if (nombre) { fields.push(`nombre = $${paramIndex++}`); values.push(nombre); }
        if (id_rol) { fields.push(`id_rol = $${paramIndex++}`); values.push(id_rol); }
        
        // El estado es booleano, debe ser TRUE o FALSE
        if (estado !== undefined) { 
            const estadoBool = estado === 'Activo' ? TRUE : FALSE;
            fields.push(`estado = $${paramIndex++}`); 
            values.push(estadoBool); 
        }

        // 3. Ejecutar la actualización
        values.push(idUsuario); // El ID es el último parámetro
        
        const updateQuery = `
            UPDATE "Usuarios" SET ${fields.join(', ')} 
            WHERE id_usuario = $${paramIndex}
            RETURNING id_usuario, nombre, id_rol, estado;
        `;
        
        const result = await db.query(updateQuery, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ mensaje: 'Error al actualizar: Usuario no encontrado.' });
        }

        return res.status(200).json({
            mensaje: `Usuario ${result.rows[0].nombre} (ID ${idUsuario}) actualizado exitosamente.`,
            usuario_actualizado: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error al actualizar usuario (Admin):', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al actualizar el usuario.',
            error: error.message
        });
    }
};

// --------------------------------------------------------------------------
// [DELETE] Desactivación Lógica de Usuario
// --------------------------------------------------------------------------

/**
 * [DELETE] /api/admin/usuarios/:id
 * Desactiva lógicamente al usuario (estado = FALSE) (Super Admin).
 */
const deleteUser = async (req, res) => {
    const { id: idUsuario } = req.params; 
    
    try {
        // 1. No permitir la desactivación del Super Admin principal (ID 1)
        if (parseInt(idUsuario) === 1) {
            return res.status(403).json({ mensaje: 'No está permitido desactivar el usuario Super Admin principal (ID 1).' });
        }

        // 2. Ejecutar la Eliminación Lógica (estado = FALSE)
        const updateQuery = `
            UPDATE "Usuarios" SET estado = FALSE 
            WHERE id_usuario = $1
            RETURNING nombre;
        `;
        
        const result = await db.query(updateQuery, [idUsuario]);

        if (result.rowCount === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado o ya estaba inactivo.' });
        }

        return res.status(200).json({
            mensaje: `Usuario ${result.rows[0].nombre} (ID ${idUsuario}) ha sido marcado como 'Inactivo'.`,
        });

    } catch (error) {
        console.error('❌ Error al desactivar usuario (Admin):', error);
        return res.status(500).json({ 
            mensaje: 'Error interno del servidor al desactivar el usuario.',
            error: error.message
        });
    }
};

module.exports = {
    getAllUsuarios,
    createUser,
    updateUser,
    deleteUser,
};