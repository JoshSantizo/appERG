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

        // --- INICIO DE LÍNEA CRÍTICA (DB) ---
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
        // --- FIN DE LÍNEA CRÍTICA (DB) ---

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

        // --- LÓGICA DE COMPARACIÓN DE CONTRASEÑA ---
        if (user.contraseña_hash.length < 60) {
            isMatch = (contraseña === user.contraseña_hash);
        } else {
            isMatch = await bcrypt.compare(contraseña, user.contraseña_hash);
        }
        // --- FIN LÓGICA DE COMPARACIÓN ---

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

        // 5. Respuesta exitosa
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

module.exports = {
    login,
};