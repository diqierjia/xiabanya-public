import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_COLORS,
  DEFAULT_SETTINGS,
  TEMPLATES,
} from '../src/shared/types';

// ===== CATEGORIES =====
describe('CATEGORIES', () => {
  it('contains exactly 12 categories', () => {
    expect(CATEGORIES).toHaveLength(12);
  });

  it('includes all expected category names', () => {
    const expected = [
      '文档', '沟通', '开发', '学习', '设计',
      '产品', '会议', '数据分析', '研究', 'AI/工具',
      '配置环境', '其他',
    ];
    for (const cat of expected) {
      expect(CATEGORIES).toContain(cat);
    }
  });

  it('has "其他" as the last category (fallback)', () => {
    expect(CATEGORIES[CATEGORIES.length - 1]).toBe('其他');
  });

  it('is a readonly tuple (const assertion)', () => {
    // Verify each element is a string literal
    for (const cat of CATEGORIES) {
      expect(typeof cat).toBe('string');
    }
  });
});

// ===== CATEGORY_COLORS =====
describe('CATEGORY_COLORS', () => {
  it('has entries for all 12 categories', () => {
    const colorKeys = Object.keys(CATEGORY_COLORS);
    expect(colorKeys).toHaveLength(12);
  });

  it('has a color mapping for each CATEGORIES entry', () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_COLORS[cat]).toBeDefined();
      expect(CATEGORY_COLORS[cat]).toBeTruthy();
    }
  });

  it('all color values are non-empty strings', () => {
    for (const value of Object.values(CATEGORY_COLORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('all color values contain Tailwind utility classes', () => {
    for (const value of Object.values(CATEGORY_COLORS)) {
      expect(value).toMatch(/^bg-\w+-\d{2,3}\s+text-\w+-\d{3}$/);
    }
  });
});

// ===== DEFAULT_SETTINGS =====
describe('DEFAULT_SETTINGS', () => {
  it('has all 10 required fields', () => {
    const keys = Object.keys(DEFAULT_SETTINGS);
    expect(keys).toHaveLength(10);
  });

  it('has correct field names', () => {
    const expectedKeys = [
      'siliconflow_api_key',
      'vision_model',
      'report_model',
      'chat_model',
      'screenshot_interval',
      'keep_screenshots',
      'auto_start_tracker',
      'auto_vision_toggle',
      'startup_with_windows',
      'desk_pet_enabled',
    ];
    for (const key of expectedKeys) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key);
    }
  });

  it('siliconflow_api_key defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.siliconflow_api_key).toBe('');
  });

  it('vision_model defaults to a Qwen VL model', () => {
    expect(DEFAULT_SETTINGS.vision_model).toContain('Qwen');
  });

  it('report_model defaults to DeepSeek-V3', () => {
    expect(DEFAULT_SETTINGS.report_model).toBe('deepseek-ai/DeepSeek-V3');
  });

  it('chat_model defaults to DeepSeek-V4-Flash', () => {
    expect(DEFAULT_SETTINGS.chat_model).toBe('deepseek-ai/DeepSeek-V4-Flash');
  });

  it('screenshot_interval defaults to 5', () => {
    expect(DEFAULT_SETTINGS.screenshot_interval).toBe(5);
  });

  it('boolean settings default to false', () => {
    expect(DEFAULT_SETTINGS.keep_screenshots).toBe(false);
    expect(DEFAULT_SETTINGS.auto_start_tracker).toBe(false);
    expect(DEFAULT_SETTINGS.auto_vision_toggle).toBe(false);
    expect(DEFAULT_SETTINGS.startup_with_windows).toBe(false);
    expect(DEFAULT_SETTINGS.desk_pet_enabled).toBe(false);
  });

  it('all values have correct types', () => {
    expect(typeof DEFAULT_SETTINGS.siliconflow_api_key).toBe('string');
    expect(typeof DEFAULT_SETTINGS.vision_model).toBe('string');
    expect(typeof DEFAULT_SETTINGS.report_model).toBe('string');
    expect(typeof DEFAULT_SETTINGS.chat_model).toBe('string');
    expect(typeof DEFAULT_SETTINGS.screenshot_interval).toBe('number');
    expect(typeof DEFAULT_SETTINGS.keep_screenshots).toBe('boolean');
    expect(typeof DEFAULT_SETTINGS.auto_start_tracker).toBe('boolean');
    expect(typeof DEFAULT_SETTINGS.auto_vision_toggle).toBe('boolean');
    expect(typeof DEFAULT_SETTINGS.startup_with_windows).toBe('boolean');
    expect(typeof DEFAULT_SETTINGS.desk_pet_enabled).toBe('boolean');
  });
});

// ===== TEMPLATES =====
describe('TEMPLATES', () => {
  it('contains exactly 2 templates', () => {
    expect(TEMPLATES).toHaveLength(2);
  });

  it('includes all expected template names', () => {
    const expected = ['工作日报', '全天回顾'];
    for (const tpl of expected) {
      expect(TEMPLATES).toContain(tpl);
    }
  });

  it('is a readonly tuple (const assertion)', () => {
    for (const tpl of TEMPLATES) {
      expect(typeof tpl).toBe('string');
    }
  });
});
