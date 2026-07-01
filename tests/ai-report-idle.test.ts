import { describe, expect, it } from 'vitest';
import { buildReportPromptPayload } from '../src/main/ai';

describe('buildReportPromptPayload() idle context', () => {
  it('injects idle periods as non-work context', () => {
    const { userContent } = buildReportPromptPayload({
      visionResults: [
        {
          id: 'vision-1',
          record_id: '',
          title: '编码实现',
          category: '开发',
          summary: '实现空闲检测状态机',
          raw_response: '{}',
          app: 'VSCode',
          window_title: 'ipc-handlers.ts',
          model: 'Qwen/Qwen3-VL-32B-Instruct',
          created_at: '2026-06-25 01:00:00',
        },
      ],
      records: [],
      idlePeriods: [
        {
          id: 'idle-1',
          start_at: '2026-06-25 02:00:00',
          end_at: '2026-06-25 02:20:00',
          created_at: '2026-06-25 02:05:00',
        },
      ],
      template: '工作轨迹日报',
      reportType: '日报',
      startDate: '2026-06-25',
      endDate: '2026-06-25',
    });

    expect(userContent).toContain('=== 空闲时段');
    expect(userContent).toContain('离开电脑');
    expect(userContent).toContain('20分钟');
    expect(userContent).toContain('请勿推测为工作');
    expect(userContent).toContain('AI 截屏识别摘要');
  });
});
