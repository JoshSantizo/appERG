const db = require('../config/db');

const getCatalogosFiltros = async (req, res) => {
    try {
        const ministerios = await db.query('SELECT * FROM "Ministerios" ORDER BY nombre_ministerio');
        const fases = await db.query('SELECT * FROM "FasesVision" ORDER BY id_fase');
        const redes = await db.query('SELECT * FROM "Redes" ORDER BY nombre_red');
        
        // Obtener solo usuarios que son líderes (Rol 5) para los filtros
        const lideres = await db.query('SELECT id_usuario, nombre FROM "Usuarios" WHERE id_rol = 5 ORDER BY nombre');
        
        // Obtener solo usuarios que son LSR (Rol 4)
        const lsrs = await db.query('SELECT id_usuario, nombre FROM "Usuarios" WHERE id_rol = 4 ORDER BY nombre');

        res.status(200).json({
            ministerios: ministerios.rows,
            fases: fases.rows,
            redes: redes.rows,
            lideres: lideres.rows,
            lsrs: lsrs.rows
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al cargar catálogos.' });
    }
};

module.exports = { getCatalogosFiltros };