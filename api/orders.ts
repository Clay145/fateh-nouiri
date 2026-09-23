import crypto from 'crypto';
import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';
import { adminCreateOrder, adminDeleteOrder, adminGetOrderByCode, adminListOrders, adminListOrdersByPhone, adminListOrdersSince, adminPatchOrder, isAdminDbConfigured } from './_firestoreAdmin.js';

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

/** Normalize Algerian phone to 213XXXXXXXXX — must match browser adv.matching. */
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

/** Real package economics from contentId (single=1/double=2/triple=3). */
function packageEconomics(contentId?: string | null, totalPrice?: number): {
  units: number;
  packageId?: string;
  originalPrice: number;
  discountValue: number;
} {
  const id = String(contentId || '');
  const units = id.includes('triple') ? 3 : id.includes('double') ? 2 : 1;
  const packageId = id.includes('triple') ? 'triple' : id.includes('double') ? 'double' : id.includes('single') ? 'single' : undefined;
  const originalPrice = id.includes('triple') ? 44700 : id.includes('double') ? 29800 : id.includes('single') ? 14900 : Number(totalPrice) || 0;
  const discountValue = Math.max(0, originalPrice - (Number(totalPrice) || 0));
  return { units, packageId, originalPrice, discountValue };
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
    // Supports incremental polling via ?since={createdAtMs}&limit={n} so the
    // dashboard can poll cheaply every 15s instead of refetching 250 rows.
    const parseSince = (): number => {
      const raw = Array.isArray(req.query.since) ? req.query.since[0] : req.query.since;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };
    const parseLimit = (): number => {
      const raw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const n = Number(raw);
      if (!Number.isFinite(n)) return 250;
      return Math.min(250, Math.max(1, Math.floor(n)));
    };
    const since = parseSince();
    const limit = parseLimit();
    const memoryOrders = global.__THEORIA_ORDERS__ || [];
    const dbOrders = since > 0 ? await adminListOrdersSince(since, limit) : await adminListOrders(limit);
    const merged = new Map<string, any>();
    [...dbOrders, ...memoryOrders].forEach((o) => {
      if (o && (o.id || o.orderCode)) merged.set(o.id || o.orderCode, o);
    });
    let result = Array.from(merged.values());
    if (since > 0) {
      result = result.filter((o) => Number(o?.createdAt || 0) > since);
    }
    result.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
    result = result.slice(0, limit);
    return res.status(200).json({
      success: true,
      orders: result,
      source: dbOrders.length ? 'memory+firestore' : memoryOrders.length ? 'memory' : 'empty',
      firestoreConfigured: isAdminDbConfigured(),
      serverTime: Date.now(),
      since,
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
    // Durable lookup: memory first, then Firestore (cross-instance retries).
    if (body.orderCode) {
      const existingByCode =
        global.__THEORIA_ORDERS__.find((o) => o.orderCode === body.orderCode) ||
        (await adminGetOrderByCode(String(body.orderCode)));
      if (existingByCode) {
        if (!global.__THEORIA_ORDERS__.some((o) => o.orderCode === existingByCode.orderCode)) {
          global.__THEORIA_ORDERS__.unshift(existingByCode);
        }
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

    // Never-lose policy: NO phone/time blocking. A second submit from the same
    // phone is accepted as its own order (own orderCode). The previous 60s
    // phone guard swallowed legitimate household re-orders, so it now only
    // annotates for admin review instead of absorbing the request.
    const now = Date.now();
    const possibleDuplicateOf = global.__THEORIA_ORDERS__.find(
      (o) => o.phone === cleanPhone && (now - (o.createdAt || 0) < 60000)
    )?.orderCode;

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

    const newOrder: Record<string, any> = {
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
      ...(possibleDuplicateOf ? { possibleDuplicateOf } : {}),
    };
    if (possibleDuplicateOf) {
      console.warn(`[Order] Same-phone re-order within 60s accepted (never-lose): new=${orderCode} prev=${possibleDuplicateOf}. Flagged, not blocked.`);
    }

    // Persist-first: claim idempotency synchronously, insert into memory, then
    // durable Firestore write BEFORE any Meta network call. A concurrent retry
    // lands in the duplicate-by-code guard above instead of double-firing.
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

    // 1) Durable write first — order is safe even if Meta times out next.
    let durableOk = false;
    try {
      durableOk = await adminCreateOrder({ ...newOrder, id: newOrder.id });
    } catch (e) {
      console.error('[FirestoreAdmin] createOrder threw:', (e as Error)?.message || e);
    }
    if (!durableOk) {
      console.error(`[Order] Firestore durable write FAILED for ${orderCode} (firestoreConfigured=${isAdminDbConfigured()}). Order held in memory only — dashboard banner must warn.`);
    }

    // 2) Fast-ack CAPI: short timeout (6s) so slow Meta never holds the
    // customer checkout hostage. Failure here never fails the order.
    // Reporting currency defaults to USD (fbevents.js rejects DZD); computed
    // once here so the response metaDeduplication block below can reference it.
    const orderMetaCurrency = (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'USD').toUpperCase();
    const orderEffectiveCurrency = orderMetaCurrency === 'DZD' ? 'DZD' : orderMetaCurrency === 'EUR' ? 'EUR' : 'USD';
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
        const normalizedOrderPhone = normalizeDzPhone(cleanPhone);
        const userData: Record<string, unknown> = {
          ph: [hashSha256(normalizedOrderPhone || cleanPhone)],
          country: [hashSha256('dz')],
          external_id: [hashSha256(orderCode)],
        };
        if (body.email) userData.em = [hashSha256(String(body.email))];
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || (req.headers['x-real-ip'] as string) || undefined;
        const clientUa = (req.headers['user-agent'] as string) || undefined;
        if (clientIp) userData.client_ip_address = clientIp;
        if (clientUa) userData.client_user_agent = clientUa;
        const { firstName: ordFn, lastName: ordLn } = splitDzName(body.customerName);
        if (ordFn) userData.fn = [hashSha256(ordFn)];
        if (ordLn) userData.ln = [hashSha256(ordLn)];
        if (body.wilaya) userData.st = [hashSha256(String(body.wilaya))];
        if (body.commune) userData.ct = [hashSha256(String(body.commune))];
        if (resolvedFbp) userData.fbp = resolvedFbp;
        if (resolvedFbc) userData.fbc = resolvedFbc;

        // Meta CAPI currency: fbevents.js rejects DZD ("Parameter 'currency' is
        // invalid"), so default reporting currency is USD (÷135) to match the
        // browser leg. True charged DZD is kept in original_* fields.
        // (orderMetaCurrency/orderEffectiveCurrency computed above; reused here.)
        const metaCurrency = orderMetaCurrency;
        const effectiveCurrency = orderEffectiveCurrency;
        const effectiveValue = effectiveCurrency === 'USD'
          ? Number((newOrder.totalPrice / 135).toFixed(2))
          : (effectiveCurrency === 'EUR' ? Number((newOrder.totalPrice / 145).toFixed(2)) : newOrder.totalPrice);

        // Real package economics + geo (mirrors the browser Purchase leg).
        const orderContentId = (newOrder as Record<string, unknown>).contentId as string | undefined;
        const contentIds = [orderContentId || 'theoria_eye_massager_pro'];
        const econ = packageEconomics(orderContentId, newOrder.totalPrice);
        const wilayaCode = extractDzWilayaCode(newOrder.wilaya);
        // Repeat-buyer value signal (best-effort Firestore lookup, never blocks).
        let predictedLtvDzd = Number(newOrder.totalPrice) || 0;
        try {
          const priors = await adminListOrdersByPhone(normalizedOrderPhone || cleanPhone, 20);
          const filtered = priors.filter((p) => p?.orderCode !== orderCode);
          if (filtered.length) {
            const spent = filtered.reduce((s, p) => s + (Number(p?.totalPrice) || 0), 0);
            predictedLtvDzd = spent + (Number(newOrder.totalPrice) || 0);
          }
        } catch {
          // ignore — predicted_ltv falls back to current value
        }
        const predictedLtv = effectiveCurrency === 'USD'
          ? Number((predictedLtvDzd / 135).toFixed(2))
          : effectiveCurrency === 'EUR'
            ? Number((predictedLtvDzd / 145).toFixed(2))
            : predictedLtvDzd;
        const customData: Record<string, unknown> = {
          currency: effectiveCurrency,
          value: effectiveValue,
          order_id: orderCode,
          content_name: newOrder.packageTitle,
          content_ids: contentIds,
          content_type: 'product',
          content_category: 'eye_care_device',
          num_items: econ.units,
          original_currency: 'DZD',
          original_value: newOrder.totalPrice,
          discount_value: econ.discountValue,
          shipping_value: 0,
          predicted_ltv: predictedLtv,
          contents: [
            {
              id: contentIds[0],
              quantity: econ.units,
              item_price: effectiveValue,
            },
          ],
        };
        if (econ.packageId) customData.package_id = econ.packageId;
        if (wilayaCode) customData.wilaya_code = wilayaCode;

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
        const capiTimeout = setTimeout(() => capiController.abort(), 6000);
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
      // Mirror final CAPI outcome onto the durable record (best-effort) so a
      // cross-instance GET sees the same capiStatus the creator saw.
      if (durableOk) {
        adminPatchOrder(String(newOrder.id), { capiStatus: newOrder.capiStatus }).catch(() => {});
        const mem = global.__THEORIA_ORDERS__.find((o) => o.orderCode === orderCode);
        if (mem) mem.capiStatus = newOrder.capiStatus;
      }
    }

    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    if (!global.__THEORIA_ORDERS__.some((o) => o.orderCode === orderCode)) {
      global.__THEORIA_ORDERS__.unshift(newOrder);
    }

    const redirect_url = `/thank-you?order_id=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(fb_token)}${testParamSuffix}`;

    return res.status(201).json({
      success: true,
      durable: durableOk,
      order: newOrder,
      order_id: orderCode,
      token: fb_token,
      event_id: eventId,
      fb_sent: 0,
      redirect_url,
      metaDeduplication: {
        eventId,
        pixelId: META_PIXEL_ID,
        currency: orderEffectiveCurrency,
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
