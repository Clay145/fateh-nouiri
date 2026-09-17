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
 * Advanced Matching is disabled in server-only intake mode: there are no browser
 * events to attach keys to. Customer keys (em/ph/fn/ln) travel server-side via
 * the order payload into CAPI user_data instead. Kept as a no-op for call-site
 * compatibility.
 */
export function setAdvancedMatching(_params: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}): void {
  // No-op in server-only intake mode (see docblock above).
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
 * Low-level pixel call — SERVER-ONLY INTAKE MODE.
 * Browser fires are disabled: the server CAPI (api/analytics.ts, api/orders.ts,
 * server.ts) is the single event source. This function only records the call in
 * the local diagnostic log so the in-app dashboard stays truthful. The pixel
 * script itself still loads (init only, sends nothing) to maintain the _fbp
 * cookie the server uses for matching.
 */
export function trackPixelEvent(
  eventName: string,
  parameters?: Record<string, unknown>,
  options?: { eventID?: string; test_event_code?: string }
): void {
  if (typeof window === 'undefined') return;
  const eventId = options?.eventID;
  logPixelEvent({
    eventName,
    eventId,
    parameters: parameters || {},
    status: 'dedup_blocked',
    timestamp: Date.now(),
  });
  console.log(
    `%c[Meta Pixel server-only] %c"${eventName}" browser fire suppressed — server CAPI is the single source%c (ID: ${eventId || '(none)'})`,
    'color: #1877f2; font-weight: bold',
    'color: #6b7280; font-weight: bold',
    'color: #4b5563;'
  );
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
 * Returns the eventID used so the caller can share it with the server (CAPI deduplication).
 */
export function trackAddToCart(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  event_id?: string;
}): string {
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
  return eventId;
}

/**
 * InitiateCheckout event (when visitor views the order form)
 * Returns the eventID used so the caller can share it with the server (CAPI deduplication).
 */
export function trackInitiateCheckout(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  event_id?: string;
}): string {
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
  return eventId;
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
 * Standard PageView tracking is disabled — PageView (browser + CAPI) was removed.
 * Funnel entry is tracked via ViewContent instead.
 */

/**
 * Custom tracking helper — disabled in server-only intake mode (no-op).
 */
export function trackPixelCustom(_eventName: string, _parameters?: Record<string, unknown>): void {
  // No browser events in server-only mode. Server CAPI is the single source.
}
