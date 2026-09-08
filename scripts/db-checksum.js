/* Compare actual row content between OLD_DATABASE_URL and DIRECT_URL.
   Hashes every row of every table server-side and compares the digests. */
const fs = require('fs');
const { Client } = require('pg');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean).map(m => [m[1], m[2]])
);

async function digests(url) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();
  const tables = (await c.query(
    "SELECT table_name FROM information_schema.tables " +
    "WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' " +
    "ORDER BY table_name")).rows.map(r => r.table_name);
  const out = {};
  for (const t of tables) {
    // hash each row's full text form, then combine order-independently via sum
    const sql =
      "SELECT count(*)::int AS n, " +
      "COALESCE(sum(('x' || substr(md5(t::text), 1, 8))::bit(32)::bigint), 0)::text AS h " +
      'FROM "' + t + '" t';
    const r = (await c.query(sql)).rows[0];
    out[t] = { n: r.n, h: r.h };
  }
  await c.end();
  return out;
}

(async () => {
  const [o, n] = await Promise.all([digests(env.OLD_DATABASE_URL), digests(env.DIRECT_URL)]);
  const all = [...new Set([...Object.keys(o), ...Object.keys(n)])].sort();
  let bad = 0;
  console.log('TABLE'.padEnd(34) + 'ROWS'.padStart(8) + '   CONTENT');
  console.log('-'.repeat(60));
  for (const t of all) {
    const a = o[t], b = n[t];
    let verdict;
    if (!a || !b) { verdict = 'MISSING ON ONE SIDE'; bad++; }
    else if (a.n !== b.n) { verdict = 'ROW COUNT DIFFERS ' + a.n + ' vs ' + b.n; bad++; }
    else if (a.h !== b.h) { verdict = 'CONTENT DIFFERS'; bad++; }
    else verdict = 'identical';
    console.log(t.padEnd(34) + String(a ? a.n : '-').padStart(8) + '   ' + verdict);
  }
  console.log('-'.repeat(60));
  console.log(bad === 0
    ? 'All ' + all.length + ' tables are byte-identical between the two databases.'
    : bad + ' table(s) differ.');
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
