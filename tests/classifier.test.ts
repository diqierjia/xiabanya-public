import { describe, it, expect } from 'vitest';
import {
  classify,
  isValidCategory,
  getCategoryKeywordMap,
} from '../src/main/classifier';
import type { ClassificationResult } from '../src/main/classifier';

// ===== classify() =====
describe('classify()', () => {
  // --- 开发 (highest priority) ---
  describe('→ 开发', () => {
    it('classifies VS Code as 开发', () => {
      const result = classify('Code.exe', 'app.ts — xiabanya-electron');
      expect(result.category).toBe('开发');
      expect(result.confidence).toBe('high');
    });

    it('classifies Cursor as 开发', () => {
      const result = classify('Cursor.exe', 'main.ts');
      expect(result.category).toBe('开发');
    });

    it('classifies PyCharm as 开发', () => {
      const result = classify('pycharm64.exe', 'project — PyCharm');
      expect(result.category).toBe('开发');
    });

    it('classifies Terminal/PowerShell as 开发', () => {
      const result = classify('WindowsTerminal.exe', 'PowerShell 7');
      expect(result.category).toBe('开发');
    });

    it('classifies Git as 开发', () => {
      const result = classify('git-bash.exe', 'MINGW64:/c/project');
      expect(result.category).toBe('开发');
    });

    it('classifies IDE as 开发', () => {
      const result = classify('some-ide.exe', 'IDE - Project');
      expect(result.category).toBe('开发');
    });
  });

  // --- 文档 (second priority if no 开发 match) ---
  describe('→ 文档', () => {
    it('classifies Word as 文档', () => {
      const result = classify('WINWORD.EXE', 'Document1 - Word');
      expect(result.category).toBe('文档');
    });

    it('classifies WPS as 文档', () => {
      const result = classify('wps.exe', '工作报告.wps');
      expect(result.category).toBe('文档');
    });

    it('classifies Excel as 文档', () => {
      const result = classify('EXCEL.EXE', '季度报表.xlsx');
      expect(result.category).toBe('文档');
    });

    it('classifies Notepad as 文档', () => {
      const result = classify('notepad.exe', 'notes.txt - Notepad');
      expect(result.category).toBe('文档');
    });

    it('classifies Obsidian as 文档', () => {
      const result = classify('Obsidian.exe', 'daily-note — Obsidian');
      expect(result.category).toBe('文档');
    });

    it('classifies Typora as 文档', () => {
      const result = classify('Typora.exe', 'readme.md — Typora');
      expect(result.category).toBe('文档');
    });
  });

  // --- 沟通 ---
  describe('→ 沟通', () => {
    it('classifies WeChat as 沟通', () => {
      const result = classify('WeChat.exe', '微信');
      expect(result.category).toBe('沟通');
    });

    it('classifies QQ as 沟通', () => {
      const result = classify('QQ.exe', 'QQ');
      expect(result.category).toBe('沟通');
    });

    it('classifies DingTalk as 沟通', () => {
      const result = classify('DingTalk.exe', '钉钉');
      expect(result.category).toBe('沟通');
    });

    it('classifies Feishu/Lark as 沟通', () => {
      const result = classify('Lark.exe', '飞书 - 团队协作');
      expect(result.category).toBe('沟通');
    });

    it('classifies Slack as 沟通', () => {
      const result = classify('Slack.exe', '#general - Slack');
      expect(result.category).toBe('沟通');
    });

    it('classifies Discord as 沟通', () => {
      const result = classify('Discord.exe', '服务器 - Discord');
      expect(result.category).toBe('沟通');
    });

    it('classifies Teams as 沟通', () => {
      const result = classify('Teams.exe', 'Microsoft Teams');
      expect(result.category).toBe('沟通');
    });
  });

  // --- 学习 ---
  describe('→ 学习', () => {
    it('classifies plain Chrome browser without content signal as 其他', () => {
      const result = classify('chrome.exe', 'Google Chrome');
      expect(result.category).toBe('其他');
      expect(result.confidence).toBe('low');
    });

    it('classifies plain Edge browser without content signal as 其他', () => {
      const result = classify('msedge.exe', 'Microsoft Edge');
      expect(result.category).toBe('其他');
    });

    it('classifies plain Firefox browser without content signal as 其他', () => {
      const result = classify('firefox.exe', 'Mozilla Firefox');
      expect(result.category).toBe('其他');
    });

    it('classifies Bilibili as 学习', () => {
      const result = classify('bilibili.exe', 'bilibili');
      expect(result.category).toBe('学习');
    });

    it('classifies YouTube as 学习', () => {
      const result = classify('chrome.exe', 'YouTube - 教程');
      expect(result.category).toBe('学习');
    });
  });

  // --- 设计 ---
  describe('→ 设计', () => {
    it('classifies Figma as 设计', () => {
      const result = classify('Figma.exe', 'Design System — Figma');
      expect(result.category).toBe('设计');
    });

    it('classifies Photoshop as 设计', () => {
      const result = classify('Photoshop.exe', 'banner.psd');
      expect(result.category).toBe('设计');
    });
  });

  // --- AI/工具 ---
  describe('→ AI/工具', () => {
    it('classifies ChatGPT desktop app as AI/工具', () => {
      const result = classify('ChatGPT.exe', 'ChatGPT');
      expect(result.category).toBe('AI/工具');
    });

    it('classifies Claude desktop app as AI/工具', () => {
      const result = classify('Claude.exe', 'Claude - Anthropic');
      expect(result.category).toBe('AI/工具');
    });

    it('classifies WorkBuddy as AI/工具', () => {
      const result = classify('WorkBuddy.exe', 'WorkBuddy');
      expect(result.category).toBe('AI/工具');
    });
  });

  // --- 会议 ---
  describe('→ 会议', () => {
    it('classifies Zoom as 会议', () => {
      const result = classify('Zoom.exe', 'Zoom Meeting');
      expect(result.category).toBe('会议');
    });

    it('classifies Tencent Meeting as 会议', () => {
      const result = classify('wemeetapp.exe', '腾讯会议');
      expect(result.category).toBe('会议');
    });

    it('classifies meeting keyword in window title as 会议', () => {
      const result = classify('meeting-app.exe', '项目评审会');
      expect(result.category).toBe('会议');
    });
  });

  // --- 配置环境 ---
  describe('→ 配置环境', () => {
    it('classifies Settings as 配置环境', () => {
      const result = classify('SystemSettings.exe', '设置');
      expect(result.category).toBe('配置环境');
    });

    it('classifies Docker as 配置环境', () => {
      const result = classify('Docker Desktop.exe', 'Docker');
      expect(result.category).toBe('配置环境');
    });

    it('classifies VPN/proxy as 配置环境', () => {
      const result = classify('clash-verge.exe', 'Clash Verge');
      expect(result.category).toBe('配置环境');
    });

    it('classifies config operations as 配置环境', () => {
      const result = classify('explorer.exe', '环境变量配置');
      expect(result.category).toBe('配置环境');
    });
  });

  // --- 研究 ---
  describe('→ 研究', () => {
    it('classifies Jupyter as 研究', () => {
      const result = classify('jupyter-notebook.exe', 'Untitled.ipynb');
      expect(result.category).toBe('研究');
    });

    it('classifies Python as 研究', () => {
      const result = classify('python.exe', 'train.py');
      expect(result.category).toBe('研究');
    });

    it('classifies Overleaf/LaTeX as 研究', () => {
      // Note: must avoid '论文' in title as it triggers 学习 (higher priority than 研究)
      const result = classify('overleaf.exe', 'LaTeX Editor');
      expect(result.category).toBe('研究');
    });
  });

  // --- 产品 ---
  describe('→ 产品', () => {
    it('classifies Jira as 产品', () => {
      const result = classify('jira.exe', 'Sprint Board');
      expect(result.category).toBe('产品');
    });

    it('classifies TAPD as 产品', () => {
      const result = classify('tapd.exe', '需求管理');
      expect(result.category).toBe('产品');
    });

    it('classifies Axure as 产品', () => {
      const result = classify('Axure.exe', '原型设计');
      expect(result.category).toBe('产品');
    });
  });

  // --- 数据分析 ---
  describe('→ 数据分析', () => {
    it('classifies Tableau as 数据分析', () => {
      const result = classify('Tableau.exe', 'Dashboard');
      expect(result.category).toBe('数据分析');
    });

    it('classifies SQL tools as 数据分析', () => {
      const result = classify('DBeaver.exe', 'SQL Query');
      expect(result.category).toBe('数据分析');
    });
  });

  // --- 默认→其他 ---
  describe('→ 其他 (fallback)', () => {
    it('returns 其他 for unknown applications', () => {
      const result = classify('SomeRandomApp.exe', 'Unknown Window');
      expect(result.category).toBe('其他');
      expect(result.confidence).toBe('low');
      expect(result.matchedKeywords).toEqual([]);
    });

    it('returns 其他 for empty strings', () => {
      const result = classify('', '');
      expect(result.category).toBe('其他');
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('handles mixed case input (case-insensitive)', () => {
      const result = classify('VSCODE.EXE', 'MAIN.TS');
      expect(result.category).toBe('开发');
    });

    it('returns matched keywords', () => {
      const result = classify('Code.exe', 'vscode project');
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
      expect(result.matchedKeywords).toContain('vscode');
    });

    it('matchedKeywords contains the exact keyword that triggered the match', () => {
      const result = classify('WeChat.exe', '微信聊天');
      expect(result.matchedKeywords).toContain('wechat');
    });
  });

  // --- Priority test: 开发 beats 学习 ---
  describe('priority: 开发 > others', () => {
    it('开发 keywords beat 学习 keywords', () => {
      // "code" is in both devKeywords and appears in the title
      const result = classify('Code.exe', 'chrome-like-ide');
      expect(result.category).toBe('开发');
    });
  });
});

// ===== isValidCategory() =====
describe('isValidCategory()', () => {
  it('returns true for all 12 valid categories', () => {
    const valid = [
      '文档', '沟通', '开发', '学习', '设计',
      '产品', '会议', '数据分析', '研究', 'AI/工具',
      '配置环境', '其他',
    ];
    for (const cat of valid) {
      expect(isValidCategory(cat)).toBe(true);
    }
  });

  it('returns false for invalid categories', () => {
    expect(isValidCategory('')).toBe(false);
    expect(isValidCategory('invalid')).toBe(false);
    expect(isValidCategory('游戏')).toBe(false);
    expect(isValidCategory('开发工具')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidCategory('')).toBe(false);
  });
});

// ===== getCategoryKeywordMap() =====
describe('getCategoryKeywordMap()', () => {
  it('returns a map with all 12 categories', () => {
    const map = getCategoryKeywordMap();
    expect(Object.keys(map)).toHaveLength(12);
  });

  it('开发 has keywords', () => {
    const map = getCategoryKeywordMap();
    expect(map['开发'].length).toBeGreaterThan(0);
  });

  it('其他 has empty keywords array', () => {
    const map = getCategoryKeywordMap();
    expect(map['其他']).toEqual([]);
  });

  it('all keyword arrays contain strings', () => {
    const map = getCategoryKeywordMap();
    for (const [cat, keywords] of Object.entries(map)) {
      for (const kw of keywords) {
        expect(typeof kw).toBe('string');
      }
    }
  });
});
