const db = require('../config/db');

const getCatalogosFiltros = async (req, res) => {
    try {
        const ministerios = await db.query('SELECT id_ministerio as id, nombre_ministerio as nombre FROM "Ministerios" ORDER BY nombre_ministerio');
        const fases = await db.query('SELECT id_fase as id, nombre_fase as nombre FROM "FasesVision" ORDER BY id_fase');
        
        // Esta es la clave: Traemos la relación Líder-LSR desde CasasDePaz
        const jerarquia = await db.query(`
            SELECT DISTINCT
                cp.id_cdp,             -- <--- ESTE ES EL CAMPO VITAL QUE FALTABA
                u_lider.id_usuario as id_usuario_lider,
                u_lider.nombre as nombre_lider,
                u_lsr.nombre as nombre_lsr
            FROM "CasasDePaz" cp
            INNER JOIN "Usuarios" u_lider ON cp.id_lider = u_lider.id_usuario
            LEFT JOIN "Usuarios" u_lsr ON cp.id_lsr = u_lsr.id_usuario
            WHERE u_lider.estado = true
            ORDER BY nombre_lsr, nombre_lider
        `);

        res.status(200).json({
            ministerios: ministerios.rows,
            fases: fases.rows,
            jerarquia: jerarquia.rows // Reemplaza a 'lideres' y 'lsrs' sueltos
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al cargar catálogos.' });
    }
};

module.exports = { getCatalogosFiltros };