const TIMEZONE_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The renderer updates this attribute when the user changes the UI language. */
function displayLocale(): string {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'en-US') {
    return 'en-US';
  }
  return 'zh-CN';
}

export function formatLocalDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatLocalDateTime(date: Date = new Date()): string {
  return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatDateTimeLocalInput(date: Date = new Date()): string {
  return `${formatLocalDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatUtcStorageDateTime(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

export function parseUtcStorageDateTime(value?: string): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(TIMEZONE_SUFFIX_RE.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUtcStorageTime(value?: string, includeSeconds = false): string {
  const date = parseUtcStorageDateTime(value);
  if (!date) return includeSeconds ? '--:--:--' : '--:--';
  return date.toLocaleTimeString(displayLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false,
  });
}

export function formatUtcStorageDateTimeLocal(value?: string): string {
  const date = parseUtcStorageDateTime(value);
  if (!date) return value ? value.substring(0, 16) : '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function localDateFromUtcStorage(value?: string): string {
  const date = parseUtcStorageDateTime(value);
  return date ? formatLocalDate(date) : '';
}

export function localHourFromUtcStorage(value?: string): number {
  const date = parseUtcStorageDateTime(value);
  return date ? date.getHours() : 0;
}

export function localDateRangeToUtcStorageRange(startDate: string, endDate: string): { start: string; end: string } {
  const start = new Date(`${startDate}T00:00:00.000`);
  const end = new Date(`${endDate}T23:59:59.999`);
  return {
    start: formatUtcStorageDateTime(start),
    end: formatUtcStorageDateTime(end),
  };
}
