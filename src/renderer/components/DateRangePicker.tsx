import { formatLocalDate } from '../../shared/time';
import { useTranslation } from '../i18n';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

function todayStr(): string {
  return formatLocalDate();
}

function weekStart(): string {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return formatLocalDate(d);
}

function monthStart(): string {
  const d = new Date();
  d.setDate(1);
  return formatLocalDate(d);
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const { t, isEnglish } = useTranslation();
  const presets = [
    { label: t('dateRangeToday'), start: todayStr(), end: todayStr() },
    { label: t('dateRangeYesterday'), start: daysAgo(1), end: daysAgo(1) },
    { label: t('dateRangeThisWeek'), start: weekStart(), end: todayStr() },
    { label: t('dateRangeThisMonth'), start: monthStart(), end: todayStr() },
    { label: t('dateRangeLast7Days'), start: daysAgo(6), end: todayStr() },
  ];
  const activePresetIndex = presets.findIndex((preset) => startDate === preset.start && endDate === preset.end);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
        <span className="text-sm text-gray-400">{isEnglish ? 'to' : '至'}</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div className="flex gap-1">
        {presets.map((preset, index) => (
          <button
            key={preset.label}
            onClick={() => onChange(preset.start, preset.end)}
            className={`px-2 py-1 text-xs rounded-md border ${
              activePresetIndex === index
                ? 'bg-brand-50 border-brand-400 text-brand-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
