import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseService } from '../src/main/database';

// Helper to create a fresh DatabaseService instance for each test
// Using :memory: database to avoid filesystem dependencies
function createService(): DatabaseService {
  DatabaseService.resetInstance();
  return DatabaseService.getInstance(':memory:');
}

// ===== DatabaseService =====
describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(() => {
    service = createService();
  });

  afterEach(() => {
    service?.close();
    DatabaseService.resetInstance();
    vi.useRealTimers();
  });

  // ===== Singleton =====
  describe('singleton pattern', () => {
    it('getInstance returns the same instance', () => {
      const a = DatabaseService.getInstance();
      const b = DatabaseService.getInstance();
      expect(a).toBe(b);
    });

    it('resetInstance clears the singleton', () => {
      const a = DatabaseService.getInstance();
      DatabaseService.resetInstance();
      const b = DatabaseService.getInstance();
      expect(a).not.toBe(b);
    });
  });

  // ===== Records: createRecord =====
  describe('createRecord()', () => {
    it('returns a string ID', () => {
      const id = service.createRecord({
        title: 'Test Record',
        category: '开发',
        app: 'VSCode',
        window_title: 'app.ts',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: 'writing tests',
      });
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('stores and retrieves correct data', () => {
      const id = service.createRecord({
        title: 'Code Review',
        category: '开发',
        app: 'GitHub',
        window_title: 'PR #42',
        start_at: '2026-06-25 14:00:00',
        end_at: '2026-06-25 15:00:00',
        notes: 'reviewed backend changes',
      });

      const record = service.getRecord(id);
      expect(record).toBeDefined();
      expect(record!.title).toBe('Code Review');
      expect(record!.category).toBe('开发');
      expect(record!.app).toBe('GitHub');
      expect(record!.window_title).toBe('PR #42');
      expect(record!.start_at).toBe('2026-06-25 14:00:00');
      expect(record!.end_at).toBe('2026-06-25 15:00:00');
      expect(record!.notes).toBe('reviewed backend changes');
    });

    it('defaults to source "manual"', () => {
      const id = service.createRecord({
        title: 'Test',
        category: '其他',
        app: '',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: '',
      });
      const record = service.getRecord(id);
      expect(record!.source).toBe('manual');
    });

    it('allows specifying custom source', () => {
      const id = service.createRecord({
        title: 'Auto Tracked',
        category: '沟通',
        app: 'WeChat',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 09:30:00',
        notes: '',
      }, 'auto');
      const record = service.getRecord(id);
      expect(record!.source).toBe('auto');
    });

    it('defaults empty title to "工作记录"', () => {
      const id = service.createRecord({
        title: '',
        category: '其他',
        app: '',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: '',
      });
      const record = service.getRecord(id);
      expect(record!.title).toBe('工作记录');
    });

    it('defaults empty category to "其他"', () => {
      const id = service.createRecord({
        title: 'Test',
        category: '',
        app: '',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: '',
      });
      const record = service.getRecord(id);
      expect(record!.category).toBe('其他');
    });

    it('rejects duplicate ID insertion (sqlite UNIQUE constraint)', () => {
      const id = 'fixed-id-001';
      service.createRecord({
        id,
        title: 'First',
        category: '其他',
        app: '',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: '',
      });
      // Second insert with same ID should throw
      expect(() => {
        service.createRecord({
          id,
          title: 'Second',
          category: '其他',
          app: '',
          window_title: '',
          start_at: '2026-06-25 09:00:00',
          end_at: '2026-06-25 10:00:00',
          notes: '',
        });
      }).toThrow();
    });

    it('auto-generates created_at timestamp', () => {
      const id = service.createRecord({
        title: 'Test',
        category: '其他',
        app: '',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: '',
      });
      const record = service.getRecord(id);
      expect(record!.created_at).toBeDefined();
      expect(record!.created_at.length).toBeGreaterThan(0);
    });

    it('sets is_achievement to 0 by default', () => {
      const id = service.createRecord({
        title: 'Test',
        category: '其他',
        app: '',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: '',
      });
      const record = service.getRecord(id);
      expect(record!.is_achievement).toBe(false);
    });

    it('sets exclude_from_report to 0 by default', () => {
      const id = service.createRecord({
        title: 'Test',
        category: '其他',
        app: '',
        window_title: '',
        start_at: '2026-06-25 09:00:00',
        end_at: '2026-06-25 10:00:00',
        notes: '',
      });
      const record = service.getRecord(id);
      expect(record!.exclude_from_report).toBe(false);
    });
  });

  // ===== Records: listRecords with date range =====
  describe('listRecords() date range', () => {
    beforeEach(() => {
      // Insert records on different dates
      service.createRecord({
        title: 'D1 Morning', category: '开发', app: 'VSCode', window_title: 'app.ts',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.createRecord({
        title: 'D1 Afternoon', category: '沟通', app: 'WeChat', window_title: '',
        start_at: '2026-06-25 14:00:00', end_at: '2026-06-25 15:00:00', notes: '',
      });
      service.createRecord({
        title: 'D2 Morning', category: '文档', app: 'Word', window_title: 'report.docx',
        start_at: '2026-06-26 09:00:00', end_at: '2026-06-26 10:00:00', notes: '',
      });
    });

    it('finds records within a single-day range', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25' });
      expect(records).toHaveLength(2);
    });

    it('finds records across a multi-day range', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-26' });
      expect(records).toHaveLength(3);
    });

    it('returns empty array for a range with no records', () => {
      const records = service.listRecords({ start: '2026-06-27', end: '2026-06-27' });
      expect(records).toHaveLength(0);
    });

    it('returns records sorted by start_at DESC', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-26' });
      // First should be the most recent
      expect(records[0].start_at >= records[1].start_at).toBe(true);
    });
  });

  // ===== Records: listRecords with filters =====
  describe('listRecords() filters', () => {
    beforeEach(() => {
      service.createRecord({
        title: 'Code D1', category: '开发', app: 'VSCode', window_title: 'main.ts',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: 'important feature',
      });
      service.createRecord({
        title: 'Chat D1', category: '沟通', app: 'WeChat', window_title: '微信',
        start_at: '2026-06-25 10:00:00', end_at: '2026-06-25 10:30:00', notes: '',
      });
      service.createRecord({
        title: 'Code D2', category: '开发', app: 'Cursor', window_title: 'utils.ts',
        start_at: '2026-06-25 11:00:00', end_at: '2026-06-25 12:00:00', notes: 'refactoring',
      });
    });

    it('filters by search query q (case-sensitive LIKE)', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', q: 'Code' });
      expect(records).toHaveLength(2);
    });

    it('filters by search query q with no match returns empty', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', q: 'nonexistent' });
      expect(records).toHaveLength(0);
    });

    it('filters by category', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', category: '开发' });
      expect(records).toHaveLength(2);
      for (const r of records) {
        expect(r.category).toBe('开发');
      }
    });

    it('filters by category with no match returns empty', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', category: '设计' });
      expect(records).toHaveLength(0);
    });

    it('respects limit parameter', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', limit: 1 });
      expect(records).toHaveLength(1);
    });

    it('combines q + category filter', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', q: 'Code', category: '开发' });
      expect(records).toHaveLength(2);
    });
  });

  // ===== Records: updateRecord =====
  describe('updateRecord()', () => {
    it('updates title', () => {
      const id = service.createRecord({
        title: 'Old Title', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.updateRecord(id, { title: 'New Title' });
      const record = service.getRecord(id);
      expect(record!.title).toBe('New Title');
    });

    it('updates category', () => {
      const id = service.createRecord({
        title: 'Test', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.updateRecord(id, { category: '开发' });
      const record = service.getRecord(id);
      expect(record!.category).toBe('开发');
    });

    it('updates multiple fields at once', () => {
      const id = service.createRecord({
        title: 'Test', category: '其他', app: 'OldApp', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: 'old notes',
      });
      service.updateRecord(id, {
        title: 'Updated',
        app: 'NewApp',
        notes: 'new notes',
      });
      const record = service.getRecord(id);
      expect(record!.title).toBe('Updated');
      expect(record!.app).toBe('NewApp');
      expect(record!.notes).toBe('new notes');
      expect(record!.category).toBe('其他'); // unchanged
    });

    it('does nothing when dto is empty', () => {
      const id = service.createRecord({
        title: 'Test', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      // Should not throw
      service.updateRecord(id, {});
      const record = service.getRecord(id);
      expect(record!.title).toBe('Test');
    });

    it('does not throw for non-existent record ID', () => {
      expect(() => {
        service.updateRecord('non-existent-id', { title: 'Test' });
      }).not.toThrow();
    });
  });

  // ===== Records: updateRecordCategory =====
  describe('updateRecordCategory()', () => {
    it('updates only the category field', () => {
      const id = service.createRecord({
        title: 'Test', category: '其他', app: 'App', window_title: 'Win',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: 'notes',
      });
      service.updateRecordCategory(id, '开发');
      const record = service.getRecord(id);
      expect(record!.category).toBe('开发');
      expect(record!.title).toBe('Test'); // unchanged
    });
  });

  // ===== Records: deleteRecord =====
  describe('deleteRecord()', () => {
    it('deletes a single record', () => {
      const id = service.createRecord({
        title: 'To Delete', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      expect(service.getRecord(id)).toBeDefined();
      service.deleteRecord(id);
      expect(service.getRecord(id)).toBeUndefined();
    });

    it('does not throw when deleting non-existent record', () => {
      expect(() => {
        service.deleteRecord('non-existent-id');
      }).not.toThrow();
    });
  });

  // ===== Records: deleteRecords (batch) =====
  describe('deleteRecords() (batch)', () => {
    it('deletes multiple records at once', () => {
      const id1 = service.createRecord({
        title: 'R1', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      const id2 = service.createRecord({
        title: 'R2', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 10:00:00', end_at: '2026-06-25 11:00:00', notes: '',
      });
      service.deleteRecords([id1, id2]);
      expect(service.getRecord(id1)).toBeUndefined();
      expect(service.getRecord(id2)).toBeUndefined();
    });

    it('does nothing with empty array', () => {
      expect(() => {
        service.deleteRecords([]);
      }).not.toThrow();
    });

    it('silently ignores non-existent IDs', () => {
      const id = service.createRecord({
        title: 'Keep', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.deleteRecords([id, 'non-existent']);
      expect(service.getRecord(id)).toBeUndefined();
    });
  });

  // ===== Records: setRecordTag =====
  describe('setRecordTag()', () => {
    let recordId: string;

    beforeEach(() => {
      recordId = service.createRecord({
        title: 'Tag Test', category: '开发', app: 'VSCode', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
    });

    it('sets is_achievement to true for tag "成果"', () => {
      service.setRecordTag(recordId, '成果', true);
      const record = service.getRecord(recordId);
      expect(record!.is_achievement).toBe(true);
    });

    it('sets is_achievement to false for tag "成果"', () => {
      service.setRecordTag(recordId, '成果', true);
      service.setRecordTag(recordId, '成果', false);
      const record = service.getRecord(recordId);
      expect(record!.is_achievement).toBe(false);
    });

    it('sets exclude_from_report to true for tag "不写入日报"', () => {
      service.setRecordTag(recordId, '不写入日报', true);
      const record = service.getRecord(recordId);
      expect(record!.exclude_from_report).toBe(true);
    });

    it('sets exclude_from_report to false for tag "不写入日报"', () => {
      service.setRecordTag(recordId, '不写入日报', true);
      service.setRecordTag(recordId, '不写入日报', false);
      const record = service.getRecord(recordId);
      expect(record!.exclude_from_report).toBe(false);
    });
  });

  // ===== Reports: createReport =====
  describe('createReport()', () => {
    it('returns a string ID', () => {
      const id = service.createReport({
        report_type: '日报',
        template: '成果导向日报',
        start_date: '2026-06-25',
        end_date: '2026-06-25',
        content: '# 今日成果\n- 完成测试',
      });
      expect(typeof id).toBe('string');
    });

    it('stores and retrieves correct report data', () => {
      const id = service.createReport({
        report_type: '日报',
        template: '工作轨迹日报',
        start_date: '2026-06-25',
        end_date: '2026-06-25',
        content: '## 工作轨迹\n09:00-12:00 开发...',
      });

      const report = service.getReport(id);
      expect(report).toBeDefined();
      expect(report!.report_type).toBe('日报');
      expect(report!.template).toBe('工作轨迹日报');
      expect(report!.start_date).toBe('2026-06-25');
      expect(report!.end_date).toBe('2026-06-25');
      expect(report!.content).toContain('工作轨迹');
    });

    it('auto-generates created_at', () => {
      const id = service.createReport({
        report_type: '周报',
        template: 'TOP3日报',
        start_date: '2026-06-20',
        end_date: '2026-06-26',
        content: '本周TOP3...',
      });
      const report = service.getReport(id);
      expect(report!.created_at).toBeDefined();
      expect(report!.created_at.length).toBeGreaterThan(0);
    });
  });

  // ===== Reports: listReports =====
  describe('listReports()', () => {
    beforeEach(() => {
      service.createReport({
        report_type: '日报', template: '成果导向日报',
        start_date: '2026-06-25', end_date: '2026-06-25', content: '日报1',
      });
      service.createReport({
        report_type: '日报', template: '工作轨迹日报',
        start_date: '2026-06-26', end_date: '2026-06-26', content: '日报2',
      });
      service.createReport({
        report_type: '周报', template: 'TOP3日报',
        start_date: '2026-06-20', end_date: '2026-06-26', content: '周报1',
      });
    });

    it('lists all reports when no filter', () => {
      const reports = service.listReports({});
      expect(reports).toHaveLength(3);
    });

    it('filters by report_type', () => {
      const reports = service.listReports({ report_type: '日报' });
      expect(reports).toHaveLength(2);
    });

    it('filters by search query', () => {
      const reports = service.listReports({ q: '周报' });
      expect(reports).toHaveLength(1);
    });

    it('returns sorted by created_at DESC', () => {
      const reports = service.listReports({});
      // newest first
      expect(reports[0].created_at >= reports[1].created_at).toBe(true);
      expect(reports[1].created_at >= reports[2].created_at).toBe(true);
    });
  });

  // ===== Reports: deleteReport =====
  describe('deleteReport()', () => {
    it('deletes a report', () => {
      const id = service.createReport({
        report_type: '日报', template: '成果导向日报',
        start_date: '2026-06-25', end_date: '2026-06-25', content: 'to delete',
      });
      expect(service.getReport(id)).toBeDefined();
      service.deleteReport(id);
      expect(service.getReport(id)).toBeUndefined();
    });

    it('does not throw for non-existent report', () => {
      expect(() => {
        service.deleteReport('non-existent');
      }).not.toThrow();
    });
  });

  // ===== Settings =====
  describe('getSetting() / setSetting()', () => {
    it('getSetting returns default when key is not set', () => {
      expect(service.getSetting('nonexistent_key')).toBe('');
    });

    it('getSetting returns custom default when key is not set', () => {
      expect(service.getSetting('nonexistent_key', 'custom_default')).toBe('custom_default');
    });

    it('setSetting + getSetting round-trips', () => {
      service.setSetting('theme', 'dark');
      expect(service.getSetting('theme')).toBe('dark');
    });

    it('setSetting overwrites existing value', () => {
      service.setSetting('key', 'value1');
      service.setSetting('key', 'value2');
      expect(service.getSetting('key')).toBe('value2');
    });
  });

  // ===== Settings: getAllSettings =====
  describe('getAllSettings()', () => {
    it('returns empty object when no settings', () => {
      expect(service.getAllSettings()).toEqual({});
    });

    it('returns all key-value pairs', () => {
      service.setSetting('a', '1');
      service.setSetting('b', '2');
      const settings = service.getAllSettings();
      expect(settings).toEqual({ a: '1', b: '2' });
    });
  });

  // ===== Vision Results =====
  describe('addVisionResult() / listVisionResults()', () => {
    it('adds and lists vision results', () => {
      const id = service.addVisionResult({
        record_id: 'rec-1',
        title: 'Code Review',
        category: '开发',
        summary: 'Reviewed PR changes',
        raw_response: '{"summary": "..."}',
        app: 'GitHub',
        window_title: 'PR #42',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });
      expect(typeof id).toBe('string');

      const results = service.listVisionResults();
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Code Review');
    });

    it('respects limit parameter', () => {
      service.addVisionResult({
        record_id: 'rec-1', title: 'R1', category: '开发',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });
      service.addVisionResult({
        record_id: 'rec-2', title: 'R2', category: '开发',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });
      const results = service.listVisionResults(1);
      expect(results).toHaveLength(1);
    });

    // Note: created_at has second-level precision, so same-second inserts
    // have undefined ordering. This test validates both records exist.
    it('stores multiple vision results', () => {
      service.addVisionResult({
        record_id: 'rec-1', title: 'Result A', category: '开发',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });
      service.addVisionResult({
        record_id: 'rec-2', title: 'Result B', category: '开发',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });
      const results = service.listVisionResults();
      expect(results).toHaveLength(2);
      const titles = results.map(r => r.title).sort();
      expect(titles).toEqual(['Result A', 'Result B']);
    });
  });

  describe('purgeVisionResultsSince()', () => {
    it('deletes only vision results created at or after the cutoff', () => {
      vi.useFakeTimers();

      vi.setSystemTime(new Date('2026-06-25T01:00:00.000Z'));
      service.addVisionResult({
        record_id: 'rec-before', title: 'Before', category: '开发',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });

      vi.setSystemTime(new Date('2026-06-25T01:05:00.000Z'));
      service.addVisionResult({
        record_id: 'rec-after', title: 'After', category: '其他',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });

      const deleted = service.purgeVisionResultsSince('2026-06-25 01:03:00');
      const remaining = service.listVisionResults();

      expect(deleted).toBe(1);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe('Before');
    });
  });

  describe('idle periods', () => {
    it('creates and closes an idle period', () => {
      const id = service.createIdlePeriod('2026-06-25 01:00:00');
      service.closeIdlePeriod(id, '2026-06-25 01:20:00');

      const periods = service.listIdlePeriodsByDateRange({ start: '2026-06-25', end: '2026-06-25' });
      expect(periods).toHaveLength(1);
      expect(periods[0].id).toBe(id);
      expect(periods[0].start_at).toBe('2026-06-25 01:00:00');
      expect(periods[0].end_at).toBe('2026-06-25 01:20:00');
    });

    it('finds idle periods that overlap the requested local date range', () => {
      const id = service.createIdlePeriod('2026-06-24 23:00:00');
      service.closeIdlePeriod(id, '2026-06-25 01:00:00');

      const periods = service.listIdlePeriodsByDateRange({ start: '2026-06-25', end: '2026-06-25' });
      expect(periods.map((period) => period.id)).toContain(id);
    });

    it('clear() removes idle periods', () => {
      service.createIdlePeriod('2026-06-25 01:00:00');
      service.clear();

      expect(service.listIdlePeriodsByDateRange({ start: '2026-06-25', end: '2026-06-25' })).toHaveLength(0);
    });
  });

  // ===== Export / Import =====
  describe('exportAll() / importAll()', () => {
    it('exportAll returns records and reports', () => {
      service.createRecord({
        title: 'Test', category: '开发', app: 'VSCode', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.createReport({
        report_type: '日报', template: '成果导向日报',
        start_date: '2026-06-25', end_date: '2026-06-25', content: 'test',
      });

      const exported = service.exportAll();
      expect(exported.records).toHaveLength(1);
      expect(exported.reports).toHaveLength(1);
      expect(exported.exported_at).toBeDefined();
    });

    it('importAll imports records with correct count', () => {
      const importedCount = service.importAll({
        records: [
          {
            id: 'imp-1',
            title: 'Imported',
            category: '开发',
            app: 'VSCode',
            window_title: '',
            start_at: '2026-06-25 09:00:00',
            end_at: '2026-06-25 10:00:00',
            notes: '',
            source: 'import',
            created_at: '2026-06-25 10:00:00',
            is_achievement: false,
            exclude_from_report: false,
          },
        ],
      });
      expect(importedCount).toBe(1);
    });

    it('importAll skips records with missing start_at/end_at', () => {
      const importedCount = service.importAll({
        records: [
          {
            id: 'imp-bad',
            title: 'Bad',
            category: '开发',
            app: 'VSCode',
            window_title: '',
            start_at: '',
            end_at: '',
            notes: '',
            source: 'import',
            created_at: '',
            is_achievement: false,
            exclude_from_report: false,
          },
        ],
      });
      expect(importedCount).toBe(0);
    });
  });

  // ===== clear() =====
  describe('clear()', () => {
    it('clears all records, reports, and vision results', () => {
      service.createRecord({
        title: 'R', category: '其他', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.createReport({
        report_type: '日报', template: '成果导向日报',
        start_date: '2026-06-25', end_date: '2026-06-25', content: 'test',
      });
      service.addVisionResult({
        record_id: 'r1', title: 'V', category: '其他',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'test',
      });

      service.clear();

      expect(service.listRecords({ start: '2000-01-01', end: '2099-12-31' })).toHaveLength(0);
      expect(service.listReports({})).toHaveLength(0);
      expect(service.listVisionResults()).toHaveLength(0);
    });
  });
});
