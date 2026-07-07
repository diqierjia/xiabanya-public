import { describe, it, expect } from 'vitest';
import {
  REPORT_PROMPTS,
  getSystemPrompt,
} from '../src/main/report-generator';

// ===== REPORT_PROMPTS =====
describe('REPORT_PROMPTS', () => {
  it('contains exactly 2 template entries', () => {
    const keys = Object.keys(REPORT_PROMPTS);
    expect(keys).toHaveLength(2);
  });

  it('includes all expected template names', () => {
    const expected = ['工作日报', '全天回顾'];
    for (const name of expected) {
      expect(REPORT_PROMPTS).toHaveProperty(name);
    }
  });

  it('each template is a function', () => {
    for (const fn of Object.values(REPORT_PROMPTS)) {
      expect(typeof fn).toBe('function');
    }
  });

  it('each template function returns a non-empty string when called', () => {
    for (const [name, fn] of Object.entries(REPORT_PROMPTS)) {
      const result = fn('日报');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ===== getSystemPrompt() =====
describe('getSystemPrompt()', () => {
  describe('direct template + 日报', () => {
    it('returns 工作日报 prompt', () => {
      const prompt = getSystemPrompt('工作日报', '日报');
      expect(prompt).toContain('工作日报');
      expect(prompt).toContain('低置信');
    });

    it('returns 全天回顾 prompt', () => {
      const prompt = getSystemPrompt('全天回顾', '日报');
      expect(prompt).toContain('全天活动回顾');
      expect(prompt).toContain('游戏');
    });
  });

  describe('non-standard template + reportType combinations', () => {
    it('工作周报 resolves to 工作日报 template with 周报 type', () => {
      const prompt = getSystemPrompt('工作周报', '周报');
      expect(prompt).toContain('周报');
      expect(prompt).toContain('低置信');
    });
  });

  describe('fallback: unknown template uses 工作日报', () => {
    it('falls back to 工作日报 for unknown template', () => {
      const prompt = getSystemPrompt('未知模板', '日报');
      expect(prompt).toContain('工作日报');
    });

    it('falls back to 工作日报 for empty template', () => {
      const prompt = getSystemPrompt('', '日报');
      expect(prompt).toContain('工作日报');
    });
  });

  describe('report type is injected into the prompt', () => {
    it('injects 日报 into prompt', () => {
      const prompt = getSystemPrompt('工作日报', '日报');
      expect(prompt).toContain('日报');
    });

    it('injects 周报 into prompt', () => {
      const prompt = getSystemPrompt('工作周报', '周报');
      expect(prompt).toContain('周报');
    });

    it('injects 月报 into prompt', () => {
      const prompt = getSystemPrompt('工作月报', '月报');
      expect(prompt).toContain('月报');
    });
  });
});
