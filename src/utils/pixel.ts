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
 * Validate that an fbclid string is authentic, not truncated, and contains valid characters.
 * Genuine Meta Click IDs are Base64/Base64url-like tokens, typically 25 to 100+ characters.
 */
export function isValidFbclid(fbclid?: string | null): boolean {
  if (!fbclid || typeof fbclid !== 'string') return false;
  const clean = fbclid.trim().replace(/^["']|["']$/g, '');
  // Disallow known placeholders, test values, or common dummy strings
  const blockedPlaceholders = [
    'test',
    'dummy',
    'undefined',
    'null',
    'none',
    'iwar0123456789abcdef',
    '123456',
    'fake',
  ];
  if (blockedPlaceholders.includes(clean.toLowerCase())) return false;
  // Meta click IDs must be at least 25 characters and contain only base64url characters
  if (clean.length < 25 || clean.length > 500) return false;
  if (!/^[a-zA-Z0-9_\-]+$/.test(clean)) return false;
  return true;
}

/**
 * Validate and clean an fbc string against Meta's official specification:
 * Format: fb.{subdomainIndex}.{creationTimeMs}.{fbclid}
 * Omit if invalid, truncated, expired (>90 days), or future-dated.
 */
export function validateAndFormatFbc(rawFbc?: string | null): string | null {
  if (!rawFbc || typeof rawFbc !== 'string') return null;
  let clean = rawFbc.trim().replace(/^["']|["']$/g, '');
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep clean as is if decodeURIComponent fails
  }

  // Strict regex for Meta fbc format: fb.<index>.<creationTimeMs>.<fbclid>
  const match = clean.match(/^fb\.([0-9]+)\.([0-9]{10,15})\.([a-zA-Z0-9_\-]+)$/);
  if (!match) return null;

  const subdomainIndex = match[1];
  const creationTimeMs = Number(match[2]);
  const fbclid = match[3];

  if (!isValidFbclid(fbclid)) return null;

  const now = Date.now();
  // Must not be in the future (with 5 min clock skew tolerance)
  if (creationTimeMs > now + 300000) return null;
  // Must not be older than 90 days (Meta fbc expiration window)
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  if (creationTimeMs < now - ninetyDaysMs) return null;

  return `fb.${subdomainIndex}.${creationTimeMs}.${fbclid}`;
}

const FBC_SESSION_STORAGE_KEY = 'theoria_meta_fbc_cache';

/**
 * Extract and validate _fbc (Meta click identifier) from document cookies or current URL ?fbclid=.
 * Locks the original click creation timestamp for the session and writes a 1st-party cookie.
 * Returns null if missing or invalid (Meta CAPI rule: omit invalid/dummy fbc).
 */
export function getFbcCookie(): string | null {
  if (typeof document === 'undefined') return null;

  // 1. Check existing _fbc cookie
  try {
    const match = document.cookie.match(/(?:^|;\s*)_fbc=([^;]+)/);
    if (match) {
      const parsedCookie = validateAndFormatFbc(match[1]);
      if (parsedCookie) return parsedCookie;
    }
  } catch {
    // ignore
  }

  // 2. Check sessionStorage cache (locks original creation timestamp for the session)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const cached = sessionStorage.getItem(FBC_SESSION_STORAGE_KEY);
      if (cached) {
        const validatedCache = validateAndFormatFbc(cached);
        if (validatedCache) return validatedCache;
      }
    }
  } catch {
    // ignore
  }

  // 3. Check URL query params for raw fbclid
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const rawFbclid = params.get('fbclid');
      if (isValidFbclid(rawFbclid)) {
        const cleanFbclid = rawFbclid!.trim().replace(/^["']|["']$/g, '');
        const creationTime = Date.now();
        const synthesized = `fb.1.${creationTime}.${cleanFbclid}`;

        // Store in sessionStorage to lock timestamp across navigation
        try {
          sessionStorage.setItem(FBC_SESSION_STORAGE_KEY, synthesized);
        } catch {
          // ignore
        }

        // Store in 1st-party cookie (90 days)
        try {
          const expires = new Date(creationTime + 90 * 24 * 60 * 60 * 1000).toUTCString();
          document.cookie = `_fbc=${synthesized}; path=/; expires=${expires}; SameSite=Lax`;
        } catch {
          // ignore
        }

        return synthesized;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Advanced Matching: attach hashed customer keys to all subsequent browser events.
 * fbq hashes plain values automatically — pass raw email/phone/name. Only non-empty
 * fields are sent. Call once the customer has typed their details (order submit)
 * so ViewContent/AddToCart/InitiateCheckout/Purchase all match better server-side.
 * external_id mirrors the server CAPI external_id (the order code) so both sides
 * match on the identical key.
 */
export function setAdvancedMatching(params: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
}): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    const adv: Record<string, string> = {};
    const email = (params.email || '').trim().toLowerCase();
    if (email && email.includes('@')) adv.em = email;
    const digits = (params.phone || '').replace(/[^0-9]/g, '');
    if (digits) {
      adv.ph = digits.startsWith('0') ? `213${digits.substring(1)}` : digits;
    }
    const fn = (params.firstName || '').trim().toLowerCase();
    if (fn) adv.fn = fn;
    const ln = (params.lastName || '').trim().toLowerCase();
    if (ln) adv.ln = ln;
    const externalId = (params.externalId || '').trim();
    if (externalId) adv.external_id = externalId;
    if (Object.keys(adv).length === 0) return;
    window.fbq('init', META_MAIN_PIXEL_ID, adv);
    console.log('%c[Meta Pixel] Advanced matching keys attached (em/ph/fn/ln/external_id as available)', 'color: #1877f2;');
  } catch {
    // ignore
  }
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

// Page-lifetime registry: the same eventName + eventID pair is handed to fbq exactly once.
// Kills same-ID doubles from stub-queue replays, StrictMode double-effects, or retry paths.
const firedBrowserEventKeys = new Set<string>();

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
      if (eventId) {
        const dedupKey = `${eventName}|${eventId}`;
        if (firedBrowserEventKeys.has(dedupKey)) {
          console.warn(
            `[Meta Pixel Deduplication Guard] "${eventName}" with eventID ${eventId} already handed to fbq on this page. Suppressed duplicate transport.`
          );
          logPixelEvent({
            eventName,
            eventId,
            parameters: parameters || {},
            status: 'dedup_blocked',
            timestamp: Date.now(),
          });
          return;
        }
        firedBrowserEventKeys.add(dedupKey);
      }

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

  // 3. Fire to browser Pixel with identical eventID and test_event_code (fbevents.js reads _fbp/_fbc from 1st-party cookies natively)

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
 * Custom tracking helper - strictly routes standard events to fbq('track', ...)
 */
export function trackPixelCustom(eventName: string, parameters?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      const standardEvents = ['Purchase', 'AddToCart', 'InitiateCheckout', 'ViewContent', 'Lead', 'Contact'];
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
