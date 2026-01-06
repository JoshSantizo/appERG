const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para verificar la existencia y validez del token JWT.
 */
const verifyToken = (req, res, next) => {
    // 1. Obtener el token del header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ mensaje: 'Acceso denegado. Token no proporcionado o formato incorrecto.' });
    }

    const token = authHeader.split(' ')[1]; // Extraer el token después de 'Bearer '

    try {
        // 2. Verificar la validez del token usando la clave secreta
        const decoded = jwt.verify(token, JWT_SECRET);

        // 3. Adjuntar el payload del usuario decodificado a la petición (req.user)
        // Esto permite que los controladores sepan quién está haciendo la solicitud
        req.user = decoded;

        next(); // Continuar con el siguiente middleware o controlador
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ mensaje: 'Token expirado.' });
        }
        return res.status(401).json({ mensaje: 'Token inválido.' });
    }
};

/**
 * Middleware para verificar si el usuario tiene uno de los roles requeridos.
 * Uso: authorizeRoles([1, 4]) donde 1 es Super Admin y 4 es Líder de Subred.
 */
const authorizeRoles = (allowedRoles) => {
    return (req, res, next) => {
        // Comprobar si req.user existe (debe venir del middleware verifyToken)
        if (!req.user || !req.user.id_rol) {
            return res.status(403).json({ mensaje: 'Acceso prohibido. Información de rol faltante.' });
        }

        const userRoleId = req.user.id_rol;

        // Comprobar si el id_rol del usuario está en la lista de roles permitidos
        if (allowedRoles.includes(userRoleId)) {
            next(); // El rol es permitido, continuar
        } else {
            // El rol no es permitido para esta ruta
            return res.status(403).json({
                mensaje: 'Acceso prohibido. Rol no autorizado para esta operación.',
                rol_actual: req.user.rol
            });
        }
    };
};

module.exports = {
    verifyToken,
    authorizeRoles
};