import { describe, it, expect } from 'vitest';
import {
  REPORT_PROMPTS,
  getSystemPrompt,
} from '../src/main/report-generator';

// ===== REPORT_PROMPTS =====
describe('REPORT_PROMPTS', () => {
  it('contains exactly 4 template entries', () => {
    const keys = Object.keys(REPORT_PROMPTS);
    expect(keys).toHaveLength(4);
  });

  it('includes all expected template names', () => {
    const expected = ['成果导向日报', '工作轨迹日报', '三句话日报', 'TOP3日报'];
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
    it('returns 成果导向日报 prompt', () => {
      const prompt = getSystemPrompt('成果导向日报', '日报');
      expect(prompt).toContain('成果导向');
      expect(prompt).toContain('今日成果');
    });

    it('returns 工作轨迹日报 prompt', () => {
      const prompt = getSystemPrompt('工作轨迹日报', '日报');
      expect(prompt).toContain('工作轨迹');
      expect(prompt).toContain('时间线');
    });

    it('returns 三句话日报 prompt', () => {
      const prompt = getSystemPrompt('三句话日报', '日报');
      expect(prompt).toContain('三句话');
      expect(prompt).toContain('今天做了什么');
    });

    it('returns TOP3日报 prompt', () => {
      const prompt = getSystemPrompt('TOP3日报', '日报');
      expect(prompt).toContain('3 件事');
      expect(prompt).toContain('最重要的');
    });
  });

  describe('non-standard template + reportType combinations', () => {
    it('成果导向周报 resolves to 成果导向日报 template with 周报 type', () => {
      const prompt = getSystemPrompt('成果导向周报', '周报');
      // Now correctly resolves via alias: 成果导向→成果导向日报("周报")
      expect(prompt).toContain('周报');
      expect(prompt).toContain('成果导向');
    });

    it('工作轨迹月报 resolves to 工作轨迹日报 template with 月报 type', () => {
      const prompt = getSystemPrompt('工作轨迹月报', '月报');
      // Now correctly resolves via alias: 工作轨迹→工作轨迹日报("月报")
      expect(prompt).toContain('月报');
      expect(prompt).toContain('工作轨迹');
      expect(prompt).toContain('时间线');
    });

    it('三句话周报 resolves to 三句话日报 template with 周报 type', () => {
      const prompt = getSystemPrompt('三句话周报', '周报');
      expect(prompt).toContain('周报');
      expect(prompt).toContain('三句话');
      expect(prompt).toContain('今天做了什么');
    });

    it('TOP3月报 resolves to TOP3日报 template with 月报 type', () => {
      const prompt = getSystemPrompt('TOP3月报', '月报');
      expect(prompt).toContain('月报');
      expect(prompt).toContain('3 件事');
      expect(prompt).toContain('最重要的');
    });
  });

  describe('fallback: unknown template uses 成果导向日报', () => {
    it('falls back to 成果导向日报 for unknown template', () => {
      const prompt = getSystemPrompt('未知模板', '日报');
      expect(prompt).toContain('成果导向');
      expect(prompt).toContain('今日成果');
    });

    it('falls back to 成果导向日报 for empty template', () => {
      const prompt = getSystemPrompt('', '日报');
      expect(prompt).toContain('成果导向');
    });
  });

  describe('report type is injected into the prompt', () => {
    it('injects 日报 into prompt', () => {
      const prompt = getSystemPrompt('成果导向日报', '日报');
      expect(prompt).toContain('日报');
    });

    it('injects 周报 into prompt', () => {
      const prompt = getSystemPrompt('成果导向周报', '周报');
      expect(prompt).toContain('周报');
    });

    it('injects 月报 into prompt', () => {
      const prompt = getSystemPrompt('成果导向月报', '月报');
      expect(prompt).toContain('月报');
    });
  });
});
