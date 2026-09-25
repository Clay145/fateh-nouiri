// Vercel Serverless Function for Funnel Analytics
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';
import { getMetaAccessToken, getMetaCurrency, getMetaPixelId, isMetaPixelFallback } from './_metaConfig.js';
import { handleMetaErrorBody } from './_metaToken.js';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[]>;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (data: any) => VercelResponse;
  send: (body: any) => VercelResponse;
  end: () => VercelResponse;
  setHeader: (name: string, value: string) => VercelResponse;
}

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

declare global {
  var __THEORIA_ANALYTICS__: FunnelStats | undefined;
}

const FILE_PATH = path.join(process.cwd(), 'analytics_data.json');
const DATA_DIR_FILE_PATH = path.join(process.cwd(), 'data', 'analytics_data.json');
const TMP_FILE_PATH = '/tmp/analytics_data.json';

function getInitialStats(): FunnelStats {
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

function loadStatsFromDisk(): FunnelStats {
  try {
    for (const f of [DATA_DIR_FILE_PATH, FILE_PATH, TMP_FILE_PATH]) {
      if (fs.existsSync(f)) {
        const raw = fs.readFileSync(f, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.totalVisitors === 'number') {
          return parsed;
        }
      }
    }
  } catch {
    // fallback
  }
  return global.__THEORIA_ANALYTICS__ || getInitialStats();
}

function saveStatsToDisk(stats: FunnelStats): void {
  global.__THEORIA_ANALYTICS__ = stats;
  for (const f of [TMP_FILE_PATH, FILE_PATH]) {
    try {
      fs.writeFileSync(f, JSON.stringify(stats, null, 2), 'utf-8');
    } catch {
      // ignore readonly filesystems
    }
  }
}

const STEP_WEIGHT: Record<string, number> = {
  page_view: 1,
  content_engaged: 2,
  add_to_cart: 3,
  initiate_checkout: 4,
  form_started: 5,
  validation_failed: 5,
  purchase: 6,
};

// --- Meta Conversions API (server events for standard funnel steps) ---
// Mirrors server.ts processMetaCapiStandardEvent. Awaited with a bounded 10s
// timeout so Vercel can't freeze the function mid-flight (which aborted the
// Meta request). Serverless instances are stateless, so this is best-effort
// on top of Meta event_id dedup.
type CapiStandardName = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'PageView' | 'Lead';

declare global {
  var __THEORIA_CAPI_SENT__: Set<string> | undefined;
  var __THEORIA_CAPI_INFLIGHT__: Set<string> | undefined;
  var __THEORIA_FIELD_TOUCHES__: Set<string> | undefined;
}

function capiHash(val: string): string {
  if (!val) return '';
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

/** Normalize Algerian phone to 213XXXXXXXXX so CAPI ph matches browser adv.matching. */
function normalizeDzPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `213${digits.substring(1)}`;
  if (digits.startsWith('213')) return digits;
  return `213${digits}`;
}

function splitDzName(fullName?: string | null): { firstName: string; lastName: string } {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function extractDzWilayaCode(wilaya?: string | null): string {
  if (!wilaya) return '';
  const m = String(wilaya).trim().match(/^(\d{2})\b/);
  return m ? m[1] : '';
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
 * If a raw fbclid is provided without fbc, it can synthesize a valid fbc.
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
  // a wrong creation timestamp — Meta detects this as a "modified fbclid value" warning.
  // fbc synthesis is handled client-side in pixel.ts getFbcCookie() where the correct
  // click timestamp from the URL is available. If no valid fbc arrived, omit entirely.

  // Meta official requirement: if invalid or missing, omit fbc entirely!
  return undefined;
}

async function sendCapiStandardEvent(params: {
  eventName: CapiStandardName;
  eventId: string;
  value?: number;
  currency?: string;
  contentName?: string;
  contentIds?: string[];
  numItems?: number;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  ip?: string;
  referer?: string;
  testEventCode?: string;
  // Enrichment: identity captured on the form (hashed here, never logged raw).
  customerName?: string;
  phone?: string;
  wilaya?: string;
  commune?: string;
  externalId?: string;
  // Enrichment: real economics + behavioral context (raw custom_data).
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
  if (!global.__THEORIA_CAPI_SENT__) global.__THEORIA_CAPI_SENT__ = new Set<string>();
  if (!global.__THEORIA_CAPI_INFLIGHT__) global.__THEORIA_CAPI_INFLIGHT__ = new Set<string>();
  const key = `${params.eventName}|${params.eventId}`;
  if (global.__THEORIA_CAPI_SENT__.has(key) || global.__THEORIA_CAPI_INFLIGHT__.has(key)) return;
  // In-flight guard only — the SENT claim happens after a definitive outcome
  // (success or 4xx rejection). Aborts/network/5xx release the key so the
  // next beacon retries with the same event_id (Meta dedupes by event_id,
  // so a retry can never double-count).
  global.__THEORIA_CAPI_INFLIGHT__.add(key);
  if (global.__THEORIA_CAPI_SENT__.size > 500) {
    const first = global.__THEORIA_CAPI_SENT__.values().next().value;
    if (first) global.__THEORIA_CAPI_SENT__.delete(first);
  }

  const accessToken = getMetaAccessToken();
  if (!accessToken) {
    console.warn(`[Meta CAPI] No token configured, skipping ${params.eventName} event_id=${params.eventId} test_event_code=${params.testEventCode || 'none'}. Set META_CONVERSIONS_API_ACCESS_TOKEN in Vercel env.`);
    return;
  }
  const pixelId = getMetaPixelId();
  if (isMetaPixelFallback()) {
    console.warn(`[Meta CAPI] META_PIXEL_ID env missing, using fallback ${pixelId} for ${params.eventName} ${params.eventId}. Set META_PIXEL_ID in Vercel env to silence this.`);
  }

  const userData: Record<string, unknown> = { country: [capiHash('dz')] };
  // Identity enrichment: only hashed values leave this function. Missing
  // values are omitted (Meta rule) — upper-funnel events before any typing
  // still send the anonymous baseline below.
  const normalizedPhone = normalizeDzPhone(params.phone);
  if (normalizedPhone) userData.ph = [capiHash(normalizedPhone)];
  const { firstName, lastName } = splitDzName(params.customerName);
  if (firstName) userData.fn = [capiHash(firstName)];
  if (lastName) userData.ln = [capiHash(lastName)];
  if (params.wilaya) userData.st = [capiHash(params.wilaya)];
  if (params.commune) userData.ct = [capiHash(params.commune)];
  if (params.externalId) userData.external_id = [capiHash(params.externalId)];
  if (params.fbp) userData.fbp = params.fbp;
  const validatedFbc = sanitizeAndValidateFbc(params.fbc);
  if (validatedFbc) userData.fbc = validatedFbc;
  if (params.ip) userData.client_ip_address = params.ip;
  if (params.userAgent) userData.client_user_agent = params.userAgent;

  // Reporting currency defaults to USD: fbevents.js rejects DZD
  // ("Parameter 'currency' is invalid"), so browser + CAPI must agree on USD.
  const metaCurrency = getMetaCurrency();
  const rawValue = Number(params.value) || 9500;
  const value =
    metaCurrency === 'DZD' ? rawValue : Number((rawValue / (metaCurrency === 'EUR' ? 145 : 135)).toFixed(2));
  const currency = metaCurrency === 'DZD' || metaCurrency === 'EUR' ? metaCurrency : 'USD';

  const resolvedContentIds = params.contentIds?.length ? params.contentIds : ['theoria_eye_massager_pro'];
  const qtyRaw = Number(params.units ?? params.numItems);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.min(10, Math.floor(qtyRaw)) : 1;
  const wilayaCode = params.wilayaCode || extractDzWilayaCode(params.wilaya);
  const customData: Record<string, unknown> = {
    value,
    currency,
    content_name: params.contentName || 'جهاز مساج واسترخاء العينين Theoria',
    content_ids: resolvedContentIds,
    content_type: 'product',
    content_category: 'eye_care_device',
    num_items: qty,
    contents: [{ id: resolvedContentIds[0], quantity: qty, item_price: value }],
    shipping_value: 0,
  };
  if (params.packageId) customData.package_id = params.packageId;
  if (typeof params.discountValue === 'number') customData.discount_value = params.discountValue;
  if (wilayaCode) customData.wilaya_code = wilayaCode;
  if (params.ctaLabel) customData.cta_label = params.ctaLabel;
  if (params.fieldCompleted) customData.field_completed = params.fieldCompleted;
  if (params.trafficSource) customData.traffic_source = params.trafficSource;
  if (params.deviceType) customData.device_type = params.deviceType;
  if (typeof params.dwellS === 'number') customData.dwell_s = params.dwellS;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: params.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        event_source_url: params.referer || 'https://theoriastore.com/',
        action_source: 'website',
        user_data: userData,
        custom_data: customData,
      },
    ],
  };
  if (params.testEventCode) payload.test_event_code = params.testEventCode;

  const controller = new AbortController();
  // 10s: Meta Graph API routinely exceeds 5s from serverless regions; the old
  // 5s timer manufactured AbortErrors (and the event was then wrongly marked
  // sent, so it was lost forever).
  const timeout = setTimeout(() => controller.abort(), 10000);

  const releaseInflight = () => {
    global.__THEORIA_CAPI_INFLIGHT__?.delete(key);
    if (global.__THEORIA_CAPI_INFLIGHT__ && global.__THEORIA_CAPI_INFLIGHT__.size > 500) {
      const first = global.__THEORIA_CAPI_INFLIGHT__.values().next().value;
      if (first) global.__THEORIA_CAPI_INFLIGHT__.delete(first);
    }
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    console.log(`[Meta CAPI] ${params.eventName} ${params.eventId} -> ${res.status}`, JSON.stringify(data));
    if (!res.ok) {
      console.error('[Meta CAPI] FB Error Body:', data);
      // Shared disposition: 100/33 + 190 + other 4xx are definitive
      // (claim SENT, never retry); 429/5xx release for next-beacon retry
      // with the same event_id. Actionable throttled log fires inside.
      const disposition = handleMetaErrorBody(data, `${params.eventName} ${params.eventId}`, pixelId, res.status);
      if (disposition === 'definitive') {
        global.__THEORIA_CAPI_SENT__?.add(key);
      }
      releaseInflight();
      return;
    }
    global.__THEORIA_CAPI_SENT__?.add(key);
    releaseInflight();
  } catch (err: any) {
    // Abort (Meta slower than timeout, or instance frozen mid-flight):
    // release the key so the next beacon retries with the same event_id.
    // Downgraded to warn — this is recoverable, not a bug.
    releaseInflight();
    if (err?.name === 'AbortError') {
      console.warn(`[Meta CAPI] ${params.eventName} ${params.eventId} timed out, will retry on next beacon.`);
      return;
    }
    console.error(`[Meta CAPI] ${params.eventName} request failed:`, err?.message, 'cause:', err?.cause, 'stack:', err?.stack);
  } finally {
    clearTimeout(timeout);
  }
}

const FUNNEL_TO_CAPI: Record<string, CapiStandardName> = {
  content_engaged: 'ViewContent',
  add_to_cart: 'AddToCart',
  initiate_checkout: 'InitiateCheckout',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, 'GET,OPTIONS,POST')) return res;

  let stats = loadStatsFromDisk();
  const queryPath = (req.query?.path || '') as string;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  // 1. Reset / Clear Analytics (admin only — destructive)
  if (req.method === 'POST' && (queryPath === 'clear' || body.action === 'clear')) {
    const adminToken = extractBearerToken(req.headers, req.query);
    if (!adminToken || !verifyAdminToken(adminToken)) {
      return res.status(401).json({ success: false, error: 'Unauthorized: admin login required.' });
    }
    stats = getInitialStats();
    saveStatsToDisk(stats);
    return res.status(200).json({ success: true, stats });
  }

  // 2. Synchronize Analytics from client cache
  if (req.method === 'POST' && (queryPath === 'sync' || body.action === 'sync' || body.stats)) {
    const incoming = body.stats as FunnelStats | undefined;
    if (incoming && typeof incoming.totalVisitors === 'number') {
      stats.totalVisitors = Math.max(stats.totalVisitors || 0, incoming.totalVisitors || 0);
      stats.contentEngaged = Math.max(stats.contentEngaged || 0, incoming.contentEngaged || 0);
      stats.clickedAddToCart = Math.max(stats.clickedAddToCart || 0, incoming.clickedAddToCart || 0);
      stats.reachedCheckoutForm = Math.max(stats.reachedCheckoutForm || 0, incoming.reachedCheckoutForm || 0);
      stats.startedFillingForm = Math.max(stats.startedFillingForm || 0, incoming.startedFillingForm || 0);
      stats.validationFailed = Math.max(stats.validationFailed || 0, incoming.validationFailed || 0);
      stats.completedPurchases = Math.max(stats.completedPurchases || 0, incoming.completedPurchases || 0);

      if (incoming.devices) {
        stats.devices.mobile = Math.max(stats.devices.mobile || 0, incoming.devices.mobile || 0);
        stats.devices.desktop = Math.max(stats.devices.desktop || 0, incoming.devices.desktop || 0);
      }
      if (incoming.fieldDropOffs) {
        stats.fieldDropOffs.fullname = Math.max(stats.fieldDropOffs.fullname || 0, incoming.fieldDropOffs.fullname || 0);
        stats.fieldDropOffs.phone = Math.max(stats.fieldDropOffs.phone || 0, incoming.fieldDropOffs.phone || 0);
        stats.fieldDropOffs.wilaya = Math.max(stats.fieldDropOffs.wilaya || 0, incoming.fieldDropOffs.wilaya || 0);
        stats.fieldDropOffs.address = Math.max(stats.fieldDropOffs.address || 0, incoming.fieldDropOffs.address || 0);
      }
      if (incoming.sources) {
        Object.entries(incoming.sources).forEach(([k, v]) => {
          stats.sources[k] = Math.max(stats.sources[k] || 0, v || 0);
        });
      }
      if (Array.isArray(incoming.recentSessions)) {
        const sessionMap = new Map<string, VisitorSession>();
        (stats.recentSessions || []).forEach((s) => sessionMap.set(s.id, s));
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
          }
        });
        stats.recentSessions = Array.from(sessionMap.values())
          .sort((a, b) => (b.lastActiveTime || b.startTime || 0) - (a.lastActiveTime || a.startTime || 0))
          .slice(0, 250);
        stats.totalVisitors = Math.max(stats.totalVisitors, stats.recentSessions.length);
      }
      stats.lastUpdated = Date.now();
      saveStatsToDisk(stats);
    }
    return res.status(200).json({ success: true, stats });
  }

  // 3. Track Event from any device
  if (req.method === 'POST') {
    const { sessionId, event, device, source, fieldName, selectedPackage } = body;

    if (!sessionId || !event) {
      return res.status(400).json({ success: false, error: 'sessionId and event are required' });
    }

    // Server Conversions API for standard funnel steps (same event_id as browser pixel).
    // page_view / form_started never auto-map: PageView/Lead CAPI fire only on
    // explicit metaEventName. Purchase is handled by api/orders.ts.
    const resolvedCapiName =
      (body.metaEventName as CapiStandardName | undefined) || FUNNEL_TO_CAPI[event as string];
    const capiEventId = body.eventId ? String(body.eventId) : undefined;
    if (resolvedCapiName && capiEventId) {
      const headerVal = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
      const queryTestCode = req.query?.test_event_code ?? req.query?.testEventCode;
      // Cookie fallback: read from request cookies and validate fbc/fbclid strictly
      const cookieHeader = headerVal(req.headers['cookie']) || '';
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
      const rawFbclid = req.query?.fbclid;
      const fbclidVal =
        (Array.isArray(rawFbclid) ? rawFbclid[0] : rawFbclid) ||
        (body.fbclid ? String(body.fbclid) : undefined);
      const validatedFbc = sanitizeAndValidateFbc((body.fbc ? String(body.fbc) : undefined) || rawCookieFbc, fbclidVal);
      const dwellRaw = Number(body.dwellS);
      // Awaited (bounded 10s inside): fire-and-forget let Vercel freeze the
      // instance mid-flight, aborting the Meta request with AbortError.
      await sendCapiStandardEvent({
        eventName: resolvedCapiName,
        eventId: capiEventId,
        value: Number(body.value ?? body.totalPrice) || 9500,
        currency: body.currency ? String(body.currency) : undefined,
        contentName: body.contentName
          ? String(body.contentName)
          : body.selectedPackage
            ? String(body.selectedPackage)
            : undefined,
        contentIds: Array.isArray(body.contentIds) ? body.contentIds.map(String) : undefined,
        numItems: body.numItems !== undefined ? Number(body.numItems) : 1,
        customerName: body.customerName ? String(body.customerName) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
        wilaya: body.wilaya ? String(body.wilaya) : undefined,
        commune: body.commune ? String(body.commune) : undefined,
        externalId: body.externalId
          ? String(body.externalId)
          : typeof body.sessionId === 'string'
            ? String(body.sessionId)
            : undefined,
        packageId: body.packageId ? String(body.packageId) : undefined,
        units: body.units !== undefined ? Number(body.units) : undefined,
        discountValue: body.discountValue !== undefined ? Number(body.discountValue) : undefined,
        wilayaCode: body.wilayaCode ? String(body.wilayaCode) : undefined,
        ctaLabel: body.ctaLabel ? String(body.ctaLabel) : undefined,
        fieldCompleted: body.fieldCompleted
          ? String(body.fieldCompleted)
          : body.fieldName
            ? String(body.fieldName)
            : undefined,
        trafficSource: body.trafficSource ? String(body.trafficSource) : undefined,
        deviceType: body.deviceType ? String(body.deviceType) : undefined,
        dwellS: Number.isFinite(dwellRaw) && dwellRaw >= 0 ? Math.min(86400, Math.floor(dwellRaw)) : undefined,
        fbp: (body.fbp ? String(body.fbp) : undefined) || cookieFbp,
        fbc: validatedFbc,
        userAgent: headerVal(req.headers['user-agent']),
        ip:
          headerVal(req.headers['x-forwarded-for'])?.split(',')[0]?.trim() ||
          headerVal(req.headers['x-real-ip']) ||
          undefined,
        // Prefer the real page URL sent by the client so event_source_url is
        // identical to the browser event's URL.
        referer:
          (body.pageUrl ? String(body.pageUrl) : undefined) ||
          headerVal(req.headers['referer']),
        testEventCode:
          (Array.isArray(queryTestCode) ? queryTestCode[0] : queryTestCode) ||
          (body.testEventCode ? String(body.testEventCode) : undefined) ||
          (body.test_event_code ? String(body.test_event_code) : undefined) ||
          headerVal(req.headers['x-meta-test-event-code']) ||
          undefined,
      }).catch((err) => console.error('[Meta CAPI Standard Event Error]', err));
    }

    const now = Date.now();
    stats.lastUpdated = now;

    let session = stats.recentSessions.find((s) => s.id === sessionId);

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
      stats.recentSessions.unshift(session);
      if (stats.recentSessions.length > 250) {
        stats.recentSessions.pop();
      }

      stats.totalVisitors = (stats.totalVisitors || 0) + 1;
      if (session.device === 'هاتف محمول') {
        stats.devices.mobile = (stats.devices.mobile || 0) + 1;
      } else {
        stats.devices.desktop = (stats.devices.desktop || 0) + 1;
      }

      const srcKey = session.source;
      stats.sources[srcKey] = (stats.sources[srcKey] || 0) + 1;
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

    if (newWeight > currWeight) {
      session.furthestStep = event;
      if (event === 'content_engaged') stats.contentEngaged = (stats.contentEngaged || 0) + 1;
      if (event === 'add_to_cart') stats.clickedAddToCart = (stats.clickedAddToCart || 0) + 1;
      if (event === 'initiate_checkout') stats.reachedCheckoutForm = (stats.reachedCheckoutForm || 0) + 1;
      if (event === 'form_started') stats.startedFillingForm = (stats.startedFillingForm || 0) + 1;
      if (event === 'purchase') {
        stats.completedPurchases = (stats.completedPurchases || 0) + 1;
        session.orderCompleted = true;
      }
    }

    if (typeof fieldName === 'string' && fieldName in stats.fieldDropOffs) {
      const fieldKey = fieldName as keyof typeof stats.fieldDropOffs;
      session.lastActiveField = fieldKey;
      // Best-effort first-touch guard (warm instances): count each field once
      // per session. Client gates repeats; this is the backstop for old clients.
      if (!global.__THEORIA_FIELD_TOUCHES__) global.__THEORIA_FIELD_TOUCHES__ = new Set<string>();
      const seenKey = `${sessionId}|${fieldKey}`;
      if (!global.__THEORIA_FIELD_TOUCHES__.has(seenKey)) {
        global.__THEORIA_FIELD_TOUCHES__.add(seenKey);
        if (global.__THEORIA_FIELD_TOUCHES__.size > 5000) {
          const first = global.__THEORIA_FIELD_TOUCHES__.values().next().value;
          if (first) global.__THEORIA_FIELD_TOUCHES__.delete(first);
        }
        stats.fieldDropOffs[fieldKey] = (stats.fieldDropOffs[fieldKey] || 0) + 1;
      }
    }

    if (event === 'validation_failed') {
      session.validationErrorsCount = (session.validationErrorsCount || 0) + 1;
      stats.validationFailed = (stats.validationFailed || 0) + 1;
    }

    saveStatsToDisk(stats);
    return res.status(200).json({ success: true, stats });
  }

  // 4. GET Analytics Stats
  return res.status(200).json({
    success: true,
    stats,
  });
}
