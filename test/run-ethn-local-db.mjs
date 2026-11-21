import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from 'node:net';
import { randomBytes } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = path.join(root, "test");
const target = ["staff-management", "exception-review", "walk-in", "booking-read", "calendar-blocks", "audit-read", "finance", "outcomes", "open-plays", "sales", "extensions", "notifications", "venue", "timing-policy", "expense-corrections", "integrated-workflows", "extension-review", "push"];
const prefixes = { "staff-management": "ETHN_STAFF_MANAGEMENT", "exception-review": "ETHN_EXCEPTION", "walk-in": "ETHN_WALK_IN", "booking-read": "ETHN_ADMIN_BOOKING_READ", "calendar-blocks": "ETHN_CALENDAR_BLOCK", "audit-read": "ETHN_AUDIT_READ", finance: "ETHN_FINANCE", outcomes: "ETHN_OUTCOMES", "open-plays": "ETHN_OPEN_PLAYS", sales: "ETHN_SALES", extensions: "ETHN_EXTENSION", notifications: "ETHN_NOTIFICATIONS", venue: "ETHN_VENUE", "timing-policy": "ETHN_TIMING", "expense-corrections": "ETHN_FINANCE", "integrated-workflows": "ETHN_INTEGRATED", "extension-review": "ETHN_EXTENSION", push:"ETHN_PUSH" };
assert.equal(new Set(target).size, target.length);

function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...opts });
    let out = "", err = "";
    child.stdout.on("data", b => { out = (out + b).slice(-16000); });
    child.stderr.on("data", b => { err = (err + b).slice(-16000); });
    const timer=setTimeout(()=>{child.kill();reject(new Error(`${path.basename(bin)} timed out`));},120000);
    child.on("error",error=>{clearTimeout(timer);reject(error);});
    child.on("close", code => {clearTimeout(timer);code === 0 ? resolve(out) : reject(new Error(`${path.basename(bin)} exited ${code}: ${err || out}`));});
  });
}
const cleanEnv={...process.env};
for(const key of Object.keys(cleanEnv))if(/^(PG|DATABASE|DIRECT_DATABASE|ETHN_|NEXT_PUBLIC_SUPABASE|SUPABASE|GMAIL|MAIL|SMTP|SENTRY|CRON|APP_URL)/i.test(key))delete cleanEnv[key];
const pgBin = process.env.ETHN_TEST_PG_BIN;
if (!pgBin) throw new Error("Set ETHN_TEST_PG_BIN to PostgreSQL bin directory containing initdb, pg_ctl, and psql.");
const exe = name => path.join(pgBin, process.platform === "win32" ? `${name}.exe` : name);
const tempBase = process.env.ETHN_TEST_TEMP ?? path.join(tmpdir(), "opencode");
const cluster = await mkdtemp(path.join(tempBase, "ethn-db-"));
const data = path.join(cluster, "data");
const socket=net.createServer();await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const pw = randomBytes(36).toString("base64url");
const pwfile = path.join(cluster, "pgpass-init");
let started = false, failed = false;
const redact = s => s.replaceAll(pw, "[redacted]");
try {
  await writeFile(pwfile, `${pw}\n`, { mode: 0o600 });
  await run(exe("initdb"), ["-D", data, "-U", "postgres", "--pwfile", pwfile, "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--encoding=UTF8"]);
  const launch=spawnSync(exe('pg_ctl'),['-D',data,'-l',path.join(cluster,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],{stdio:'ignore',timeout:60000});assert.equal(launch.status,0,'Disposable PostgreSQL start failed');
  started = true;
  const admin = `postgresql://postgres:${encodeURIComponent(pw)}@127.0.0.1:${port}/postgres`;
  const migrations = (await readdir(path.join(root, "db/ethn"))).filter(f => /^\d+.*\.sql$/.test(f)).sort((a,b) => Number(a.match(/^\d+/)[0])-Number(b.match(/^\d+/)[0]));
  assert.equal(migrations.length, 28, "Expected complete 28-file ETHN migration chain");
  const files = (await readdir(testDir)).filter(f => f.endsWith(".test.ts") && target.some(n => f === `ethn-${n}.test.ts`)).sort();
  assert.equal(files.length, target.length, "Missing requested test source");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: admin });
  try {
    await pool.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE ethn_checkout LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS`);
  } finally { await pool.end(); }
  for (const file of files) {
    const name = file.slice(5, -8), prefix = prefixes[name];
    const source = await readFile(path.join(testDir, file), "utf8");
    assert(prefix && source.includes(`${prefix}_TEST_DATABASE_URL`), `Missing explicit env mapping for ${file}`);
    const db = `ethn_${randomBytes(8).toString("hex")}`;
    const adminPool = new Pool({ connectionString: admin });
    try { await adminPool.query(`CREATE DATABASE ${db}`); } finally { await adminPool.end(); }
    const testAdmin = admin.replace(/\/postgres$/, `/${db}`);
    try {
      for (const migration of migrations) await run(exe("psql"), ["-X", "-v", "ON_ERROR_STOP=1", testAdmin, "-f", path.join(root, "db/ethn", migration)], { env: { ...cleanEnv, PGPASSWORD: pw } });
      const env = { ...cleanEnv, [`${prefix}_TEST_DATABASE_URL`]: testAdmin.replace("postgres:", "ethn_checkout:"), [`${prefix}_TEST_ADMIN_URL`]: testAdmin };
      const result = await run(process.execPath, ["--test", "--test-reporter=tap", "--import", "./test/register-loader.mjs", path.join("test", file)], { env });
      if (/^# (?:tests|pass|fail|skipped) /m.test(result)) {
        const skip = result.match(/^# skipped (\d+)/m);
        if (skip && Number(skip[1])) throw new Error(`${file}: tests skipped unexpectedly\n${result}`);
      }
      await writeFile(path.join(cluster,`${file}.log`),redact(result));
      console.log(`${file}: PASS\n${redact(result).slice(-2500)}`);
    } catch (e) { failed = true; await writeFile(path.join(cluster,`${file}.log`),redact(String(e))); console.error(`${file}: FAIL\n${redact(String(e))}`); }
    finally {
      const p = new Pool({ connectionString: admin });
      try { await p.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`); } finally { await p.end(); }
    }
  }
} finally {
  if (started) { const pid=(await readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);assert.equal(Number(pid[3]),port);assert.equal(path.resolve(pid[1]).toLowerCase(),path.resolve(data).toLowerCase());await run(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]).catch(e => { failed = true; console.error(redact(String(e))); }); }
  if (started) { try { await readFile(path.join(data,'postmaster.pid')); failed=true; console.error('Disposable cluster still has PID file; data retained.'); } catch { await rm(data,{recursive:true,force:true}); } }
  await rm(pwfile,{force:true});
  console.log(`Local DB evidence directory: ${cluster}`);
}
if (failed) process.exitCode = 1;
