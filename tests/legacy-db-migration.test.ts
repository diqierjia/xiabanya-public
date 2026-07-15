import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectDatabaseActivity, migrateLegacyDatabaseIfNeeded } from '../src/main/legacy-db-migration';

const testDirs: string[] = [];

function createDatabase(path: string, rows: { records?: number; visionResults?: number } = {}): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const db = new Database(path);
  db.exec('CREATE TABLE records (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE vision_results (id TEXT PRIMARY KEY)');
  for (let i = 0; i < (rows.records || 0); i += 1) db.prepare('INSERT INTO records (id) VALUES (?)').run(`record-${i}`);
  for (let i = 0; i < (rows.visionResults || 0); i += 1) db.prepare('INSERT INTO vision_results (id) VALUES (?)').run(`vision-${i}`);
  db.close();
}

function createTestPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'xiabanya-legacy-db-'));
  testDirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  while (testDirs.length) rmSync(testDirs.pop()!, { recursive: true, force: true });
});

describe('legacy database migration', () => {
  it('restores the most populated legacy database into an empty target', async () => {
    const target = createTestPath('current.db');
    const legacy = createTestPath('legacy.db');
    createDatabase(target);
    createDatabase(legacy, { records: 3, visionResults: 2 });

    const result = await migrateLegacyDatabaseIfNeeded(target, [legacy]);

    expect(result).toMatchObject({ migrated: true, reason: 'migrated', sourcePath: legacy });
    expect(inspectDatabaseActivity(target)).toMatchObject({ records: 3, visionResults: 2 });
    expect(result.backupPath).toBeTruthy();
  });

  it('never overwrites a target database that already has history', async () => {
    const target = createTestPath('current.db');
    const legacy = createTestPath('legacy.db');
    createDatabase(target, { records: 1 });
    createDatabase(legacy, { records: 3, visionResults: 2 });

    const result = await migrateLegacyDatabaseIfNeeded(target, [legacy]);

    expect(result).toEqual({ migrated: false, reason: 'target_has_history' });
    expect(inspectDatabaseActivity(target)).toMatchObject({ records: 1, visionResults: 0 });
  });
});
