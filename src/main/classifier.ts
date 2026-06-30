import type { Category } from '../shared/types';
import { CATEGORIES } from '../shared/types';

// ===== 关键词分类引擎 =====
// 直接映射 v1 PySide6 的 cat_for() 函数逻辑
// 12 分类: 文档, 沟通, 开发, 学习, 设计, 产品, 会议, 数据分析, 研究, AI/工具, 配置环境, 其他

export interface ClassificationResult {
  category: Category;
  matchedKeywords: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 根据应用名和窗口标题进行关键词分类
 * 匹配顺序与 v1 保持一致：开发 → 文档 → 沟通 → 学习 → 设计 → 研究 → AI/工具 → 配置环境 → 会议 → 数据分析 → 产品 → 其他
 */
export function classify(app: string, title: string): ClassificationResult {
  const t = `${app} ${title}`.toLowerCase();

  // 1. 开发 (最高优先级，开发者最常用)
  const devKeywords = ['code', 'cursor', 'pycharm', 'terminal', 'powershell', 'cmd', 'vscode',
    'visual studio', 'git', 'ide'];
  const devHits = devKeywords.filter(k => t.includes(k));
  if (devHits.length > 0) {
    return { category: '开发', matchedKeywords: devHits, confidence: 'high' };
  }

  // 2. 文档
  const docKeywords = ['word', 'wps', 'excel', 'notepad', '文档', 'obsidian', 'typora', 'md ', 'markdown'];
  const docHits = docKeywords.filter(k => t.includes(k));
  if (docHits.length > 0) {
    return { category: '文档', matchedKeywords: docHits, confidence: 'high' };
  }

  // 3. 沟通
  const commKeywords = ['wechat', 'weixin', 'qq', 'teams', '钉钉', '飞书', 'lark', 'slack', 'discord'];
  const commHits = commKeywords.filter(k => t.includes(k));
  if (commHits.length > 0) {
    return { category: '沟通', matchedKeywords: commHits, confidence: 'high' };
  }

  // 4. 学习
  const learnKeywords = ['arxiv', '论文', 'paper', 'scholar',
    'github', 'stackoverflow', 'csdn', '知乎', 'bilibili', 'youtube', '教程', 'course'];
  const learnHits = learnKeywords.filter(k => t.includes(k));
  if (learnHits.length > 0) {
    return { category: '学习', matchedKeywords: learnHits, confidence: 'medium' };
  }

  // 5. 设计
  const designKeywords = ['figma', 'photoshop', 'illustrator', 'sketch'];
  const designHits = designKeywords.filter(k => t.includes(k));
  if (designHits.length > 0) {
    return { category: '设计', matchedKeywords: designHits, confidence: 'high' };
  }

  // 6. 研究
  const researchKeywords = ['jupyter', 'python', 'anaconda', 'conda', 'pip', 'numpy', 'pandas',
    'pytorch', 'tensorflow', '模型', 'model', '训练', 'train', '实验', 'experiment',
    'research', '论文写作', 'latex', 'overleaf'];
  const researchHits = researchKeywords.filter(k => t.includes(k));
  if (researchHits.length > 0) {
    return { category: '研究', matchedKeywords: researchHits, confidence: 'high' };
  }

  // 7. AI/工具
  const aiKeywords = ['workbuddy', 'chatgpt', 'claude', 'gemini', 'copilot', 'ai助手', 'gpt',
    'llm', '大模型', 'openai', 'anthropic'];
  const aiHits = aiKeywords.filter(k => t.includes(k));
  if (aiHits.length > 0) {
    return { category: 'AI/工具', matchedKeywords: aiHits, confidence: 'high' };
  }

  // 8. 配置环境
  const configKeywords = ['setting', '设置', 'config', '配置', 'install', '安装', '环境', 'env',
    'docker', 'vmware', '虚拟机', 'clash', 'proxy', 'vpn'];
  const configHits = configKeywords.filter(k => t.includes(k));
  if (configHits.length > 0) {
    return { category: '配置环境', matchedKeywords: configHits, confidence: 'medium' };
  }

  // 9. 会议
  const meetingKeywords = ['meeting', '会议', 'zoom', '腾讯会议', 'tencent meeting', 'tmeet'];
  const meetingHits = meetingKeywords.filter(k => t.includes(k));
  if (meetingHits.length > 0) {
    return { category: '会议', matchedKeywords: meetingHits, confidence: 'high' };
  }

  // 10. 数据分析
  const dataKeywords = ['tableau', 'powerbi', 'sql', '数据库', 'data', '数据分析', 'excel', 'csv'];
  const dataHits = dataKeywords.filter(k => t.includes(k));
  if (dataHits.length > 0) {
    return { category: '数据分析', matchedKeywords: dataHits, confidence: 'medium' };
  }

  // 11. 产品
  const productKeywords = ['axure', '原型', 'product', '需求', 'jira', 'confluence', 'tapd', 'teambition'];
  const productHits = productKeywords.filter(k => t.includes(k));
  if (productHits.length > 0) {
    return { category: '产品', matchedKeywords: productHits, confidence: 'medium' };
  }

  // 12. 默认 → 其他
  return { category: '其他', matchedKeywords: [], confidence: 'low' };
}

/**
 * 验证分类是否有效（属于预设的 12 个分类）
 */
export function isValidCategory(cat: string): cat is Category {
  return (CATEGORIES as readonly string[]).includes(cat);
}

/**
 * 获取所有分类及其对应的关键词映射
 */
export function getCategoryKeywordMap(): Record<Category, string[]> {
  return {
    '文档': ['word', 'wps', 'excel', 'notepad', '文档', 'obsidian', 'typora', 'md ', 'markdown'],
    '沟通': ['wechat', 'weixin', 'qq', 'teams', '钉钉', '飞书', 'lark', 'slack', 'discord'],
    '开发': ['code', 'cursor', 'pycharm', 'terminal', 'powershell', 'cmd', 'vscode', 'visual studio', 'git', 'ide'],
    '学习': ['arxiv', '论文', 'paper', 'scholar', 'github', 'stackoverflow', 'csdn', '知乎', 'bilibili', 'youtube', '教程', 'course'],
    '设计': ['figma', 'photoshop', 'illustrator', 'sketch'],
    '产品': ['axure', '原型', 'product', '需求', 'jira', 'confluence', 'tapd', 'teambition'],
    '会议': ['meeting', '会议', 'zoom', '腾讯会议', 'tencent meeting', 'tmeet'],
    '数据分析': ['tableau', 'powerbi', 'sql', '数据库', 'data', '数据分析', 'excel', 'csv'],
    '研究': ['jupyter', 'python', 'anaconda', 'conda', 'pip', 'numpy', 'pandas', 'pytorch', 'tensorflow', '模型', 'model', '训练', 'train', '实验', 'experiment', 'research', '论文写作', 'latex', 'overleaf'],
    'AI/工具': ['workbuddy', 'chatgpt', 'claude', 'gemini', 'copilot', 'ai助手', 'gpt', 'llm', '大模型', 'openai', 'anthropic'],
    '配置环境': ['setting', '设置', 'config', '配置', 'install', '安装', '环境', 'env', 'docker', 'vmware', '虚拟机', 'clash', 'proxy', 'vpn'],
    '其他': [],
  };
}
