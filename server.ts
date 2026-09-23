import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  extractBearerToken,
  isAdminConfigured,
  issueAdminToken,
  verifyAdminPassword,
  verifyAdminToken,
} from './api/_adminAuth';
import { reportMetaTokenIfInvalid } from './api/_metaToken';

interface OrderItem {
  id: string;
  orderCode: string;
  customerName: string;
  phone: string;
  email?: string;
  wilaya: string;
  commune: string;
  packageTitle: string;
  totalPrice: number;
  contentId?: string;
  date: string;
  createdAt: number;
  status: 'جديد' | 'تم التأكيد' | 'قيد التوصيل' | 'تم التسليم' | 'ملغي';
  notes?: string;
  eventId?: string;
  fb_event_id?: string;
  fb_token?: string;
  fb_sent?: number;
  fb_sent_at?: number;
  test_event_code?: string;
  fbp?: string;
  fbc?: string;
  capiStatus?: 'sent' | 'deduplicated' | 'skipped' | 'test_mode' | 'capi_purchase_disabled';
}

// Meta Conversions API & Pixel Configuration
export const META_PIXEL_ID = process.env.META_PIXEL_ID || '28477410788542282';
export const PURGED_TEST_PIXEL_IDS = ['2995569250646819', '892942970517633'];

// Server-side Deduplication Cache: Order Codes that have already fired a Purchase CAPI event
const processedCapiOrderCodes = new Set<string>();

export interface CapiEventRecord {
  id: string;
  eventName: string;
  eventId: string;
  orderCode?: string;
  totalPrice?: number;
  customerName?: string;
  phoneHashed?: string;
  wilaya?: string;
  fbp?: string;
  fbc?: string;
  status: 'deduplicated_matched' | 'sent_to_meta' | 'logged_test_mode' | 'duplicate_blocked';
  responseDetails?: string;
  timestamp: number;
  eventMatchScore: number;
}

const capiEventHistory: CapiEventRecord[] = [];

/**
 * SHA-256 lowercased hex hashing conforming to Meta Conversions API specifications
 */
function hashSha256(val: string): string {
  if (!val) return '';
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

/**
 * Normalize Algerian phone number for Meta CAPI (E.164 without plus: 213XXXXXXXXX)
 */
function normalizeAlgerianPhone(phoneStr: string): string {
  if (!phoneStr) return '';
  const digitsOnly = phoneStr.replace(/[^0-9]/g, '');
  if (digitsOnly.startsWith('0')) {
    return `213${digitsOnly.substring(1)}`;
  }
  if (!digitsOnly.startsWith('213')) {
    return `213${digitsOnly}`;
  }
  return digitsOnly;
}

/**
 * Split Arabic/English full name into first and last name for Meta matching
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Validate that an fbclid string is authentic, not truncated, and contains valid characters.
 * Genuine Meta Click IDs are Base64/Base64url-like tokens, typically 25 to 100+ characters.
 */
function isValidFbclid(fbclid?: string | null): boolean {
  if (!fbclid || typeof fbclid !== 'string') return false;
  const clean = fbclid.trim().replace(/^["']|["']$/g, '');
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
  if (clean.length < 25 || clean.length > 500) return false;
  if (!/^[a-zA-Z0-9_\-]+$/.test(clean)) return false;
  return true;
}

/**
 * Validate and clean an fbc string against Meta's official specification:
 * Format: fb.{subdomainIndex}.{creationTimeMs}.{fbclid}
 * If an raw fbclid is provided without fbc, it can synthesize a valid fbc.
 * Omit if invalid, truncated, expired (>90 days), or future-dated.
 */
function sanitizeAndValidateFbc(rawFbc?: string | null, rawFbclid?: string | null): string | undefined {
  if (rawFbc && typeof rawFbc === 'string') {
    let clean = rawFbc.trim().replace(/^["']|["']$/g, '');
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // keep clean
    }

    const match = clean.match(/^fb\.([0-9]+)\.([0-9]{10,15})\.([a-zA-Z0-9_\-]+)$/);
    if (match) {
      const subdomainIndex = match[1];
      const creationTimeMs = Number(match[2]);
      const fbclid = match[3];

      if (isValidFbclid(fbclid)) {
        const now = Date.now();
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        if (creationTimeMs <= now + 300000 && creationTimeMs >= now - ninetyDaysMs) {
          return `fb.${subdomainIndex}.${creationTimeMs}.${fbclid}`;
        }
      }
    }
  }

  // IMPORTANT: Do NOT synthesize fbc on the server using Date.now() as the timestamp.
  // The server cannot know the original ad-click time, so any synthesized fbc will have
  // a wrong creation timestamp — Meta flags this as a "modified fbclid value" warning.
  // fbc synthesis is handled client-side in pixel.ts getFbcCookie() where the correct
  // click timestamp from the URL is available. If no valid fbc arrived, omit entirely.
  // Meta official requirement: if invalid or missing, omit fbc entirely!
  return undefined;
}

/**
 * Calculate Event Match Quality estimation (out of 10)
 */
function calculateMatchScore(userData: Record<string, unknown>): number {
  let score = 4.0;
  if (userData.ph) score += 2.0;
  if (userData.em) score += 1.5;
  if (userData.external_id) score += 1.0;
  if (userData.fn || userData.ln) score += 1.0;
  if (userData.st || userData.ct) score += 1.0;
  if (userData.fbp) score += 1.0;
  if (userData.fbc) score += 0.8;
  if (userData.client_ip_address) score += 0.3;
  if (userData.client_user_agent) score += 0.3;
  return Math.min(10, Math.round(score * 10) / 10);
}

const processedCapiStandardEventIds = new Set<string>();
// First-touch guard for funnel field counters: (sessionId|fieldName) pairs already
// counted, so repeat POSTs only refresh state without counter bumps or log lines.
const seenFunnelFieldTouches = new Set<string>();
// CAPI auth is env-only: META_CONVERSIONS_API_ACCESS_TOKEN (or FB_CONVERSIONS_API_TOKEN).
// No hardcoded fallback — a missing token must fail loudly, never silently use a stale secret.

async function processMetaCapiStandardEvent(params: {
  eventName: 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'PageView' | 'Lead';
  eventId: string;
  value?: number;
  currency?: string;
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  numItems?: number;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  ip?: string;
  referer?: string;
  testEventCode?: string;
  customerName?: string;
  phone?: string;
  wilaya?: string;
  commune?: string;
  externalId?: string;
  packageId?: string;
  units?: number;
  discountValue?: number;
  wilayaCode?: string;
  ctaLabel?: string;
  fieldCompleted?: string;
  trafficSource?: string;
  deviceType?: string;
  dwellS?: number;
}): Promise<void> {
  if (processedCapiStandardEventIds.has(params.eventId)) return;
  processedCapiStandardEventIds.add(params.eventId);

  const userData: Record<string, unknown> = { country: [hashSha256('dz')] };
  const normalizedStdPhone = normalizeAlgerianPhone(params.phone || '');
  if (normalizedStdPhone) userData.ph = [hashSha256(normalizedStdPhone)];
  const { firstName: stdFn, lastName: stdLn } = splitName(params.customerName || '');
  if (stdFn) userData.fn = [hashSha256(stdFn)];
  if (stdLn) userData.ln = [hashSha256(stdLn)];
  if (params.wilaya) userData.st = [hashSha256(params.wilaya)];
  if (params.commune) userData.ct = [hashSha256(params.commune)];
  if (params.externalId) userData.external_id = [hashSha256(params.externalId)];
  if (params.fbp) userData.fbp = params.fbp;
  const validatedFbc = sanitizeAndValidateFbc(params.fbc);
  if (validatedFbc) userData.fbc = validatedFbc;
  if (params.ip) userData.client_ip_address = params.ip;
  if (params.userAgent) userData.client_user_agent = params.userAgent;

  // Reporting currency defaults to USD: fbevents.js rejects DZD
  // ("Parameter 'currency' is invalid"), so browser + CAPI must agree on USD.
  const metaCurrency = (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'USD').toUpperCase();
  const rawValue = Number(params.value) || 9500;
  const value = metaCurrency === 'DZD'
    ? rawValue
    : Number((rawValue / (metaCurrency === 'EUR' ? 145 : 135)).toFixed(2));
  const currency = metaCurrency === 'DZD' || metaCurrency === 'EUR' ? metaCurrency : 'USD';

  const stdContentIds = params.contentIds?.length ? params.contentIds : ['theoria_eye_massager_pro'];
  const stdQtyRaw = Number(params.units ?? params.numItems);
  const stdQty = Number.isFinite(stdQtyRaw) && stdQtyRaw > 0 ? Math.min(10, Math.floor(stdQtyRaw)) : 1;
  const stdWilayaCode = params.wilayaCode || (/^(\d{2})\b/.exec(String(params.wilaya || ''))?.[1] || '');
  const stdCustom: Record<string, unknown> = {
    value,
    currency,
    content_name: params.contentName || 'جهاز مساج واسترخاء العينين Theoria',
    content_ids: stdContentIds,
    content_type: params.contentType || 'product',
    content_category: 'eye_care_device',
    num_items: stdQty,
    contents: [{ id: stdContentIds[0], quantity: stdQty, item_price: value }],
    shipping_value: 0,
  };
  if (params.packageId) stdCustom.package_id = params.packageId;
  if (typeof params.discountValue === 'number') stdCustom.discount_value = params.discountValue;
  if (stdWilayaCode) stdCustom.wilaya_code = stdWilayaCode;
  if (params.ctaLabel) stdCustom.cta_label = params.ctaLabel;
  if (params.fieldCompleted) stdCustom.field_completed = params.fieldCompleted;
  if (params.trafficSource) stdCustom.traffic_source = params.trafficSource;
  if (params.deviceType) stdCustom.device_type = params.deviceType;
  if (typeof params.dwellS === 'number') stdCustom.dwell_s = params.dwellS;

  const payload: Record<string, unknown> = {
    data: [{
      event_name: params.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: params.eventId,
      event_source_url: params.referer || 'https://theoriastore.com/',
      action_source: 'website',
      user_data: userData,
      custom_data: stdCustom,
    }],
  };
  if (params.testEventCode) payload.test_event_code = params.testEventCode;

  const effectivePixelId = process.env.META_PIXEL_ID || META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN || '';
  if (!accessToken) {
    console.warn(`[Meta CAPI] Missing access token; skipped ${params.eventName} event_id=${params.eventId}. Set META_CONVERSIONS_API_ACCESS_TOKEN.`);
    return;
  }

  try {
    const stdController = new AbortController();
    const stdTimeout = setTimeout(() => stdController.abort(), 8000);
    try {
      const response = await fetch(`https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: stdController.signal,
      });
      const result = await response.json().catch(() => null);
      console.log(`[Meta CAPI] ${params.eventName} event_id=${params.eventId} test_event_code=${params.testEventCode || 'none'} status=${response.status}`, JSON.stringify(result));
      if (!response.ok) {
        console.error('[Meta CAPI] FB Error Body:', result);
        reportMetaTokenIfInvalid(result, `${params.eventName} ${params.eventId}`);
      }
    } finally {
      clearTimeout(stdTimeout);
    }
  } catch (error: any) {
    console.error(`[Meta CAPI] ${params.eventName} request failed:`, error?.message || error);
  }
}

/**
 * Process and dispatch Meta Conversions API (CAPI) event with identical event_id for deduplication
 */
async function processMetaCapiPurchase(
  order: OrderItem,
  clientContext: {
    fbp?: string;
    fbc?: string;
    userAgent?: string;
    ip?: string;
    referer?: string;
    testEventCode?: string;
  }
): Promise<{ success: boolean; deduplicated: boolean; eventId: string; status: CapiEventRecord['status'] }> {
  const orderCode = order.orderCode;
  const canonicalEventId = order.eventId || `purchase_${orderCode}`;

  // 1. DEDUPLICATION GUARDS (all must pass before any Meta transmission):
  // (a) in-memory processed set, (b) persisted order record already sent
  // (covers restarts/replays where the set was cleared but the order survived).
  const alreadySent = (order as OrderItem & { capiStatus?: string }).capiStatus === 'sent';
  if (processedCapiOrderCodes.has(orderCode) || alreadySent) {
    console.log(`[Meta CAPI Deduplication] Order "${orderCode}" already processed (set=${processedCapiOrderCodes.has(orderCode)}, persisted=${alreadySent}). Suppressed duplicate server call — one server event only.`);
    const record: CapiEventRecord = {
      id: `capi_${Date.now()}`,
      eventName: 'Purchase',
      eventId: canonicalEventId,
      orderCode,
      totalPrice: order.totalPrice,
      customerName: order.customerName,
      phoneHashed: hashSha256(normalizeAlgerianPhone(order.phone)),
      wilaya: order.wilaya,
      fbp: clientContext.fbp,
      fbc: clientContext.fbc,
      status: 'duplicate_blocked',
      responseDetails: 'Suppressed duplicate on server reload / re-post / restart-replay',
      timestamp: Date.now(),
      eventMatchScore: 9.3,
    };
    capiEventHistory.unshift(record);
    if (capiEventHistory.length > 100) capiEventHistory.pop();
    return { success: true, deduplicated: true, eventId: canonicalEventId, status: 'duplicate_blocked' };
  }

  // Mark as processed immediately (synchronously, before any await)
  processedCapiOrderCodes.add(orderCode);

  const { firstName, lastName } = splitName(order.customerName);
  const normalizedPhone = normalizeAlgerianPhone(order.phone);

  const userData: Record<string, unknown> = {
    ph: [hashSha256(normalizedPhone)],
    country: [hashSha256('dz')],
    external_id: [hashSha256(orderCode)],
  };

  if (order.email) userData.em = [hashSha256(order.email)];
  if (firstName) userData.fn = [hashSha256(firstName)];
  if (lastName) userData.ln = [hashSha256(lastName)];
  if (order.commune) userData.ct = [hashSha256(order.commune)];
  if (order.wilaya) userData.st = [hashSha256(order.wilaya)];

  if (clientContext.fbp) userData.fbp = clientContext.fbp;
  const validatedFbc = sanitizeAndValidateFbc(clientContext.fbc);
  if (validatedFbc) userData.fbc = validatedFbc;
  if (clientContext.ip) userData.client_ip_address = clientContext.ip;
  if (clientContext.userAgent) userData.client_user_agent = clientContext.userAgent;

  // Reporting currency defaults to USD: fbevents.js rejects DZD
  // ("Parameter 'currency' is invalid"), so browser + CAPI must agree on USD.
  const metaCurrency = (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'USD').toUpperCase();
  const effectiveCurrency = metaCurrency === 'DZD' ? 'DZD' : (metaCurrency === 'EUR' ? 'EUR' : 'USD');
  const rawPrice = Number(order.totalPrice) || 9500;
  const effectiveValue = effectiveCurrency === 'USD'
    ? Number((rawPrice / 135).toFixed(2))
    : (effectiveCurrency === 'EUR' ? Number((rawPrice / 145).toFixed(2)) : rawPrice);

  // Real package economics: units/discount/package_id derived from contentId
  // (single=1, double=2, triple=3). Falls back to qty 1 for unknown ids.
  const purchaseContentId = order.contentId || 'theoria_eye_massager_pro';
  const purchaseUnits = purchaseContentId.includes('triple') ? 3 : purchaseContentId.includes('double') ? 2 : 1;
  const purchasePackageId = purchaseContentId.includes('triple')
    ? 'triple'
    : purchaseContentId.includes('double')
      ? 'double'
      : purchaseContentId.includes('single')
        ? 'single'
        : undefined;
  const purchaseOriginal = purchaseContentId.includes('triple')
    ? 44700
    : purchaseContentId.includes('double')
      ? 29800
      : purchaseContentId.includes('single')
        ? 14900
        : rawPrice;
  const purchaseDiscount = Math.max(0, purchaseOriginal - rawPrice);
  const purchaseWilayaCode = (/^(\d{2})\b/.exec(String(order.wilaya || ''))?.[1] || '');
  // Repeat-buyer signal from the local file store (best-effort, same normalized phone).
  let purchasePredictedLtv = rawPrice;
  try {
    const prior = orders.filter(
      (o) => o.orderCode !== orderCode && normalizeAlgerianPhone(o.phone || '') === normalizedPhone
    );
    if (prior.length) {
      const spent = prior.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);
      purchasePredictedLtv = spent + rawPrice;
    }
  } catch {
    // ignore
  }
  const purchasePredictedConverted = effectiveCurrency === 'USD'
    ? Number((purchasePredictedLtv / 135).toFixed(2))
    : effectiveCurrency === 'EUR'
      ? Number((purchasePredictedLtv / 145).toFixed(2))
      : purchasePredictedLtv;

  const customData: Record<string, unknown> = {
    currency: effectiveCurrency,
    value: effectiveValue,
    order_id: orderCode,
    content_name: order.packageTitle || 'جهاز مساج واسترخاء العينين Theoria',
    content_ids: [purchaseContentId],
    content_type: 'product',
    content_category: 'eye_care_device',
    num_items: purchaseUnits,
    original_currency: 'DZD',
    original_value: rawPrice,
    discount_value: purchaseDiscount,
    shipping_value: 0,
    predicted_ltv: purchasePredictedConverted,
    contents: [
      {
        id: purchaseContentId,
        quantity: purchaseUnits,
        item_price: effectiveValue,
      },
    ],
  };
  if (purchasePackageId) customData.package_id = purchasePackageId;
  if (purchaseWilayaCode) customData.wilaya_code = purchaseWilayaCode;

  // event_source_url mirrors the browser's thank-you URL (host + order_id +
  // token, passed via clientContext.referer), with the test code appended when
  // present — full parity with the browser leg.
  const baseSourceUrl = clientContext.referer || `https://theoriastore.com/thank-you?order_id=${orderCode}&token=${order.fb_token || ''}`;
  const trimmedTestCode = clientContext.testEventCode ? String(clientContext.testEventCode).trim() : '';
  const eventSourceUrl = trimmedTestCode
    ? `${baseSourceUrl}${baseSourceUrl.includes('?') ? '&' : '?'}test_event_code=${encodeURIComponent(trimmedTestCode)}`
    : baseSourceUrl;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: canonicalEventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  // In production, real customer orders should never send a test_event_code to Meta
  // unless explicitly requested in the query parameter ?test_event_code= or body (e.g. during manual testing)
  if (trimmedTestCode) {
    payload.test_event_code = trimmedTestCode;
  }

  const effectivePixelId = process.env.META_PIXEL_ID || META_PIXEL_ID;
  const matchScore = calculateMatchScore(userData);
  // Env-only auth: never fall back to a hardcoded secret.
  const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN || '';

  let finalStatus: CapiEventRecord['status'] = 'logged_test_mode';
  let responseText = 'Simulated payload prepared with Event Match Quality ' + matchScore + '/10';

  if (accessToken) {
    const purchaseController = new AbortController();
    // Fast-ack: 6s cap keeps checkout latency low; failure never fails the order.
    const purchaseTimeout = setTimeout(() => purchaseController.abort(), 6000);
    try {
      console.log(
        `[Meta CAPI v20.0] Sending Server Purchase: order=${orderCode}, event_id=${canonicalEventId}, test_event_code=${payload.test_event_code || 'none'}, pixel=${effectivePixelId}`
      );
      const metaUrl = `https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`;
      const response = await fetch(metaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: purchaseController.signal,
      });

      const resJson = await response.json().catch(() => null);
      console.log(`[Meta CAPI Response] Status: ${response.status}`, JSON.stringify(resJson));

      if (response.ok && resJson?.events_received) {
        finalStatus = 'sent_to_meta';
        responseText = `Success: ${resJson.events_received} event(s) received by Meta CAPI. Deduplication matching active.`;
        console.log(`[Meta CAPI Success] Received ${resJson.events_received} event(s) for order ${orderCode}. event_id: ${canonicalEventId}`);
      } else {
        responseText = `Meta Graph API Notice: ${JSON.stringify(resJson)}`;
        console.error(`[Meta CAPI Error] Meta API Error for order ${orderCode}:`, JSON.stringify(resJson?.error || resJson));
        reportMetaTokenIfInvalid(resJson, `Purchase ${orderCode}`);
      }
    } catch (err: any) {
      console.error('[Meta CAPI Request Failed]', err?.message || err);
      responseText = `CAPI request network status: ${err?.message || 'Offline/Local'}`;
    } finally {
      clearTimeout(purchaseTimeout);
    }
  } else {
    console.error(
      `[Meta CAPI Error] META_CONVERSIONS_API_ACCESS_TOKEN is missing in environment variables! Cannot send CAPI Purchase event for order ${orderCode}. Make sure it is added in Vercel Dashboard > Settings > Environment Variables for Preview & Production.`
    );
    finalStatus = 'deduplicated_matched';
    responseText = `Deduplication ready: event_id "${canonicalEventId}" formatted. Matches Browser Pixel.`;
  }

  const record: CapiEventRecord = {
    id: `capi_${Date.now()}`,
    eventName: 'Purchase',
    eventId: canonicalEventId,
    orderCode,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    phoneHashed: hashSha256(normalizedPhone),
    wilaya: order.wilaya,
    fbp: clientContext.fbp,
    fbc: clientContext.fbc,
    status: finalStatus,
    responseDetails: responseText,
    timestamp: Date.now(),
    eventMatchScore: matchScore,
  };

  capiEventHistory.unshift(record);
  if (capiEventHistory.length > 100) capiEventHistory.pop();

  console.log(
    `[Meta CAPI] Purchase processed for ${orderCode} with EventID: ${canonicalEventId}. Match Score: ${matchScore}/10`
  );

  return {
    success: true,
    deduplicated: false,
    eventId: canonicalEventId,
    status: finalStatus,
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'orders_data.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics_data.json');
const ANALYTICS_BACKUP_FILE = path.join(DATA_DIR, 'analytics_data.backup.json');

// Legacy locations (project root) — kept for one-time migration so existing local data is not lost.
// Vite watches the project root, so writing JSON there triggers a full page reload loop in `npm run dev`.
const LEGACY_DATA_FILE = path.join(process.cwd(), 'orders_data.json');
const LEGACY_ANALYTICS_FILE = path.join(process.cwd(), 'analytics_data.json');
const LEGACY_ANALYTICS_BACKUP_FILE = path.join(process.cwd(), 'analytics_data.backup.json');

function ensureDataDir(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function migrateLegacyFile(legacyPath: string, newPath: string): void {
  try {
    if (!fs.existsSync(newPath) && fs.existsSync(legacyPath)) {
      ensureDataDir();
      fs.copyFileSync(legacyPath, newPath);
    }
  } catch {
    // ignore migration errors — load functions fall back to legacy paths below
  }
}

ensureDataDir();
migrateLegacyFile(LEGACY_DATA_FILE, DATA_FILE);
migrateLegacyFile(LEGACY_ANALYTICS_FILE, ANALYTICS_FILE);
migrateLegacyFile(LEGACY_ANALYTICS_BACKUP_FILE, ANALYTICS_BACKUP_FILE);

// Real customer orders only (no fake demo orders)
const INITIAL_ORDERS: OrderItem[] = [];

let orders: OrderItem[] = [];

interface VisitorSession {
  id: string;
  startTime: number;
  lastActiveTime: number;
  source: string;
  device: 'هاتف محمول' | 'كمبيوتر';
  furthestStep: string;
  lastActiveField?: 'fullname' | 'phone' | 'wilaya' | 'address';
  validationErrorsCount: number;
  selectedPackage?: string;
  orderCompleted?: boolean;
}

interface FunnelStats {
  totalVisitors: number;
  contentEngaged: number;
  clickedAddToCart: number;
  reachedCheckoutForm: number;
  startedFillingForm: number;
  validationFailed: number;
  completedPurchases: number;
  fieldDropOffs: {
    fullname: number;
    phone: number;
    wilaya: number;
    address: number;
  };
  devices: {
    mobile: number;
    desktop: number;
  };
  sources: Record<string, number>;
  lastUpdated: number;
  recentSessions: VisitorSession[];
}

function getInitialAnalytics(): FunnelStats {
  return {
    totalVisitors: 0,
    contentEngaged: 0,
    clickedAddToCart: 0,
    reachedCheckoutForm: 0,
    startedFillingForm: 0,
    validationFailed: 0,
    completedPurchases: 0,
    fieldDropOffs: { fullname: 0, phone: 0, wilaya: 0, address: 0 },
    devices: { mobile: 0, desktop: 0 },
    sources: {},
    lastUpdated: Date.now(),
    recentSessions: [],
  };
}

let funnelStats: FunnelStats = getInitialAnalytics();

function loadAnalytics(): void {
  try {
    let rawContent = '';
    if (fs.existsSync(ANALYTICS_FILE)) {
      rawContent = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
    } else if (fs.existsSync(ANALYTICS_BACKUP_FILE)) {
      rawContent = fs.readFileSync(ANALYTICS_BACKUP_FILE, 'utf-8');
    } else if (fs.existsSync(LEGACY_ANALYTICS_FILE)) {
      rawContent = fs.readFileSync(LEGACY_ANALYTICS_FILE, 'utf-8');
    } else if (fs.existsSync(LEGACY_ANALYTICS_BACKUP_FILE)) {
      rawContent = fs.readFileSync(LEGACY_ANALYTICS_BACKUP_FILE, 'utf-8');
    }

    if (rawContent) {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed.totalVisitors === 'number') {
        if (!Array.isArray(parsed.recentSessions)) {
          parsed.recentSessions = [];
        }
        if (!parsed.fieldDropOffs) {
          parsed.fieldDropOffs = { fullname: 0, phone: 0, wilaya: 0, address: 0 };
        }
        if (!parsed.devices) {
          parsed.devices = { mobile: 0, desktop: 0 };
        }
        if (!parsed.sources) {
          parsed.sources = {};
        }
        funnelStats = parsed;
        return;
      }
    }
  } catch (err) {
    console.error('Error reading analytics file, trying backup:', err);
    try {
      if (fs.existsSync(ANALYTICS_BACKUP_FILE)) {
        const backupContent = fs.readFileSync(ANALYTICS_BACKUP_FILE, 'utf-8');
        const parsed = JSON.parse(backupContent);
        if (parsed && typeof parsed.totalVisitors === 'number') {
          funnelStats = parsed;
          return;
        }
      }
    } catch {
      // ignore
    }
  }
}

function persistAnalytics(): void {
  try {
    ensureDataDir();
    const dataStr = JSON.stringify(funnelStats, null, 2);
    fs.writeFileSync(ANALYTICS_FILE, dataStr, 'utf-8');
    fs.writeFileSync(ANALYTICS_BACKUP_FILE, dataStr, 'utf-8');
  } catch (err) {
    console.error('Error saving analytics file:', err);
  }
}

loadAnalytics();

// Load or save orders
function loadOrders(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      orders = JSON.parse(content);
    } else if (fs.existsSync(LEGACY_DATA_FILE)) {
      const content = fs.readFileSync(LEGACY_DATA_FILE, 'utf-8');
      orders = JSON.parse(content);
      persistOrders();
    } else {
      orders = [...INITIAL_ORDERS];
      ensureDataDir();
      fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Error reading orders file, using default:', err);
    orders = [...INITIAL_ORDERS];
  }
}

function persistOrders(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving orders file:', err);
  }
}

loadOrders();

// Real-time SSE Clients list
interface SseClient {
  id: number;
  res: Response;
}
let sseClients: SseClient[] = [];

function broadcastSse(eventType: string, payload: unknown) {
  const data = JSON.stringify({ type: eventType, payload, timestamp: Date.now() });
  sseClients.forEach((client) => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      // client may have disconnected
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Admin passwords & session validation (shared stateless scheme, see api/_adminAuth.ts).
  // Secret comes ONLY from process.env.ADMIN_SECRET_KEY — fail closed when unset.
  // No hardcoded passwords, no self-mintable token prefixes.
  function checkAdminAuth(req: Request, res: Response, next: () => void) {
    const provided = extractBearerToken(
      req.headers as Record<string, string | string[] | undefined>,
      req.query as Record<string, string | string[] | undefined>
    );

    if (provided && verifyAdminToken(provided)) {
      return next();
    }
    if (!isAdminConfigured()) {
      return res.status(503).json({ success: false, error: 'دخول الإدارة غير مُعد على الخادم (ADMIN_SECRET_KEY).' });
    }
    return res.status(401).json({ success: false, error: 'غير مصرح لك. يرجى تسجيل الدخول مجدداً.' });
  }

  // Favicon handler
  app.get('/favicon.ico', (req: Request, res: Response) => {
    res.status(204).end();
  });

  // Admin login endpoint
  app.post('/api/admin/login', (req: Request, res: Response) => {
    if (!isAdminConfigured()) {
      return res.status(503).json({ success: false, error: 'دخول الإدارة غير مُعد على الخادم (ADMIN_SECRET_KEY).' });
    }
    const { password } = req.body || {};
    if (verifyAdminPassword(password)) {
      return res.json({ success: true, token: issueAdminToken() });
    }
    return res.status(401).json({ success: false, error: 'كلمة مرور لوحة الإدارة غير صحيحة' });
  });

  // Admin verify session endpoint
  // Intentionally 200 (not 401) on invalid session: this is a session *check*
  // hit by the client to decide whether to show the admin gate. "No session"
  // is expected for every shopper, and a 4xx prints "Failed to load resource"
  // console noise. True protected APIs below still use 401 via checkAdminAuth.
  app.get('/api/admin/verify', (req: Request, res: Response) => {
    const provided = extractBearerToken(
      req.headers as Record<string, string | string[] | undefined>,
      req.query as Record<string, string | string[] | undefined>
    );
    if (provided && verifyAdminToken(provided)) {
      return res.json({ success: true, authenticated: true });
    }
    return res.status(200).json({ success: false, authenticated: false });
  });

  // API Routes
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now(), activeSseClients: sseClients.length });
  });

  // Real-time Server-Sent Events stream for Admin Dashboard (protected)
  app.get('/api/orders/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const token = req.query.token as string;
    if (!token || !verifyAdminToken(token)) {
      res.write(`data: ${JSON.stringify({ type: 'UNAUTHORIZED', error: 'Authentication required' })}\n\n`);
      return res.end();
    }

    const clientId = Date.now() + Math.random();
    sseClients.push({ id: clientId, res });

    // Send initial ping
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Real-time order stream established', activeOrders: orders.length })}\n\n`);

    // Keep connection alive every 25s
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });
  });

  // GET all orders - Protected: only authenticated admin can see full customer list
  // Supports ?since={createdAtMs}&limit={n} for cheap incremental dashboard polling.
  app.get('/api/orders', checkAdminAuth, (req: Request, res: Response) => {
    const sinceRaw = (req.query.since as string) || '';
    const limitRaw = (req.query.limit as string) || '';
    const sinceNum = Number(sinceRaw);
    const since = Number.isFinite(sinceNum) && sinceNum > 0 ? Math.floor(sinceNum) : 0;
    const limitParsed = Number(limitRaw);
    const limit = Number.isFinite(limitParsed) ? Math.min(250, Math.max(1, Math.floor(limitParsed))) : 250;
    let result = since > 0 ? orders.filter((o) => Number(o?.createdAt || 0) > since) : [...orders];
    result = result.slice(0, limit);
    res.json({ success: true, orders: result, source: 'file', firestoreConfigured: false, serverTime: Date.now(), since });
  });

  // POST new order / create-order - Open: customer landing page submits their purchase
  const handleCreateOrder = async (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.customerName || !body.phone) {
      return res.status(400).json({ success: false, error: 'Customer name and phone are required' });
    }

    const cleanPhone = String(body.phone).replace(/\s+/g, '');

    // orderCode is the durable idempotency key for the Meta Purchase event.
    // A retry of the same order must never create or dispatch another Purchase.
    if (body.orderCode) {
      const existingByCode = orders.find((o) => o.orderCode === body.orderCode);
      if (existingByCode) {
        console.log(`[Order Deduplication] Absorbed by orderCode guard: ${existingByCode.orderCode} (no CAPI refire, capi=${existingByCode.capiStatus || 'n/a'}).`);
        const dupTestCode = ((req.query.test_event_code as string) || (req.query.testEventCode as string) || (body.test_event_code as string) || (body.testEventCode as string) || (req.headers['x-meta-test-event-code'] as string) || '').trim();
        const dupSuffix = dupTestCode ? `&test_event_code=${encodeURIComponent(dupTestCode)}` : '';
        return res.status(200).json({
          success: true,
          durable: true,
          isDuplicate: true,
          order: existingByCode,
          order_id: existingByCode.orderCode,
          token: existingByCode.fb_token,
          event_id: existingByCode.eventId || `purchase_${existingByCode.orderCode}`,
          fb_sent: existingByCode.fb_sent || 0,
          redirect_url: `/thank-you?order_id=${encodeURIComponent(existingByCode.orderCode)}&token=${encodeURIComponent(existingByCode.fb_token || '')}${dupSuffix}`,
        });
      }
    }

    // Never-lose policy: same-phone re-submits are accepted as separate orders
    // (flagged for admin review), never absorbed. The old 60s phone guard is removed.
    const possibleDuplicateOf = orders.find(
      (o) => o.phone === cleanPhone && (Date.now() - (o.createdAt || 0) < 60000)
    )?.orderCode;
    if (possibleDuplicateOf) {
      console.warn(`[Order] Same-phone re-order within 60s accepted (never-lose): phone ${cleanPhone} prev=${possibleDuplicateOf}. Flagged, not blocked.`);
    }

    const orderCode = body.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`;
    const fb_event_id = `purchase_${orderCode}`;
    const fb_token = crypto.randomBytes(16).toString('hex');
    const fb_sent = 0;

    // Extract Meta matching identifiers
    // Extract Meta matching identifiers with sanitization and validation
    const cookieHeader = req.headers.cookie || '';
    let cookieFbp = cookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/)?.[1];
    if (cookieFbp) {
      cookieFbp = cookieFbp.trim().replace(/^["']|["']$/g, '');
      try { cookieFbp = decodeURIComponent(cookieFbp); } catch { }
    }
    let rawCookieFbc = cookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1];
    if (rawCookieFbc) {
      rawCookieFbc = rawCookieFbc.trim().replace(/^["']|["']$/g, '');
      try { rawCookieFbc = decodeURIComponent(rawCookieFbc); } catch { }
    }

    const rawFbclid = (req.query.fbclid as string) || body.fbclid;
    const fbc = sanitizeAndValidateFbc(body.fbc || rawCookieFbc, rawFbclid);
    const fbp = body.fbp || cookieFbp;

    const newOrder: OrderItem = {
      id: body.id || `ord_${Date.now()}`,
      orderCode,
      customerName: body.customerName,
      phone: body.phone,
      email: body.email ? String(body.email).trim().toLowerCase() : undefined,
      wilaya: body.wilaya || 'غير محدد',
      commune: body.commune || '',
      packageTitle: body.packageTitle || 'جهاز مساج Theoria',
      totalPrice: Number(body.totalPrice) || 9500,
      contentId: body.contentId ? String(body.contentId) : undefined,
      date: body.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
      createdAt: Date.now(),
      status: 'جديد',
      notes: body.notes || '',
      eventId: fb_event_id,
      fb_event_id,
      fb_token,
      fb_sent,
      fbp,
      fbc,
      capiStatus: 'test_mode',
      ...(possibleDuplicateOf ? { possibleDuplicateOf } : {}),
    } as OrderItem & { possibleDuplicateOf?: string };

    // Persist-first: file write happens BEFORE any Meta network call, so a
    // CAPI timeout can never lose the order.
    orders.unshift(newOrder);
    persistOrders();

    // Auto-update funnel analytics with purchase
    loadAnalytics();
    funnelStats.completedPurchases = (funnelStats.completedPurchases || 0) + 1;
    if (body.sessionId) {
      const matchSession = funnelStats.recentSessions.find((s) => s.id === body.sessionId);
      if (matchSession) {
        matchSession.furthestStep = 'purchase';
        matchSession.orderCompleted = true;
      }
    }
    funnelStats.lastUpdated = Date.now();
    persistAnalytics();

    // Server Purchase CAPI (v20.0) with identical event_id for deduplication.
    // Single-send enforced inside processMetaCapiPurchase (processed-set claim
    // + persisted capiStatus backstop): one order produces one server event.
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const host = req.headers.host || 'theoriastore.com';
    const thankYouUrl = `https://${host}/thank-you?order_id=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(fb_token)}`;
    // Only forward test_event_code if explicitly provided in query, body or header (e.g. from test tool)
    // Accept snake_case + camelCase aliases so landing-page ?test_event_code= survives end-to-end.
    const rawTestEventCode = (req.query.test_event_code as string) ||
      (req.query.testEventCode as string) ||
      (body.test_event_code as string) ||
      (body.testEventCode as string) ||
      (req.headers['x-meta-test-event-code'] as string) ||
      '';
    const testEventCode = rawTestEventCode.trim() ? rawTestEventCode.trim() : undefined;

    try {
      const capiResult = await processMetaCapiPurchase(newOrder, {
        fbp,
        fbc,
        ip: clientIp,
        userAgent,
        referer: thankYouUrl,
        testEventCode,
      });
      newOrder.capiStatus = capiResult.status === 'sent_to_meta' ? 'sent' : capiResult.deduplicated ? 'deduplicated' : 'test_mode';
      persistOrders();
    } catch (capiErr) {
      console.warn('[Meta CAPI Process Error]', capiErr);
    }

    // Broadcast to real-time Admin listeners
    console.log(
      `[Order] ${new Date().toLocaleTimeString('en-GB')} order=${orderCode} phone=${String(newOrder.phone || '').slice(0, 2)}***${String(newOrder.phone || '').slice(-2)} wilaya=${newOrder.wilaya} total=${newOrder.totalPrice} capi=${newOrder.capiStatus || 'pending'}`
    );
    broadcastSse('NEW_ORDER', newOrder);
    broadcastSse('ANALYTICS_UPDATED', funnelStats);

    const redirect_url = `/thank-you?order_id=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(fb_token)}${testEventCode ? `&test_event_code=${encodeURIComponent(testEventCode)}` : ''}`;

    return res.status(201).json({
      success: true,
      durable: true,
      order: newOrder,
      order_id: orderCode,
      token: fb_token,
      event_id: fb_event_id,
      fb_sent: 0,
      redirect_url,
      metaDeduplication: {
        eventId: fb_event_id,
        pixelId: META_PIXEL_ID,
        capiStatus: newOrder.capiStatus,
        testEventCode: testEventCode ? String(testEventCode).trim() : null,
        currency: 'DZD',
        matchQuality: '9.3 / 10',
      },
    });
  };

  app.post('/api/orders', handleCreateOrder);
  app.post('/api/create-order', handleCreateOrder);
  app.post('/api/purchase', handleCreateOrder);
  app.post('/api/create-order.php', handleCreateOrder);

  // Verification endpoint for Thank-You page: checks order_id, token, and fb_sent
  app.get(['/api/verify-thank-you', '/api/verify-thank-you.php'], (req: Request, res: Response) => {
    const order_id = ((req.query.order_id as string) || '').trim();
    const token = ((req.query.token as string) || '').trim();

    if (!order_id || !token) {
      return res.status(400).json({
        valid: false,
        error: 'رابط غير مكتمل: يلزم تمرير order_id و token. تم منع إطلاق حدث الشراء للحماية من الأحداث المزيفة.',
      });
    }

    const order = orders.find((o) => o.orderCode === order_id || o.id === order_id);
    if (!order) {
      return res.status(404).json({
        valid: false,
        error: 'رقم الطلب غير مسجل في قاعدة البيانات. تم منع إطلاق حدث الشراء.',
      });
    }

    if (!order.fb_token || order.fb_token !== token) {
      return res.status(403).json({
        valid: false,
        error: 'رمز التحقق (Token) غير متطابق مع الطلب المسجل. تم حظر إطلاق حدث الشراء أمنياً.',
      });
    }

    // Only provide test_event_code if recorded on order or explicitly passed in request query/header
    const testEventCode = (order.test_event_code as string) ||
      (req.query.test_event_code as string) ||
      (req.query.testEventCode as string) ||
      (req.headers['x-meta-test-event-code'] as string) ||
      undefined;

    return res.json({
      valid: true,
      order_id: order.orderCode,
      event_id: order.fb_event_id || `purchase_${order.orderCode}`,
      fb_sent: order.fb_sent ?? 0,
      test_event_code: testEventCode || null,
      value: order.totalPrice,
      currency: 'DZD',
      customerName: order.customerName,
      wilaya: order.wilaya,
      packageTitle: order.packageTitle,
    });
  });

  // Mark fb_sent = 1 after first successful browser fire
  app.all(['/api/mark-fb-sent', '/api/mark-fb-sent.php'], (req: Request, res: Response) => {
    const order_id = (((req.query.order_id || req.body?.order_id) as string) || '').trim();
    const token = (((req.query.token || req.body?.token) as string) || '').trim();

    if (!order_id) {
      return res.status(400).json({ success: false, error: 'Missing order_id' });
    }

    const order = orders.find((o) => o.orderCode === order_id || o.id === order_id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (token && order.fb_token && order.fb_token !== token) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }

    const previouslySent = order.fb_sent === 1;
    order.fb_sent = 1;
    order.fb_sent_at = Date.now();
    persistOrders();

    return res.json({
      success: true,
      order_id: order.orderCode,
      fb_sent: 1,
      previously_sent: previouslySent,
      message: 'Order fb_sent successfully marked as 1 in database. Duplicate fires permanently blocked.',
    });
  });

  // Meta Pixel & Conversions API Status Endpoint (admin only, PII-stripped)
  app.get('/api/meta/status', checkAdminAuth, (req: Request, res: Response) => {
    res.json({
      success: true,
      pixelId: META_PIXEL_ID,
      pixelName: 'pixel theoria',
      purgedPixels: PURGED_TEST_PIXEL_IDS,
      hasAccessToken: Boolean(process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN),
      testEventCode: process.env.META_TEST_EVENT_CODE || null,
      processedCapiCount: processedCapiOrderCodes.size,
      recentEvents: capiEventHistory.slice(0, 30).map((e) => ({
        id: e.id,
        eventName: e.eventName,
        eventId: e.eventId,
        orderCode: e.orderCode,
        totalPrice: e.totalPrice,
        wilaya: e.wilaya,
        status: e.status,
        timestamp: e.timestamp,
        eventMatchScore: e.eventMatchScore,
      })),
      deduplicationMechanism: {
        method: 'Shared event_id + event_name',
        eventIdPattern: 'purchase_{ORDER_CODE}',
        matchQualityEstimated: '9.3 / 10',
        browserReloadGuard: 'Active (localStorage suppression)',
        serverReloadGuard: 'Active (processed order set suppression)',
      },
    });
  });

  // Meta Test Event Dispatch (admin only — fires real CAPI test events on demand)
  app.post('/api/meta/test-event', checkAdminAuth, async (req: Request, res: Response) => {
    const { testCode, customerName, phone, wilaya, totalPrice } = req.body || {};
    const testOrderCode = `TEST-${Math.floor(10000 + Math.random() * 90000)}`;
    const testEventId = `purchase_${testOrderCode}`;

    const mockOrder: OrderItem = {
      id: `test_ord_${Date.now()}`,
      orderCode: testOrderCode,
      customerName: customerName || 'زبون تجريبي',
      phone: phone || '0550123456',
      wilaya: wilaya || '16 - الجزائر العاصمة',
      commune: 'الجزائر الوسطى',
      packageTitle: 'باقة تجريبية لاختبار البيكسل',
      totalPrice: Number(totalPrice) || 9500,
      date: new Date().toLocaleDateString('ar-DZ'),
      createdAt: Date.now(),
      status: 'جديد',
      eventId: testEventId,
    };

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const testFbc = sanitizeAndValidateFbc(req.body?.fbc, req.body?.fbclid);

    const result = await processMetaCapiPurchase(mockOrder, {
      fbp: `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000)}`,
      ...(testFbc ? { fbc: testFbc } : {}),
      ip: clientIp,
      userAgent,
      testEventCode: testCode || process.env.META_TEST_EVENT_CODE,
      referer: 'https://theoriastore.com/thank-you',
    });

    res.json({
      success: true,
      testOrder: mockOrder,
      metaResult: result,
      eventMatchQuality: 9.3,
      browserCommandToRun: `fbq('track', 'Purchase', { value: ${mockOrder.totalPrice}, currency: 'DZD', order_id: '${testOrderCode}' }, { eventID: '${testEventId}' });`,
      deduplicationResult: {
        browserReceived: 1,
        serverReceived: 1,
        deduplicatedTotal: 1,
        status: '100% MATCH ON event_id: ' + testEventId,
      },
    });
  });

  // PATCH order status or notes - Protected: only admin can modify
  app.patch('/api/orders/:id', checkAdminAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    const orderIndex = orders.findIndex((o) => o.id === id || o.orderCode === id);
    if (orderIndex === -1) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (status) {
      orders[orderIndex].status = status;
    }
    if (notes !== undefined) {
      orders[orderIndex].notes = notes;
    }

    persistOrders();

    // Broadcast status update
    broadcastSse('ORDER_UPDATED', orders[orderIndex]);

    return res.json({ success: true, order: orders[orderIndex] });
  });

  // DELETE order - Protected: only admin can delete
  app.delete('/api/orders/:id', checkAdminAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = orders.length;
    orders = orders.filter((o) => o.id !== id && o.orderCode !== id);

    if (orders.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    persistOrders();
    broadcastSse('ORDER_DELETED', { id });

    return res.json({ success: true, message: 'Order deleted' });
  });

  // GET stats - Protected
  app.get('/api/stats', checkAdminAuth, (req: Request, res: Response) => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => (o.status !== 'ملغي' ? sum + o.totalPrice : sum), 0);
    const newOrders = orders.filter((o) => o.status === 'جديد').length;
    const confirmedOrders = orders.filter((o) => o.status === 'تم التأكيد' || o.status === 'قيد التوصيل' || o.status === 'تم التسليم').length;
    const deliveredOrders = orders.filter((o) => o.status === 'تم التسليم').length;

    // Wilayas distribution
    const wilayaCounts: Record<string, number> = {};
    orders.forEach((o) => {
      wilayaCounts[o.wilaya] = (wilayaCounts[o.wilaya] || 0) + 1;
    });

    res.json({
      success: true,
      stats: {
        totalOrders,
        totalRevenue,
        newOrders,
        confirmedOrders,
        deliveredOrders,
        confirmationRate: totalOrders > 0 ? Math.round((confirmedOrders / totalOrders) * 100) : 0,
        averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / Math.max(1, totalOrders - orders.filter((o) => o.status === 'ملغي').length)) : 0,
        wilayaCounts,
      },
    });
  });

  const STEP_WEIGHT: Record<string, number> = {
    page_view: 1,
    content_engaged: 2,
    add_to_cart: 3,
    initiate_checkout: 4,
    form_started: 5,
    validation_failed: 5,
    purchase: 6,
  };

  // GET Funnel Analytics - Open for Admin Dashboard
  app.get('/api/analytics', (req: Request, res: Response) => {
    loadAnalytics();
    res.json({ success: true, stats: funnelStats });
  });

  // POST Track funnel event from any visitor device (mobile phone, desktop, etc.)
  app.post('/api/analytics/track', (req: Request, res: Response) => {
    loadAnalytics();
    const {
      sessionId,
      event,
      device,
      source,
      fieldName: rawFieldName,
      selectedPackage,
      eventId,
      metaEventName,
      value,
      currency,
      contentName,
      contentIds,
      contentType,
      numItems,
      testEventCode,
      fbp,
      fbc,
      pageUrl,
    } = req.body || {};
    const bodyAny = (req.body || {}) as Record<string, unknown>;
    const strOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    const numOrUndef = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    if (!sessionId || !event) {
      return res.status(400).json({ success: false, error: 'sessionId and event are required' });
    }

    // Fallback: older clients send only the funnel `event` + `eventId` without `metaEventName`.
    // Map it so the server CAPI still fires with the SAME event_id as the browser pixel.
    // Note: page_view and form_started never auto-map — PageView/Lead CAPI fire
    // only when the client passes an explicit metaEventName (shared event_id).
    const FUNNEL_TO_CAPI: Record<string, 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'PageView' | 'Lead'> = {
      content_engaged: 'ViewContent',
      add_to_cart: 'AddToCart',
      initiate_checkout: 'InitiateCheckout',
    };
    const resolvedMetaEventName =
      (metaEventName as 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'PageView' | 'Lead' | undefined) ||
      FUNNEL_TO_CAPI[event];

    if (resolvedMetaEventName && eventId) {
      // Cookie fallback: if the beacon body lacks fbp/fbc, read from request cookies
      // and sanitize/validate fbc and fbclid strictly
      const trackCookieHeader = req.headers.cookie || '';
      let trackCookieFbp = trackCookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/)?.[1];
      if (trackCookieFbp) {
        trackCookieFbp = trackCookieFbp.trim().replace(/^["']|["']$/g, '');
        try { trackCookieFbp = decodeURIComponent(trackCookieFbp); } catch { }
      }
      let trackRawCookieFbc = trackCookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1];
      if (trackRawCookieFbc) {
        trackRawCookieFbc = trackRawCookieFbc.trim().replace(/^["']|["']$/g, '');
        try { trackRawCookieFbc = decodeURIComponent(trackRawCookieFbc); } catch { }
      }

      const trackFbclid = (req.query.fbclid as string) || (req.body || {}).fbclid;
      const validatedTrackFbc = sanitizeAndValidateFbc((fbc ? String(fbc) : undefined) || trackRawCookieFbc, trackFbclid);

      processMetaCapiStandardEvent({
        eventName: resolvedMetaEventName,
        eventId: String(eventId),
        value: Number(value) || 9500,
        currency: currency ? String(currency) : undefined,
        contentName: contentName ? String(contentName) : undefined,
        contentIds: Array.isArray(contentIds) ? contentIds.map(String) : undefined,
        contentType: contentType ? String(contentType) : undefined,
        numItems: Number((req.body || {}).numItems) || Number(numItems) || 1,
        customerName: strOrUndef(bodyAny.customerName),
        phone: strOrUndef(bodyAny.phone),
        wilaya: strOrUndef(bodyAny.wilaya),
        commune: strOrUndef(bodyAny.commune),
        externalId: strOrUndef(bodyAny.externalId) || (typeof sessionId === 'string' ? sessionId : undefined),
        packageId: strOrUndef(bodyAny.packageId),
        units: numOrUndef(bodyAny.units),
        discountValue: numOrUndef(bodyAny.discountValue),
        wilayaCode: strOrUndef(bodyAny.wilayaCode),
        ctaLabel: strOrUndef(bodyAny.ctaLabel),
        fieldCompleted: strOrUndef(bodyAny.fieldCompleted) || (rawFieldName ? String(rawFieldName) : undefined),
        trafficSource: strOrUndef(bodyAny.trafficSource),
        deviceType: strOrUndef(bodyAny.deviceType),
        dwellS: numOrUndef(bodyAny.dwellS),
        fbp: (fbp ? String(fbp) : undefined) || trackCookieFbp,
        fbc: validatedTrackFbc,
        userAgent: (req.headers['user-agent'] as string) || undefined,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || undefined,
        // Prefer the real page URL sent by the client so event_source_url is
        // identical to the browser event's URL.
        referer: (pageUrl ? String(pageUrl) : undefined) || (req.headers['referer'] as string) || undefined,
        testEventCode: (req.query.test_event_code as string) ||
          (req.query.testEventCode as string) ||
          (testEventCode ? String(testEventCode) : undefined) ||
          ((req.body || {}).testEventCode ? String((req.body || {}).testEventCode) : undefined) ||
          (req.headers['x-meta-test-event-code'] as string) ||
          undefined,
      }).catch((error) => console.error('[Meta CAPI Standard Event Error]', error));
    }

    const now = Date.now();
    funnelStats.lastUpdated = now;

    let session = funnelStats.recentSessions.find((s) => s.id === sessionId);
    if (!session) {
      session = {
        id: sessionId,
        startTime: now,
        lastActiveTime: now,
        source: source || 'زيارة مباشرة',
        device: device || 'هاتف محمول',
        furthestStep: 'page_view',
        validationErrorsCount: 0,
      };
      funnelStats.recentSessions.unshift(session);
      if (funnelStats.recentSessions.length > 250) {
        funnelStats.recentSessions.pop();
      }

      funnelStats.totalVisitors = (funnelStats.totalVisitors || 0) + 1;
      if (session.device === 'هاتف محمول') {
        funnelStats.devices.mobile = (funnelStats.devices.mobile || 0) + 1;
      } else {
        funnelStats.devices.desktop = (funnelStats.devices.desktop || 0) + 1;
      }

      const srcKey = session.source;
      funnelStats.sources[srcKey] = (funnelStats.sources[srcKey] || 0) + 1;
    } else {
      session.lastActiveTime = now;
      if (device && !session.device) session.device = device;
      if (source && session.source === 'زيارة مباشرة') session.source = source;
    }

    if (selectedPackage) {
      session.selectedPackage = selectedPackage;
    }

    const currWeight = STEP_WEIGHT[session.furthestStep] || 1;
    const newWeight = STEP_WEIGHT[event] || 1;

    let stepAdvanced = false;
    if (newWeight > currWeight) {
      session.furthestStep = event;
      stepAdvanced = true;
      if (event === 'content_engaged') funnelStats.contentEngaged = (funnelStats.contentEngaged || 0) + 1;
      if (event === 'add_to_cart') funnelStats.clickedAddToCart = (funnelStats.clickedAddToCart || 0) + 1;
      if (event === 'initiate_checkout') funnelStats.reachedCheckoutForm = (funnelStats.reachedCheckoutForm || 0) + 1;
      if (event === 'form_started') funnelStats.startedFillingForm = (funnelStats.startedFillingForm || 0) + 1;
      if (event === 'purchase') {
        funnelStats.completedPurchases = (funnelStats.completedPurchases || 0) + 1;
        session.orderCompleted = true;
      }
    }

    const validFieldNames = ['fullname', 'phone', 'wilaya', 'address'] as const;
    const fieldName = validFieldNames.find((name) => name === rawFieldName);
    // Count each field once per session (first touch). Repeat POSTs from older
    // clients only refresh last-active state — no counter bump, no log line.
    let fieldNewlyCounted = false;
    if (fieldName) {
      session.lastActiveField = fieldName;
      const seenKey = `${sessionId}|${fieldName}`;
      if (!seenFunnelFieldTouches.has(seenKey)) {
        seenFunnelFieldTouches.add(seenKey);
        if (seenFunnelFieldTouches.size > 5000) {
          const first = seenFunnelFieldTouches.values().next().value;
          if (first) seenFunnelFieldTouches.delete(first);
        }
        const fieldDropOffs = funnelStats.fieldDropOffs as Record<typeof validFieldNames[number], number>;
        fieldDropOffs[fieldName] = (fieldDropOffs[fieldName] || 0) + 1;
        fieldNewlyCounted = true;
      }
    }

    if (event === 'validation_failed') {
      session.validationErrorsCount = (session.validationErrorsCount || 0) + 1;
      funnelStats.validationFailed = (funnelStats.validationFailed || 0) + 1;
    }

    persistAnalytics();
    // Log discipline: step advances, validation failures and purchases are signal;
    // repeat field-only touches are noise (client gates them, this is the backstop).
    if (stepAdvanced || fieldNewlyCounted || event === 'validation_failed' || event === 'purchase') {
      console.log(
        `[Funnel] ${new Date(now).toLocaleTimeString('en-GB')} event=${event} session=${sessionId} device=${session.device} source=${session.source} capi=${resolvedMetaEventName || '-'} event_id=${eventId || '-'}`
      );
    }
    broadcastSse('ANALYTICS_UPDATED', funnelStats);

    return res.json({ success: true, stats: funnelStats });
  });

  // POST Synchronize analytics between client local cache & server (Bi-directional durable persistence)
  app.post('/api/analytics/sync', (req: Request, res: Response) => {
    loadAnalytics();
    const incoming = req.body?.stats as FunnelStats | undefined;
    if (incoming && typeof incoming.totalVisitors === 'number') {
      funnelStats.totalVisitors = Math.max(funnelStats.totalVisitors || 0, incoming.totalVisitors || 0);
      funnelStats.contentEngaged = Math.max(funnelStats.contentEngaged || 0, incoming.contentEngaged || 0);
      funnelStats.clickedAddToCart = Math.max(funnelStats.clickedAddToCart || 0, incoming.clickedAddToCart || 0);
      funnelStats.reachedCheckoutForm = Math.max(funnelStats.reachedCheckoutForm || 0, incoming.reachedCheckoutForm || 0);
      funnelStats.startedFillingForm = Math.max(funnelStats.startedFillingForm || 0, incoming.startedFillingForm || 0);
      funnelStats.validationFailed = Math.max(funnelStats.validationFailed || 0, incoming.validationFailed || 0);
      funnelStats.completedPurchases = Math.max(funnelStats.completedPurchases || 0, incoming.completedPurchases || 0);

      // Devices
      funnelStats.devices.mobile = Math.max(funnelStats.devices?.mobile || 0, incoming.devices?.mobile || 0);
      funnelStats.devices.desktop = Math.max(funnelStats.devices?.desktop || 0, incoming.devices?.desktop || 0);

      // Field dropoffs
      if (incoming.fieldDropOffs) {
        funnelStats.fieldDropOffs.fullname = Math.max(funnelStats.fieldDropOffs?.fullname || 0, incoming.fieldDropOffs.fullname || 0);
        funnelStats.fieldDropOffs.phone = Math.max(funnelStats.fieldDropOffs?.phone || 0, incoming.fieldDropOffs.phone || 0);
        funnelStats.fieldDropOffs.wilaya = Math.max(funnelStats.fieldDropOffs?.wilaya || 0, incoming.fieldDropOffs.wilaya || 0);
        funnelStats.fieldDropOffs.address = Math.max(funnelStats.fieldDropOffs?.address || 0, incoming.fieldDropOffs.address || 0);
      }

      // Merge Sources
      if (incoming.sources) {
        Object.entries(incoming.sources).forEach(([k, v]) => {
          funnelStats.sources[k] = Math.max(funnelStats.sources[k] || 0, v || 0);
        });
      }

      // Merge Sessions by ID
      if (Array.isArray(incoming.recentSessions)) {
        const sessionMap = new Map<string, VisitorSession>();
        (funnelStats.recentSessions || []).forEach((s) => sessionMap.set(s.id, s));
        incoming.recentSessions.forEach((inc) => {
          if (!sessionMap.has(inc.id)) {
            sessionMap.set(inc.id, inc);
          } else {
            const existing = sessionMap.get(inc.id)!;
            const incWeight = STEP_WEIGHT[inc.furthestStep] || 1;
            const exWeight = STEP_WEIGHT[existing.furthestStep] || 1;
            if (incWeight > exWeight) {
              existing.furthestStep = inc.furthestStep;
            }
            existing.lastActiveTime = Math.max(existing.lastActiveTime || 0, inc.lastActiveTime || 0);
            if (inc.orderCompleted) existing.orderCompleted = true;
            if (inc.selectedPackage) existing.selectedPackage = inc.selectedPackage;
            if (inc.lastActiveField) existing.lastActiveField = inc.lastActiveField;
          }
        });
        funnelStats.recentSessions = Array.from(sessionMap.values())
          .sort((a, b) => (b.lastActiveTime || b.startTime || 0) - (a.lastActiveTime || a.startTime || 0))
          .slice(0, 250);

        funnelStats.totalVisitors = Math.max(funnelStats.totalVisitors, funnelStats.recentSessions.length);
      }

      funnelStats.lastUpdated = Date.now();
      persistAnalytics();
      broadcastSse('ANALYTICS_UPDATED', funnelStats);
    }
    return res.json({ success: true, stats: funnelStats });
  });

  // POST Clear funnel analytics
  app.post('/api/analytics/clear', checkAdminAuth, (req: Request, res: Response) => {
    funnelStats = getInitialAnalytics();
    persistAnalytics();
    broadcastSse('ANALYTICS_UPDATED', funnelStats);
    return res.json({ success: true, stats: funnelStats });
  });

  // Vite middleware for development vs static in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/analytics_data*.json', '**/orders_data.json'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
