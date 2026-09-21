import crypto from 'crypto';
import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';
import { adminDeleteOrder, adminGetOrderByCode, adminListOrders, adminPatchOrder, isAdminDbConfigured } from './_firestoreAdmin.js';

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
  var __THEORIA_CAPI_DISPATCHED__: Set<string> | undefined;
}

// In production, start with clean real orders only (no mock data)
if (!global.__THEORIA_ORDERS__) {
  global.__THEORIA_ORDERS__ = [];
}
// Single-server-event enforcement: orderCodes already dispatched on this
// instance. Claimed synchronously before any await (see POST handler).
if (!global.__THEORIA_CAPI_DISPATCHED__) {
  global.__THEORIA_CAPI_DISPATCHED__ = new Set<string>();
}

const META_PIXEL_ID = '28477410788542282';

function hashSha256(val: string): string {
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
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
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    applyCors(
      req,
      res,
      'GET,OPTIONS,PATCH,DELETE,POST,PUT',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-meta-test-event-code'
    )
  ) {
    return res;
  }

  const requireAdmin = (): boolean => {
    const token = extractBearerToken(req.headers, req.query);
    if (token && verifyAdminToken(token)) return true;
    res.status(401).json({ success: false, error: 'Unauthorized: admin login required.' });
    return false;
  };

  const { id } = req.query;

  // 1. GET ORDERS / STREAM (admin only — contains customer PII)
  if (req.method === 'GET') {
    if (!requireAdmin()) return res;
    if (id === 'stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.send(`data: {"type":"CONNECTED","message":"Live sync active"}\n\n`);
      return res.end();
    }

    if (id) {
      const orderId = Array.isArray(id) ? id[0] : id;
      const order =
        (global.__THEORIA_ORDERS__ || []).find((o) => o.id === orderId || o.orderCode === orderId) ||
        (await adminGetOrderByCode(orderId));
      if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
      return res.status(200).json({ success: true, order });
    }

    // Durable cross-device read: instance memory first, then Firestore.
    const memoryOrders = global.__THEORIA_ORDERS__ || [];
    const dbOrders = await adminListOrders(250);
    const merged = new Map<string, any>();
    [...dbOrders, ...memoryOrders].forEach((o) => {
      if (o && (o.id || o.orderCode)) merged.set(o.id || o.orderCode, o);
    });
    return res.status(200).json({
      success: true,
      orders: Array.from(merged.values()),
      source: dbOrders.length ? 'memory+firestore' : memoryOrders.length ? 'memory' : 'empty',
      firestoreConfigured: isAdminDbConfigured(),
    });
  }

  // 2. POST NEW ORDER (Customer submission)
  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.customerName || !body.phone) {
      return res.status(400).json({ success: false, error: 'Customer name and phone are required' });
    }

    // Sanitize and clean phone
    const cleanPhone = String(body.phone).replace(/\s+/g, '');

    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];

    // An orderCode is the durable idempotency key for the Meta Purchase event.
    // Never create or dispatch a second order when the client retries the same request.
    if (body.orderCode) {
      const existingByCode = global.__THEORIA_ORDERS__.find((o) => o.orderCode === body.orderCode);
      if (existingByCode) {
        console.log(`[Order Deduplication] Absorbed by orderCode guard: ${existingByCode.orderCode} (no CAPI refire, capi=${existingByCode.capiStatus || 'n/a'}).`);
        const dupTestCode = ((req.query.test_event_code as string) || (req.query.testEventCode as string) || (body.test_event_code as string) || (body.testEventCode as string) || (req.headers['x-meta-test-event-code'] as string) || '').trim();
        const dupSuffix = dupTestCode ? `&test_event_code=${encodeURIComponent(dupTestCode)}` : '';
        return res.status(200).json({
          success: true,
          isDuplicate: true,
          order: existingByCode,
          order_id: existingByCode.orderCode,
          token: existingByCode.fb_token,
          event_id: existingByCode.eventId || `purchase_${existingByCode.orderCode}`,
          fb_sent: existingByCode.fb_sent || 0,
          redirect_url: `/thank-you?order_id=${encodeURIComponent(existingByCode.orderCode)}&token=${encodeURIComponent(existingByCode.fb_token)}${dupSuffix}`,
        });
      }
    }

    // Anti-Duplicate Shield: Check if this order or phone was submitted in the last 60 seconds
    const now = Date.now();
    const existingOrder = global.__THEORIA_ORDERS__.find(
      (o) => (o.phone === cleanPhone || (body.orderCode && o.orderCode === body.orderCode)) &&
             (now - (o.createdAt || 0) < 60000)
    );

    if (existingOrder) {
      console.warn(`[Order Deduplication] Absorbed by 60s phone guard: phone ${cleanPhone} (existing: ${existingOrder.orderCode}). Returning existing order without duplicate insertion or CAPI fire.`);
      const dupTestCode2 = ((req.query.test_event_code as string) || (req.query.testEventCode as string) || (body.test_event_code as string) || (body.testEventCode as string) || (req.headers['x-meta-test-event-code'] as string) || '').trim();
      const dupSuffix2 = dupTestCode2 ? `&test_event_code=${encodeURIComponent(dupTestCode2)}` : '';
      return res.status(200).json({
        success: true,
        isDuplicate: true,
        order: existingOrder,
        order_id: existingOrder.orderCode,
        token: existingOrder.fb_token,
        event_id: existingOrder.eventId || `purchase_${existingOrder.orderCode}`,
        fb_sent: existingOrder.fb_sent || 0,
        redirect_url: `/thank-you?order_id=${encodeURIComponent(existingOrder.orderCode)}&token=${encodeURIComponent(existingOrder.fb_token)}${dupSuffix2}`,
      });
    }

    const orderCode = body.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`;
    const eventId = body.eventId || `purchase_${orderCode}`;
    const fb_token = body.fb_token || (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2));
    const fb_sent = 0;

    // Production: never send test_event_code unless explicitly passed (no env fallback)
    // Accept both snake_case and camelCase aliases plus the test header so the
    // landing-page ?test_event_code= survives end-to-end (client sends all three).
    const rawTestCode = (req.query.test_event_code as string) ||
                          (req.query.testEventCode as string) ||
                          (body.test_event_code as string) ||
                          (body.testEventCode as string) ||
                          (req.headers['x-meta-test-event-code'] as string) ||
                          '';
    const testEventCode = rawTestCode.trim() ? rawTestCode.trim() : undefined;
    const testParamSuffix = testEventCode ? `&test_event_code=${encodeURIComponent(testEventCode)}` : '';

    // Cookie fallback for fbp/fbc with strict sanitization and validation:
    const headerFirst = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const orderCookieHeader = headerFirst(req.headers['cookie']) || '';
    let orderCookieFbp = orderCookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/)?.[1];
    if (orderCookieFbp) {
      orderCookieFbp = orderCookieFbp.trim().replace(/^["']|["']$/g, '');
      try { orderCookieFbp = decodeURIComponent(orderCookieFbp); } catch {}
    }
    let rawOrderCookieFbc = orderCookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1];
    if (rawOrderCookieFbc) {
      rawOrderCookieFbc = rawOrderCookieFbc.trim().replace(/^["']|["']$/g, '');
      try { rawOrderCookieFbc = decodeURIComponent(rawOrderCookieFbc); } catch {}
    }

    const rawOrderFbclid = req.query?.fbclid as string | string[] | undefined;
    const orderFbclid =
      (Array.isArray(rawOrderFbclid) ? rawOrderFbclid[0] : rawOrderFbclid) ||
      (body.fbclid ? String(body.fbclid) : undefined);

    const resolvedFbp = (body.fbp ? String(body.fbp) : undefined) || orderCookieFbp;
    const resolvedFbc = sanitizeAndValidateFbc(
      (body.fbc ? String(body.fbc) : undefined) || rawOrderCookieFbc,
      orderFbclid
    );

    const newOrder = {
      id: body.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderCode,
      customerName: String(body.customerName).trim(),
      phone: cleanPhone,
      email: body.email ? String(body.email).trim().toLowerCase() : undefined,
      wilaya: body.wilaya || 'غير محدد',
      commune: String(body.commune || '').trim(),
      packageTitle: body.packageTitle || 'جهاز مساج Theoria',
      totalPrice: Number(body.totalPrice) || 9500,
      contentId: body.contentId ? String(body.contentId) : undefined,
      currency: 'DZD',
      date: body.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
      createdAt: body.createdAt || Date.now(),
      status: 'جديد',
      notes: body.notes || '',
      eventId,
      fb_event_id: eventId,
      fb_token,
      fb_sent,
      ...(resolvedFbp ? { fbp: resolvedFbp } : {}),
      ...(resolvedFbc ? { fbc: resolvedFbc } : {}),
      capiStatus: testEventCode ? 'test_mode' : 'pending',
    };

    // Single-server-event enforcement: claim this orderCode synchronously
    // (before any await) and persist the order BEFORE the CAPI network call,
    // so a concurrent retry lands in the duplicate-by-code guard above
    // instead of firing a second CAPI event with the same event_id.
    if (!global.__THEORIA_CAPI_DISPATCHED__) global.__THEORIA_CAPI_DISPATCHED__ = new Set<string>();
    let capiDuplicate = false;
    if (global.__THEORIA_CAPI_DISPATCHED__.has(orderCode)) {
      capiDuplicate = true;
      newOrder.capiStatus = 'deduplicated';
      console.log(`[Meta CAPI Deduplication] Order "${orderCode}" already dispatched. Suppressed duplicate server call — one server event only.`);
    } else {
      global.__THEORIA_CAPI_DISPATCHED__.add(orderCode);
      if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
      if (!global.__THEORIA_ORDERS__.some((o) => o.orderCode === orderCode)) {
        global.__THEORIA_ORDERS__.unshift(newOrder);
      }
    }

    // Server-side Meta CAPI v20.0 dispatch (env-only auth, no hardcoded fallback)
    const effectivePixelId = process.env.META_PIXEL_ID || META_PIXEL_ID;
    const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN || '';

    if (capiDuplicate) {
      // Already dispatched: order is persisted, nothing to send.
    } else if (!accessToken) {
      console.error(
        `[Meta CAPI Error] META_CONVERSIONS_API_ACCESS_TOKEN is missing or undefined in Vercel environment variables! Cannot send CAPI Purchase event for order ${orderCode}. Make sure it is added in Vercel Dashboard > Settings > Environment Variables for Preview & Production.`
      );
    } else {
      try {
        const userData: Record<string, unknown> = {
          ph: [hashSha256(cleanPhone)],
          country: [hashSha256('dz')],
          external_id: [hashSha256(orderCode)],
        };
        if (body.email) userData.em = [hashSha256(String(body.email))];
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || (req.headers['x-real-ip'] as string) || undefined;
        const clientUa = (req.headers['user-agent'] as string) || undefined;
        if (clientIp) userData.client_ip_address = clientIp;
        if (clientUa) userData.client_user_agent = clientUa;
        const nameParts = String(body.customerName).trim().split(/\s+/);
        if (nameParts[0]) userData.fn = [hashSha256(nameParts[0])];
        if (nameParts.length > 1) userData.ln = [hashSha256(nameParts.slice(1).join(' '))];
        if (body.wilaya) userData.st = [hashSha256(body.wilaya)];
        if (body.commune) userData.ct = [hashSha256(body.commune)];
        if (resolvedFbp) userData.fbp = resolvedFbp;
        if (resolvedFbc) userData.fbc = resolvedFbc;

        // Meta CAPI standard currency conversion: USD is the primary accepted currency for Algerian Ad accounts & fbevents.js
        const metaCurrency = (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'DZD').toUpperCase();
        const effectiveCurrency = metaCurrency === 'DZD' ? 'DZD' : (metaCurrency === 'EUR' ? 'EUR' : 'USD');
        const effectiveValue = effectiveCurrency === 'USD'
          ? Number((newOrder.totalPrice / 135).toFixed(2))
          : (effectiveCurrency === 'EUR' ? Number((newOrder.totalPrice / 145).toFixed(2)) : newOrder.totalPrice);

        const orderContentId = (newOrder as Record<string, unknown>).contentId as string | undefined;
        const contentIds = [orderContentId || 'theoria_eye_massager_pro'];
        const customData = {
          currency: effectiveCurrency,
          value: effectiveValue,
          order_id: orderCode,
          content_name: newOrder.packageTitle,
          content_ids: contentIds,
          content_type: 'product',
          num_items: 1,
          original_currency: 'DZD',
          original_value: newOrder.totalPrice,
          contents: [
            {
              id: contentIds[0],
              quantity: 1,
              item_price: effectiveValue,
            },
          ],
        };

        // event_source_url mirrors the browser's thank-you URL (with test code
        // when present) — full parity with the browser leg. Canonical host
        // keeps AEM domain attribution consistent with the ad landing domain.
        const baseSourceUrl = `https://${req.headers.host || 'theoriastore.com'}/thank-you?order_id=${orderCode}&token=${fb_token}`;
        const trimmedTestCode = testEventCode ? String(testEventCode).trim() : '';
        const eventSourceUrl = trimmedTestCode
          ? `${baseSourceUrl}&test_event_code=${encodeURIComponent(trimmedTestCode)}`
          : baseSourceUrl;

        const capiPayload: Record<string, unknown> = {
          data: [
            {
              event_name: 'Purchase',
              event_time: Math.floor(Date.now() / 1000),
              event_id: eventId,
              event_source_url: eventSourceUrl,
              action_source: 'website',
              user_data: userData,
              custom_data: customData,
            },
          ],
        };

        if (trimmedTestCode) {
          capiPayload.test_event_code = trimmedTestCode;
        }

        console.log(
          `[Meta CAPI] Dispatching Server Purchase: order=${orderCode}, event_id=${eventId}, test_event_code=${capiPayload.test_event_code || 'none'}, pixel=${effectivePixelId}`
        );

        const capiController = new AbortController();
        const capiTimeout = setTimeout(() => capiController.abort(), 10000);
        try {
          const metaRes = await fetch(`https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(capiPayload),
            signal: capiController.signal,
          });

          const metaData = await metaRes.json().catch(() => null);
          console.log(`[Meta CAPI Response] HTTP ${metaRes.status}:`, JSON.stringify(metaData));

          if (metaRes.ok && metaData?.events_received) {
            console.log(`[Meta CAPI Success] Received ${metaData.events_received} event(s) for order ${orderCode}. event_id: ${eventId}`);
            newOrder.capiStatus = 'sent';
          } else {
            console.error(`[Meta CAPI Error] Meta Graph API returned error:`, JSON.stringify(metaData?.error || metaData));
          }
        } finally {
          clearTimeout(capiTimeout);
        }
      } catch (capiErr: any) {
        console.error('[Meta CAPI Request Failed]', capiErr?.message || capiErr);
      }
    }

    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    if (!global.__THEORIA_ORDERS__.some((o) => o.orderCode === orderCode)) {
      global.__THEORIA_ORDERS__.unshift(newOrder);
    }

    const redirect_url = `/thank-you?order_id=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(fb_token)}${testParamSuffix}`;

    return res.status(201).json({
      success: true,
      order: newOrder,
      order_id: orderCode,
      token: fb_token,
      event_id: eventId,
      fb_sent: 0,
      redirect_url,
      metaDeduplication: {
        eventId,
        pixelId: META_PIXEL_ID,
        currency: 'DZD',
        testEventCode: testEventCode ? String(testEventCode).trim() : null,
        capiStatus: newOrder.capiStatus,
      },
    });
  }

  // 3. PATCH ORDER STATUS OR NOTES (admin only)
  if (req.method === 'PATCH') {
    if (!requireAdmin()) return res;
    const targetId = (id as string) || req.body?.id;
    const { status, notes } = req.body || {};

    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    const idx = global.__THEORIA_ORDERS__.findIndex((o) => o.id === targetId || o.orderCode === targetId);

    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (status) global.__THEORIA_ORDERS__[idx].status = status;
    if (notes !== undefined) global.__THEORIA_ORDERS__[idx].notes = notes;

    // Mirror to the durable record (best-effort; memory stays authoritative here).
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (notes !== undefined) patch.notes = notes;
    if (Object.keys(patch).length) {
      adminPatchOrder(global.__THEORIA_ORDERS__[idx].id || targetId, patch).catch(() => {});
    }

    return res.status(200).json({ success: true, order: global.__THEORIA_ORDERS__[idx] });
  }

  // 4. DELETE ORDER (admin only)
  if (req.method === 'DELETE') {
    if (!requireAdmin()) return res;
    const targetId = (id as string) || (req.query?.orderId as string);
    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    global.__THEORIA_ORDERS__ = global.__THEORIA_ORDERS__.filter((o) => o.id !== targetId && o.orderCode !== targetId);
    if (targetId) adminDeleteOrder(targetId).catch(() => {});

    return res.status(200).json({ success: true, message: 'Order deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
