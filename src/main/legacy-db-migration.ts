import Database from 'better-sqlite3';
import { copyFileSync, existsSync, statSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';

export interface DatabaseActivity {
  records: number;
  visionResults: number;
  reports: number;
  chatMessages: number;
}

export interface LegacyDatabaseMigrationResult {
  migrated: boolean;
  sourcePath?: string;
  backupPath?: string;
  reason: 'migrated' | 'target_has_history' | 'no_legacy_history' | 'failed';
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function rowCount(db: Database.Database, table: string): number {
  if (!tableExists(db, table)) return 0;
  return Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

export function inspectDatabaseActivity(dbPath: string): DatabaseActivity | null {
  if (!existsSync(dbPath)) return null;

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return {
      records: rowCount(db, 'records'),
      visionResults: rowCount(db, 'vision_results'),
      reports: rowCount(db, 'reports'),
      chatMessages: rowCount(db, 'chat_messages'),
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function hasUserHistory(activity: DatabaseActivity | null): boolean {
  return Boolean(activity && (activity.records > 0 || activity.visionResults > 0 || activity.reports > 0 || activity.chatMessages > 0));
}

function backupPathFor(targetPath: string): string {
  const parsedExtension = extname(targetPath) || '.db';
  const name = basename(targetPath, parsedExtension);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(dirname(targetPath), `${name}.before-legacy-migration-${stamp}${parsedExtension}`);
}

/**
 * Restores a legacy database only before the new user-data database contains
 * any actual history. Existing new history is never overwritten.
 */
export async function migrateLegacyDatabaseIfNeeded(
  targetPath: string,
  legacyCandidates: readonly string[]
): Promise<LegacyDatabaseMigrationResult> {
  if (hasUserHistory(inspectDatabaseActivity(targetPath))) {
    return { migrated: false, reason: 'target_has_history' };
  }

  const targetResolved = resolve(targetPath).toLowerCase();
  const source = legacyCandidates
    .filter((candidate) => resolve(candidate).toLowerCase() !== targetResolved)
    .map((candidate) => ({ path: candidate, activity: inspectDatabaseActivity(candidate) }))
    .filter(({ activity }) => hasUserHistory(activity))
    .sort((left, right) => {
      const leftTotal = left.activity!.records + left.activity!.visionResults + left.activity!.reports + left.activity!.chatMessages;
      const rightTotal = right.activity!.records + right.activity!.visionResults + right.activity!.reports + right.activity!.chatMessages;
      return rightTotal - leftTotal || statSync(right.path).mtimeMs - statSync(left.path).mtimeMs;
    })[0];

  if (!source) return { migrated: false, reason: 'no_legacy_history' };

  const backupPath = existsSync(targetPath) ? backupPathFor(targetPath) : undefined;
  let sourceDb: Database.Database | null = null;
  try {
    if (backupPath) copyFileSync(targetPath, backupPath);
    sourceDb = new Database(source.path, { readonly: true, fileMustExist: true });
    await sourceDb.backup(targetPath);
    return { migrated: true, reason: 'migrated', sourcePath: source.path, backupPath };
  } catch (error) {
    console.error('[数据迁移] 无法恢复旧数据库:', error);
    if (backupPath && existsSync(backupPath)) copyFileSync(backupPath, targetPath);
    return { migrated: false, reason: 'failed', backupPath };
  } finally {
    sourceDb?.close();
  }
}
