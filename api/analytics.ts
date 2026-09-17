// Vercel Serverless Function for Funnel Analytics
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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
// Mirrors server.ts processMetaCapiStandardEvent. Fire-and-forget: never blocks the response.
// Serverless instances are stateless, so this is best-effort on top of Meta event_id dedup.
type CapiStandardName = 'ViewContent' | 'AddToCart' | 'InitiateCheckout';

declare global {
  var __THEORIA_CAPI_SENT__: Set<string> | undefined;
}

function capiHash(val: string): string {
  if (!val) return '';
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

async function sendCapiStandardEvent(params: {
  eventName: CapiStandardName;
  eventId: string;
  value?: number;
  currency?: string;
  contentName?: string;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  ip?: string;
  referer?: string;
  testEventCode?: string;
}): Promise<void> {
  if (!global.__THEORIA_CAPI_SENT__) global.__THEORIA_CAPI_SENT__ = new Set<string>();
  const key = `${params.eventName}|${params.eventId}`;
  if (global.__THEORIA_CAPI_SENT__.has(key)) return;
  global.__THEORIA_CAPI_SENT__.add(key);
  if (global.__THEORIA_CAPI_SENT__.size > 500) {
    const first = global.__THEORIA_CAPI_SENT__.values().next().value;
    if (first) global.__THEORIA_CAPI_SENT__.delete(first);
  }

  const accessToken =
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN || '';
  if (!accessToken) return; // silent skip when token is not configured
  const pixelId = process.env.META_PIXEL_ID || '28477410788542282';

  const userData: Record<string, unknown> = { country: [capiHash('dz')] };
  if (params.fbp) userData.fbp = params.fbp;
  if (params.fbc) userData.fbc = params.fbc;
  if (params.ip) userData.client_ip_address = params.ip;
  if (params.userAgent) userData.client_user_agent = params.userAgent;

  const metaCurrency = (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'USD').toUpperCase();
  const rawValue = Number(params.value) || 9500;
  const value =
    metaCurrency === 'DZD' ? rawValue : Number((rawValue / (metaCurrency === 'EUR' ? 145 : 135)).toFixed(2));
  const currency = metaCurrency === 'DZD' || metaCurrency === 'EUR' ? metaCurrency : 'USD';

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: params.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        event_source_url: params.referer || 'https://theoriastore.com/',
        action_source: 'website',
        user_data: userData,
        custom_data: {
          value,
          currency,
          content_name: params.contentName || 'جهاز مساج واسترخاء العينين Theoria',
          content_ids: ['theoria_eye_massager_pro'],
          content_type: 'product',
        },
      },
    ],
  };
  if (params.testEventCode) payload.test_event_code = params.testEventCode;

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    console.log(`[Meta CAPI] ${params.eventName} event_id=${params.eventId} status=${res.status}`, JSON.stringify(data));
  } catch (err: any) {
    console.error(`[Meta CAPI] ${params.eventName} request failed:`, err?.message || err);
  }
}

const FUNNEL_TO_CAPI: Record<string, CapiStandardName> = {
  content_engaged: 'ViewContent',
  add_to_cart: 'AddToCart',
  initiate_checkout: 'InitiateCheckout',
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let stats = loadStatsFromDisk();
  const queryPath = (req.query?.path || '') as string;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  // 1. Reset / Clear Analytics
  if (req.method === 'POST' && (queryPath === 'clear' || body.action === 'clear')) {
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
    // page_view never maps to CAPI. Purchase is handled by api/orders.ts.
    const resolvedCapiName =
      (body.metaEventName as CapiStandardName | undefined) || FUNNEL_TO_CAPI[event as string];
    const capiEventId = body.eventId ? String(body.eventId) : undefined;
    if (resolvedCapiName && capiEventId) {
      const headerVal = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
      const queryTestCode = req.query?.test_event_code;
      // Cookie fallback: if the beacon body lacks fbp/fbc, read them straight
      // from the request cookies; synthesize fbc from fbclid when present.
      const cookieHeader = headerVal(req.headers['cookie']) || '';
      const cookieFbp = cookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/)?.[1];
      let cookieFbc = cookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1];
      const rawFbclid = req.query?.fbclid;
      const fbclidVal =
        (Array.isArray(rawFbclid) ? rawFbclid[0] : rawFbclid) ||
        (body.fbclid ? String(body.fbclid) : undefined);
      if (!cookieFbc && fbclidVal) {
        cookieFbc = `fb.1.${Date.now()}.${fbclidVal}`;
      }
      sendCapiStandardEvent({
        eventName: resolvedCapiName,
        eventId: capiEventId,
        value: Number(body.value ?? body.totalPrice) || 9500,
        currency: body.currency ? String(body.currency) : undefined,
        contentName: body.contentName
          ? String(body.contentName)
          : body.selectedPackage
            ? String(body.selectedPackage)
            : undefined,
        fbp: (body.fbp ? String(body.fbp) : undefined) || cookieFbp,
        fbc: (body.fbc ? String(body.fbc) : undefined) || cookieFbc,
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
          (body.testEventCode ? String(body.testEventCode) : undefined),
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

    if (fieldName) {
      session.lastActiveField = fieldName;
      if (stats.fieldDropOffs[fieldName] !== undefined) {
        stats.fieldDropOffs[fieldName] = (stats.fieldDropOffs[fieldName] || 0) + 1;
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
