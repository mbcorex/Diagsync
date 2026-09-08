/*
 * Apply a SQL file to DIRECT_URL inside a transaction, report what it inserted,
 * then ROLL BACK so the database is left untouched.
 *
 *   node scripts/sql-validate.js diagsync_full_backup.sql          # verify only
 *   node scripts/sql-validate.js diagsync_full_backup.sql --commit # actually import
 */
const fs = require('fs');
const { Client } = require('pg');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean).map(m => [m[1], m[2]])
);

const file = process.argv[2] || 'diagsync_full_backup.sql';
const COMMIT = process.argv.includes('--commit');

/* Split on statement boundaries: a semicolon at end of line, outside any quoted
   string. Values in this file can contain semicolons and newlines inside quotes,
   so a naive split on ';' would corrupt them. */
function statements(sql) {
  const out = [];
  let start = 0, inQ = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inQ) {
      if (ch === "'") { if (sql[i + 1] === "'") i++; else inQ = false; }
      continue;
    }
    if (ch === "'") { inQ = true; continue; }
    if (ch === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (ch === ';') {
      let j = i + 1;
      while (j < sql.length && (sql[j] === ' ' || sql[j] === '\r')) j++;
      if (j >= sql.length || sql[j] === '\n') {
        const s = sql.slice(start, i + 1).trim();
        if (s) out.push(s);
        start = i + 1;
      }
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(s => !/^(BEGIN|COMMIT);$/i.test(s));
}

(async () => {
  const sql = fs.readFileSync(file, 'utf8');
  const stmts = statements(sql);
  console.log(file + ': ' + (fs.statSync(file).size / 1048576).toFixed(1) + ' MB, ' + stmts.length + ' statements');

  const c = new Client({ connectionString: env.DIRECT_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();
  await c.query('BEGIN');
  try {
    let n = 0;
    for (const st of stmts) {
      await c.query(st);
      if (++n % 100 === 0) process.stdout.write('\r  applied ' + n + '/' + stmts.length + ' statements');
    }
    process.stdout.write('\r  applied ' + n + '/' + stmts.length + ' statements\n');

    const r = await c.query('SELECT relname, n_tup_ins FROM pg_stat_xact_user_tables WHERE n_tup_ins > 0 ORDER BY relname');
    console.log('\nINSERTED:');
    let tot = 0;
    for (const row of r.rows) { console.log('  ' + row.relname.padEnd(34) + String(row.n_tup_ins).padStart(7)); tot += Number(row.n_tup_ins); }
    console.log('  ' + 'TOTAL'.padEnd(34) + String(tot).padStart(7));

    if (COMMIT) {
      await c.query('COMMIT');
      console.log('\nCOMMITTED - the data is now in the target database.');
    } else {
      await c.query('ROLLBACK');
      console.log('\nROLLED BACK - database unchanged. The file applies cleanly.');
    }
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nFAILED: ' + e.message);
    if (e.detail) console.error('detail: ' + e.detail);
    process.exit(1);
  }
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
