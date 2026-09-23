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
 * Normalize an Algerian phone to E.164 without plus (213XXXXXXXXX) so the
 * browser advanced-matching hash matches the server CAPI ph hash exactly.
 * Shared contract: strip non-digits, 0XXXXXXXXX -> 213XXXXXXXXX.
 */
export function normalizeAlgerianPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `213${digits.substring(1)}`;
  if (digits.startsWith('213')) return digits;
  return `213${digits}`;
}

/**
 * Extract the 2-digit wilaya code from a "16 - الجزائر العاصمة" style label.
 * Returns '' when unknown — sent as raw custom_data (never hashed user_data).
 */
export function extractWilayaCode(wilaya?: string | null): string {
  if (!wilaya) return '';
  const m = String(wilaya).trim().match(/^(\d{2})\b/);
  return m ? m[1] : '';
}

/**
 * Build Meta contents[] + num_items from real package economics.
 * Single source of truth so browser pixel and server CAPI agree on
 * quantity/value for single (1) / double (2) / triple (3) packs.
 */
export function buildMetaContents(params: {
  contentId?: string | null;
  units?: number | null;
  itemPrice?: number | null;
}): { contents: Array<{ id: string; quantity: number; item_price: number }>; num_items: number } {
  const id = (params.contentId || '').trim() || 'theoria_eye_massager_pro';
  const units = Number(params.units);
  const qty = Number.isFinite(units) && units > 0 ? Math.min(10, Math.floor(units)) : 1;
  const price = Number(params.itemPrice);
  return {
    contents: [{ id, quantity: qty, item_price: Number.isFinite(price) ? price : 0 }],
    num_items: qty,
  };
}

/**
 * Advanced Matching: attach hashed customer keys to all subsequent browser events.
 * fbq hashes plain values automatically — pass raw email/phone/name. Only non-empty
 * fields are sent. Call once the customer has typed their details (order submit)
 * so ViewContent/AddToCart/InitiateCheckout/Purchase all match better server-side.
 * external_id mirrors the server CAPI external_id (the order code) so both sides
 * match on the identical key.
 *
 * Duplicate-init guard: fbevents.js logs "Duplicate Pixel ID" on every repeat
 * `fbq('init', sameId)`. Keys are accumulated across calls (a later call never
 * drops earlier keys), and `init` re-fires ONLY when the merged set gained a
 * new/changed key — submit + thank-you re-hydrates with identical data are
 * no-ops. Note: 1 repeat init per typing session (base page-load init has no
 * user data yet) is inherent to progressive matching and harmless.
 */
const attachedAdvKeys: Record<string, string> = {};
let advInitFired = false;

export function setAdvancedMatching(params: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
}): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    const incoming: Record<string, string> = {};
    const email = (params.email || '').trim().toLowerCase();
    if (email && email.includes('@')) incoming.em = email;
    const normalizedPhone = normalizeAlgerianPhone(params.phone || '');
    if (normalizedPhone) {
      incoming.ph = normalizedPhone;
    }
    const fn = (params.firstName || '').trim().toLowerCase();
    if (fn) incoming.fn = fn;
    const ln = (params.lastName || '').trim().toLowerCase();
    if (ln) incoming.ln = ln;
    const externalId = (params.externalId || '').trim();
    if (externalId) incoming.external_id = externalId;
    if (Object.keys(incoming).length === 0) return;

    // Merge over previously attached keys; detect whether anything is new.
    let hasNewKey = false;
    for (const [k, v] of Object.entries(incoming)) {
      if (attachedAdvKeys[k] !== v) {
        attachedAdvKeys[k] = v;
        hasNewKey = true;
      }
    }
    if (advInitFired && !hasNewKey) {
      console.log('%c[Meta Pixel] Advanced matching unchanged — redundant init suppressed (Duplicate Pixel ID avoided)', 'color: #6b7280;');
      return;
    }
    advInitFired = true;
    window.fbq('init', META_MAIN_PIXEL_ID, { ...attachedAdvKeys });
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
 * Calculate compliant currency and value for Meta Pixel.
 * fbevents.js validates `currency` against a whitelist of major currencies
 * (USD, EUR, SAR, AED, ...) and rejects DZD with
 * "Parameter 'currency' is invalid" — so the default reporting currency is
 * USD (DZD amount ÷ 135). The true charged DZD amount is always preserved in
 * `original_value` / `original_currency` for audit.
 * Override with VITE_META_CURRENCY (DZD/EUR/USD).
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
 * PageView event (landing entry signal for the algorithm + retargeting pools).
 * Fired once per session with a shared eventID so the matching server CAPI
 * PageView deduplicates to a single counted event.
 * Returns the eventID used so the caller can share it with the server (CAPI deduplication).
 */
export function trackPageView(params?: {
  event_id?: string;
}): string {
  const eventId = params?.event_id || `pv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  trackPixelEvent('PageView', undefined, { eventID: eventId });
  return eventId;
}

/**
 * AddToCart event (when visitor clicks "اطلب الآن")
 * Returns the eventID used so the caller can share it with the server (CAPI deduplication).
 * Enriched (no new events): real units/contents, package_id, discount,
 * wilaya_code, traffic/device context — all as custom_data.
 */
export function trackAddToCart(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  event_id?: string;
  content_ids?: string[];
  packageId?: string;
  units?: number;
  discountValue?: number;
  wilayaCode?: string;
  trafficSource?: string;
  deviceType?: string;
  ctaLabel?: string;
}): string {
  const eventId = params?.event_id || `atc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const rawValue = params?.value || 9500;
  const { value: metaValue, currency: metaCurrency } = getMetaConversionAmount(rawValue);

  const contentId = params?.content_ids?.length ? params.content_ids[0] : 'theoria_eye_massager_pro';
  const { contents, num_items } = buildMetaContents({ contentId, units: params?.units, itemPrice: metaValue });

  const defaultParams: Record<string, unknown> = {
    content_name: params?.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    content_category: 'eye_care_device',
    content_ids: params?.content_ids?.length ? params.content_ids : ['theoria_eye_massager_pro'],
    contents,
    value: metaValue,
    currency: metaCurrency,
    original_value: rawValue,
    original_currency: 'DZD',
    num_items,
    shipping_value: 0,
  };
  if (params?.packageId) defaultParams.package_id = params.packageId;
  if (typeof params?.discountValue === 'number') defaultParams.discount_value = params.discountValue;
  if (params?.wilayaCode) defaultParams.wilaya_code = params.wilayaCode;
  if (params?.trafficSource) defaultParams.traffic_source = params.trafficSource;
  if (params?.deviceType) defaultParams.device_type = params.deviceType;
  if (params?.ctaLabel) defaultParams.cta_label = params.ctaLabel;

  trackPixelEvent('AddToCart', defaultParams, { eventID: eventId });
  return eventId;
}

/**
 * InitiateCheckout event (when visitor shows real purchase intent:
 * first field interaction or package selection inside the order form).
 * Mere form views/scrolls must NOT fire this event.
 * Returns the eventID used so the caller can share it with the server (CAPI deduplication).
 * Enriched like AddToCart: real package economics + geo/behavioral context.
 */
export function trackInitiateCheckout(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  event_id?: string;
  content_ids?: string[];
  packageId?: string;
  units?: number;
  discountValue?: number;
  wilayaCode?: string;
  trafficSource?: string;
  deviceType?: string;
}): string {
  const eventId = params?.event_id || `ic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const rawValue = params?.value || 9500;
  const { value: metaValue, currency: metaCurrency } = getMetaConversionAmount(rawValue);

  const contentId = params?.content_ids?.length ? params.content_ids[0] : 'theoria_eye_massager_pro';
  const { contents, num_items } = buildMetaContents({
    contentId,
    units: params?.units ?? params?.num_items,
    itemPrice: metaValue,
  });

  const defaultParams: Record<string, unknown> = {
    content_name: params?.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    content_category: 'eye_care_device',
    content_ids: params?.content_ids?.length ? params.content_ids : ['theoria_eye_massager_pro'],
    contents,
    value: metaValue,
    currency: metaCurrency,
    original_value: rawValue,
    original_currency: 'DZD',
    num_items,
    shipping_value: 0,
  };
  if (params?.packageId) defaultParams.package_id = params.packageId;
  if (typeof params?.discountValue === 'number') defaultParams.discount_value = params.discountValue;
  if (params?.wilayaCode) defaultParams.wilaya_code = params.wilayaCode;
  if (params?.trafficSource) defaultParams.traffic_source = params.trafficSource;
  if (params?.deviceType) defaultParams.device_type = params.deviceType;

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
  content_ids?: string[];
  packageId?: string;
  units?: number;
  discountValue?: number;
  predictedLtv?: number;
  wilayaCode?: string;
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
        undefined
      : undefined);

  const payload: Record<string, unknown> = {
    value: metaValue,
    currency: metaCurrency,
    content_name: params.content_name || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    content_category: 'eye_care_device',
    content_ids: params.content_ids?.length ? params.content_ids : ['theoria_eye_massager_pro'],
    contents: buildMetaContents({
      contentId: params.content_ids?.length ? params.content_ids[0] : undefined,
      units: params.units,
      itemPrice: metaValue,
    }).contents,
    num_items: buildMetaContents({
      contentId: params.content_ids?.length ? params.content_ids[0] : undefined,
      units: params.units,
      itemPrice: metaValue,
    }).num_items,
    order_id: orderCode,
    original_value: rawPrice,
    original_currency: 'DZD',
    shipping_value: 0,
  };
  if (params.packageId) payload.package_id = params.packageId;
  if (typeof params.discountValue === 'number') payload.discount_value = params.discountValue;
  if (typeof params.predictedLtv === 'number') payload.predicted_ltv = params.predictedLtv;
  if (params.wilayaCode) payload.wilaya_code = params.wilayaCode;

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
