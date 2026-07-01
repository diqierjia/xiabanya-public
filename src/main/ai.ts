import type { ActivityRecord, IdlePeriod, VisionResult } from '../shared/types';
import { formatUtcStorageTime, parseUtcStorageDateTime } from '../shared/time';

const API_BASE = 'https://api.siliconflow.cn/v1';

/** 将 UTC 存储时间转为用户电脑本地 HH:MM 显示 */
function localTime(utcStr?: string): string {
  return formatUtcStorageTime(utcStr);
}

function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes}分钟`;
}

function formatIdlePeriod(period: IdlePeriod): string {
  const start = localTime(period.start_at);
  const end = period.end_at ? localTime(period.end_at) : '当前';
  const startMs = parseUtcStorageDateTime(period.start_at)?.getTime();
  const endMs = period.end_at ? parseUtcStorageDateTime(period.end_at)?.getTime() : Date.now();
  const durationSec = startMs !== undefined && endMs !== undefined
    ? Math.max(0, Math.round((endMs - startMs) / 1000))
    : 0;
  return `${start} - ${end} 离开电脑 (${formatMinutes(durationSec)})`;
}

export async function classifyWithVision(
  apiKey: string,
  model: string,
  imageBase64: string,
  app: string,
  title: string,
  signal?: AbortSignal
): Promise<{ title: string; category: string; summary: string }> {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            '你是工作时间追踪助手。分析用户屏幕截图，判断当前工作内容。\n\n严格返回纯 JSON，不要有任何额外文字：\n{"title":"任务名称（10字以内）","category":"分类","summary":"一句话描述工作内容（30字以内）"}\n\n分类选项：文档、沟通、开发、学习、设计、产品、会议、数据分析、研究、AI/工具、配置环境、其他',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: `当前应用: ${app}\n窗口标题: ${title}\n\n分析截图中用户的工作内容。`,
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`SiliconFlow API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // fallback
  }

  return { title: `${app} - ${title}`.substring(0, 50), category: '其他', summary: content.substring(0, 100) };
}

/** v2.2: 报告生成参数 */
export interface GenerateReportParams {
  visionResults: VisionResult[];
  records: ActivityRecord[];
  idlePeriods?: IdlePeriod[];
  template: string;
  reportType: string;
  startDate: string;
  endDate: string;
}

export function buildReportPromptPayload(params: GenerateReportParams): { systemPrompt: string; userContent: string } {
  const { visionResults, records, idlePeriods = [], template, reportType, startDate, endDate } = params;

  // 优先使用 vision_results 构造工作摘要（清洗非法字符防注入）
  const visionText = visionResults.length > 0
    ? visionResults
        .map((vr, i) => {
          const cleanTitle = (vr.title || '').replace(/[)\]]+$/, '').substring(0, 60);
          const cleanSummary = (vr.summary || '').replace(/[)\]）]+$/, '').substring(0, 80);
          return `${i + 1}. [${localTime(vr.created_at)}] ${cleanTitle} (${vr.category})\n   摘要: ${cleanSummary}`;
        })
        .join('\n')
    : '';

  // records 作为补充上下文
  const recordsText = records.length > 0
    ? records
        .map((r, i) => {
          const cleanTitle = (r.title || '').substring(0, 60);
          return `${i + 1}. [${localTime(r.start_at)}-${localTime(r.end_at)}] ${cleanTitle} (${r.category}, ${r.app})`;
        })
        .join('\n')
    : '';

  const idleText = idlePeriods.length > 0
    ? idlePeriods.map((period) => `- ${formatIdlePeriod(period)}`).join('\n')
    : '';

  let systemPrompt = '';
  if (template === '成果导向日报') {
    systemPrompt = `你是一个专业的工作日报助手。请根据用户的 AI 截屏识别摘要和工作记录生成一份成果导向的日报。
AI 截屏识别摘要是主要数据源（反映用户屏幕实际工作内容），窗口追踪记录作为补充上下文。
格式要求：
## 今日成果
列出 3-5 项具体成果（优先从 AI 识别摘要中提取）
## 数据概览
工作时长、完成事项数等
## 明日计划
列出明天的主要安排`;
  } else if (template === '工作轨迹日报') {
    systemPrompt = `你是一个专业的工作日报助手。请按时间线描述用户的工作轨迹。
AI 截屏识别摘要是主要数据源（反映用户屏幕实际工作内容），窗口追踪记录作为补充上下文。
格式要求：
## 工作轨迹
按时间顺序描述每个时段的工作内容（优先从 AI 识别摘要中提取）
## 时间分布
简要说明各分类时间占比`;
  } else if (template === '三句话日报') {
    systemPrompt = `你是一个专业的工作日报助手。请根据 AI 截屏识别摘要（主要）和窗口追踪记录（补充）用三句话概括用户今天的工作：
1. 今天做了什么
2. 进展如何
3. 明天计划什么`;
  } else {
    systemPrompt = `你是一个专业的工作日报助手。请根据 AI 截屏识别摘要（主要）和窗口追踪记录（补充）列出用户今天最重要的 3 件事，每件事附带简短说明。`;
  }

  // 组装用户消息：vision 优先
  let userContent = `报告类型: ${reportType}\n日期范围: ${startDate} ~ ${endDate}\n\n`;
  if (visionText) {
    userContent += `=== AI 截屏识别摘要（主要数据源） ===\n${visionText}\n\n`;
  }
  if (recordsText) {
    userContent += `=== 窗口追踪记录（补充上下文） ===\n${recordsText}\n\n`;
  }
  if (idleText) {
    userContent += `=== 空闲时段（用户离开电脑，请勿推测为工作） ===\n${idleText}`;
  }
  if (!visionText && !recordsText && !idleText) {
    userContent += '（无工作记录数据，请生成空报告模板）';
  }

  return { systemPrompt, userContent };
}

/**
 * v2.2: generateReport 接收 vision_results（主）+ records（辅），
 * 组装 prompt 时 vision 数据优先，records 作为补充上下文。
 */
export async function generateReport(
  apiKey: string,
  model: string,
  params: GenerateReportParams
): Promise<string> {
  const { systemPrompt, userContent } = buildReportPromptPayload(params);

  // 调试：打印请求摘要到终端
  console.log(
    '\n[生成报告] model:',
    model,
    '| vision:',
    params.visionResults.length,
    '条 | records:',
    params.records.length,
    '条 | idle:',
    params.idlePeriods?.length || 0,
    '条'
  );

  // 完整请求体写入 data/report-request-debug.json 供排查
  try {
    const { writeFileSync } = await import('fs');
    const { join: pathJoin } = await import('path');
    writeFileSync(pathJoin(process.cwd(), 'data', 'report-request-debug.json'), JSON.stringify({ model, systemPrompt, userContent }, null, 2), 'utf-8');
  } catch {}

  // 报告生成 API 调用
  const reportFetchRes = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 1.0,
      max_tokens: 4096,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      stream: false,
    }),
  });

  if (!reportFetchRes.ok) {
    throw new Error(`SiliconFlow API error: ${reportFetchRes.status} ${reportFetchRes.statusText}`);
  }

  const data: any = await reportFetchRes.json();
  return data.choices?.[0]?.message?.content || '报告生成失败';
}
