import {Pool} from 'pg';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
const op=process.argv[2];
async function run() {
  if(!['migrate','cleanup'].includes(op)) throw Error('Usage: node src/db-tool.mjs migrate|cleanup');
  const ssl=process.env.PGSSL_CA_FILE?{ca:fs.readFileSync(process.env.PGSSL_CA_FILE,'utf8'),rejectUnauthorized:true}:undefined;
  const pool=new Pool({connectionString:process.env.DATABASE_URL||undefined,host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),database:process.env.PGDATABASE??'shortener',user:process.env.PGUSER??'shortener',password:process.env.PGPASSWORD,ssl});
  try {
    if(op==='migrate') {
      // For serious multi-release migrations use a versioned migration tool in CI rather than on each replica.
      await pool.query(fs.readFileSync(fileURLToPath(new URL('../sql/001_init.sql',import.meta.url)),'utf8'));
      console.log('PostgreSQL schema initialized');
    } else {
      const retentionDays=Number(process.env.EXPIRED_RETENTION_DAYS??90);
      if(!Number.isInteger(retentionDays)||retentionDays<1)throw Error('EXPIRED_RETENTION_DAYS must be a positive integer');
      const r=await pool.query("DELETE FROM short_links WHERE expires_at < NOW() - ($1 * INTERVAL '1 day')",[retentionDays]);
      console.log('Pruned expired links past retention:',r.rowCount);
    }
  } finally {await pool.end();}
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});
