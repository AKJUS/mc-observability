// Timestamp helpers that treat backend "naive" datetime strings as UTC.
//
// Backend LocalDateTime values arrive as a naive ISO string with no timezone
// (e.g. "2026-06-12T10:20:38.528956"), but they are UTC. `new Date()` would treat
// such a string as *local* time and skip the conversion, so we mark naive datetime
// strings as UTC (append "Z") before parsing. Epoch numbers and timezone-aware
// strings (with "Z" or an offset) are passed through unchanged.
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

// Parse a backend timestamp into a Date, interpreting naive (tz-less) strings as UTC.
// Returns null for empty/invalid input. Epoch numbers and tz-aware strings pass through.
export function toDate(value) {
  if (value == null || value === '') return null;
  let v = value;
  if (typeof v === 'string' && NAIVE_DATETIME.test(v.trim())) {
    v = v.trim().replace(' ', 'T') + 'Z';
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Epoch milliseconds for a backend timestamp (naive strings treated as UTC).
// Use this for chart x-values so datetime axes render in the browser's local zone.
export function toEpochMillis(value) {
  const d = toDate(value);
  return d ? d.getTime() : NaN;
}

// Format a backend timestamp in the browser's local timezone (YYYY-MM-DD HH:mm:ss).
export function formatLocalTime(value) {
  if (value == null || value === '') return '';
  const d = toDate(value);
  if (!d) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
