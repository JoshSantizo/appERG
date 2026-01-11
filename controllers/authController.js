const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const login = async (req, res) => {
    const { nombre, contraseña } = req.body;

    if (!nombre || !contraseña) {
        console.log('🔴 Log 1: Faltan credenciales.');
        return res.status(400).json({ mensaje: 'Debe proporcionar el nombre de usuario y la contraseña.' });
    }

    try {
        console.log(`🟡 Log 2: Buscando usuario: ${nombre}`);

        const userQuery = `
            SELECT
                u.id_usuario,
                u.id_rol,
                u.nombre,
                u.contraseña_hash,
                u.estado,
                r.nombre_rol
            FROM "Usuarios" u
            JOIN "Roles" r ON u.id_rol = r.id_rol
            WHERE u.nombre = $1;
        `;
        const result = await db.query(userQuery, [nombre]);

        console.log('🟢 Log 3: Consulta a DB finalizada.');

        if (result.rows.length === 0) {
            console.log('🔴 Log 4: Usuario no encontrado.');
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        const user = result.rows[0];

        if (user.estado === false) {
            console.log('🔴 Log 4b: Usuario inactivo.');
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacte al Super Admin.' });
        }

        console.log('🟢 Log 5: Usuario encontrado, verificando contraseña.');

        let isMatch = false;

        // LÓGICA DE COMPARACIÓN DE CONTRASEÑA (Soporta texto plano y hash)
        if (user.contraseña_hash.length < 60) {
            isMatch = (contraseña === user.contraseña_hash);
        } else {
            isMatch = await bcrypt.compare(contraseña, user.contraseña_hash);
        }

        if (!isMatch) {
            console.log('🔴 Log 6: Contraseña incorrecta.');
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        console.log('🟢 Log 7: Contraseña correcta, generando JWT.');

        const tokenPayload = {
            id: user.id_usuario,
            nombre: user.nombre,
            rol: user.nombre_rol,
            id_rol: user.id_rol
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, {
            expiresIn: '8h'
        });

        console.log('🟢 Log 8: Login exitoso. Enviando respuesta.');

        return res.status(200).json({
            mensaje: 'Inicio de sesión exitoso.',
            token,
            usuario: {
                id: user.id_usuario,
                nombre: user.nombre,
                rol: user.nombre_rol
            }
        });

    } catch (error) {
        console.error('❌ Log 9: Error FATAL en el servidor (catch block).', error);
        return res.status(500).json({
            mensaje: 'Error interno del servidor durante la autenticación.',
            error: error.message
        });
    }
};

/**
 * Función para que cualquier usuario cambie su propia contraseña desde Configuración
 */
const updatePassword = async (req, res) => {
    const idUsuario = req.user.id; // Obtenido del token decodificado
    const { passwordActual, nuevaPassword, confirmarPassword } = req.body;

    // Validaciones básicas de campos vacíos y coincidencia
    if (!passwordActual || !nuevaPassword || !confirmarPassword) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }

    if (nuevaPassword !== confirmarPassword) {
        return res.status(400).json({ mensaje: 'La nueva contraseña y la confirmación no coinciden.' });
    }

    try {
        // 1. Obtener la contraseña actual de la DB
        const userQuery = `SELECT contraseña_hash FROM "Usuarios" WHERE id_usuario = $1`;
        const result = await db.query(userQuery, [idUsuario]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
        }

        const contraseñaHashDB = result.rows[0].contraseña_hash;

        // 2. Verificar si la contraseña actual es correcta (usando tu misma lógica del login)
        let isMatch = false;
        if (contraseñaHashDB.length < 60) {
            isMatch = (passwordActual === contraseñaHashDB);
        } else {
            isMatch = await bcrypt.compare(passwordActual, contraseñaHashDB);
        }

        if (!isMatch) {
            return res.status(401).json({ mensaje: 'La contraseña actual es incorrecta.' });
        }

        // 3. Generar nuevo Hash para la nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const nuevoHash = await bcrypt.hash(nuevaPassword, salt);

        // 4. Actualizar en la base de datos
        await db.query(
            'UPDATE "Usuarios" SET contraseña_hash = $1 WHERE id_usuario = $2',
            [nuevoHash, idUsuario]
        );

        return res.status(200).json({ mensaje: 'Contraseña actualizada con éxito.' });

    } catch (error) {
        console.error('❌ Error al cambiar contraseña:', error);
        return res.status(500).json({ 
            mensaje: 'Error interno al procesar el cambio de contraseña.',
            error: error.message 
        });
    }
};

module.exports = {
    login,
    updatePassword 
};