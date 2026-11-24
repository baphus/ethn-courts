// Isolated loopback database only; never reads application database configuration.
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import {Pool} from 'pg';
import {readMigrationFiles} from 'drizzle-orm/migrator';
const bin=process.env.ETHN_TEST_PG_BIN;if(!bin)throw Error('ETHN_TEST_PG_BIN required');
const base=process.env.ETHN_TEST_TEMP;if(!base)throw Error('ETHN_TEST_TEMP required');
const dir=await mkdtemp(path.join(base,'ethn-unified-')),data=path.join(dir,'data'),pw=randomBytes(32).toString('hex'),pwfile=path.join(dir,'password');
const env={...process.env};for(const k of Object.keys(env))if(/^(PG|DATABASE|DIRECT_DATABASE|ETHN_|NEXT_PUBLIC_SUPABASE|SUPABASE|MAIL|SMTP|SENTRY|CRON|APP_URL)/i.test(k))delete env[k];
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const exe=n=>path.join(bin,process.platform==='win32'?`${n}.exe`:n);
function run(program,args,extra={}){const r=spawnSync(program,args,{env:{...env,...extra},encoding:'utf8',timeout:120000,windowsHide:true});const output=`${r.stdout??''}${r.stderr??''}`.replaceAll(pw,'[redacted]');if(r.status!==0)throw Error(`${path.basename(program)} exit ${r.status}\n${output}`);return output;}
let started=false;
try{
 await writeFile(pwfile,pw+'\n',{mode:0o600});run(exe('initdb'),['-D',data,'-U','postgres','--pwfile',pwfile,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--encoding=UTF8']);
 run(exe('pg_ctl'),['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 const admin=`postgresql://postgres:${pw}@127.0.0.1:${port}/postgres`,pool=new Pool({connectionString:admin});
 try{await pool.query(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE ethn_checkout LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS;`);
 for(const migration of readMigrationFiles({migrationsFolder:'db/ethn-migrations'})){await pool.query('BEGIN');try{for(const sql of migration.sql)await pool.query(sql);await pool.query('COMMIT');}catch(e){await pool.query('ROLLBACK');throw e;}}
 }finally{await pool.end();}
 const result=run(process.execPath,['--import','./test/register-loader.mjs','--test','test/ethn-unified-database.test.ts'],{ETHN_UNIFIED_TEST_DATABASE_URL:admin.replace('postgres:','ethn_checkout:'),ETHN_UNIFIED_TEST_ADMIN_URL:admin});
 await writeFile(path.join(dir,'tests.log'),result);console.log(result);console.log(`Evidence: ${dir}`);
}finally{
 if(started){const pid=(await readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(pid[3])!==port||path.resolve(pid[1]).toLowerCase()!==path.resolve(data).toLowerCase())throw Error('Cluster identity mismatch; cleanup stopped');run(exe('pg_ctl'),['-D',data,'-m','fast','-w','stop']);await rm(data,{recursive:true,force:true});}
 await rm(pwfile,{force:true});
}
