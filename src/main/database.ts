import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  ActivityRecord,
  IdlePeriod,
  Report,
  VisionResult,
  VisionQuery,
  RecordUpsertDTO,
  RecordsQuery,
  ReportsQuery,
} from '../shared/types';
import { formatUtcStorageDateTime, localDateRangeToUtcStorageRange } from '../shared/time';

// ===== 数据库服务 =====
export class DatabaseService {
  private db: Database.Database;
  private static instance: DatabaseService | null = null;

  private constructor(dbPath: string = ':memory:') {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode=WAL');
    this.initTables();
  }

  static getInstance(dbPath?: string): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService(dbPath);
    }
    return DatabaseService.instance;
  }

  static resetInstance(): void {
    if (DatabaseService.instance) {
      DatabaseService.instance.close();
      DatabaseService.instance = null;
    }
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        title TEXT,
        category TEXT,
        app TEXT,
        window_title TEXT,
        start_at TEXT,
        end_at TEXT,
        notes TEXT,
        source TEXT,
        created_at TEXT,
        is_achievement INTEGER DEFAULT 0,
        exclude_from_report INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        report_type TEXT,
        template TEXT,
        start_date TEXT,
        end_date TEXT,
        content TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS vision_results (
        id TEXT PRIMARY KEY,
        record_id TEXT,
        title TEXT,
        category TEXT,
        summary TEXT,
        raw_response TEXT,
        app TEXT,
        window_title TEXT,
        model TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS idle_periods (
        id TEXT PRIMARY KEY,
        start_at TEXT NOT NULL,
        end_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_idle_periods_range ON idle_periods(start_at, end_at);
      CREATE INDEX IF NOT EXISTS idx_vision_created ON vision_results(created_at);
    `);
  }

  // ===== Records CRUD =====
  listRecords(query: RecordsQuery): ActivityRecord[] {
    const { start, end, q, category, limit } = query;
    const range = localDateRangeToUtcStorageRange(start, end);
    let sql = `SELECT * FROM records WHERE end_at >= ? AND start_at <= ?`;
    const params: unknown[] = [range.start, range.end];

    if (q) {
      sql += ` AND (title LIKE ? OR category LIKE ? OR app LIKE ? OR notes LIKE ? OR window_title LIKE ?)`;
      const likeQ = `%${q}%`;
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ);
    }
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY start_at DESC`;
    if (limit !== undefined) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }

    const rows = this.db.prepare(sql).all(...params) as ActivityRecord[];
    return rows.map((r) => ({ ...r, is_achievement: !!r.is_achievement, exclude_from_report: !!r.exclude_from_report }));
  }

  getRecord(id: string): ActivityRecord | undefined {
    const row = this.db.prepare('SELECT * FROM records WHERE id = ?').get(id) as ActivityRecord | undefined;
    if (row) {
      row.is_achievement = !!row.is_achievement;
      row.exclude_from_report = !!row.exclude_from_report;
    }
    return row;
  }

  createRecord(dto: RecordUpsertDTO, source: string = 'manual'): string {
    const id = dto.id || uuidv4();
    const now = formatUtcStorageDateTime();
    this.db.prepare(`
      INSERT INTO records (id, title, category, app, window_title, start_at, end_at, notes, source, created_at, is_achievement, exclude_from_report)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(id, dto.title || '工作记录', dto.category || '其他', dto.app || '', dto.window_title || '',
      dto.start_at, dto.end_at, dto.notes || '', source, now);
    return id;
  }

  updateRecord(id: string, dto: Partial<RecordUpsertDTO>): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    const fields: (keyof RecordUpsertDTO)[] = ['title', 'category', 'app', 'window_title', 'start_at', 'end_at', 'notes'];
    for (const f of fields) {
      if (dto[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(dto[f]);
      }
    }
    if (sets.length === 0) return;
    params.push(id);
    this.db.prepare(`UPDATE records SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  deleteRecord(id: string): void {
    this.db.prepare('DELETE FROM records WHERE id = ?').run(id);
  }

  deleteRecords(ids: string[]): void {
    if (ids.length === 0) return;
    const deleteStmt = this.db.prepare('DELETE FROM records WHERE id = ?');
    const transaction = this.db.transaction((recordIds: string[]) => {
      for (const id of recordIds) {
        deleteStmt.run(id);
      }
    });
    transaction(ids);
  }

  setRecordTag(id: string, tag: '成果' | '不写入日报', enabled: boolean): void {
    const field = tag === '成果' ? 'is_achievement' : 'exclude_from_report';
    this.db.prepare(`UPDATE records SET ${field} = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
  }

  updateRecordCategory(id: string, category: string): void {
    this.db.prepare('UPDATE records SET category = ? WHERE id = ?').run(category, id);
  }

  // ===== Reports CRUD =====
  listReports(query: ReportsQuery): Report[] {
    let sql = 'SELECT * FROM reports WHERE 1=1';
    const params: unknown[] = [];
    if (query.report_type) {
      sql += ' AND report_type = ?';
      params.push(query.report_type);
    }
    if (query.q) {
      sql += ' AND (template LIKE ? OR content LIKE ? OR report_type LIKE ?)';
      const likeQ = `%${query.q}%`;
      params.push(likeQ, likeQ, likeQ);
    }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all(...params) as Report[];
  }

  getReport(id: string): Report | undefined {
    return this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Report | undefined;
  }

  createReport(report: Omit<Report, 'id' | 'created_at'>): string {
    const id = uuidv4();
    const now = formatUtcStorageDateTime();
    this.db.prepare(
      'INSERT INTO reports (id, report_type, template, start_date, end_date, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, report.report_type, report.template, report.start_date, report.end_date, report.content, now);
    return id;
  }

  deleteReport(id: string): void {
    this.db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  }

  // ===== Settings =====
  getSetting(key: string, defaultValue: string = ''): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  getAllSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  // ===== Vision Results =====
  listVisionResults(limit: number = 20): VisionResult[] {
    return this.db.prepare('SELECT * FROM vision_results ORDER BY created_at DESC LIMIT ?').all(limit) as VisionResult[];
  }

  /** 按日期范围查询 vision_results，支持搜索和分类过滤 */
  listVisionResultsByDate(query: VisionQuery): VisionResult[] {
    const { start, end, q, category, limit } = query;
    const range = localDateRangeToUtcStorageRange(start, end);
    let sql = `SELECT * FROM vision_results WHERE created_at >= ? AND created_at <= ?`;
    const params: unknown[] = [range.start, range.end];

    if (q) {
      sql += ` AND (title LIKE ? OR summary LIKE ? OR category LIKE ? OR app LIKE ? OR window_title LIKE ?)`;
      const likeQ = `%${q}%`;
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ);
    }
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY created_at DESC`;
    if (limit !== undefined) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }

    return this.db.prepare(sql).all(...params) as VisionResult[];
  }

  addVisionResult(vr: Omit<VisionResult, 'id' | 'created_at'>): string {
    const id = uuidv4();
    const now = formatUtcStorageDateTime();
    this.db.prepare(
      'INSERT INTO vision_results (id, record_id, title, category, summary, raw_response, app, window_title, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, vr.record_id, vr.title, vr.category, vr.summary, vr.raw_response, vr.app, vr.window_title, vr.model, now);
    return id;
  }

  deleteVisionResult(id: string): void {
    this.db.prepare('DELETE FROM vision_results WHERE id = ?').run(id);
  }

  deleteVisionResults(ids: string[]): void {
    if (ids.length === 0) return;
    const deleteStmt = this.db.prepare('DELETE FROM vision_results WHERE id = ?');
    const transaction = this.db.transaction((visionIds: string[]) => {
      for (const id of visionIds) {
        deleteStmt.run(id);
      }
    });
    transaction(ids);
  }

  purgeVisionResultsSince(since: string): number {
    const result = this.db.prepare('DELETE FROM vision_results WHERE created_at >= ?').run(since);
    return result.changes;
  }

  // ===== Idle Periods =====
  createIdlePeriod(startAt: string): string {
    const id = uuidv4();
    const now = formatUtcStorageDateTime();
    this.db.prepare(
      'INSERT INTO idle_periods (id, start_at, end_at, created_at) VALUES (?, ?, NULL, ?)'
    ).run(id, startAt, now);
    return id;
  }

  closeIdlePeriod(id: string, endAt: string): void {
    this.db.prepare('UPDATE idle_periods SET end_at = ? WHERE id = ?').run(endAt, id);
  }

  listIdlePeriodsByDateRange(query: { start: string; end: string; limit?: number }): IdlePeriod[] {
    const range = localDateRangeToUtcStorageRange(query.start, query.end);
    let sql = `
      SELECT * FROM idle_periods
      WHERE start_at <= ?
        AND COALESCE(end_at, '9999-12-31 23:59:59') >= ?
      ORDER BY start_at ASC
    `;
    const params: unknown[] = [range.end, range.start];
    if (query.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }
    return this.db.prepare(sql).all(...params) as IdlePeriod[];
  }

  // ===== Export/Import =====
  exportAll(): { exported_at: string; records: ActivityRecord[]; reports: Report[] } {
    const records = this.listRecords({ start: '1900-01-01', end: '2999-12-31' });
    const reports = this.listReports({});
    return { exported_at: formatUtcStorageDateTime(), records, reports };
  }

  importAll(data: { records: ActivityRecord[] }): number {
    let n = 0;
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO records (id, title, category, app, window_title, start_at, end_at, notes, source, created_at, is_achievement, exclude_from_report) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const transaction = this.db.transaction((rows: ActivityRecord[]) => {
      for (const r of rows) {
        if (!r.start_at || !r.end_at) continue;
        stmt.run(r.id || uuidv4(), r.title || '工作记录', r.category || '其他', r.app || '', r.window_title || '',
          r.start_at, r.end_at, r.notes || '', r.source || 'import', r.created_at || '', r.is_achievement ? 1 : 0, r.exclude_from_report ? 1 : 0);
        n++;
      }
    });
    transaction(data.records);
    return n;
  }

  clear(): void {
    this.db.exec('DELETE FROM records; DELETE FROM reports; DELETE FROM vision_results; DELETE FROM idle_periods;');
  }

  close(): void {
    this.db.close();
  }
}
