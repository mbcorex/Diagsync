/* Row counts for a target. Default DIRECT_URL (new db); pass "old" for OLD_DATABASE_URL. */
const fs = require('fs');
const { Client } = require('pg');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean).map(m => [m[1], m[2]])
);

const which = process.argv[2] === 'old' ? 'OLD_DATABASE_URL' : 'DIRECT_URL';

(async () => {
  const c = new Client({ connectionString: env[which], ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });
  await c.connect();
  const host = (env[which].match(/@([^:/]+)/) || [])[1];
  const tables = (await c.query(
    "SELECT table_name FROM information_schema.tables " +
    "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
  )).rows.map(r => r.table_name);

  console.log(which + '  (' + host + ')');
  console.log('tables: ' + tables.length + '\n');

  let total = 0;
  const nonEmpty = [];
  for (const t of tables) {
    const n = Number((await c.query('SELECT count(*)::int AS n FROM "' + t + '"')).rows[0].n);
    total += n;
    if (n) nonEmpty.push([t, n]);
  }
  for (const [t, n] of nonEmpty) console.log('  ' + t.padEnd(34) + String(n).padStart(7));
  console.log('\nnon-empty tables: ' + nonEmpty.length + ' of ' + tables.length);
  console.log('TOTAL ROWS: ' + total);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
