import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  ActivityRecord,
  ChatCompactionDebugRun,
  ChatMemoryRuntimeDebug,
  ChatHistoryMessage,
  IdlePeriod,
  MemoryCriticality,
  MemoryDashboard,
  MemoryElement,
  MemoryElementDetail,
  MemoryEvent,
  MemoryEventDetail,
  MemoryEventUpdate,
  MemoryListQuery,
  MemoryRelation,
  MemoryScope,
  MemoryStatus,
  MemoryToolDebugCall,
  MemoryToolDebugRun,
  MemoryWeightPoint,
  QueuedChatMessage,
  Report,
  VisionResult,
  VisionQuery,
  RecordUpsertDTO,
  RecordsQuery,
  ReportsQuery,
} from '../shared/types';
import { formatUtcStorageDateTime, localDateRangeToUtcStorageRange } from '../shared/time';

export interface ChatCompactionBatch {
  id: string;
  startTurn: number;
  endTurn: number;
  previousSummary: string;
  messages: ChatHistoryMessage[];
}

export interface ChatCompactionResult {
  conversationSummary: string;
  events: Array<{
    title: string;
    summary: string;
    narrative?: string;
    tags?: string[];
    scope?: MemoryScope;
    criticality?: MemoryCriticality;
    confidence?: number;
    elements?: Array<{ name: string; type?: MemoryElement['type']; role?: string; state?: string }>;
    relations?: MemoryRelation[];
  }>;
  elements: Array<{ name: string; type?: MemoryElement['type']; scope?: MemoryScope; state?: string }>;
  calls?: MemoryToolDebugCall[];
  residentMemory?: ChatCompactionDebugRun['resident_memory'];
}

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

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reply_to_message_id TEXT,
        response_latency_ms INTEGER,
        vision_understanding_latency_ms INTEGER,
        total_wait_latency_ms INTEGER
      );

      CREATE TABLE IF NOT EXISTS chat_queued_messages (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        scope TEXT NOT NULL,
        criticality TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        narrative TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        quotes_json TEXT NOT NULL DEFAULT '[]',
        source_refs_json TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        superseded_by TEXT,
        mention_count INTEGER NOT NULL DEFAULT 1,
        last_adopted_turn INTEGER NOT NULL DEFAULT 0,
        last_retrieved_at TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        floor_weight REAL NOT NULL DEFAULT 0,
        forced_cap REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_elements (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        scope TEXT NOT NULL,
        special_role TEXT,
        current_state TEXT NOT NULL DEFAULT '',
        mention_count INTEGER NOT NULL DEFAULT 1,
        last_adopted_turn INTEGER NOT NULL DEFAULT 0,
        last_retrieved_at TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        floor_weight REAL NOT NULL DEFAULT 0,
        forced_cap REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_event_elements (
        event_id TEXT NOT NULL,
        element_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(event_id, element_id),
        FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE,
        FOREIGN KEY(element_id) REFERENCES memory_elements(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_event_relations (
        event_id TEXT NOT NULL,
        target_event_id TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(event_id, target_event_id, type),
        FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_weight_history (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        turn INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_element_state_history (
        id TEXT PRIMARY KEY,
        element_id TEXT NOT NULL,
        state TEXT NOT NULL,
        valid_at TEXT NOT NULL,
        source_refs_json TEXT NOT NULL DEFAULT '[]',
        turn INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(element_id) REFERENCES memory_elements(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_usage_receipts (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        assistant_message_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_proposals (
        id TEXT PRIMARY KEY,
        source_refs_json TEXT NOT NULL DEFAULT '[]',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        changes_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        turn INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS chat_compactions (
        id TEXT PRIMARY KEY,
        start_turn INTEGER NOT NULL UNIQUE,
        end_turn INTEGER NOT NULL,
        source_refs_json TEXT NOT NULL DEFAULT '[]',
        conversation_summary TEXT NOT NULL DEFAULT '',
        tool_calls_json TEXT NOT NULL DEFAULT '[]',
        resident_memory_json TEXT NOT NULL DEFAULT '[]',
        event_ids_json TEXT NOT NULL DEFAULT '[]',
        element_ids_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS memory_tool_debug_runs (
        id TEXT PRIMARY KEY,
        user_message_id TEXT,
        assistant_message_id TEXT,
        turn INTEGER NOT NULL,
        mode TEXT NOT NULL,
        calls_json TEXT NOT NULL DEFAULT '[]',
        used_event_ids_json TEXT NOT NULL DEFAULT '[]',
        used_element_ids_json TEXT NOT NULL DEFAULT '[]',
        proposal_count INTEGER NOT NULL DEFAULT 0,
        fallback_reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_idle_periods_range ON idle_periods(start_at, end_at);
      CREATE INDEX IF NOT EXISTS idx_vision_created ON vision_results(created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_queued_messages_created ON chat_queued_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_events_status ON memory_events(status, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_event_elements_element ON memory_event_elements(element_id);
      CREATE INDEX IF NOT EXISTS idx_memory_weight_history_event ON memory_weight_history(event_id, turn);
      CREATE INDEX IF NOT EXISTS idx_memory_element_states_element ON memory_element_state_history(element_id, valid_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_usage_receipts_event ON memory_usage_receipts(event_id, turn);
      CREATE INDEX IF NOT EXISTS idx_memory_proposals_status ON memory_proposals(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_tool_debug_runs_created ON memory_tool_debug_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_compactions_status ON chat_compactions(status, start_turn);
    `);
    this.ensureVisionResultColumns();
    this.ensureChatMessageColumns();
    this.ensureMemoryElementColumns();
    this.ensureChatCompactionColumns();
    this.ensureMemoryToolDebugColumns();
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private ensureVisionResultColumns(): void {
    this.ensureColumn('vision_results', 'observed_fact', 'TEXT DEFAULT ""');
    this.ensureColumn('vision_results', 'possible_activity', 'TEXT DEFAULT ""');
    this.ensureColumn('vision_results', 'confidence', 'TEXT DEFAULT "medium"');
    this.ensureColumn('vision_results', 'activity_type', 'TEXT DEFAULT "unclear"');
    this.ensureColumn('vision_results', 'segment_merge', 'TEXT DEFAULT ""');
    this.ensureColumn('vision_results', 'stuck_signal', 'TEXT DEFAULT ""');
    this.ensureColumn('vision_results', 'distraction_signal', 'TEXT DEFAULT ""');
    this.ensureColumn('vision_results', 'content_mood', 'TEXT DEFAULT ""');
  }

  private ensureChatMessageColumns(): void {
    this.ensureColumn('chat_messages', 'reply_to_message_id', 'TEXT');
    this.ensureColumn('chat_messages', 'response_latency_ms', 'INTEGER');
    this.ensureColumn('chat_messages', 'vision_understanding_latency_ms', 'INTEGER');
    this.ensureColumn('chat_messages', 'total_wait_latency_ms', 'INTEGER');
  }

  private ensureMemoryElementColumns(): void {
    this.ensureColumn('memory_elements', 'mention_count', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('memory_elements', 'last_adopted_turn', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('memory_elements', 'last_retrieved_at', 'TEXT');
    this.ensureColumn('memory_elements', 'floor_weight', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('memory_elements', 'forced_cap', 'REAL');
    this.ensureColumn('memory_elements', 'special_role', 'TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_elements_special_role ON memory_elements(special_role) WHERE special_role IS NOT NULL');

    if (this.getSetting('memory_element_weights_initialized', '') !== '1') {
      // 旧元素卡此前借用关联事件的权重。升级时继承一次最近关联事件的使用历史，
      // 之后元素卡只维护自己的衰减和实际使用记录。
      const legacyRows = this.db.prepare(`
        SELECT link.element_id AS id, MAX(event.last_adopted_turn) AS last_adopted_turn, MAX(event.mention_count) AS mention_count
        FROM memory_event_elements link
        JOIN memory_events event ON event.id = link.event_id
        GROUP BY link.element_id
      `).all() as Array<{ id: string; last_adopted_turn: number | null; mention_count: number | null }>;
      const update = this.db.prepare('UPDATE memory_elements SET last_adopted_turn = ?, mention_count = ? WHERE id = ?');
      const initialize = this.db.transaction(() => {
        for (const row of legacyRows) {
          update.run(Math.max(0, Number(row.last_adopted_turn) || 0), Math.max(1, Number(row.mention_count) || 1), row.id);
        }
      });
      initialize();
      this.setSetting('memory_element_weights_initialized', '1');
    }
    this.ensureConversationAnchors();
  }

  /**
   * 用户和下班鸭是聊天记忆的两个固定主体，不是按 scope 复制出来的普通实体。
   * 这里兼容已有库：同名旧卡的事件关系、状态历史都收束到一个 canonical 卡上。
   */
  private ensureConversationAnchors(): void {
    const ensure = this.db.transaction(() => {
      const userId = this.ensureSpecialElement('user', '用户', 'person', 'user');
      const assistantId = this.ensureSpecialElement('assistant', '下班鸭', 'project', 'project');
      // 现有事件同样来自聊天；迁移时一次性补齐两个参与者，避免旧历史只挂在普通元素上。
      const link = this.db.prepare('INSERT OR IGNORE INTO memory_event_elements (event_id, element_id, role) SELECT id, ?, ? FROM memory_events');
      link.run(userId, '对话参与者');
      link.run(assistantId, '对话参与者');
    });
    ensure();
  }

  private ensureSpecialElement(role: 'user' | 'assistant', name: string, type: MemoryElement['type'], scope: MemoryScope): string {
    const rows = this.db.prepare(`
      SELECT * FROM memory_elements
      WHERE special_role = ? OR name = ? COLLATE NOCASE
      ORDER BY CASE WHEN special_role = ? THEN 0 WHEN scope = ? THEN 1 ELSE 2 END, created_at ASC, id ASC
    `).all(role, name, role, scope) as Array<Record<string, unknown>>;
    const now = formatUtcStorageDateTime();
    if (rows.length === 0) {
      const id = `elem_${uuidv4()}`;
      this.db.prepare(`
        INSERT INTO memory_elements (id, type, name, scope, special_role, current_state, mention_count, last_adopted_turn, pinned, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', 1, ?, 1, ?, ?)
      `).run(id, type, name, scope, role, this.getMemoryTurn(), now, now);
      return id;
    }

    const canonical = rows[0];
    const canonicalId = String(canonical.id);
    const latestState = rows
      .filter((row) => String(row.current_state || '').trim())
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    const maxMentions = Math.max(...rows.map((row) => Math.max(1, Number(row.mention_count) || 1)));
    const latestTurn = Math.max(...rows.map((row) => Math.max(0, Number(row.last_adopted_turn) || 0)));

    for (const duplicate of rows.slice(1)) this.mergeMemoryElements(canonicalId, String(duplicate.id));
    this.db.prepare(`
      UPDATE memory_elements
      SET type = ?, name = ?, scope = ?, special_role = ?, pinned = 1,
        current_state = ?, mention_count = ?, last_adopted_turn = ?, updated_at = ?
      WHERE id = ?
    `).run(type, name, scope, role, String(latestState?.current_state || canonical.current_state || ''), maxMentions, latestTurn, now, canonicalId);
    return canonicalId;
  }

  private mergeMemoryElements(targetId: string, duplicateId: string): void {
    if (targetId === duplicateId) return;
    this.db.prepare(`
      INSERT OR IGNORE INTO memory_event_elements (event_id, element_id, role)
      SELECT event_id, ?, role FROM memory_event_elements WHERE element_id = ?
    `).run(targetId, duplicateId);
    this.db.prepare('DELETE FROM memory_event_elements WHERE element_id = ?').run(duplicateId);
    this.db.prepare('UPDATE memory_element_state_history SET element_id = ? WHERE element_id = ?').run(targetId, duplicateId);
    this.db.prepare('DELETE FROM memory_elements WHERE id = ?').run(duplicateId);
  }

  private ensureChatCompactionColumns(): void {
    this.ensureColumn('chat_compactions', 'tool_calls_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('chat_compactions', 'resident_memory_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('chat_compactions', 'event_ids_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('chat_compactions', 'element_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  }

  private ensureMemoryToolDebugColumns(): void {
    this.ensureColumn('memory_tool_debug_runs', 'used_element_ids_json', "TEXT NOT NULL DEFAULT '[]'");
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
    sql += ' ORDER BY created_at DESC, rowid DESC';
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

  updateReportContent(id: string, content: string): Report {
    const result = this.db.prepare('UPDATE reports SET content = ? WHERE id = ?').run(content, id);
    if (result.changes === 0) {
      throw new Error('Report not found');
    }
    const report = this.getReport(id);
    if (!report) {
      throw new Error('Report not found');
    }
    return report;
  }

  deleteReport(id: string): void {
    this.db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  }

  // ===== Chat Messages =====
  addChatMessage(message: {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: string;
    replyToMessageId?: string;
    responseLatencyMs?: number;
    visionUnderstandingLatencyMs?: number;
    totalWaitLatencyMs?: number;
  }): string {
    const content = message.content.trim();
    if (!content) {
      throw new Error('Chat message content cannot be empty');
    }
    const id = message.id || uuidv4();
    const now = message.createdAt || formatUtcStorageDateTime();
    const responseLatencyMs = Number.isFinite(message.responseLatencyMs)
      ? Math.max(0, Math.round(message.responseLatencyMs!))
      : null;
    const visionUnderstandingLatencyMs = Number.isFinite(message.visionUnderstandingLatencyMs)
      ? Math.max(0, Math.round(message.visionUnderstandingLatencyMs!))
      : null;
    const totalWaitLatencyMs = Number.isFinite(message.totalWaitLatencyMs)
      ? Math.max(0, Math.round(message.totalWaitLatencyMs!))
      : null;
    this.db.prepare(
      `INSERT INTO chat_messages (
        id, role, content, created_at, reply_to_message_id, response_latency_ms,
        vision_understanding_latency_ms, total_wait_latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, message.role, content, now, message.replyToMessageId || null, responseLatencyMs, visionUnderstandingLatencyMs, totalWaitLatencyMs);
    return id;
  }

  queueChatMessage(message: { id?: string; content: string }): string {
    const content = message.content.trim();
    if (!content) throw new Error('Queued chat message content cannot be empty');
    const id = message.id || uuidv4();
    this.db.prepare('INSERT INTO chat_queued_messages (id, content, created_at) VALUES (?, ?, ?)')
      .run(id, content, formatUtcStorageDateTime());
    return id;
  }

  listQueuedChatMessages(): QueuedChatMessage[] {
    return this.db.prepare('SELECT * FROM chat_queued_messages ORDER BY created_at ASC, rowid ASC').all() as QueuedChatMessage[];
  }

  promoteQueuedChatMessage(id: string): string | undefined {
    return this.db.transaction(() => {
      const queued = this.db.prepare('SELECT id, content, created_at FROM chat_queued_messages WHERE id = ?').get(id) as { id: string; content: string; created_at: string } | undefined;
      if (!queued) return undefined;
      // 排队期间也属于用户发出消息的真实时刻，晋升后不得把它改写成“刚刚”。
      this.addChatMessage({ id: queued.id, role: 'user', content: queued.content, createdAt: queued.created_at });
      this.db.prepare('DELETE FROM chat_queued_messages WHERE id = ?').run(id);
      return queued.id;
    })();
  }

  listChatMessages(query: { q?: string; limit?: number; before?: { createdAt: string; sequence: number } } = {}): ChatHistoryMessage[] {
    let sql = 'SELECT chat_messages.*, rowid AS sequence FROM chat_messages WHERE 1=1';
    const params: unknown[] = [];
    if (query.q) {
      sql += ' AND content LIKE ?';
      params.push(`%${query.q}%`);
    }
    if (query.before) {
      sql += ' AND (created_at < ? OR (created_at = ? AND rowid < ?))';
      params.push(query.before.createdAt, query.before.createdAt, query.before.sequence);
    }
    sql += ' ORDER BY created_at DESC, rowid DESC';
    if (query.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }
    return (this.db.prepare(sql).all(...params) as ChatHistoryMessage[]).reverse();
  }

  /**
   * 聊天原文始终保存；这里仅把已完成的用户发起轮次分组，用于滚动整理。
   */
  private listCompletedChatTurns(): ChatHistoryMessage[][] {
    const turns: ChatHistoryMessage[][] = [];
    let current: ChatHistoryMessage[] = [];
    for (const message of this.listChatMessages()) {
      if (message.role === 'user') {
        if (current.some((item) => item.role === 'assistant')) turns.push(current);
        current = [message];
      } else if (current.length > 0) {
        current.push(message);
      }
    }
    if (current.some((item) => item.role === 'assistant')) turns.push(current);
    return turns;
  }

  /**
   * 第 25 轮完成后先整理最早的 8 轮，之后每多 8 轮继续整理下一批。
   * claim 在模型调用前落库，避免连续回复并发触发同一批整理。
   */
  claimNextChatCompactionBatch(): ChatCompactionBatch | undefined {
    const batchSize = 8;
    const retainedRawTurns = 17;
    const now = formatUtcStorageDateTime();
    const claim = this.db.transaction((): ChatCompactionBatch | undefined => {
      const processing = this.db.prepare("SELECT id FROM chat_compactions WHERE status = 'processing' LIMIT 1").get();
      if (processing) return undefined;

      const completed = this.db.prepare("SELECT MAX(end_turn) AS end_turn FROM chat_compactions WHERE status = 'completed'").get() as { end_turn?: number | null };
      const normalizedStartTurn = completed.end_turn ? Number(completed.end_turn) + 1 : 1;
      const endTurn = normalizedStartTurn + batchSize - 1;
      if (this.getMemoryTurn() < endTurn + retainedRawTurns) return undefined;

      const turns = this.listCompletedChatTurns();
      const batchTurns = turns.slice(normalizedStartTurn - 1, endTurn);
      if (batchTurns.length !== batchSize) return undefined;
      const messages = batchTurns.flat();
      const sourceRefs = messages.map((message) => message.id);
      const failed = this.db.prepare("SELECT id FROM chat_compactions WHERE start_turn = ? AND status = 'failed'").get(normalizedStartTurn) as { id: string } | undefined;
      const id = failed?.id || `chatcmp_${uuidv4()}`;
      if (failed) {
        this.db.prepare("UPDATE chat_compactions SET end_turn = ?, source_refs_json = ?, status = 'processing', error = NULL, updated_at = ? WHERE id = ?")
          .run(endTurn, JSON.stringify(sourceRefs), now, id);
      } else {
        this.db.prepare(`INSERT INTO chat_compactions (id, start_turn, end_turn, source_refs_json, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'processing', ?, ?)`)
          .run(id, normalizedStartTurn, endTurn, JSON.stringify(sourceRefs), now, now);
      }
      return { id, startTurn: normalizedStartTurn, endTurn, previousSummary: this.getChatWorkingSummary(), messages };
    });
    return claim();
  }

  getChatWorkingSummary(): string {
    return this.getSetting('chat_working_summary').trim();
  }

  /**
   * 整理器尚未返回或需要重试时，把旧原文临时补进上下文，避免第 26 轮出现断层。
   */
  getPendingChatCompactionMessages(): ChatHistoryMessage[] {
    const row = this.db.prepare("SELECT source_refs_json FROM chat_compactions WHERE status IN ('processing', 'failed') ORDER BY start_turn ASC LIMIT 1")
      .get() as { source_refs_json?: string } | undefined;
    if (!row) return [];
    const ids = new Set(this.parseStringArray(row.source_refs_json));
    return this.listChatMessages().filter((message) => ids.has(message.id));
  }

  completeChatCompaction(id: string, result: ChatCompactionResult): void {
    const row = this.db.prepare("SELECT source_refs_json, end_turn FROM chat_compactions WHERE id = ? AND status = 'processing'").get(id) as { source_refs_json: string; end_turn: number } | undefined;
    if (!row) return;
    const sourceRefs = this.parseStringArray(row.source_refs_json);
    const summary = result.conversationSummary.trim().slice(0, 2000) || '本段为闲聊，无待续事项。';
    const quote = this.listChatMessages().find((message) => sourceRefs.includes(message.id) && message.role === 'user')?.content;
    const eventIds = this.createMemoryEvents(result.events, sourceRefs, row.end_turn, quote);
    const elementIds: string[] = [];
    for (const element of result.elements) {
      const name = element.name?.trim();
      if (!name) continue;
      if (element.state?.trim()) {
        elementIds.push(this.setMemoryElementState({ name, type: element.type, scope: element.scope, state: element.state, sourceRefs, turn: row.end_turn }));
      } else {
        elementIds.push(this.upsertMemoryElement({ name, type: element.type, scope: element.scope, turn: row.end_turn }));
      }
    }
    const now = formatUtcStorageDateTime();
    this.setSetting('chat_working_summary', summary);
    this.db.prepare(`UPDATE chat_compactions
      SET conversation_summary = ?, tool_calls_json = ?, resident_memory_json = ?, event_ids_json = ?, element_ids_json = ?,
        status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?`)
      .run(summary, JSON.stringify(result.calls || []), JSON.stringify(result.residentMemory || []), JSON.stringify(eventIds), JSON.stringify([...new Set(elementIds)]), now, now, id);
  }

  failChatCompaction(id: string, error: unknown): void {
    this.db.prepare("UPDATE chat_compactions SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'processing'")
      .run(String(error instanceof Error ? error.message : error).slice(0, 500), formatUtcStorageDateTime(), id);
  }

  getChatMemoryRuntimeDebug(): ChatMemoryRuntimeDebug {
    const allMessages = this.listChatMessages();
    const completedTurns = this.listCompletedChatTurns();
    const shortTermMessageIds = completedTurns.slice(-25).flat().map((message) => message.id);
    const pendingMessageIds = this.getPendingChatCompactionMessages().map((message) => message.id);
    const rows = this.db.prepare('SELECT * FROM chat_compactions ORDER BY start_turn DESC LIMIT 30').all() as Array<Record<string, unknown>>;
    const parseArray = <T>(value: unknown): T[] => {
      try {
        const parsed = JSON.parse(typeof value === 'string' ? value : '[]');
        return Array.isArray(parsed) ? parsed as T[] : [];
      } catch { return []; }
    };
    const compactions: ChatCompactionDebugRun[] = rows.map((row) => ({
      id: String(row.id),
      start_turn: Number(row.start_turn),
      end_turn: Number(row.end_turn),
      source_refs: parseArray<string>(row.source_refs_json).filter((id): id is string => typeof id === 'string'),
      conversation_summary: String(row.conversation_summary || ''),
      status: ['processing', 'completed', 'failed'].includes(String(row.status)) ? row.status as ChatCompactionDebugRun['status'] : 'failed',
      error: typeof row.error === 'string' ? row.error : null,
      calls: parseArray<MemoryToolDebugCall>(row.tool_calls_json).filter((call): call is MemoryToolDebugCall => !!call && typeof call === 'object' && typeof call.name === 'string'),
      resident_memory: parseArray<ChatCompactionDebugRun['resident_memory'][number]>(row.resident_memory_json).filter((item): item is ChatCompactionDebugRun['resident_memory'][number] => !!item && typeof item === 'object' && (item as { kind?: unknown }).kind !== undefined && typeof (item as { id?: unknown }).id === 'string'),
      event_ids: parseArray<string>(row.event_ids_json).filter((id): id is string => typeof id === 'string'),
      element_ids: parseArray<string>(row.element_ids_json).filter((id): id is string => typeof id === 'string'),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    }));
    return {
      current_turn: this.getMemoryTurn(),
      full_message_count: allMessages.length,
      short_term_message_ids: shortTermMessageIds,
      pending_message_ids: pendingMessageIds,
      working_summary: this.getChatWorkingSummary(),
      compactions,
    };
  }

  // ===== 长期记忆 =====
  private parseStringArray(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private getMemoryTurn(): number {
    return Math.max(0, Number.parseInt(this.getSetting('memory_turn', '0'), 10) || 0);
  }

  advanceMemoryTurn(): number {
    const turn = this.getMemoryTurn() + 1;
    this.setSetting('memory_turn', String(turn));
    return turn;
  }

  private calculateMemoryWeight(row: Record<string, unknown>, currentTurn = this.getMemoryTurn()): number {
    const status = row.status as MemoryStatus;
    if (status === 'forgotten') return 0;
    if (Number(row.pinned)) return 1;

    const mentionCount = Math.max(1, Number(row.mention_count) || 1);
    const lastAdoptedTurn = Math.max(0, Number(row.last_adopted_turn) || 0);
    const elapsedTurns = Math.max(0, currentTurn - lastAdoptedTurn);
    const lambda = 0.15 / (1 + 1.5 * Math.log(mentionCount));
    const floor = Math.max(0, Math.min(1, Number(row.floor_weight) || 0));
    let value = Math.max(floor, Math.exp(-lambda * elapsedTurns));
    const forcedCap = row.forced_cap === null || row.forced_cap === undefined ? null : Number(row.forced_cap);
    if (forcedCap !== null && Number.isFinite(forcedCap)) value = Math.min(value, forcedCap);
    return Number(value.toFixed(4));
  }

  private toMemoryEvent(row: Record<string, unknown>, currentTurn = this.getMemoryTurn()): MemoryEvent {
    return {
      id: String(row.id),
      timestamp: String(row.timestamp),
      scope: row.scope as MemoryScope,
      criticality: row.criticality as MemoryCriticality,
      title: String(row.title),
      summary: String(row.summary),
      narrative: String(row.narrative),
      tags: this.parseStringArray(row.tags_json),
      quotes: this.parseStringArray(row.quotes_json),
      source_refs: this.parseStringArray(row.source_refs_json),
      confidence: Number(row.confidence),
      status: row.status as MemoryStatus,
      superseded_by: typeof row.superseded_by === 'string' ? row.superseded_by : null,
      weight: {
        value: this.calculateMemoryWeight(row, currentTurn),
        mention_count: Number(row.mention_count) || 1,
        last_adopted_turn: Number(row.last_adopted_turn) || 0,
        last_retrieved_at: typeof row.last_retrieved_at === 'string' ? row.last_retrieved_at : null,
        pinned: Boolean(row.pinned),
        floor_weight: Number(row.floor_weight) || 0,
        forced_cap: row.forced_cap === null || row.forced_cap === undefined ? null : Number(row.forced_cap),
      },
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  private getFloorWeight(criticality: MemoryCriticality): number {
    if (criticality === 'safety') return 1;
    if (criticality === 'identity') return 0.9;
    if (criticality === 'preference') return 0.3;
    return 0;
  }

  private normalizeMemoryScope(value: unknown): MemoryScope {
    return ['session', 'project', 'user', 'team'].includes(String(value)) ? value as MemoryScope : 'project';
  }

  private normalizeMemoryCriticality(value: unknown): MemoryCriticality {
    return ['safety', 'identity', 'preference', 'routine'].includes(String(value)) ? value as MemoryCriticality : 'routine';
  }

  private normalizeMemoryStatus(value: unknown): MemoryStatus {
    return ['active', 'superseded', 'archived', 'forgotten'].includes(String(value)) ? value as MemoryStatus : 'active';
  }

  private toMemoryElement(row: Record<string, unknown>, eventCount: number, currentTurn = this.getMemoryTurn()): MemoryElement {
    return {
      id: String(row.id),
      type: row.type as MemoryElement['type'],
      name: String(row.name),
      scope: row.scope as MemoryScope,
      special_role: row.special_role === 'user' || row.special_role === 'assistant' ? row.special_role : null,
      current_state: String(row.current_state || ''),
      weight: {
        value: this.calculateMemoryWeight(row, currentTurn),
        mention_count: Number(row.mention_count) || 1,
        last_adopted_turn: Number(row.last_adopted_turn) || 0,
        last_retrieved_at: typeof row.last_retrieved_at === 'string' ? row.last_retrieved_at : null,
        pinned: Boolean(row.pinned),
        floor_weight: Number(row.floor_weight) || 0,
        forced_cap: row.forced_cap === null || row.forced_cap === undefined ? null : Number(row.forced_cap),
      },
      event_count: eventCount,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  listMemoryEvents(query: MemoryListQuery = {}): MemoryEvent[] {
    let sql = 'SELECT * FROM memory_events WHERE 1=1';
    const params: unknown[] = [];
    if (query.q?.trim()) {
      sql += ' AND (title LIKE ? OR summary LIKE ? OR narrative LIKE ? OR tags_json LIKE ?)';
      const term = `%${query.q.trim()}%`;
      params.push(term, term, term, term);
    }
    if (query.scope) {
      sql += ' AND scope = ?';
      params.push(query.scope);
    }
    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    const currentTurn = this.getMemoryTurn();
    return (this.db.prepare(`${sql} ORDER BY timestamp DESC`).all(...params) as Record<string, unknown>[])
      .map((row) => this.toMemoryEvent(row, currentTurn))
      .sort((a, b) => b.weight.value - a.weight.value || b.timestamp.localeCompare(a.timestamp));
  }

  listMemoryElements(): MemoryElement[] {
    const links = this.db.prepare('SELECT event_id, element_id FROM memory_event_elements').all() as Array<{ event_id: string; element_id: string }>;
    const counts = new Map<string, number>();
    for (const link of links) {
      counts.set(link.element_id, (counts.get(link.element_id) || 0) + 1);
    }
    const currentTurn = this.getMemoryTurn();
    return (this.db.prepare('SELECT * FROM memory_elements ORDER BY updated_at DESC').all() as Record<string, unknown>[])
      .map((row) => this.toMemoryElement(row, counts.get(String(row.id)) || 0, currentTurn))
      .sort((a, b) => b.weight.value - a.weight.value || b.updated_at.localeCompare(a.updated_at));
  }

  /** 事件卡与元素卡共用 L0 名额；仅按当前权重决定常驻顺序。 */
  listResidentMemory(limit = 20): Array<{ kind: 'event'; value: MemoryEvent } | { kind: 'element'; value: MemoryElement }> {
    const candidates = [
      ...this.listMemoryEvents()
        .filter((event) => event.status !== 'forgotten' && event.status !== 'archived')
        .map((event) => ({ kind: 'event' as const, value: event, weight: event.weight.value, updatedAt: event.updated_at })),
      ...this.listMemoryElements()
        .map((element) => ({ kind: 'element' as const, value: element, weight: element.weight.value, updatedAt: element.updated_at })),
    ];
    const sorted = candidates
      .sort((a, b) => b.weight - a.weight || b.updatedAt.localeCompare(a.updatedAt))
      .map(({ kind, value }) => ({ kind, value }));
    const anchors = sorted.filter((item) => item.kind === 'element' && item.value.special_role);
    const others = sorted.filter((item) => item.kind !== 'element' || !item.value.special_role);
    return [...anchors, ...others].slice(0, Math.max(1, Math.min(20, Number(limit) || 20)));
  }

  listMemoryDashboard(query: MemoryListQuery = {}): MemoryDashboard {
    return { events: this.listMemoryEvents(query), elements: this.listMemoryElements(), current_turn: this.getMemoryTurn() };
  }

  getMemoryEvent(id: string): MemoryEventDetail | undefined {
    const row = this.db.prepare('SELECT * FROM memory_events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const event = this.toMemoryEvent(row);
    const elementRows = this.db.prepare(`
      SELECT e.*, link.role
      FROM memory_event_elements link
      JOIN memory_elements e ON e.id = link.element_id
      WHERE link.event_id = ?
    `).all(id) as Array<Record<string, unknown>>;
    const elements = this.listMemoryElements();
    const elementWeights = new Map(elements.map((element) => [element.id, element]));
    const relatedElements = elementRows.map((element) => ({
      ...this.toMemoryElement(element, elementWeights.get(String(element.id))?.event_count || 0),
      role: String(element.role || ''),
    }));
    const relations = this.db.prepare('SELECT type, target_event_id, description FROM memory_event_relations WHERE event_id = ?').all(id) as Array<Record<string, unknown>>;
    const historyRows = this.db.prepare('SELECT kind, turn, created_at FROM memory_weight_history WHERE event_id = ? ORDER BY turn ASC, created_at ASC').all(id) as Array<Record<string, unknown>>;
    const weight_history: MemoryWeightPoint[] = historyRows.map((history) => ({
      kind: history.kind as MemoryWeightPoint['kind'],
      turn: Number(history.turn),
      value: this.calculateMemoryWeight({ ...row, last_adopted_turn: history.turn, mention_count: 1 }, Number(history.turn)),
      created_at: String(history.created_at),
    }));
    return {
      ...event,
      elements: relatedElements,
      relations: relations.map((relation) => ({
        type: relation.type as MemoryRelation['type'],
        target_event_id: String(relation.target_event_id),
        description: String(relation.description || ''),
      })),
      weight_history,
    };
  }

  getMemoryElement(id: string): MemoryElementDetail | undefined {
    const element = this.listMemoryElements().find((item) => item.id === id);
    if (!element) return undefined;
    const rows = this.db.prepare(`
      SELECT event.* FROM memory_events event
      JOIN memory_event_elements link ON link.event_id = event.id
      WHERE link.element_id = ? ORDER BY event.timestamp DESC
    `).all(id) as Record<string, unknown>[];
    return { ...element, events: rows.map((row) => this.toMemoryEvent(row)) };
  }

  /** 默认返回最新状态；传入 at 时只读取该时点及以前最后一次状态。 */
  getMemoryElementAt(id: string, at?: string): MemoryElementDetail | undefined {
    const detail = this.getMemoryElement(id);
    if (!detail || !at?.trim()) return detail;
    const target = /^\d{4}-\d{2}-\d{2}$/.test(at.trim()) ? `${at.trim()} 23:59:59` : at.trim();
    const state = this.db.prepare(`
      SELECT state FROM memory_element_state_history
      WHERE element_id = ? AND valid_at <= ?
      ORDER BY valid_at DESC, created_at DESC LIMIT 1
    `).get(id, target) as { state: string } | undefined;
    return state ? { ...detail, current_state: state.state } : detail;
  }

  findMemoryElementsForChat(query: string, limit = 6): MemoryElement[] {
    const normalized = query.trim().toLocaleLowerCase();
    const terms = normalized.match(/[\p{Script=Han}]{2,}|[a-z0-9_+#.-]{2,}/gu) || [];
    const selected = this.listMemoryElements().filter((element) => {
      if (!normalized) return true;
      const haystack = `${element.name} ${element.type} ${element.current_state}`.toLocaleLowerCase();
      return terms.length > 0 ? terms.some((term) => haystack.includes(term)) : haystack.includes(normalized);
    }).slice(0, Math.max(1, Math.min(6, Number(limit) || 6)));
    if (selected.length > 0) {
      const now = formatUtcStorageDateTime();
      const update = this.db.prepare('UPDATE memory_elements SET last_retrieved_at = ? WHERE id = ?');
      const transaction = this.db.transaction(() => selected.forEach((element) => update.run(now, element.id)));
      transaction();
    }
    return selected;
  }

  listMemoryElementStateHistory(id: string): Array<{ state: string; valid_at: string; source_refs: string[] }> {
    return (this.db.prepare('SELECT state, valid_at, source_refs_json FROM memory_element_state_history WHERE element_id = ? ORDER BY valid_at DESC LIMIT 12').all(id) as Array<{ state: string; valid_at: string; source_refs_json: string }>)
      .map((row) => ({ state: String(row.state), valid_at: String(row.valid_at), source_refs: this.parseStringArray(row.source_refs_json) }));
  }

  private upsertMemoryElement(input: { name: string; type?: MemoryElement['type']; scope?: MemoryScope; turn?: number }): string {
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new Error('元素名称不能为空');
    if (name === '用户') return this.getSpecialElementId('user');
    if (name === '下班鸭') return this.getSpecialElementId('assistant');
    const scope = this.normalizeMemoryScope(input.scope);
    // scope 是事件的适用范围，不是实体身份；同名元素必须复用同一张卡。
    const existing = this.db.prepare('SELECT id FROM memory_elements WHERE name = ? COLLATE NOCASE LIMIT 1').get(name) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = `elem_${uuidv4()}`;
    const type = ['person', 'project', 'concept', 'tool', 'place'].includes(String(input.type)) ? input.type : 'concept';
    const now = formatUtcStorageDateTime();
    this.db.prepare(`
      INSERT INTO memory_elements (id, type, name, scope, current_state, mention_count, last_adopted_turn, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', 1, ?, ?, ?)
    `).run(id, type, name, scope, Math.max(0, Number(input.turn) || this.getMemoryTurn()), now, now);
    return id;
  }

  private getSpecialElementId(role: 'user' | 'assistant'): string {
    const row = this.db.prepare('SELECT id FROM memory_elements WHERE special_role = ?').get(role) as { id: string } | undefined;
    if (!row) throw new Error(`缺少系统元素卡：${role}`);
    return row.id;
  }

  private linkConversationAnchors(eventId: string): void {
    const link = this.db.prepare('INSERT OR IGNORE INTO memory_event_elements (event_id, element_id, role) VALUES (?, ?, ?)');
    link.run(eventId, this.getSpecialElementId('user'), '对话参与者');
    link.run(eventId, this.getSpecialElementId('assistant'), '对话参与者');
  }

  setMemoryElementState(input: { elementId?: string; name?: string; type?: MemoryElement['type']; scope?: MemoryScope; state: string; validAt?: string; sourceRefs?: string[]; turn?: number }): string {
    const state = input.state.trim().slice(0, 300);
    if (!state) throw new Error('元素状态不能为空');
    const elementId = input.elementId || this.upsertMemoryElement({ name: input.name || '', type: input.type, scope: input.scope, turn: input.turn });
    const now = formatUtcStorageDateTime();
    const validAt = input.validAt?.trim() || now;
    this.db.prepare('UPDATE memory_elements SET current_state = ?, updated_at = ? WHERE id = ?').run(state, now, elementId);
    this.db.prepare(`
      INSERT INTO memory_element_state_history (id, element_id, state, valid_at, source_refs_json, turn, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), elementId, state, validAt, JSON.stringify(input.sourceRefs || []), Math.max(0, Number(input.turn) || 0), now);
    return elementId;
  }

  recordMemoryUseReceipts(eventIds: string[], turn: number, assistantMessageId: string): void {
    const ids = [...new Set(eventIds)].filter(Boolean);
    if (ids.length === 0 || !assistantMessageId) return;
    const now = formatUtcStorageDateTime();
    const insert = this.db.prepare(`
      INSERT INTO memory_usage_receipts (id, event_id, turn, assistant_message_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction(() => ids.forEach((eventId) => insert.run(uuidv4(), eventId, turn, assistantMessageId, now)));
    transaction();
  }

  adoptMemoryElements(elementIds: string[], turn: number): void {
    const ids = [...new Set(elementIds)].filter(Boolean);
    if (ids.length === 0) return;
    const now = formatUtcStorageDateTime();
    const adopt = this.db.transaction(() => {
      for (const id of ids) {
        const row = this.db.prepare('SELECT id FROM memory_elements WHERE id = ?').get(id);
        if (!row) continue;
        this.db.prepare('UPDATE memory_elements SET mention_count = mention_count + 1, last_adopted_turn = ?, updated_at = ? WHERE id = ?')
          .run(turn, now, id);
      }
    });
    adopt();
  }

  saveMemoryToolDebugRun(input: {
    userMessageId?: string;
    assistantMessageId?: string;
    turn: number;
    mode: MemoryToolDebugRun['mode'];
    calls: MemoryToolDebugCall[];
    usedEventIds: string[];
    usedElementIds: string[];
    proposalCount: number;
    fallbackReason?: string;
  }): string {
    const id = `memdebug_${uuidv4()}`;
    this.db.prepare(`
      INSERT INTO memory_tool_debug_runs (
        id, user_message_id, assistant_message_id, turn, mode, calls_json,
        used_event_ids_json, used_element_ids_json, proposal_count, fallback_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.userMessageId || null,
      input.assistantMessageId || null,
      Math.max(0, Number(input.turn) || 0),
      input.mode,
      JSON.stringify(input.calls),
      JSON.stringify([...new Set(input.usedEventIds.filter(Boolean))]),
      JSON.stringify([...new Set(input.usedElementIds.filter(Boolean))]),
      Math.max(0, Number(input.proposalCount) || 0),
      input.fallbackReason?.trim() || null,
      formatUtcStorageDateTime(),
    );
    return id;
  }

  listMemoryToolDebugRuns(limit = 12): MemoryToolDebugRun[] {
    const rows = this.db.prepare(`
      SELECT * FROM memory_tool_debug_runs
      ORDER BY created_at DESC LIMIT ?
    `).all(Math.max(1, Math.min(100, Number(limit) || 12))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toMemoryToolDebugRun(row));
  }

  getMemoryToolDebugRunByAssistantMessageId(assistantMessageId: string): MemoryToolDebugRun | undefined {
    if (!assistantMessageId.trim()) return undefined;
    const row = this.db.prepare(`
      SELECT * FROM memory_tool_debug_runs
      WHERE assistant_message_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(assistantMessageId) as Record<string, unknown> | undefined;
    return row ? this.toMemoryToolDebugRun(row) : undefined;
  }

  private toMemoryToolDebugRun(row: Record<string, unknown>): MemoryToolDebugRun {
    const parseArray = <T>(value: unknown): T[] => {
      try {
        const parsed = JSON.parse(typeof value === 'string' ? value : '[]');
        return Array.isArray(parsed) ? parsed as T[] : [];
      } catch {
        return [];
      }
    };
    const calls = parseArray<MemoryToolDebugCall>(row.calls_json).flatMap((call) => (
      call && typeof call === 'object' && typeof call.name === 'string' && call.arguments && call.result
        ? [{ name: call.name, arguments: call.arguments, result: call.result }]
        : []
    ));
    return {
      id: String(row.id),
      user_message_id: typeof row.user_message_id === 'string' ? row.user_message_id : null,
      assistant_message_id: typeof row.assistant_message_id === 'string' ? row.assistant_message_id : null,
      turn: Number(row.turn) || 0,
      mode: row.mode === 'tool' ? 'tool' : 'fallback',
      calls,
      used_event_ids: parseArray<string>(row.used_event_ids_json).filter((id): id is string => typeof id === 'string'),
      used_element_ids: parseArray<string>(row.used_element_ids_json).filter((id): id is string => typeof id === 'string'),
      proposal_count: Number(row.proposal_count) || 0,
      fallback_reason: typeof row.fallback_reason === 'string' ? row.fallback_reason : null,
      created_at: String(row.created_at),
    };
  }

  applyMemoryProposal(input: {
    sourceMessageIds: string[];
    evidence: Array<{ message_id: string; quote: string }>;
    changes: Array<Record<string, unknown>>;
  }, turn: number): { proposalId: string; eventIds: string[]; elementIds: string[] } {
    const now = formatUtcStorageDateTime();
    const proposalId = `memprop_${uuidv4()}`;
    const sourceMessageIds = [...new Set(input.sourceMessageIds)].filter(Boolean);
    this.db.prepare(`
      INSERT INTO memory_proposals (id, source_refs_json, evidence_json, changes_json, status, turn, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(proposalId, JSON.stringify(sourceMessageIds), JSON.stringify(input.evidence), JSON.stringify(input.changes), turn, now);

    const eventInputs = input.changes.filter((change) => change.kind === 'event').map((change) => ({
      title: String(change.title || ''),
      summary: String(change.summary || ''),
      narrative: typeof change.narrative === 'string' ? change.narrative : undefined,
      tags: Array.isArray(change.tags) ? change.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
      scope: this.normalizeMemoryScope(change.scope),
      criticality: this.normalizeMemoryCriticality(change.criticality),
      confidence: Number(change.confidence) || 0,
    }));
    const eventIds = this.createMemoryEvents(eventInputs, sourceMessageIds, turn, input.evidence[0]?.quote);
    const elementIds: string[] = [];
    for (const change of input.changes) {
      if (change.kind === 'element') {
        try {
          elementIds.push(this.upsertMemoryElement({ name: String(change.name || ''), type: change.type as MemoryElement['type'] }));
        } catch { /* invalid individual element proposals are rejected without blocking verified events */ }
      }
      if (change.kind === 'element_state') {
        try {
          elementIds.push(this.setMemoryElementState({
            name: String(change.name || ''),
            type: change.type as MemoryElement['type'],
            state: String(change.state || ''),
            validAt: typeof change.valid_at === 'string' ? change.valid_at : now,
            sourceRefs: sourceMessageIds,
            turn,
          }));
        } catch { /* invalid individual state proposals are rejected without blocking verified changes */ }
      }
    }
    this.db.prepare("UPDATE memory_proposals SET status = 'accepted', resolved_at = ? WHERE id = ?").run(formatUtcStorageDateTime(), proposalId);
    return { proposalId, eventIds, elementIds: [...new Set(elementIds)] };
  }

  createMemoryEvents(events: Array<{
    title: string;
    summary: string;
    narrative?: string;
    tags?: string[];
    scope?: MemoryScope;
    criticality?: MemoryCriticality;
    confidence?: number;
    elements?: Array<{ name: string; type?: MemoryElement['type']; role?: string; state?: string }>;
    relations?: MemoryRelation[];
  }>, sourceRefs: string[], turn: number, quote?: string): string[] {
    const now = formatUtcStorageDateTime();
    const inserted: string[] = [];
    const create = this.db.transaction(() => {
      for (const rawEvent of events) {
        const title = rawEvent.title?.trim().slice(0, 80);
        const summary = rawEvent.summary?.trim().slice(0, 300);
        if (!title || !summary) continue;
        const confidence = Math.max(0, Math.min(1, Number(rawEvent.confidence) || 0));
        // 工具化提议已要求可核验原话；事件卡保留中等置信度，避免把轻量但明确的聊天信息全部丢掉。
        if (confidence < 0.6) continue;
        const id = `evt_${uuidv4()}`;
        const scope = this.normalizeMemoryScope(rawEvent.scope);
        const criticality = this.normalizeMemoryCriticality(rawEvent.criticality);
        const tags = Array.isArray(rawEvent.tags) ? rawEvent.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 8) : [];
        const narrative = rawEvent.narrative?.trim().slice(0, 1200) || summary;
        this.db.prepare(`
          INSERT INTO memory_events (
            id, timestamp, scope, criticality, title, summary, narrative, tags_json, quotes_json, source_refs_json,
            confidence, status, mention_count, last_adopted_turn, floor_weight, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)
        `).run(id, now, scope, criticality, title, summary, narrative, JSON.stringify(tags), JSON.stringify(quote ? [quote] : []), JSON.stringify(sourceRefs), confidence, turn, this.getFloorWeight(criticality), now, now);
        this.db.prepare('INSERT INTO memory_weight_history (id, event_id, kind, turn, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(uuidv4(), id, 'created', turn, now);
        for (const rawElement of rawEvent.elements || []) {
          const name = rawElement.name?.trim().slice(0, 80);
          if (!name) continue;
          const state = rawElement.state?.trim().slice(0, 300) || '';
          const elementId = state
            ? this.setMemoryElementState({ name, type: rawElement.type, state, sourceRefs, turn })
            : this.upsertMemoryElement({ name, type: rawElement.type, turn });
          this.db.prepare('INSERT OR IGNORE INTO memory_event_elements (event_id, element_id, role) VALUES (?, ?, ?)')
            .run(id, elementId, rawElement.role?.trim().slice(0, 80) || '关联');
        }
        this.linkConversationAnchors(id);
        for (const relation of rawEvent.relations || []) {
          if (!relation.target_event_id || !['continuation', 'turning_point', 'cause', 'correction', 'parallel'].includes(relation.type)) continue;
          this.db.prepare('INSERT OR IGNORE INTO memory_event_relations (event_id, target_event_id, type, description) VALUES (?, ?, ?, ?)')
            .run(id, relation.target_event_id, relation.type, relation.description?.slice(0, 200) || '');
          if (relation.type === 'correction') {
            this.db.prepare("UPDATE memory_events SET status = 'superseded', superseded_by = ?, forced_cap = 0.1, updated_at = ? WHERE id = ?")
              .run(id, now, relation.target_event_id);
          }
        }
        inserted.push(id);
      }
    });
    create();
    return inserted;
  }

  adoptMemoryEvents(eventIds: string[], turn: number): void {
    const ids = [...new Set(eventIds)].filter(Boolean);
    if (ids.length === 0) return;
    const now = formatUtcStorageDateTime();
    const adopt = this.db.transaction(() => {
      for (const id of ids) {
        const row = this.db.prepare("SELECT id FROM memory_events WHERE id = ? AND status NOT IN ('forgotten', 'archived')").get(id);
        if (!row) continue;
        this.db.prepare('UPDATE memory_events SET mention_count = mention_count + 1, last_adopted_turn = ?, updated_at = ? WHERE id = ?')
          .run(turn, now, id);
        this.db.prepare('INSERT INTO memory_weight_history (id, event_id, kind, turn, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(uuidv4(), id, 'adopted', turn, now);
      }
    });
    adopt();
  }

  /**
   * `excludeSourceRefs` 只影响主聊天的默认注入：若事件的原始聊天仍在短期上下文，
   * 不重复注入压缩卡。调用方不传此参数时（例如未来的精确搜索/展开工具），卡仍可立即访问。
   */
  findMemoryEventsForChat(query: string, limit = 6, options?: { excludeSourceRefs?: readonly string[] }): MemoryEvent[] {
    const normalized = query.toLocaleLowerCase();
    const terms = new Set<string>();
    for (const chunk of normalized.match(/[\p{Script=Han}]{2,}|[a-z0-9_+#.-]{2,}/gu) || []) {
      terms.add(chunk);
      if (/^[\p{Script=Han}]+$/u.test(chunk)) {
        for (let index = 0; index < chunk.length - 1; index += 1) terms.add(chunk.slice(index, index + 2));
      }
    }
    const shortTermSourceRefs = new Set(options?.excludeSourceRefs?.filter(Boolean) || []);
    const candidates = this.listMemoryEvents().filter((event) => (
      event.status !== 'forgotten' &&
      event.status !== 'archived' &&
      !event.source_refs.some((sourceRef) => shortTermSourceRefs.has(sourceRef))
    ));
    const ranked = candidates.map((event) => {
      const haystack = `${event.title} ${event.summary} ${event.narrative} ${event.tags.join(' ')}`.toLocaleLowerCase();
      const relevance = [...terms].reduce((score, term) => score + (haystack.includes(term) ? Math.min(3, term.length / 2) : 0), 0);
      const isSafety = event.criticality === 'safety';
      return { event, relevance, score: isSafety ? 100 + event.weight.value : relevance * event.weight.value };
    }).filter(({ event, relevance }) => event.criticality === 'safety' || (relevance > 0 && (event.weight.value > 0.15 || relevance >= 3)));
    const selected = ranked.sort((a, b) => b.score - a.score).slice(0, limit).map(({ event }) => event);
    if (selected.length > 0) {
      const now = formatUtcStorageDateTime();
      const update = this.db.prepare('UPDATE memory_events SET last_retrieved_at = ? WHERE id = ?');
      const transaction = this.db.transaction(() => selected.forEach((event) => update.run(now, event.id)));
      transaction();
    }
    return selected;
  }

  updateMemoryEvent(id: string, update: MemoryEventUpdate): void {
    const event = this.getMemoryEvent(id);
    if (!event) throw new Error('记忆事件不存在');
    const title = update.title?.trim().slice(0, 80) || event.title;
    const summary = update.summary?.trim().slice(0, 300) || event.summary;
    const narrative = update.narrative?.trim().slice(0, 1200) || event.narrative;
    const tags = update.tags ? update.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 8) : event.tags;
    const scope = update.scope ? this.normalizeMemoryScope(update.scope) : event.scope;
    const criticality = update.criticality ? this.normalizeMemoryCriticality(update.criticality) : event.criticality;
    this.db.prepare(`UPDATE memory_events SET title = ?, summary = ?, narrative = ?, tags_json = ?, scope = ?, criticality = ?, floor_weight = ?, updated_at = ? WHERE id = ?`)
      .run(title, summary, narrative, JSON.stringify(tags), scope, criticality, this.getFloorWeight(criticality), formatUtcStorageDateTime(), id);
  }

  actOnMemoryEvent(id: string, action: 'pin' | 'unpin' | 'forget' | 'restore'): void {
    const now = formatUtcStorageDateTime();
    if (action === 'pin' || action === 'unpin') {
      this.db.prepare('UPDATE memory_events SET pinned = ?, updated_at = ? WHERE id = ?').run(action === 'pin' ? 1 : 0, now, id);
      this.db.prepare('INSERT INTO memory_weight_history (id, event_id, kind, turn, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), id, 'manual', this.getMemoryTurn(), now);
      return;
    }
    this.db.prepare('UPDATE memory_events SET status = ?, updated_at = ? WHERE id = ?')
      .run(action === 'forget' ? 'forgotten' : 'active', now, id);
  }

  deleteMemoryEvent(id: string): void {
    const remove = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_event_relations WHERE event_id = ? OR target_event_id = ?').run(id, id);
      this.db.prepare('DELETE FROM memory_weight_history WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM memory_event_elements WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM memory_events WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM memory_elements WHERE special_role IS NULL AND id NOT IN (SELECT DISTINCT element_id FROM memory_event_elements)').run();
    });
    remove();
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
    const rows = this.db.prepare('SELECT * FROM vision_results ORDER BY created_at DESC LIMIT ?').all(limit) as VisionResult[];
    return rows.map((row) => this.normalizeVisionResult(row));
  }

  /** 按日期范围查询 vision_results，支持搜索和分类过滤 */
  listVisionResultsByDate(query: VisionQuery): VisionResult[] {
    const { start, end, q, category, limit } = query;
    const range = localDateRangeToUtcStorageRange(start, end);
    let sql = `SELECT * FROM vision_results WHERE created_at >= ? AND created_at <= ?`;
    const params: unknown[] = [range.start, range.end];

    if (q) {
      sql += ` AND (title LIKE ? OR summary LIKE ? OR observed_fact LIKE ? OR possible_activity LIKE ? OR category LIKE ? OR app LIKE ? OR window_title LIKE ?)`;
      const likeQ = `%${q}%`;
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
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

    const rows = this.db.prepare(sql).all(...params) as VisionResult[];
    return rows.map((row) => this.normalizeVisionResult(row));
  }

  addVisionResult(vr: Omit<VisionResult, 'id' | 'created_at'>): string {
    const id = uuidv4();
    const now = formatUtcStorageDateTime();
    this.db.prepare(
      `INSERT INTO vision_results (
        id, record_id, title, category, summary, observed_fact, possible_activity,
        confidence, activity_type, segment_merge, stuck_signal, distraction_signal, content_mood,
        raw_response, app, window_title, model, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      vr.record_id,
      vr.title,
      vr.category,
      vr.summary,
      vr.observed_fact || vr.summary || '',
      vr.possible_activity || vr.summary || '',
      vr.confidence || 'medium',
      vr.activity_type || 'unclear',
      JSON.stringify(vr.segment_merge || null),
      JSON.stringify(vr.stuck_signal || null),
      JSON.stringify(vr.distraction_signal || null),
      JSON.stringify(vr.content_mood || null),
      vr.raw_response,
      vr.app,
      vr.window_title,
      vr.model,
      now
    );
    return id;
  }

  private parseJsonField<T>(value: unknown, fallback: T): T {
    if (!value || typeof value !== 'string') return fallback;
    try {
      const parsed = JSON.parse(value) as T | null;
      return parsed === null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  private normalizeVisionResult(row: VisionResult): VisionResult {
    return {
      ...row,
      observed_fact: row.observed_fact || row.summary || '',
      possible_activity: row.possible_activity || row.summary || '',
      confidence: row.confidence || 'medium',
      activity_type: row.activity_type || 'unclear',
      segment_merge: this.parseJsonField(row.segment_merge, {
        should_merge: false,
        confidence: 'low',
        reason: '',
        current_activity: row.possible_activity || row.summary || '',
        updated_segment_summary: row.possible_activity || row.summary || '',
      }),
      stuck_signal: this.parseJsonField(row.stuck_signal, {
        is_stuck_like: false,
        reason: '',
        evidence: [],
        confidence: 'low',
      }),
      distraction_signal: this.parseJsonField(row.distraction_signal, {
        is_distraction_like: false,
        activity_type: 'none',
        reason: '',
        confidence: 'low',
      }),
      content_mood: this.parseJsonField(row.content_mood, {
        mood: 'unclear',
        reason: '',
        confidence: 'low',
      }),
    };
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
    this.db.exec('DELETE FROM records; DELETE FROM reports; DELETE FROM vision_results; DELETE FROM idle_periods; DELETE FROM chat_messages; DELETE FROM chat_queued_messages; DELETE FROM memory_usage_receipts; DELETE FROM memory_tool_debug_runs; DELETE FROM memory_element_state_history; DELETE FROM memory_proposals; DELETE FROM chat_compactions; DELETE FROM memory_event_relations; DELETE FROM memory_event_elements; DELETE FROM memory_weight_history; DELETE FROM memory_events; DELETE FROM memory_elements; DELETE FROM settings WHERE key IN (\'memory_turn\', \'chat_working_summary\');');
    this.ensureConversationAnchors();
  }

  close(): void {
    this.db.close();
  }
}
