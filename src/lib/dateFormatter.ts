/**
 * The API serializes timestamps as naive UTC ISO8601 strings (no "Z"/offset).
 * `new Date()` would read those as local time, so mark them as UTC explicitly.
 */
export function parseApiDate(value: string) {
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

const RelativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function formatRelativeTime(date: Date, now: Date = new Date()) {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  for (const [unit, unitSeconds] of UNITS) {
    if (Math.abs(seconds) >= unitSeconds) {
      return RelativeFormat.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return "just now";
}
