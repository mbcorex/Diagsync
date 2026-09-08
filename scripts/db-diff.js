/* Compare OLD_DATABASE_URL against DIRECT_URL: tables, columns, row counts. */
const fs = require('fs');
const { Client } = require('pg');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean).map(m => [m[1], m[2]])
);

async function snap(url, label) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });
  await c.connect();
  const v = (await c.query('SELECT version()')).rows[0].version.split(',')[0];
  const cols = (await c.query(`
    SELECT table_name, column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name NOT LIKE '\\_%'
    ORDER BY table_name, ordinal_position`)).rows;
  const tables = {};
  for (const r of cols) (tables[r.table_name] = tables[r.table_name] || {})[r.column_name] = r.udt_name;
  const counts = {};
  for (const t of Object.keys(tables)) {
    counts[t] = Number((await c.query('SELECT count(*)::int AS n FROM "' + t + '"')).rows[0].n);
  }
  await c.end();
  console.log(label + ': ' + v + ' | ' + Object.keys(tables).length + ' tables');
  return { tables, counts };
}

(async () => {
  const oldDb = await snap(env.OLD_DATABASE_URL, 'OLD');
  const newDb = await snap(env.DIRECT_URL, 'NEW');

  const all = [...new Set([...Object.keys(oldDb.tables), ...Object.keys(newDb.tables)])].sort();
  const issues = [];

  console.log('\n' + 'TABLE'.padEnd(36) + 'OLD'.padStart(8) + 'NEW'.padStart(8) + '   SCHEMA');
  console.log('-'.repeat(76));
  let totalOld = 0;
  for (const t of all) {
    const o = oldDb.tables[t], n = newDb.tables[t];
    let note = 'ok';
    if (!o) { note = 'MISSING IN OLD'; issues.push(t + ': exists only in the new database'); }
    else if (!n) { note = 'MISSING IN NEW'; issues.push(t + ': exists only in the old database - data cannot be imported'); }
    else {
      const onlyOld = Object.keys(o).filter(k => !(k in n));
      const onlyNew = Object.keys(n).filter(k => !(k in o));
      const typeDiff = Object.keys(o).filter(k => k in n && o[k] !== n[k]).map(k => k + ' ' + o[k] + '->' + n[k]);
      const parts = [];
      if (onlyOld.length) { parts.push('old-only cols: ' + onlyOld.join(',')); issues.push(t + ': columns ' + onlyOld.join(', ') + ' exist in old but not new - data in them will be lost'); }
      if (onlyNew.length) parts.push('new-only cols: ' + onlyNew.join(','));
      if (typeDiff.length) { parts.push('type change: ' + typeDiff.join(',')); issues.push(t + ': type change ' + typeDiff.join(', ')); }
      if (parts.length) note = parts.join(' | ');
    }
    const oc = o ? (oldDb.counts[t] ?? 0) : '-';
    const nc = n ? (newDb.counts[t] ?? 0) : '-';
    if (typeof oc === 'number') totalOld += oc;
    console.log(t.padEnd(36) + String(oc).padStart(8) + String(nc).padStart(8) + '   ' + note);
  }
  console.log('-'.repeat(76));
  console.log('total rows in OLD: ' + totalOld);

  console.log('\n' + (issues.length ? 'ISSUES:\n  ' + issues.join('\n  ') : 'No schema differences that block the import.'));
})().catch(e => { console.error('\nFAILED:', e.message, e.code || ''); process.exit(1); });
