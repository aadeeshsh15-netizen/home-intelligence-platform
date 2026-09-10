/**
 * Technical formatting utilities for sensor telemetry, units, and timestamps.
 */

export function formatMetricValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }

  switch (unit) {
    case '°C':
    case '°F':
      return `${value.toFixed(1)} ${unit}`;
    case '%':
      return `${Math.round(value)} %`;
    case 'ppm':
    case 'ppb':
    case 'lux':
      return `${Math.round(value).toLocaleString()} ${unit}`;
    case 'µg/m³':
      return `${value.toFixed(1)} ${unit}`;
    case 'W':
      return value >= 1000 ? `${(value / 1000).toFixed(2)} kW` : `${Math.round(value)} W`;
    case 'dB':
      return `${Math.round(value)} dB`;
    case 'boolean':
    case 'binary':
      return value > 0.5 ? 'Occupied' : 'Clear';
    default:
      return `${value.toFixed(1)} ${unit}`;
  }
}

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'Never';
  const now = new Date();
  const d = new Date(date);
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatTimestampIso(date: Date | string): string {
  return new Date(date).toISOString().replace('T', ' ').substring(0, 19);
}
