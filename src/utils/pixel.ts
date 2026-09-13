// Meta (Facebook) Pixel Helper Utility

declare global {
  interface Window {
    fbq?: (action: string, eventName: string, parameters?: Record<string, unknown>) => void;
    _fbq?: unknown;
  }
}

/**
 * Low-level call to window.fbq with safety checks
 */
export function trackPixelEvent(eventName: string, parameters?: Record<string, unknown>): void {
  if (typeof window !== 'undefined') {
    if (typeof window.fbq === 'function') {
      try {
        if (parameters) {
          window.fbq('track', eventName, parameters);
        } else {
          window.fbq('track', eventName);
        }
      } catch (err) {
        console.warn(`[Pixel] Error tracking ${eventName}:`, err);
      }
    } else {
      // In case pixel is still loading
      console.log(`[Pixel Event Queued] fbq('track', '${eventName}')`, parameters || '');
    }
  }
}

/**
 * كي يكليكي على اطلب الآن
 * fbq('track', 'AddToCart');
 */
export function trackAddToCart(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
}): void {
  const defaultParams = {
    content_name: params?.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    value: params?.value || 9500,
    currency: params?.currency || 'DZD',
  };

  trackPixelEvent('AddToCart', defaultParams);
}

/**
 * كي يفتح الفورم
 * fbq('track', 'InitiateCheckout');
 */
export function trackInitiateCheckout(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  num_items?: number;
}): void {
  const defaultParams = {
    content_name: params?.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    value: params?.value || 9500,
    currency: params?.currency || 'DZD',
    num_items: params?.num_items || 1,
  };

  trackPixelEvent('InitiateCheckout', defaultParams);
}

/**
 * عند إتمام الطلب بنجاح
 * fbq('track', 'Purchase');
 */
export function trackPurchase(params: {
  value: number;
  currency: string;
  content_name: string;
  order_id: string;
}): void {
  trackPixelEvent('Purchase', {
    value: params.value,
    currency: params.currency || 'DZD',
    content_name: params.content_name,
    order_id: params.order_id,
    content_type: 'product',
  });
}

/**
 * Custom tracking helper
 */
export function trackPixelCustom(eventName: string, parameters?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      window.fbq('trackCustom', eventName, parameters);
    } catch {
      // ignore
    }
  }
}
