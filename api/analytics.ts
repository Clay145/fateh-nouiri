// Vercel Serverless Function for Funnel Analytics
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

if (!global.__THEORIA_ANALYTICS__) {
  global.__THEORIA_ANALYTICS__ = getInitialStats();
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

  const stats = global.__THEORIA_ANALYTICS__ || getInitialStats();
  const queryPath = (req.query?.path || '') as string;

  // 1. Reset / Clear Analytics
  if (req.method === 'POST' && (queryPath === 'clear' || req.body?.action === 'clear')) {
    global.__THEORIA_ANALYTICS__ = getInitialStats();
    return res.status(200).json({ success: true, stats: global.__THEORIA_ANALYTICS__ });
  }

  // 2. Track Event from any device (phone, laptop, tablet)
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { sessionId, event, device, source, fieldName, selectedPackage } = body;

    if (!sessionId || !event) {
      return res.status(400).json({ success: false, error: 'sessionId and event are required' });
    }

    const now = Date.now();
    stats.lastUpdated = now;

    let session = stats.recentSessions.find((s) => s.id === sessionId);
    let isNewVisitor = false;

    if (!session) {
      isNewVisitor = true;
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
      if (stats.recentSessions.length > 60) {
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

    global.__THEORIA_ANALYTICS__ = stats;
    return res.status(200).json({ success: true, stats });
  }

  // 3. GET Analytics Stats
  return res.status(200).json({
    success: true,
    stats,
  });
}
