// Vercel Serverless Function for Funnel Analytics
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
    for (const f of [FILE_PATH, TMP_FILE_PATH]) {
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
