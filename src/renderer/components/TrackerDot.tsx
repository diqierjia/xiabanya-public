import { useState } from 'react';

interface TrackerDotProps {
  /** 自动截图识别是否运行中 */
  running: boolean;
  /** 点击切换回调 */
  onToggle: () => void;
}

/**
 * 小型 Vision Auto 状态指示器 — TodayPage Hero 右上角
 * 绿点闪烁=自动截图识别中 / 灰点=已停止
 */
export default function TrackerDot({ running, onToggle }: TrackerDotProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={onToggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors"
        title={running ? '自动截图识别中 — 点击停止截图' : '自动截图识别已停止 — 点击开始截图'}
        aria-label={running ? '停止自动截图识别' : '开始自动截图识别'}
      >
        <span
          className={`block w-3 h-3 rounded-full transition-all duration-300 ${
            running
              ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)] animate-pulse'
              : 'bg-gray-400'
          }`}
        />
      </button>
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-1.5 px-2.5 py-1 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap z-50 shadow-lg">
          {running ? '自动截图识别中，点击停止' : '自动截图识别已停止，点击开始'}
          <div className="absolute -top-1 right-3 w-2 h-2 bg-gray-800 rotate-45" />
        </div>
      )}
    </div>
  );
}
