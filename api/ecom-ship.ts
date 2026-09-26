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

function isValidSnapshot(s: any): boolean {
  return Boolean(
    s &&
    typeof s === 'object' &&
    typeof s.orderCode === 'string' &&
    s.orderCode.trim() &&
    typeof s.customerName === 'string' &&
    s.customerName.trim() &&
    typeof s.phone === 'string' &&
    s.phone.trim()
  );
}

function buildSnapshotOrder(orderId: string, snapshot: any): any {
  return {
    id: typeof snapshot.id === 'string' ? snapshot.id : String(orderId),
    orderCode: String(snapshot.orderCode).trim(),
    customerName: String(snapshot.customerName).trim(),
    phone: String(snapshot.phone).trim(),
    wilaya: typeof snapshot.wilaya === 'string' ? snapshot.wilaya : 'غير محدد',
    commune: typeof snapshot.commune === 'string' ? snapshot.commune : '',
    packageTitle: typeof snapshot.packageTitle === 'string' ? snapshot.packageTitle : 'جهاز مساج Theoria',
    contentId: typeof snapshot.contentId === 'string' ? snapshot.contentId : undefined,
    totalPrice: Number(snapshot.totalPrice) || 0,
    notes: typeof snapshot.notes === 'string' ? snapshot.notes : '',
    deliveryStatus: typeof snapshot.deliveryStatus === 'string' ? snapshot.deliveryStatus : undefined,
    deliveryTracking: typeof snapshot.deliveryTracking === 'string' ? snapshot.deliveryTracking : undefined,
    deliveryMode: typeof snapshot.deliveryMode === 'string' ? snapshot.deliveryMode : undefined,
  };
}

async function shipOne(orderId: string, mode: EcomMode, snapshot?: any) {
  // Hobby budget: the whole response must fit in ~10s. When the dashboard
  // supplies a valid snapshot it is used IMMEDIATELY — no Firestore read on
  // the critical path (a stalled lookup alone can burn 16s). The snapshot
  // carries deliveryStatus/tracking, so idempotency still holds. The
  // Firestore lookup remains only for snapshot-less callers.
  let order = findMemoryOrder(orderId);
  let durable = true;
  if (!order && isValidSnapshot(snapshot)) {
    order = buildSnapshotOrder(orderId, snapshot);
    durable = false;
  }
  if (!order) {
    if (isAdminDbConfigured()) {
      const lookup = await adminGetOrderByCodeStrict(String(orderId));
      if (lookup.status === 'found') {
        order = lookup.order;
        if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
        if (!global.__THEORIA_ORDERS__.some((o) => o.id === order.id || o.orderCode === order.orderCode)) {
          global.__THEORIA_ORDERS__.unshift(order);
        }
      } else if (lookup.status === 'unavailable' || lookup.status === 'unconfigured') {
        if (isValidSnapshot(snapshot)) {
          order = buildSnapshotOrder(orderId, snapshot);
          durable = false;
        } else {
          return { http: 503 as const, body: { success: false, error: 'Store unreachable — أعد المحاولة (انقطاع مؤقت في قاعدة البيانات).', firestore: getFirestoreDiagnostics() } };
        }
      } else {
        return { http: 404 as const, body: { success: false, error: 'Order not found' } };
      }
    } else if (isValidSnapshot(snapshot)) {
      order = buildSnapshotOrder(orderId, snapshot);
      durable = false;
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

  // Mirror onto both stores WITHOUT awaiting: persistence must never sit on
  // the response critical path (an 8s patch cap + slow Ecom leg would exceed
  // the Hobby 10s function budget and produce an empty platform 502).
  // On the snapshot path there may be no durable record yet — the patch is a
  // no-op then, and durable:false tells the dashboard the mirror is pending.
  if (order.id && durable) {
    void adminPatchOrder(String(order.id), patch).catch(() => {});
  }
  Object.assign(order, patch);

  if (!result.ok) {
    return { http: 502 as const, body: { success: false, error: result.error, order, durable } };
  }
  return { http: 200 as const, body: { success: true, order, tracking: result.tracking, mode, durable } };
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

    // Bulk: { orderIds: [...], orderSnapshots?: { [id]: order } }
    const ids = Array.isArray(body.orderIds) ? body.orderIds.map(String).filter(Boolean) : null;
    if (ids) {
      if (ids.length === 0 || ids.length > 50) {
        return res.status(400).json({ success: false, error: 'orderIds must contain 1..50 ids.' });
      }
      const snapshots = (body.orderSnapshots && typeof body.orderSnapshots === 'object' ? body.orderSnapshots : {}) as Record<string, unknown>;
      const results: Array<Record<string, unknown>> = [];
      for (const id of ids) {
        try {
          const r = await shipOne(
            id,
            Array.isArray(body.modes) ? normalizeMode((body.modes as Record<string, unknown>)[id]) : mode,
            snapshots[id]
          );
          results.push({ orderId: id, http: r.http, ...(r.body as Record<string, unknown>) });
        } catch (e) {
          results.push({ orderId: id, http: 500, success: false, error: (e as Error)?.message || String(e) });
        }
      }
      const shipped = results.filter((r) => r.http === 200 && r.success).length;
      return res.status(200).json({ success: true, shipped, total: results.length, results });
    }

    // Single: { orderId, orderSnapshot? }
    const orderId = String(body.orderId || body.id || req.query.id || '').trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required.' });
    }
    const r = await shipOne(orderId, mode, body.orderSnapshot);
    return res.status(r.http).json(r.body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
