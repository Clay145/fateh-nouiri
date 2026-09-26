import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';
import {
  adminGetOrderByCodeStrict,
  adminPatchOrder,
  getFirestoreDiagnostics,
  isAdminDbConfigured,
} from './_firestoreAdmin.js';
import {
  EcomMode,
  getEcomConfig,
  isEcomConfigured,
  shipOrderToEcom,
} from './_ecom.js';

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

declare global {
  var __THEORIA_ORDERS__: any[] | undefined;
}

function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const token = extractBearerToken(req.headers, req.query);
  if (token && verifyAdminToken(token)) return true;
  res.status(401).json({ success: false, error: 'Unauthorized: admin login required.' });
  return false;
}

function normalizeMode(v: unknown): EcomMode {
  const s = String(v || 'domicile').trim().toLowerCase();
  if (s === 'stopdesk' || s === 'stop_desk' || s === 'stop-desk' || s === 'bureau') return 'stopdesk';
  return 'domicile';
}

function findMemoryOrder(key: string): any | null {
  const list = global.__THEORIA_ORDERS__ || [];
  return list.find((o) => o && (o.id === key || o.orderCode === key)) || null;
}

async function shipOne(orderId: string, mode: EcomMode) {
  // Resolve order: memory first (fast path), then durable Firestore.
  let order = findMemoryOrder(orderId);
  if (!order && isAdminDbConfigured()) {
    const lookup = await adminGetOrderByCodeStrict(String(orderId));
    if (lookup.status === 'found') {
      order = lookup.order;
      if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
      if (!global.__THEORIA_ORDERS__.some((o) => o.id === order.id || o.orderCode === order.orderCode)) {
        global.__THEORIA_ORDERS__.unshift(order);
      }
    } else if (lookup.status === 'unavailable' || lookup.status === 'unconfigured') {
      return { http: 503 as const, body: { success: false, error: 'Store unreachable.', firestore: getFirestoreDiagnostics() } };
    } else {
      return { http: 404 as const, body: { success: false, error: 'Order not found' } };
    }
  }
  if (!order) {
    return { http: 404 as const, body: { success: false, error: 'Order not found' } };
  }

  // Idempotency: already shipped with tracking → return existing, no 2nd parcel.
  if (order.deliveryStatus === 'shipped' && order.deliveryTracking) {
    return {
      http: 200 as const,
      body: {
        success: true,
        duplicate: true,
        order,
        tracking: order.deliveryTracking,
        mode: order.deliveryMode || 'domicile',
      },
    };
  }

  const result = await shipOrderToEcom(
    {
      orderCode: order.orderCode,
      customerName: order.customerName,
      phone: order.phone,
      wilaya: order.wilaya,
      commune: order.commune,
      packageTitle: order.packageTitle,
      contentId: order.contentId,
      totalPrice: Number(order.totalPrice) || 0,
      notes: order.notes,
    },
    mode,
    { env: process.env as Record<string, string | undefined> }
  );

  const patch: Record<string, unknown> = {
    deliveryProvider: 'ecom_delivery',
    deliveryMode: mode,
  };
  if (result.ok) {
    patch.deliveryStatus = 'shipped';
    patch.deliveryShippedAt = Date.now();
    if (result.tracking) patch.deliveryTracking = result.tracking;
    patch.deliveryError = null;
  } else {
    patch.deliveryStatus = 'failed';
    patch.deliveryError = result.error;
  }

  // Mirror onto both stores (best-effort durable, authoritative memory here).
  if (order.id) {
    adminPatchOrder(String(order.id), patch).catch(() => {});
  }
  Object.assign(order, patch);

  if (!result.ok) {
    return { http: 502 as const, body: { success: false, error: result.error, order } };
  }
  return { http: 200 as const, body: { success: true, order, tracking: result.tracking, mode } };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, 'GET,OPTIONS,POST', 'Content-Type, Authorization')) {
    return res;
  }

  if (!requireAdmin(req, res)) return res;

  // GET /api/ecom/status — config probe (booleans only, never secrets).
  if (req.method === 'GET') {
    const cfg = getEcomConfig(process.env as Record<string, string | undefined>);
    return res.status(200).json({
      success: true,
      configured: isEcomConfigured(process.env as Record<string, string | undefined>),
      hasToken: Boolean(cfg.token),
      hasKey: Boolean(cfg.key),
      baseUrl: cfg.baseUrl,
      createPath: cfg.createPath,
      firestoreConfigured: isAdminDbConfigured(),
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const mode = normalizeMode(body.mode || body.deliveryMode);

    // Bulk: { orderIds: [...] }
    const ids = Array.isArray(body.orderIds) ? body.orderIds.map(String).filter(Boolean) : null;
    if (ids) {
      if (ids.length === 0 || ids.length > 50) {
        return res.status(400).json({ success: false, error: 'orderIds must contain 1..50 ids.' });
      }
      const results: Array<Record<string, unknown>> = [];
      for (const id of ids) {
        try {
          const r = await shipOne(id, Array.isArray(body.modes) ? normalizeMode((body.modes as Record<string, unknown>)[id]) : mode);
          results.push({ orderId: id, http: r.http, ...(r.body as Record<string, unknown>) });
        } catch (e) {
          results.push({ orderId: id, http: 500, success: false, error: (e as Error)?.message || String(e) });
        }
      }
      const shipped = results.filter((r) => r.http === 200 && r.success).length;
      return res.status(200).json({ success: true, shipped, total: results.length, results });
    }

    // Single: { orderId }
    const orderId = String(body.orderId || body.id || req.query.id || '').trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required.' });
    }
    const r = await shipOne(orderId, mode);
    return res.status(r.http).json(r.body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
