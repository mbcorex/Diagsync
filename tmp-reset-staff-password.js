require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

async function main() {
  const email = "julietigwe@gmail.com";
  const newPassword = "juliet2026";
  const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!conn) throw new Error("Missing DATABASE_URL or DIRECT_URL");

  const url = new URL(conn);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");

  console.log("connecting...");
  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  await client.connect();
  console.log("connected");

  const existing = await client.query(
    "select id, email, full_name, role, status from staff where email = $1 limit 1",
    [email]
  );
  console.log("lookup done");

  if (existing.rowCount === 0) {
    throw new Error(`No staff account found for ${email}`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  console.log("hash ready");

  await client.query(
    "update staff set password_hash = $1, updated_at = now() where email = $2",
    [passwordHash, email]
  );
  console.log("update done");

  const refreshed = await client.query(
    "select id, email, full_name, role, status, updated_at from staff where email = $1 limit 1",
    [email]
  );

  console.log(JSON.stringify({ before: existing.rows[0], after: refreshed.rows[0] }, null, 2));
  await client.end();
  console.log("done");
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
