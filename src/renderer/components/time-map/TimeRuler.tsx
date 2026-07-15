interface TimeRulerProps {
  hours: number[];
  pxPerMinute: number;
}

/** 将小时数格式化为 "HH:00"（如 9 → "09:00"） */
function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * 时间轴左侧刻度尺。
 * 按传入的小时数组渲染整点标签，绝对定位。
 */
export function TimeRuler({ hours, pxPerMinute }: TimeRulerProps) {
  if (hours.length === 0) return null;

  const firstHour = hours[0];
  const totalHeight = hours.length * 60 * pxPerMinute;

  return (
    <div
      className="relative border-r border-gray-200 shrink-0"
      style={{ width: 64, height: totalHeight }}
    >
      {hours.map((hour) => {
        const top = (hour - firstHour) * 60 * pxPerMinute;
        return (
          <div
            key={hour}
            className="absolute right-2 text-xs text-gray-400"
            style={{ top, transform: 'translateY(-50%)' }}
          >
            {formatHourLabel(hour)}
          </div>
        );
      })}
    </div>
  );
}
