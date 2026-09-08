/*
 * Full data-only dump of the OLD database into a single runnable SQL file.
 *
 * Reads OLD_DATABASE_URL from .env. Nothing is uploaded anywhere: this connects
 * from your machine to Supabase and writes a local file.
 *
 * Every column is read as ::text, which is the form Postgres itself accepts back
 * on INSERT - so timestamps, enums, arrays, jsonb and numerics all round-trip
 * without any per-type guesswork.
 *
 * Rows are paged and streamed straight to disk, so a 60k-row table never has to
 * sit in memory all at once. Self-referencing tables are the exception: they are
 * loaded whole and ordered parent-first, so a row never references one that has
 * not been inserted yet.
 *
 *   node scripts/db-to-sql.js
 */
const fs = require('fs');
const { Client } = require('pg');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean).map(m => [m[1], m[2]])
);

const OLD = env.OLD_DATABASE_URL;
const OUT = 'diagsync_full_backup.sql';
const PAGE = 2000;   // rows fetched per round trip
const BATCH = 200;   // rows per INSERT statement

if (!OLD) {
  console.error('\nOLD_DATABASE_URL is not set in .env\n');
  console.error('Supabase dashboard -> old project -> Connect -> Session pooler:');
  console.error('OLD_DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres"\n');
  process.exit(1);
}

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const write = (stream, s) => new Promise(res => stream.write(s) ? res() : stream.once('drain', res));

(async () => {
  const c = new Client({ connectionString: OLD, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();
  console.log('connected:', (await c.query('SELECT version()')).rows[0].version.split(',')[0]);

  const colRows = (await c.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name NOT LIKE '\\_%'
    ORDER BY table_name, ordinal_position`)).rows;
  const tables = {};
  for (const r of colRows) (tables[r.table_name] = tables[r.table_name] || []).push(r.column_name);

  const fks = (await c.query(`
    SELECT ch.relname AS child, ca.attname AS childcol, pa.relname AS parent
    FROM pg_constraint con
    JOIN pg_class ch ON ch.oid = con.conrelid
    JOIN pg_class pa ON pa.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = con.connamespace
    JOIN unnest(con.conkey) k(a) ON TRUE
    JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = k.a
    WHERE con.contype='f' AND n.nspname='public'`)).rows;

  /* topological order so the file runs top to bottom in one pass */
  const names = new Set(Object.keys(tables));
  const deps = {}; for (const t of names) deps[t] = new Set();
  for (const f of fks) if (f.child !== f.parent && names.has(f.child) && names.has(f.parent)) deps[f.child].add(f.parent);
  const order = [], done = new Set();
  while (order.length < names.size) {
    const ready = [...names].filter(t => !done.has(t) && [...deps[t]].every(d => done.has(d))).sort();
    if (!ready.length) { const l = [...names].filter(t => !done.has(t)).sort()[0]; order.push(l); done.add(l); continue; }
    for (const t of ready) { order.push(t); done.add(t); }
  }

  /* self-FK columns, e.g. staff.createdById -> staff.id */
  const selfCols = {};
  for (const f of fks) if (f.child === f.parent) (selfCols[f.child] = selfCols[f.child] || []).push(f.childcol);

  /* order rows so that a row referencing another row of the same table comes after it */
  function parentFirst(rows, cols) {
    const byId = new Map(rows.map(r => [r.id, r]));
    const out = [], seen = new Set();
    const visit = (r, stack) => {
      if (seen.has(r.id) || stack.has(r.id)) return;   // stack guard: tolerate reference cycles
      stack.add(r.id);
      for (const col of cols) {
        const v = r[col];
        if (v !== null && v !== r.id && byId.has(v)) visit(byId.get(v), stack);
      }
      stack.delete(r.id);
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    };
    for (const r of rows) visit(r, new Set());
    return out;
  }

  const s = fs.createWriteStream(OUT, { encoding: 'utf8' });
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
  await write(s, [
    '-- ============================================================================',
    '-- DiagSync - full data backup',
    '-- Taken ' + ts + ' UTC directly from the source database',
    '--',
    '-- Data only. The target database already has the tables, created by',
    '-- prisma migrate deploy, so nothing here creates or alters schema.',
    '--',
    '-- Tables run in foreign-key order, and rows inside self-referencing tables',
    '-- are ordered parent-first. One transaction: it all lands or none of it does.',
    '-- ON CONFLICT DO NOTHING, so re-running is safe.',
    '-- ============================================================================',
    '', 'BEGIN;', '', ''
  ].join('\n'));

  const stats = [];
  let grand = 0;
  for (const table of order) {
    const cs = tables[table];
    const total = Number((await c.query('SELECT count(*)::int AS n FROM "' + table + '"')).rows[0].n);
    if (!total) { stats.push([table, 0]); continue; }

    const sel = cs.map(x => '"' + x + '"::text AS "' + x + '"').join(', ');
    const list = cs.map(x => '"' + x + '"').join(', ');
    const ordBy = cs.includes('id') ? ' ORDER BY "id"' : '';
    const self = selfCols[table];

    await write(s, '-- ' + '-'.repeat(72) + '\n-- ' + table + ' - ' + total + ' rows'
      + (self ? ' (self-referencing: ordered parent-first)' : '') + '\n-- ' + '-'.repeat(72) + '\n');

    let seen = 0, buf = [];
    const flush = async () => {
      if (!buf.length) return;
      await write(s, 'INSERT INTO "' + table + '" (' + list + ') VALUES\n' + buf.join(',\n') + '\nON CONFLICT DO NOTHING;\n\n');
      buf = [];
    };
    const emit = async r => {
      buf.push('  (' + cs.map(x => r[x] === null ? 'NULL' : q(r[x])).join(', ') + ')');
      seen++;
      if (buf.length >= BATCH) await flush();
    };

    if (self && cs.includes('id')) {
      // small enough to sort whole; correctness beats streaming here
      const rows = (await c.query('SELECT ' + sel + ' FROM "' + table + '"' + ordBy)).rows;
      for (const r of parentFirst(rows, self)) await emit(r);
    } else {
      for (let off = 0; off < total; off += PAGE) {
        const rows = (await c.query('SELECT ' + sel + ' FROM "' + table + '"' + ordBy + ' LIMIT ' + PAGE + ' OFFSET ' + off)).rows;
        for (const r of rows) await emit(r);
      }
    }
    await flush();

    stats.push([table, seen]);
    grand += seen;
    console.log('  ' + table.padEnd(34) + String(seen).padStart(7) + ' rows' + (self ? '  (parent-first)' : ''));
  }

  await write(s, 'COMMIT;\n');
  await new Promise(res => s.end(res));
  await c.end();

  console.log('\nWRITTEN  ' + OUT + '  ' + (fs.statSync(OUT).size / 1048576).toFixed(1) + ' MB');
  console.log('TOTAL    ' + grand + ' rows across ' + stats.filter(x => x[1]).length + ' non-empty tables');
})().catch(e => {
  console.error('\nFAILED:', e.message);
  if (/ENOTFOUND|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/.test(e.code || '')) {
    console.error('\nThe db.<ref>.supabase.co host is IPv6-only and unreachable from this network.');
    console.error('Use the Session pooler string on port 5432 instead.');
  }
  process.exit(1);
});
