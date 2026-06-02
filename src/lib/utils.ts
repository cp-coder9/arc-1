import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely formats a date string/value using date-fns format.
 * Returns `fallback` (default: '—') instead of throwing when the
 * value is undefined, null, or results in an invalid Date.
 */
export function safeFormat(
  value: string | number | Date | null | undefined,
  formatStr: string,
  fallback = '—'
): string {
  try {
    if (value === null || value === undefined || value === '') return fallback;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr);
  } catch {
    return fallback;
  }
}

/**
 * Safely converts a number to a locale string.
 * Returns '0' instead of throwing when value is undefined/null.
 */
export function safeLocale(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value as number)) return '0';
  return value.toLocaleString();
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}
