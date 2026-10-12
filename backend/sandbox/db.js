// The sandbox database: a real Postgres (PGlite, Postgres compiled to WASM)
// running inside this Node process. Nothing here can reach Supabase.
//
// Build order (only when the data directory is new or --reset):
//   1. bootstrap.sql      Supabase-isms the repo's SQL expects: roles, auth.*, storage.*
//   2. the repo's SQL     every setup / migration file below, statement by statement;
//                         a failing statement is logged and skipped, like pasting the
//                         file into Supabase's SQL editor one block at a time
//   3. schema-patches.sql what the CODE uses that no SQL file in the repo creates
//   4. seed.js            fixtures: people, posts, raids, cosmetics, config
//
// The data lives in backend/sandbox/.data/pgdata (git-ignored) and survives
// restarts. `node run.js --reset` (or openDatabase({ reset: true })) rebuilds it.

const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const { splitSql, headline } = require('./sql-split');

const SANDBOX = __dirname;
const BACKEND = path.resolve(SANDBOX, '..');
const REPO = path.resolve(BACKEND, '..');
const DATA_DIR = path.join(SANDBOX, /^\.data[\w-]*$/.test(process.env.SANDBOX_DATA || '') ? process.env.SANDBOX_DATA : '.data', 'pgdata');

// The repo's schema, oldest first. One-off scripts that delete or rewrite real
// people's data (DELETE-USERS, delete-*, clear-*, reset scripts, restore-admin-access,
// test-week-reset, supabase-cleanup) are deliberately NOT loaded.
const SCHEMA_FILES = [
  // raids first: the root schema has an older raids table (raid_title …) that
  // production replaced with this one (description, twitter_url, expires_at …).
  [BACKEND, 'supabase-raids-setup.sql'],
  [REPO, 'supabase-schema.sql'],
  [BACKEND, 'supabase-honey-points-setup.sql'],
  [BACKEND, 'supabase-profile-system-setup.sql'],
  [BACKEND, 'supabase-follows-setup.sql'],
  [BACKEND, 'supabase-notifications-table-setup.sql'],
  [BACKEND, 'supabase-cosmetics-setup.sql'],
  [BACKEND, 'supabase-cosmetics-update-bearableguy123.sql'],
  [BACKEND, 'supabase-roles-setup.sql'],
  [BACKEND, 'supabase-admin-features-setup.sql'],
  [BACKEND, 'supabase-game-points-setup.sql'],
  [BACKEND, 'supabase-time-based-migration.sql'],
  [BACKEND, 'supabase-bulletin-board-setup.sql'],
  [BACKEND, 'supabase-bulletin-post-reactions-setup.sql'],
  [BACKEND, 'supabase-comment-reactions-setup.sql'],
  [BACKEND, 'supabase-beardrops-setup.sql'],
  [BACKEND, 'supabase-merch-inventory-setup.sql'],
  [BACKEND, 'supabase-merch-multi-item-setup.sql'],
  [BACKEND, 'supabase-merch-conversion-columns.sql'],
  [BACKEND, 'supabase-push-notifications-setup.sql'],
  [BACKEND, 'meme-database-setup.sql'],
  [BACKEND, 'fix-meme-weeks-insert.sql'],
  [BACKEND, 'add-submission-rewards-table.sql'],
  [BACKEND, 'fix-profile-comments-rls.sql'],
  [BACKEND, 'add-delete-policy.sql'],
  [REPO, 'supabase_fix_reactions_rls.sql'],
  [BACKEND, 'setup-auto-sync-trigger.sql'],
  [BACKEND, 'create-performance-indexes.sql'],
  [BACKEND, 'migrations/002-add-lp-forfeited.sql'],
  [BACKEND, 'migrations/003-lp-balance-tracking.sql'],
  [BACKEND, 'migrations/004-honey-ledger.sql'],
  [BACKEND, 'migrations/005-lock-down-anon-writes.sql'],
  [BACKEND, 'migrations/006-social-notifications.sql'],
  [BACKEND, 'migrations/007-honey-activity-numeric.sql'],
];

async function runScript(db, label, text, report) {
  const statements = splitSql(text);
  let ok = 0;
  for (const sql of statements) {
    try {
      await db.exec(sql);
      ok += 1;
    } catch (err) {
      report.failures.push({ file: label, statement: headline(sql), error: err.message });
    }
  }
  report.files.push({ file: label, statements: statements.length, ok });
}

async function buildSchema(db, { log = console.log } = {}) {
  const report = { files: [], failures: [] };
  await runScript(db, 'sandbox/bootstrap.sql', fs.readFileSync(path.join(SANDBOX, 'bootstrap.sql'), 'utf8'), report);
  for (const [dir, file] of SCHEMA_FILES) {
    const abs = path.join(dir, file);
    if (!fs.existsSync(abs)) { report.failures.push({ file, statement: '(file missing)', error: 'not found' }); continue; }
    await runScript(db, path.relative(REPO, abs).replace(/\\/g, '/'), fs.readFileSync(abs, 'utf8'), report);
  }
  await runScript(db, 'sandbox/schema-patches.sql', fs.readFileSync(path.join(SANDBOX, 'schema-patches.sql'), 'utf8'), report);
  const patchFailures = report.failures.filter((f) => f.file.startsWith('sandbox/'));
  if (patchFailures.length) {
    for (const f of patchFailures) log(`  ✗ ${f.file}: ${f.statement}\n      ${f.error}`);
    throw new Error(`sandbox SQL failed (${patchFailures.length} statement(s)); fix bootstrap.sql / schema-patches.sql`);
  }
  return report;
}

async function seed(db) {
  const { seedSql } = require('./seed');
  const report = { files: [], failures: [] };
  await runScript(db, 'sandbox/seed', seedSql(), report);
  if (report.failures.length) {
    const lines = report.failures.map((f) => `  ✗ ${f.statement}\n      ${f.error}`).join('\n');
    throw new Error(`seed failed:\n${lines}`);
  }
}

/**
 * Open (and on first use, build) the sandbox database.
 * @param {{ reset?: boolean, memory?: boolean, log?: Function, quiet?: boolean }} opts
 */
async function openDatabase({ reset = false, memory = false, log = console.log, quiet = false } = {}) {
  if (!memory && reset) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  if (!memory) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = memory ? new PGlite() : new PGlite(DATA_DIR);
  await db.waitReady;
  // Supabase runs in UTC; PostgREST's JSON timestamps read "…+00:00".
  await db.exec(`SET TIME ZONE 'UTC'`);

  const built = (await db.query(`SELECT to_regclass('public.sandbox_meta') AS t`)).rows[0].t;
  if (!built) {
    const t0 = Date.now();
    const report = await buildSchema(db, { log });
    await seed(db);
    await db.exec(`CREATE TABLE sandbox_meta (key text PRIMARY KEY, value jsonb); INSERT INTO sandbox_meta VALUES ('built_at', to_jsonb(now()::text))`);
    await db.query(`INSERT INTO sandbox_meta VALUES ('schema_report', $1::jsonb)`, [JSON.stringify(report)]);
    if (!quiet) {
      const total = report.files.reduce((a, f) => a + f.statements, 0);
      log(`[sandbox-db] built in ${Date.now() - t0} ms: ${report.files.length} SQL files, ${total} statements, ${report.failures.length} skipped (see schema report: node db.js --report)`);
    }
  }
  return db;
}

module.exports = { openDatabase, buildSchema, SCHEMA_FILES, DATA_DIR };

// node db.js [--report]   build a throwaway copy in memory and print what the repo's
// SQL could not do (never opens .data/: PGlite is single-process, and the
// running sandbox owns that directory)
if (require.main === module) {
  (async () => {
    const db = await openDatabase({ memory: true });
    if (process.argv.includes('--report')) {
      const { rows } = await db.query(`SELECT value FROM sandbox_meta WHERE key = 'schema_report'`);
      const report = rows[0]?.value || { files: [], failures: [] };
      for (const f of report.files) console.log(`${String(f.ok).padStart(4)}/${String(f.statements).padEnd(4)} ${f.file}`);
      console.log(`\n${report.failures.length} statements skipped:`);
      for (const f of report.failures) console.log(`- [${f.file}] ${f.statement}\n    → ${f.error}`);
    }
    const tables = await db.query(`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`);
    console.log(`\n${tables.rows.length} relations: ${tables.rows.map((r) => r.table_name + (r.table_type === 'VIEW' ? ' (view)' : '')).join(', ')}`);
    await db.close();
  })().catch((err) => { console.error(err); process.exit(1); });
}
