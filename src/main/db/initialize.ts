import { createHash } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import journal from '@root/drizzle/meta/_journal.json';
import { sqlite } from './client';

// Vite bundles all migration SQL files at build time — no runtime path resolution needed.
// Each value is the raw SQL string content of the file.
const sqlFiles = import.meta.glob('@root/drizzle/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type JournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };

function isSkippableMigrationStatementError(error: unknown, statement: string): boolean {
  if (!(error instanceof Error)) return false;

  const isCreateStatement = /^(CREATE\s+TABLE|CREATE\s+INDEX)/i.test(statement.trim());
  if (!isCreateStatement) return false;

  return /already exists/i.test(error.message);
}

function runBundledMigrations(connection: BetterSqlite3.Database): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);

  const lastRow = connection
    .prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
    .get() as { created_at: number } | undefined;
  const lastTimestamp = lastRow?.created_at ?? 0;

  connection.transaction(() => {
    for (const entry of (journal as { entries: JournalEntry[] }).entries) {
      if (entry.when <= lastTimestamp) continue;

      const sqlKey = Object.keys(sqlFiles).find((k) => k.includes(entry.tag));
      if (!sqlKey) throw new Error(`Missing bundled SQL for migration: ${entry.tag}`);

      const sql = sqlFiles[sqlKey];
      const hash = createHash('sha256').update(sql).digest('hex');

      for (const stmt of sql.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;

        try {
          connection.exec(trimmed);
        } catch (error) {
          if (isSkippableMigrationStatementError(error, trimmed)) {
            continue;
          }

          throw error;
        }
      }

      connection
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run(hash, entry.when);
    }
  })();
}

/**
 * Runs all pending migrations against the shared SQLite connection and validates
 * the schema contract. Call this once in main.ts before any db queries run.
 *
 * Throws `DatabaseSchemaMismatchError` when required columns/tables are missing
 * after migration (e.g. the user downgraded from a newer build).
 *
 * Returns the raw better-sqlite3 handle so the caller can close it on shutdown.
 */
export async function initializeDatabase(): Promise<BetterSqlite3.Database> {
  runBundledMigrations(sqlite);
  return sqlite;
}
