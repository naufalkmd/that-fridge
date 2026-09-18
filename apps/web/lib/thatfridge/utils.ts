export const FRESH_GREEN = "#3f8f5c";
export const FRESH_AMBER = "#d99a2b";
export const FRESH_RED = "#c1452e";

export function freshColor(freshness: number): string {
  if (freshness >= 60) return FRESH_GREEN;
  if (freshness >= 30) return FRESH_AMBER;
  return FRESH_RED;
}

// Same thresholds as freshColor, as an ordinal for sorting: most urgent (red) first.
export function freshnessBand(freshness: number): 0 | 1 | 2 {
  if (freshness < 30) return 0;
  if (freshness < 60) return 1;
  return 2;
}

export function daysLabel(days: number): string {
  if (days < 0) return "Expired";
  return days <= 1 ? "Today" : `${days}d left`;
}

export function timeAgo(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
