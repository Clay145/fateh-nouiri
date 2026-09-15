// Meta (Facebook) Pixel Helper Utility & Deduplication Engine
// Business: Theoria Store
// Primary Authorized Pixel: pixel theoria ID 28477410788542282
// Purged Test Pixels: test_theoria_01 (2995569250646819), test_theoria_02 (892942970517633)

export const META_MAIN_PIXEL_ID = '28477410788542282';
export const PURGED_TEST_PIXEL_IDS = ['2995569250646819', '892942970517633'] as const;

declare global {
  interface Window {
    fbq?: (
      action: string,
      eventName: string,
      parameters?: Record<string, unknown>,
      options?: { eventID?: string }
    ) => void;
    _fbq?: unknown;
  }
}

const FIRED_PURCHASES_STORAGE_KEY = 'theoria_fired_purchases_cache';
const PIXEL_EVENT_LOGS_KEY = 'theoria_pixel_event_logs';

/**
 * Extract _fbp (Meta browser identifier) from document cookies
 */
export function getFbpCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(^|;\s*)_fbp=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Extract _fbc (Meta click identifier) from document cookies or current URL ?fbclid=
 */
export function getFbcCookie(): string | null {
  if (typeof document === 'undefined') return null;
  // 1. Check existing cookie
  const match = document.cookie.match(/(^|;\s*)_fbc=([^;]+)/);
  if (match) return decodeURIComponent(match[2]);

  // 2. Check URL query params for fbclid
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fbclid = params.get('fbclid');
      if (fbclid) {
        // Standard Meta format: fb.1.{creation_time_ms}.{fbclid}
        return `fb.1.${Date.now()}.${fbclid}`;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Generates a deterministic, shared Event ID for Meta Pixel & CAPI Deduplication
 * Example output: 'purchase_TH-84920'
 */
export function generatePurchaseEventId(orderIdOrCode: string): string {
  const clean = String(orderIdOrCode).trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `purchase_${clean}`;
}

/**
 * Check if a Purchase event has already fired for this specific order code
 * Prevents false positives caused by page refresh, back navigation, or direct thank-you URL visits
 */
export function hasPurchaseFired(orderCode: string): boolean {
  if (typeof window === 'undefined' || !orderCode) return false;
  try {
    const raw = localStorage.getItem(FIRED_PURCHASES_STORAGE_KEY);
    if (!raw) return false;
    const firedIds: string[] = JSON.parse(raw);
    return Array.isArray(firedIds) && firedIds.includes(orderCode);
  } catch {
    return false;
  }
}

/**
 * Mark an order as fired in the persistent local deduplication cache
 */
export function markPurchaseFired(orderCode: string): void {
  if (typeof window === 'undefined' || !orderCode) return;
  try {
    const raw = localStorage.getItem(FIRED_PURCHASES_STORAGE_KEY);
    const firedIds: string[] = raw ? JSON.parse(raw) : [];
    if (!firedIds.includes(orderCode)) {
      firedIds.push(orderCode);
      localStorage.setItem(FIRED_PURCHASES_STORAGE_KEY, JSON.stringify(firedIds.slice(-200)));
    }
  } catch {
    // ignore
  }
}

/**
 * Internal logger to track events fired for the in-app Meta Diagnostic Dashboard
 */
function logPixelEvent(record: {
  eventName: string;
  eventId?: string;
  parameters: Record<string, unknown>;
  status: 'fired' | 'dedup_blocked' | 'queued';
  timestamp: number;
}) {
  try {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem(PIXEL_EVENT_LOGS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(record);
    sessionStorage.setItem(PIXEL_EVENT_LOGS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // ignore
  }
}

/**
 * Get recent client-side Pixel event logs for inspection
 */
export function getPixelEventLogs(): Array<{
  eventName: string;
  eventId?: string;
  parameters: Record<string, unknown>;
  status: 'fired' | 'dedup_blocked' | 'queued';
  timestamp: number;
}> {
  try {
    if (typeof window === 'undefined') return [];
    const raw = sessionStorage.getItem(PIXEL_EVENT_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Low-level call to window.fbq with safety checks and optional eventID for Deduplication
 */
export function trackPixelEvent(
  eventName: string,
  parameters?: Record<string, unknown>,
  options?: { eventID?: string; test_event_code?: string }
): void {
  if (typeof window === 'undefined') return;

  // Strict Protection: Purchase is strictly forbidden outside the Thank You page
  if (eventName === 'Purchase') {
    const isThankYouPage = window.location.pathname.includes('thank-you') ||
                           window.location.search.includes('order_id') ||
                           window.location.hash.includes('thank-you');

    if (!isThankYouPage) {
      console.warn(
        '[Meta Pixel Protection Shield] Blocked Purchase outside Thank You page! Purchase is fired strictly once on the Thank You page after a real order is created.'
      );
      return;
    }
  }

  const eventId = options?.eventID;
  const testEventCode = options?.test_event_code || (parameters?.test_event_code as string | undefined);

  if (typeof window.fbq === 'function') {
    try {
      const mergedOptions: Record<string, unknown> = {};
      if (eventId) mergedOptions.eventID = eventId;
      if (testEventCode) mergedOptions.test_event_code = testEventCode;

      if (Object.keys(mergedOptions).length > 0) {
        // Official Meta format: fbq('track', eventName, parameters, { eventID: '...', test_event_code: '...' });
        window.fbq('track', eventName, parameters, mergedOptions as { eventID?: string });
      } else if (parameters) {
        window.fbq('track', eventName, parameters);
      } else {
        window.fbq('track', eventName);
      }

      logPixelEvent({
        eventName,
        eventId,
        parameters: parameters || {},
        status: 'fired',
        timestamp: Date.now(),
      });
      console.log(
        `%c[Meta Pixel] %cTracked "${eventName}"%c with eventID: ${eventId || '(none)'}`,
        'color: #1877f2; font-weight: bold',
        'color: #059669; font-weight: bold',
        'color: #4b5563;'
      );
    } catch (err) {
      console.warn(`[Pixel] Error tracking ${eventName}:`, err);
    }
  } else {
    // Pixel script is still loading in background
    console.log(`[Pixel Event Queued] fbq('track', '${eventName}')`, parameters || '', options || '');
    logPixelEvent({
      eventName,
      eventId,
      parameters: parameters || {},
      status: 'queued',
      timestamp: Date.now(),
    });
  }
}

/**
 * Calculate compliant currency and value for Meta Pixel
 * (Meta fbevents.js whitelist only includes 45 major currencies like USD, EUR, SAR, AED, etc.)
 * For Algerian stores running Meta Ads, USD is the universal standard for Ad Accounts and Pixel reporting.
 */
export function getMetaConversionAmount(dzdAmount: number = 9500): { value: number; currency: string } {
  const metaCurrency = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_META_CURRENCY
    ? (import.meta as any).env.VITE_META_CURRENCY
    : 'USD').toUpperCase();

  if (metaCurrency === 'DZD') {
    return { value: dzdAmount, currency: 'DZD' };
  }
  if (metaCurrency === 'EUR') {
    return { value: Number((dzdAmount / 145).toFixed(2)), currency: 'EUR' };
  }
  return { value: Number((dzdAmount / 135).toFixed(2)), currency: 'USD' };
}

/**
 * AddToCart event (when visitor clicks "اطلب الآن")
 */
export function trackAddToCart(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  event_id?: string;
}): void {
  const eventId = params?.event_id || `atc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const rawValue = params?.value || 9500;
  const { value: metaValue, currency: metaCurrency } = getMetaConversionAmount(rawValue);

  const defaultParams = {
    content_name: params?.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    content_ids: ['theoria_eye_massager_pro'],
    value: metaValue,
    currency: metaCurrency,
    original_value: rawValue,
    original_currency: 'DZD',
    num_items: 1,
  };

  trackPixelEvent('AddToCart', defaultParams, { eventID: eventId });
}

/**
 * InitiateCheckout event (when visitor views the order form)
 */
export function trackInitiateCheckout(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  event_id?: string;
}): void {
  const eventId = params?.event_id || `ic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const rawValue = params?.value || 9500;
  const { value: metaValue, currency: metaCurrency } = getMetaConversionAmount(rawValue);

  const defaultParams = {
    content_name: params?.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    content_ids: ['theoria_eye_massager_pro'],
    value: metaValue,
    currency: metaCurrency,
    original_value: rawValue,
    original_currency: 'DZD',
    num_items: params?.num_items || 1,
  };

  trackPixelEvent('InitiateCheckout', defaultParams, { eventID: eventId });
}

/**
 * Purchase event - STRICTLY PROTECTED WITH DEDUPLICATION & RELOAD GUARD
 * Fired only once per genuine order creation.
 * Shares the identical eventID with Server Conversions API (CAPI).
 */
export function trackPurchase(params: {
  value: number;
  currency?: string;
  content_name?: string;
  order_id: string;
  event_id?: string;
  test_event_code?: string;
}): boolean {
  const orderCode = params.order_id;
  if (!orderCode) {
    console.warn('[Pixel Purchase Blocked] Missing order_id. Direct visits without order_id will not fire.');
    return false;
  }

  // Strict check: Block if attempting to fire outside Thank You page
  if (typeof window !== 'undefined') {
    const isThankYou = window.location.pathname.includes('/thank-you') ||
                       window.location.search.includes('order_id=') ||
                       window.location.hash.includes('thank-you');
    if (!isThankYou) {
      console.warn('[Meta Pixel Shield] Purchase event strictly blocked! Purchase fires ONLY on thank you page after order submission.');
      return false;
    }
  }

  // 1. DEDUPLICATION CHECK: Check if this order_id has already been fired in this browser
  if (hasPurchaseFired(orderCode)) {
    console.warn(
      `%c[Meta Pixel Deduplication Guard] %cPurchase for order "${orderCode}" already fired! %cSuppressed to prevent duplicate counting on page refresh or direct URL access.`,
      'color: #f59e0b; font-weight: bold',
      'color: #ef4444; font-weight: bold',
      'color: #6b7280'
    );
    logPixelEvent({
      eventName: 'Purchase',
      eventId: params.event_id || generatePurchaseEventId(orderCode),
      parameters: { order_id: orderCode, note: 'Duplicate suppressed on reload' },
      status: 'dedup_blocked',
      timestamp: Date.now(),
    });
    return false;
  }

  // 2. Generate canonical eventID shared with Server CAPI
  const canonicalEventId = params.event_id || generatePurchaseEventId(orderCode);
  const rawPrice = Number(params.value) || 9500;
  const { value: metaValue, currency: metaCurrency } = getMetaConversionAmount(rawPrice);

  const testEventCode = params.test_event_code ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('test_event_code') ||
        sessionStorage.getItem('meta_test_event_code') ||
        'TEST45919'
      : 'TEST45919');

  const payload: Record<string, unknown> = {
    value: metaValue,
    currency: metaCurrency,
    content_name: params.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    content_ids: ['theoria_eye_massager_pro'],
    num_items: 1,
    order_id: orderCode,
    original_value: rawPrice,
    original_currency: 'DZD',
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  // Attach client context matching parameters
  const fbp = getFbpCookie();
  const fbc = getFbcCookie();
  if (fbp) payload._fbp = fbp;
  if (fbc) payload._fbc = fbc;

  // 3. Fire to browser Pixel with identical eventID and test_event_code
  trackPixelEvent('Purchase', payload, {
    eventID: canonicalEventId,
    test_event_code: testEventCode,
  });

  // 4. Mark this order as fired permanently in cache
  markPurchaseFired(orderCode);
  return true;
}

/**
 * Standard PageView tracking helper with Deduplication and test_event_code support
 */
export function trackPageView(options?: { eventID?: string; test_event_code?: string; force?: boolean }): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;

  // Avoid firing duplicate PageView on the very initial page load if index.html already fired it
  if ((window as any).__theoria_initial_pv_fired && !options?.force && !options?.eventID) {
    (window as any).__theoria_initial_pv_fired = false;
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const testCode =
      options?.test_event_code ||
      urlParams.get('test_event_code') ||
      urlParams.get('testEventCode') ||
      sessionStorage.getItem('meta_test_event_code') ||
      undefined;

    const opt: Record<string, string> = {};
    if (options?.eventID) opt.eventID = options.eventID;
    if (testCode) opt.test_event_code = testCode;

    if (Object.keys(opt).length > 0) {
      window.fbq('track', 'PageView', {}, opt);
    } else {
      window.fbq('track', 'PageView');
    }

    logPixelEvent({
      eventName: 'PageView',
      eventId: options?.eventID,
      parameters: opt,
      status: 'fired',
      timestamp: Date.now(),
    });

    console.log(
      '%c[Meta Pixel] %cTracked "PageView" (Standard Event)' +
        (options?.eventID ? ` [EventID: ${options.eventID}]` : '') +
        (testCode ? ` [TestCode: ${testCode}]` : ''),
      'color: #1877f2; font-weight: bold',
      'color: #059669; font-weight: bold'
    );
  } catch {
    // ignore
  }
}

/**
 * Custom tracking helper - strictly routes standard events like PageView to fbq('track', ...)
 */
export function trackPixelCustom(eventName: string, parameters?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      const standardEvents = ['PageView', 'Purchase', 'AddToCart', 'InitiateCheckout', 'ViewContent', 'Lead', 'Contact'];
      if (standardEvents.includes(eventName)) {
        window.fbq('track', eventName, parameters);
      } else {
        window.fbq('trackCustom', eventName, parameters);
      }
    } catch {
      // ignore
    }
  }
}
