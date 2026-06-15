import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('it-IT', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export function fmtCost(value: number | null | undefined, currency = 'USD'): string {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency', currency, minimumFractionDigits: value < 1 ? 3 : 2, maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return `${value.toFixed(3)} ${currency}`;
  }
}

export function fmtRelative(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    const diff = Date.now() - new Date(s).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'poco fa';
    if (m < 60) return `${m} min fa`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h fa`;
    return fmtDate(s);
  } catch {
    return s;
  }
}
