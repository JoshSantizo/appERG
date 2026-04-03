const db = require('../config/db');
const ROLES = require('../constants/roles');

// Roles permitidos para crear reportes
const REPORTER_ROLES = [
    ROLES.SUPER_ADMIN, 
    ROLES.ADMINISTRACION,
    ROLES.LSR, 
    ROLES.LIDER
];

const createReporteCompleto = async (req, res) => {
    console.log(">>> Solicitud recibida en createReporteCompleto");
    const client = await db.getClient();
    
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

// Agregar esta función al final de reportController.js
const getReportesPorRol = async (req, res) => {
    // Detección flexible de datos del Token
    const id_usuario = req.user?.id_usuario || req.user?.id || req.user?.id_lider;
    const role = req.user?.role || req.user?.id_rol;
    const { mes, anio, id_lider } = req.query;

    const client = await db.getClient();

    try {
        let query = `
            SELECT 
                r.*, 
                u.nombre as nombre_lider,
                lsr.nombre as nombre_sublider,
                cp.nombre_lider_cdp as nombre_casa,
                r.metodo_entrega_ofrenda,
                -- 1. Total Financiero (Suma de los 4 campos)
                (COALESCE(r.ofrendas,0) + COALESCE(r.diezmos,0) + COALESCE(r.pactos,0) + COALESCE(r.primicias,0)) as total_general,
                -- 2. Conteo de Asistencia de Miembros
                (SELECT COUNT(*) FROM "AsistenciaCdP" a WHERE a.id_reporte_cdp = r.id_reporte_cdp AND a.asistio = true) as total_asistentes,
                -- 3. Conteo de Decisiones en Visitas
                (SELECT COUNT(*) FROM "VisitasCdP" v WHERE v.id_reporte_cdp = r.id_reporte_cdp AND v.decision = 'Convertido') as total_convertidos,
                (SELECT COUNT(*) FROM "VisitasCdP" v WHERE v.id_reporte_cdp = r.id_reporte_cdp AND v.decision = 'Reconciliado') as total_reconciliados,
                -- 4. Listado detallado de asistencia (Quiénes estuvieron y quiénes no)
                (
                    SELECT json_agg(json_build_object('nombre', m.nombre, 'asistio', asis.asistio))
                    FROM "AsistenciaCdP" asis
                    JOIN "Miembros" m ON asis.id_miembro = m.id_miembro
                    WHERE asis.id_reporte_cdp = r.id_reporte_cdp
                ) as detalle_asistencia
            FROM "ReporteCdP" r
            JOIN "Usuarios" u ON r.id_lider = u.id_usuario
            LEFT JOIN "CasasDePaz" cp ON u.id_usuario = cp.id_lider
            LEFT JOIN "Usuarios" lsr ON cp.id_lsr = lsr.id_usuario
            WHERE 1=1
        `;
        
        let params = [];
        let paramCount = 1;

        // --- Lógica de Jerarquía ---
        if (role != ROLES.ADMINISTRACION && role != ROLES.SUPER_ADMIN) {
            if (role == ROLES.LSR) {
                query += ` AND (cp.id_lsr = $${paramCount} OR r.id_lider = $${paramCount})`;
            } else {
                query += ` AND r.id_lider = $${paramCount}`;
            }
            params.push(id_usuario);
            paramCount++;
        }

        // --- Filtros de Fecha ---
        if (mes) {
            query += ` AND EXTRACT(MONTH FROM r.fecha_reporte) = $${paramCount}`;
            params.push(mes);
            paramCount++;
        }
        if (anio) {
            query += ` AND EXTRACT(YEAR FROM r.fecha_reporte) = $${paramCount}`;
            params.push(anio);
            paramCount++;
        }
        if (id_lider) {
            query += ` AND r.id_lider = $${paramCount}`;
            params.push(id_lider);
            paramCount++;
        }

        query += ` ORDER BY r.fecha_reporte DESC, r.id_reporte_cdp DESC`;

        const result = await client.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error("Error al obtener reporte detallado:", error);
        res.status(500).json({ error: "Error en el servidor", detalle: error.message });
    } finally {
        client.release();
    }
};

// No olvides exportarla al final del archivo:
module.exports = {
    createReporteCompleto,
    getReportesPorRol 
};