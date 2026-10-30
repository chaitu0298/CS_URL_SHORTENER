// Safe, serialized bootstrap for a NEW database. Future migrations must be added
// as ordered, reviewed SQL files and run through this controlled mechanism.
import fs from 'node:fs';
import {Pool} from 'pg';
import {start} from './postgres-server.mjs';

async function bootstrap() {
  const ssl=process.env.PGSSL_CA_FILE
    ? {ca:fs.readFileSync(process.env.PGSSL_CA_FILE,'utf8'),rejectUnauthorized:true}
    : undefined;
  const pool=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
    database:process.env.PGDATABASE||'shortener',user:process.env.PGUSER||'shortener',
    password:process.env.PGPASSWORD,ssl,connectionTimeoutMillis:8000,max:1});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Blocks concurrent App Runner instances until the schema is ready.
    await client.query('SELECT pg_advisory_xact_lock(4651287)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations
      (version VARCHAR(64) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const migration='001_init';
    const exists=await client.query('SELECT version FROM schema_migrations WHERE version=$1',[migration]);
    if (!exists.rowCount) {
      const sql=fs.readFileSync(new URL('../sql/001_init.sql',import.meta.url),'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[migration]);
      console.log('Applied PostgreSQL migration:',migration);
    }
    await client.query('COMMIT');
  } catch(e) {await client.query('ROLLBACK').catch(()=>{});throw e;}
  finally {client.release();await pool.end();}
  await start();
  console.log('URL shortener listening after successful DB migration');
}
bootstrap().catch(e=>{console.error('Bootstrap failed:',e.message);process.exit(1);});
