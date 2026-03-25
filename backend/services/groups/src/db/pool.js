import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'chat',
  password: process.env.DB_PASSWORD || 'chatpass',
  database: process.env.DB_NAME || 'groups_db'
});

export default pool;
