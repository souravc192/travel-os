const MIGRATIONS = require('./migration-manifest');

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function probe(client, sql) {
  const result = await client.query(sql);
  return result.rowCount > 0;
}

async function isApplied(client, filename) {
  const result = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename]
  );
  return result.rowCount > 0;
}

async function recordApplied(client, filename) {
  await client.query(
    `INSERT INTO schema_migrations (filename) VALUES ($1)
     ON CONFLICT (filename) DO NOTHING`,
    [filename]
  );
}

/**
 * On databases migrated before tracking existed, infer applied migrations
 * from schema markers and backfill schema_migrations.
 */
async function bootstrapIfNeeded(client) {
  await client.query(ENSURE_TABLE_SQL);

  const count = await client.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
  if (count.rows[0].n > 0) return;

  const detected = new Set();
  const byFile = new Map(MIGRATIONS.map((m) => [m.file, m]));

  for (const migration of MIGRATIONS) {
    if (migration.probe && (await probe(client, migration.probe))) {
      detected.add(migration.file);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const migration of MIGRATIONS) {
      if (detected.has(migration.file)) continue;
      if (migration.impliedBy && detected.has(migration.impliedBy)) {
        detected.add(migration.file);
        changed = true;
      }
    }
  }

  if (detected.size === 0) return;

  for (const filename of detected) {
    await recordApplied(client, filename);
  }

  console.log(
    `Bootstrapped ${detected.size} migration(s) already present in the database.`
  );
}

module.exports = {
  MIGRATIONS,
  ENSURE_TABLE_SQL,
  bootstrapIfNeeded,
  isApplied,
  recordApplied,
};
