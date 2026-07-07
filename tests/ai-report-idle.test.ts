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
          observed_fact: '代码编辑器中打开空闲检测相关文件，可见状态机和计时器处理逻辑。',
          possible_activity: '可能在实现或调整空闲检测状态机。',
          confidence: 'high',
          activity_type: 'work',
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
      template: '工作日报',
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

  it('filters personal and low-confidence vision results out of work reports', () => {
    const { userContent } = buildReportPromptPayload({
      visionResults: [
        {
          id: 'vision-work',
          record_id: '',
          title: '编辑代码',
          category: '开发',
          summary: '可能在编辑代码',
          observed_fact: '代码编辑器中打开项目源码文件，可见函数实现和类型定义。',
          possible_activity: '可能在开发项目功能。',
          confidence: 'high',
          activity_type: 'work',
          raw_response: '{}',
          app: 'Code',
          window_title: 'ai.ts',
          model: 'Qwen/Qwen3-VL-32B-Instruct',
          created_at: '2026-06-25 01:00:00',
        },
        {
          id: 'vision-game',
          record_id: '',
          title: '游戏娱乐',
          category: '其他',
          summary: '可能在进行游戏',
          observed_fact: '屏幕显示游戏界面，可见角色、地图和对战 UI。',
          possible_activity: '可能在进行游戏娱乐。',
          confidence: 'high',
          activity_type: 'personal',
          raw_response: '{}',
          app: 'Game',
          window_title: '三角洲行动',
          model: 'Qwen/Qwen3-VL-32B-Instruct',
          created_at: '2026-06-25 01:05:00',
        },
        {
          id: 'vision-low',
          record_id: '',
          title: '不确定活动',
          category: '其他',
          summary: '可能处于切换窗口',
          observed_fact: '屏幕内容较少，只能看到桌面和任务栏。',
          possible_activity: '可能处于等待或切换窗口状态。',
          confidence: 'low',
          activity_type: 'unclear',
          raw_response: '{}',
          app: 'Explorer',
          window_title: 'Desktop',
          model: 'Qwen/Qwen3-VL-32B-Instruct',
          created_at: '2026-06-25 01:10:00',
        },
      ],
      records: [],
      idlePeriods: [],
      template: '工作日报',
      reportType: '日报',
      startDate: '2026-06-25',
      endDate: '2026-06-25',
    });

    expect(userContent).toContain('进入工作日报材料 1 条');
    expect(userContent).toContain('编辑代码');
    expect(userContent).not.toContain('游戏娱乐');
    expect(userContent).not.toContain('不确定活动');
  });
});
