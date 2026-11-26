import { TIMEZONE } from '../contracts';

export interface LocalParts {
  localDate: string; // YYYY-MM-DD in America/Toronto
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
  offset: string; // e.g. GMT-05:00
}

/** Wall-clock parts in America/Toronto for an instant. Never assumes a fixed UTC offset. */
export function torontoParts(instant: Date): LocalParts {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
    timeZoneName: 'longOffset',
  });
  const parts = Object.fromEntries(f.formatToParts(instant).map((p) => [p.type, p.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(parts.weekday));
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: wd,
    offset: String(parts.timeZoneName),
  };
}

export const SEND_HOUR = 9;
/** Latest local hour at which a delayed send may still go out (then it holds). */
export const SEND_GRACE_END_HOUR = 12;

export function isPublicationDay(localDate: string): boolean {
  const wd = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  return wd >= 1 && wd <= 5;
}

export type SendGate =
  | { open: true; localDate: string }
  | { open: false; localDate: string; reason: 'weekend' | 'before_send_time' | 'after_grace_window' };

/**
 * The scheduler may fire at several UTC instants (e.g. 13:00 and 14:00 UTC to
 * cover EDT and EST). The gate opens only between 09:00 and the grace end,
 * Toronto local time, on Monday–Friday; exactly-once delivery is then
 * guaranteed by the unique dispatch per local issue date.
 */
export function sendGate(instant: Date): SendGate {
  const p = torontoParts(instant);
  if (p.weekday === 0 || p.weekday === 6) return { open: false, localDate: p.localDate, reason: 'weekend' };
  if (p.hour < SEND_HOUR) return { open: false, localDate: p.localDate, reason: 'before_send_time' };
  if (p.hour >= SEND_GRACE_END_HOUR) return { open: false, localDate: p.localDate, reason: 'after_grace_window' };
  return { open: true, localDate: p.localDate };
}

/** Human-readable local date, e.g. "Thursday, 26 November 2026". */
export function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${localDate}T12:00:00Z`));
}

export function formatShortDate(iso?: string): string {
  if (!iso) return 'date unknown';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}
