import fs from 'node:fs';
import {createServer} from './server.mjs';
import {PgLinkStore} from './postgres-store.mjs';
import {pathToFileURL} from 'node:url';

export async function start() {
  const {Pool} = await import('pg');
  const production = process.env.NODE_ENV === 'production';
  if (production && (process.env.AUTH_MODE !== 'jwt' || !process.env.BASE_URL?.startsWith('https://') || !process.env.CORS_ORIGINS || !process.env.VISITOR_HASH_SECRET || !process.env.PGSSL_CA_FILE)) {
    throw Error('Production requires AUTH_MODE=jwt, HTTPS BASE_URL, CORS_ORIGINS, VISITOR_HASH_SECRET and PGSSL_CA_FILE');
  }
  const ssl = process.env.PGSSL_CA_FILE ? {ca:fs.readFileSync(process.env.PGSSL_CA_FILE,'utf8'),rejectUnauthorized:true} : undefined;
  const pool = new Pool({connectionString:process.env.DATABASE_URL || undefined, host:process.env.PGHOST,port:Number(process.env.PGPORT ?? 5432),database:process.env.PGDATABASE ?? 'shortener',user:process.env.PGUSER ?? 'shortener',password:process.env.PGPASSWORD, ssl, max:Number(process.env.PGPOOL_MAX ?? 10), connectionTimeoutMillis:5000, idleTimeoutMillis:30000});
  await pool.query('SELECT 1');
  const store = new PgLinkStore(pool);
  const server = createServer(store);
  server.listen(Number(process.env.PORT ?? 3000),'0.0.0.0');
  const shutdown = () => server.close(()=>pool.end());
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
  return server;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start().catch(e=>{console.error('Startup failed:',e.message);process.exitCode=1;});
