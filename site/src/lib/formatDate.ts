const MONTHS = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];

/** The latest of ISO `YYYY-MM-DD` dates — they sort as strings. */
export function latestDay(...days: string[]): string {
  return days.reduce((a, b) => (b > a ? b : a));
}

/** «29 вересня 2026» from an ISO `YYYY-MM-DD` date, without a Date object (no timezone drift). */
export function formatDateUk(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
