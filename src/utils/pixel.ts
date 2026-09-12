// Meta Pixel Helper Utility

declare global {
  interface Window {
    fbq?: (action: string, eventName: string, parameters?: Record<string, unknown>) => void;
  }
}

export function trackPixelEvent(eventName: string, parameters?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      window.fbq('track', eventName, parameters);
    } catch {
      // ignore tracking errors gracefully
    }
  }
}

export function trackPixelCustom(eventName: string, parameters?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      window.fbq('trackCustom', eventName, parameters);
    } catch {
      // ignore tracking errors gracefully
    }
  }
}
