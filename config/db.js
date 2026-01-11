const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();



const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});


const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('✅ Conexión exitosa a PostgreSQL');
    } catch (err) {
        console.error('❌ ERROR CRÍTICO DE CONEXIÓN A POSTGRESQL:');
        console.error('--------------------------------------------------');
        console.error('Causa probable: Credenciales incorrectas (.env) o el servicio de PostgreSQL está detenido.');
        console.error('Detalles del error:', err.message);
        console.error('--------------------------------------------------');
        process.exit(1);
    } finally {
        if (client) {
            client.release();
        }
    }
};

testConnection();

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
};
