import pg from "pg";

const { Pool } = pg;

// pg reads PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE from env
// automatically when no connectionString is provided.
export const pool = new Pool();
