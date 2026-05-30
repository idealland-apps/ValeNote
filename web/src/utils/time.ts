let cachedTimezone: string | null = null;

export function setTimezone(tz: string) {
  cachedTimezone = tz;
}

export function getTimezone(): string {
  return cachedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatTimestamp(timestamp: number): string {
  if (!timestamp) return '';
  const tz = getTimezone();
  try {
    return new Date(timestamp).toLocaleString(undefined, { timeZone: tz });
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const tz = getTimezone();
  try {
    return new Date(timestamp).toLocaleDateString(undefined, { timeZone: tz });
  } catch {
    return new Date(timestamp).toLocaleDateString();
  }
}

export function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  const tz = getTimezone();
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, { timeZone: tz });
  } catch {
    return new Date(timestamp).toLocaleTimeString();
  }
}
