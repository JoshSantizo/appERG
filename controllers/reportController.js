const db = require('../config/db');
const ROLES = require('../constants/roles');

// Roles permitidos para crear reportes
const REPORTER_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

const pool = require('../config/db');

const createReporteCompleto = async (req, res) => {
    console.log(">>> Solicitud recibida en createReporteCompleto");
    const client = await pool.connect();
    
    try {
        const { 
            id_lider, ofrendas, diezmos, pactos, primicias, 
            comentarios, metodo_entrega_ofrenda, visitas, asistencia 
        } = req.body;

        await client.query('BEGIN');

        // 1. Insertar Reporte Principal
        const reporteRes = await client.query(
            `INSERT INTO "ReporteCdP" 
            (id_lider, ofrendas, diezmos, pactos, primicias, comentarios, metodo_entrega_ofrenda, fecha_reporte)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE) 
             RETURNING id_reporte_cdp`,
            [id_lider, ofrendas || 0, diezmos || 0, pactos || 0, primicias || 0, comentarios, metodo_entrega_ofrenda]
        );

        const id_reporte = reporteRes.rows[0].id_reporte_cdp;

        // 2. Insertar Visitas (si existen)
        if (visitas && visitas.length > 0) {
            for (const v of visitas) {
                await client.query(
                    `INSERT INTO "VisitasCdP" 
                    (id_reporte_cdp, nombre, telefono, direccion, referencia, nombre_invitador, asiste_otra_iglesia, nombre_otra_iglesia, tipo, decision)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [id_reporte, v.nombre, v.telefono, v.direccion, v.referencia, v.nombre_invitador, v.asiste_otra_iglesia, v.nombre_otra_iglesia, v.tipo, v.decision]
                );
            }
        }

        // 3. Insertar Asistencia (si existe)
        if (asistencia && asistencia.length > 0) {
            for (const a of asistencia) {
                await client.query(
                    `INSERT INTO "AsistenciaCdP" (id_reporte_cdp, id_miembro, asistio)
                     VALUES ($1, $2, $3)`,
                    [id_reporte, a.id_miembro, a.asistio]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ mensaje: "Reporte guardado con éxito", id: id_reporte });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("ERROR EN CONTROLADOR:", error);
        res.status(500).json({ mensaje: "Error al guardar reporte", error: error.message });
    } finally {
        client.release();
    }
};

module.exports = { createReporteCompleto };