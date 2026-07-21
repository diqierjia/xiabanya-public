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
        category: '代码开发',
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
        category: '代码开发',
        app: 'GitHub',
        window_title: 'PR #42',
        start_at: '2026-06-25 14:00:00',
        end_at: '2026-06-25 15:00:00',
        notes: 'reviewed backend changes',
      });

      const record = service.getRecord(id);
      expect(record).toBeDefined();
      expect(record!.title).toBe('Code Review');
      expect(record!.category).toBe('代码开发');
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
        category: '沟通与协作',
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
        title: 'D1 Morning', category: '代码开发', app: 'VSCode', window_title: 'app.ts',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.createRecord({
        title: 'D1 Afternoon', category: '沟通与协作', app: 'WeChat', window_title: '',
        start_at: '2026-06-25 14:00:00', end_at: '2026-06-25 15:00:00', notes: '',
      });
      service.createRecord({
        title: 'D2 Morning', category: '文稿写作', app: 'Word', window_title: 'report.docx',
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
        title: 'Code D1', category: '代码开发', app: 'VSCode', window_title: 'main.ts',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: 'important feature',
      });
      service.createRecord({
        title: 'Chat D1', category: '沟通与协作', app: 'WeChat', window_title: '微信',
        start_at: '2026-06-25 10:00:00', end_at: '2026-06-25 10:30:00', notes: '',
      });
      service.createRecord({
        title: 'Code D2', category: '代码开发', app: 'Cursor', window_title: 'utils.ts',
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
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', category: '代码开发' });
      expect(records).toHaveLength(2);
      for (const r of records) {
        expect(r.category).toBe('代码开发');
      }
    });

    it('filters by category with no match returns empty', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', category: '视觉设计' });
      expect(records).toHaveLength(0);
    });

    it('respects limit parameter', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', limit: 1 });
      expect(records).toHaveLength(1);
    });

    it('combines q + category filter', () => {
      const records = service.listRecords({ start: '2026-06-25', end: '2026-06-25', q: 'Code', category: '代码开发' });
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
      service.updateRecord(id, { category: '代码开发' });
      const record = service.getRecord(id);
      expect(record!.category).toBe('代码开发');
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
      service.updateRecordCategory(id, '代码开发');
      const record = service.getRecord(id);
      expect(record!.category).toBe('代码开发');
      expect(record!.title).toBe('Test'); // unchanged
    });

    it('renames categories in existing records and vision results together', () => {
      const recordId = service.createRecord({
        title: 'Old category', category: '代码开发', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      const visionId = service.addVisionResult({
        record_id: recordId, title: 'Vision category', category: '代码开发', summary: '', raw_response: '', app: '', window_title: '', model: 'test',
      });

      service.saveManagedCategories(['编程', '其他'], [{ from: '代码开发', to: '编程' }]);

      expect(service.getRecord(recordId)?.category).toBe('编程');
      expect(service.listVisionResults(10).find((result) => result.id === visionId)?.category).toBe('编程');
      expect(service.getSetting('managed_categories')).toBe(JSON.stringify(['编程', '其他']));
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
        title: 'Tag Test', category: '代码开发', app: 'VSCode', window_title: '',
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
        category: '代码开发',
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
        record_id: 'rec-1', title: 'R1', category: '代码开发',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });
      service.addVisionResult({
        record_id: 'rec-2', title: 'R2', category: '代码开发',
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
        record_id: 'rec-1', title: 'Result A', category: '代码开发',
        summary: '', raw_response: '', app: '', window_title: '',
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      });
      service.addVisionResult({
        record_id: 'rec-2', title: 'Result B', category: '代码开发',
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
        record_id: 'rec-before', title: 'Before', category: '代码开发',
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

  describe('chat messages', () => {
    it('adds and lists chat messages in conversation order', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T01:00:00.000Z'));
      const userId = service.addChatMessage({ role: 'user', content: '今天我做了什么？' });

      vi.setSystemTime(new Date('2026-06-25T01:00:01.000Z'));
      const assistantId = service.addChatMessage({ role: 'assistant', content: '你主要在写代码。' });

      const messages = service.listChatMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe(userId);
      expect(messages[0].role).toBe('user');
      expect(messages[1].id).toBe(assistantId);
      expect(messages[1].role).toBe('assistant');
    });

    it('filters chat messages by content search', () => {
      service.addChatMessage({ role: 'user', content: '整理日报素材' });
      service.addChatMessage({ role: 'assistant', content: '可以，先看今天的工作记录。' });

      const messages = service.listChatMessages({ q: '日报' });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('日报');
    });

    it('uses an explicit chat message id when provided', () => {
      const id = service.addChatMessage({
        id: 'proactive-message-1',
        role: 'assistant',
        content: '你今天看起来状态不错（我猜的）。',
      });

      const messages = service.listChatMessages();
      expect(id).toBe('proactive-message-1');
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('proactive-message-1');
    });

    it('rejects empty chat message content', () => {
      expect(() => {
        service.addChatMessage({ role: 'user', content: '   ' });
      }).toThrow('Chat message content cannot be empty');
    });
  });

  describe('chat memory retrieval', () => {
    it('records realtime extraction sources once and exposes only completed event sources to compaction', () => {
      expect(service.claimRealtimeMemoryExtraction('u-safety-1', 'safety')).toBe(true);
      expect(service.claimRealtimeMemoryExtraction('u-safety-1', 'safety')).toBe(false);
      expect(service.listRealtimeExtractedMessageIds(['u-safety-1'])).toEqual([]);

      const [eventId] = service.createMemoryEvents([{
        title: '花生过敏', summary: '用户明确表示对花生过敏。', criticality: 'safety', confidence: 0.95,
      }], ['u-safety-1'], 1, '我对花生过敏。');
      service.finishRealtimeMemoryExtraction('u-safety-1', [eventId]);

      expect(service.listRealtimeExtractedMessageIds(['u-safety-1', 'u-other'])).toEqual(['u-safety-1']);
      expect(service.listMemoryEvents()[0]).toMatchObject({ id: eventId, criticality: 'safety' });
    });

    it('keeps the latest 12 complete turns raw and compacts the earliest four turns', () => {
      for (let turn = 1; turn <= 16; turn += 1) {
        service.addChatMessage({ id: `u-${turn}`, role: 'user', content: `问题 ${turn}` });
        service.addChatMessage({ id: `a-${turn}`, role: 'assistant', content: `回答 ${turn}` });
        service.advanceMemoryTurn();
      }

      const firstBatch = service.claimNextChatCompactionBatch();
      expect(firstBatch).toMatchObject({ startTurn: 1, endTurn: 4 });
      expect(firstBatch?.messages.map((message) => message.id)).toEqual([
        'u-1', 'a-1', 'u-2', 'a-2', 'u-3', 'a-3', 'u-4', 'a-4',
      ]);
      expect(service.getPendingChatCompactionMessages()).toHaveLength(8);

      service.completeChatCompaction(firstBatch!.id, {
        conversationSummary: '用户正在讨论会话整理规则，后续需要保留最近原文与摘要的衔接。',
        events: [{ title: '确定会话整理节奏', summary: '始终保留最近 12 轮原文，每批整理最早 4 轮。', confidence: 0.9 }],
        elements: [{ name: '会话整理', type: 'concept', scope: 'project', state: '按保留 12 轮原文和每批 4 轮执行' }],
      });
      expect(service.getChatWorkingSummary()).toContain('会话整理规则');
      expect(service.getPendingChatCompactionMessages()).toEqual([]);
      expect(service.listMemoryEvents()).toHaveLength(1);
      expect(service.listMemoryElements().find((item) => item.name === '会话整理')?.current_state).toContain('保留 12 轮');

      for (let turn = 17; turn <= 20; turn += 1) {
        service.addChatMessage({ id: `u-${turn}`, role: 'user', content: `问题 ${turn}` });
        service.addChatMessage({ id: `a-${turn}`, role: 'assistant', content: `回答 ${turn}` });
        service.advanceMemoryTurn();
      }
      expect(service.claimNextChatCompactionBatch()).toMatchObject({ startTurn: 5, endTurn: 8 });
    });

    it('releases stale processing batches and limits automatic retries before allowing a manual retry', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-17T01:00:00.000Z'));
      for (let turn = 1; turn <= 16; turn += 1) {
        service.addChatMessage({ id: `stale-u-${turn}`, role: 'user', content: `问题 ${turn}` });
        service.addChatMessage({ id: `stale-a-${turn}`, role: 'assistant', content: `回答 ${turn}` });
        service.advanceMemoryTurn();
      }

      const first = service.claimNextChatCompactionBatch();
      expect(first).toMatchObject({ startTurn: 1, endTurn: 4 });
      vi.setSystemTime(new Date('2026-07-17T01:10:01.000Z'));
      expect(service.recoverStaleChatCompactions()).toBe(1);
      expect(service.getChatMemoryRuntimeDebug().compactions[0]).toMatchObject({ status: 'pending', attempt_count: 1 });

      let batch = service.claimNextChatCompactionBatch();
      expect(batch).toBeDefined();
      for (let attempt = 2; attempt <= 4; attempt += 1) {
        const retry = service.failChatCompaction(batch!.id, new Error(`失败 ${attempt}`));
        if (attempt < 4) {
          expect(retry.terminal).toBe(false);
          vi.setSystemTime(new Date(retry.nextRetryAt!));
          batch = service.claimNextChatCompactionBatch();
          expect(batch).toBeDefined();
        } else {
          expect(retry.terminal).toBe(true);
        }
      }
      expect(service.getChatMemoryRuntimeDebug().compactions[0]).toMatchObject({ status: 'failed', attempt_count: 4 });
      expect(service.retryChatCompaction(first!.id)).toBe(true);
      expect(service.claimNextChatCompactionBatch()).toBeDefined();
    });

    it('persists tool-call debug records with parameters, results, and adoption outcome', () => {
      service.saveMemoryToolDebugRun({
        userMessageId: 'msg-user-1',
        assistantMessageId: 'msg-assistant-1',
        turn: 12,
        mode: 'tool',
        calls: [{
          name: 'search_events',
          arguments: { query: '事件网络', limit: 3 },
          result: { ok: true, events: '[evt-1] 事件网络方案' },
        }],
        usedEventIds: ['evt-1'],
        usedElementIds: ['el-1'],
        proposalCount: 0,
      });

      const [run] = service.listMemoryToolDebugRuns();
      expect(run).toMatchObject({
        user_message_id: 'msg-user-1',
        assistant_message_id: 'msg-assistant-1',
        turn: 12,
        mode: 'tool',
        used_event_ids: ['evt-1'],
        used_element_ids: ['el-1'],
        proposal_count: 0,
      });
      expect(run.calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'search_events', arguments: { query: '事件网络', limit: 3 }, result: { ok: true, events: '[evt-1] 事件网络方案' } }),
      ]));
      expect(service.getMemoryToolDebugRunByAssistantMessageId('msg-assistant-1')?.id).toBe(run.id);
    });

    it('keeps a fallback diagnostic even when no tool was called', () => {
      service.saveMemoryToolDebugRun({
        turn: 13,
        mode: 'fallback',
        calls: [],
        usedEventIds: [],
        usedElementIds: [],
        proposalCount: 0,
        fallbackReason: '模型服务未返回兼容的工具调用响应。',
      });

      const [run] = service.listMemoryToolDebugRuns();
      expect(run).toMatchObject({
        mode: 'fallback',
        calls: [],
        used_event_ids: [],
        fallback_reason: '模型服务未返回兼容的工具调用响应。',
      });
    });

    it('keeps an event immediately retrievable even while its source chat is still recent', () => {
      const [eventId] = service.createMemoryEvents([{
        title: '确定记忆交接规则',
        summary: '原始对话和事件卡可以同时进入聊天上下文。',
        narrative: '事件卡与最近 12 轮原始对话可以同时参与连续记忆。',
        tags: ['记忆', '短期上下文'],
        confidence: 0.9,
      }], ['message-user-1', 'message-assistant-1'], 1, '事件卡先不要重复注入');

      expect(service.findMemoryEventsForChat('记忆交接')).toHaveLength(1);
      expect(service.getMemoryEvent(eventId)).toBeDefined();
    });

    it('keeps element-state history while default reads return the newest state', () => {
      const elementId = service.setMemoryElementState({
        name: '记忆系统', type: 'concept', scope: 'project', state: '初版方案讨论中', validAt: '2026-07-10 10:00:00', sourceRefs: ['msg-1'], turn: 1,
      });
      service.setMemoryElementState({
        elementId, state: '今天相关工作接近完成', validAt: '2026-07-13 18:00:00', sourceRefs: ['msg-2'], turn: 2,
      });

      expect(service.getMemoryElement(elementId)?.current_state).toBe('今天相关工作接近完成');
      expect(service.getMemoryElementAt(elementId, '2026-07-10 23:59:59')?.current_state).toBe('初版方案讨论中');
    });

    it('gives elements their own decay, adoption reset, and shared L0 ranking', () => {
      service.createMemoryEvents([{
        title: '较早事件', summary: '用于验证元素和事件共用 L0 名额。', confidence: 0.9,
      }], [], 0);
      const elementId = service.setMemoryElementState({
        name: '当前项目', type: 'project', scope: 'project', state: '进行中', turn: 0,
      });

      service.advanceMemoryTurn();
      service.advanceMemoryTurn();
      expect(service.getMemoryElement(elementId)?.weight.value).toBeLessThan(1);

      service.adoptMemoryElements([elementId], 2);
      const element = service.getMemoryElement(elementId);
      expect(element?.weight).toMatchObject({ value: 1, mention_count: 2, last_adopted_turn: 2 });
      expect(service.listResidentMemory(3)).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'element', value: expect.objectContaining({ id: elementId }) }),
      ]));
    });

    it('treats 用户 and 下班鸭 as unique conversation anchors across event scopes', () => {
      const projectId = service.setMemoryElementState({
        name: '下班鸭', type: 'project', scope: 'project', state: '负责提醒', turn: 1,
      });
      const userScopedId = service.setMemoryElementState({
        name: '下班鸭', type: 'project', scope: 'user', state: '负责提醒和陪伴', turn: 2,
      });
      const [eventId] = service.createMemoryEvents([{
        title: '用户设定提醒约束', summary: '用户要求下班前提醒整理。', scope: 'user', confidence: 0.9,
        elements: [{ name: '下班鸭', type: 'project', role: '执行者', state: '负责提醒和陪伴' }],
      }], ['msg-user-1'], 2);

      expect(projectId).toBe(userScopedId);
      const duckCards = service.listMemoryElements().filter((element) => element.name === '下班鸭');
      expect(duckCards).toEqual([expect.objectContaining({ id: projectId, special_role: 'assistant', current_state: '负责提醒和陪伴' })]);
      expect(service.listMemoryElements()).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: '用户', special_role: 'user' }),
      ]));
      expect(service.getMemoryEvent(eventId)?.elements).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: '用户', special_role: 'user', role: '对话参与者' }),
        expect.objectContaining({ name: '下班鸭', special_role: 'assistant' }),
      ]));
    });

    it('applies a verified mixed memory proposal as event and element changes', () => {
      const result = service.applyMemoryProposal({
        sourceMessageIds: ['msg-user-1'],
        evidence: [{ message_id: 'msg-user-1', quote: '我叫小橙子' }],
        changes: [
          { kind: 'element', name: '小橙子', type: 'person', scope: 'user' },
          { kind: 'element_state', name: '记忆系统', type: 'concept', scope: 'project', state: '今天相关工作接近完成', valid_at: '2026-07-13 18:00:00' },
          { kind: 'event', title: '记忆系统进入收尾阶段', summary: '用户确认今天相关工作差不多了。', confidence: 0.65, scope: 'project' },
        ],
      }, 3);

      expect(result.proposalId).toMatch(/^memprop_/);
      expect(result.eventIds).toHaveLength(1);
      expect(service.listMemoryElements().map((element) => element.name)).toEqual(expect.arrayContaining(['小橙子', '记忆系统']));
    });
  });

  // ===== Export / Import =====
  describe('exportAll() / importAll()', () => {
    it('exportAll returns records and reports', () => {
      service.createRecord({
        title: 'Test', category: '代码开发', app: 'VSCode', window_title: '',
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

    it('exports records and overlapping reports for a selected date range', () => {
      service.createRecord({
        title: 'In range', category: '代码开发', app: '', window_title: '',
        start_at: '2026-06-25 09:00:00', end_at: '2026-06-25 10:00:00', notes: '',
      });
      service.createRecord({
        title: 'Out of range', category: '代码开发', app: '', window_title: '',
        start_at: '2026-06-26 09:00:00', end_at: '2026-06-26 10:00:00', notes: '',
      });
      service.createReport({ report_type: '日报', template: '日报', start_date: '2026-06-25', end_date: '2026-06-25', content: '当天报告' });
      service.createReport({ report_type: '周报', template: '周报', start_date: '2026-06-23', end_date: '2026-06-26', content: '跨天报告' });
      service.createReport({ report_type: '日报', template: '日报', start_date: '2026-06-26', end_date: '2026-06-26', content: '次日报告' });

      const exported = service.exportAll({ start: '2026-06-25', end: '2026-06-25' });
      expect(exported.range).toEqual({ start: '2026-06-25', end: '2026-06-25' });
      expect(exported.records.map((record) => record.title)).toEqual(['In range']);
      expect(exported.reports.map((report) => report.content)).toEqual(expect.arrayContaining(['当天报告', '跨天报告']));
      expect(exported.reports).toHaveLength(2);
    });

    it('importAll imports records with correct count', () => {
      const importedCount = service.importAll({
        records: [
          {
            id: 'imp-1',
            title: 'Imported',
            category: '代码开发',
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

    it('importAll restores reports from an export payload', () => {
      const importedCount = service.importAll({
        records: [],
        reports: [{
          id: 'imp-report-1', report_type: '日报', template: '工作日报',
          start_date: '2026-06-25', end_date: '2026-06-25', content: '已导入报告', created_at: '2026-06-25 18:00:00',
        }],
      });
      expect(importedCount).toBe(1);
      expect(service.getReport('imp-report-1')?.content).toBe('已导入报告');
    });

    it('importAll skips records with missing start_at/end_at', () => {
      const importedCount = service.importAll({
        records: [
          {
            id: 'imp-bad',
            title: 'Bad',
            category: '代码开发',
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
      service.addChatMessage({
        role: 'user',
        content: '今天我做了什么？',
      });

      service.clear();

      expect(service.listRecords({ start: '2000-01-01', end: '2099-12-31' })).toHaveLength(0);
      expect(service.listReports({})).toHaveLength(0);
      expect(service.listVisionResults()).toHaveLength(0);
      expect(service.listChatMessages()).toHaveLength(0);
    });
  });
});
