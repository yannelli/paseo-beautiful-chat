/** A duration in human units: `820ms`, `1.4s`, `42s`, `2m 5s`, `1h 3m`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const tenths = Math.round(ms / 100) / 10;
  if (tenths < 10) return `${tenths.toFixed(1)}s`;
  // Round once, then split, so 59.99s never prints as "60.0s" and 119.7s never as "1m 60s".
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** An epoch-millisecond stamp as a coarse age: `just now`, `12s ago`, `5m ago`, `3h ago`, `2d ago`. */
export function formatAge(ts: number, now: number = Date.now()): string {
  const gap = now - ts;
  if (!Number.isFinite(gap) || gap < 5000) return "just now";
  const seconds = Math.floor(gap / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** A byte count with one decimal past a kilobyte: `512 B`, `1.5 KB`, `3.2 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
