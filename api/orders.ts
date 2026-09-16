import crypto from 'crypto';

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

// In production, start with clean real orders only (no mock data)
if (!global.__THEORIA_ORDERS__) {
  global.__THEORIA_ORDERS__ = [];
}

const META_PIXEL_ID = '28477410788542282';

function hashSha256(val: string): string {
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-meta-test-event-code'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  // 1. GET ORDERS / STREAM
  if (req.method === 'GET') {
    if (id === 'stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.send(`data: {"type":"CONNECTED","message":"Live sync active"}\n\n`);
      return res.end();
    }

    if (id) {
      const order = (global.__THEORIA_ORDERS__ || []).find((o) => o.id === id || o.orderCode === id);
      if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
      return res.status(200).json({ success: true, order });
    }

    return res.status(200).json({
      success: true,
      orders: global.__THEORIA_ORDERS__ || [],
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
        return res.status(200).json({
          success: true,
          isDuplicate: true,
          order: existingByCode,
          order_id: existingByCode.orderCode,
          token: existingByCode.fb_token,
          event_id: existingByCode.eventId || `purchase_${existingByCode.orderCode}`,
          fb_sent: existingByCode.fb_sent || 0,
          redirect_url: `/thank-you?order_id=${encodeURIComponent(existingByCode.orderCode)}&token=${encodeURIComponent(existingByCode.fb_token)}`,
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
      console.warn(`[Order Deduplication] Duplicate order detected for phone ${cleanPhone} (existing: ${existingOrder.orderCode}). Returning existing order without duplicate insertion or CAPI fire.`);
      return res.status(200).json({
        success: true,
        isDuplicate: true,
        order: existingOrder,
        order_id: existingOrder.orderCode,
        token: existingOrder.fb_token,
        event_id: existingOrder.eventId || `purchase_${existingOrder.orderCode}`,
        fb_sent: existingOrder.fb_sent || 0,
        redirect_url: `/thank-you?order_id=${encodeURIComponent(existingOrder.orderCode)}&token=${encodeURIComponent(existingOrder.fb_token)}`,
      });
    }

    const orderCode = body.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`;
    const eventId = body.eventId || `purchase_${orderCode}`;
    const fb_token = body.fb_token || (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2));
    const fb_sent = 0;

    // Production: never send test_event_code unless explicitly passed (no env fallback)
    const testEventCode = (req.query.test_event_code as string) ||
                          (body.test_event_code as string) ||
                          (req.headers['x-meta-test-event-code'] as string) ||
                          undefined;

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
      currency: 'DZD',
      date: body.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
      createdAt: body.createdAt || Date.now(),
      status: 'جديد',
      notes: body.notes || '',
      eventId,
      fb_event_id: eventId,
      fb_token,
      fb_sent,
      ...(body.fbp ? { fbp: String(body.fbp) } : {}),
      ...(body.fbc ? { fbc: String(body.fbc) } : {}),
      capiStatus: testEventCode ? 'test_mode' : 'pending',
    };

    // Server-side Meta CAPI v20.0 dispatch
    const effectivePixelId = process.env.META_PIXEL_ID || META_PIXEL_ID;
    const FALLBACK_CAPI_TOKEN = 'EAAhsQrqF1LQBSbZC1XT8cdCX81jJvmxac27deOQd4s77dZASnegTKykgb95lCjYdWRLc3mvS0zYVtTaUMwLNIHGg1YghynrkaBCergTHujh49rInS6dZCFUfHmXWS59vk2bq58DrbfixVFUA0tqSuZAmgxil6PvMYvhOymwxlrdEB2PIe8taE20wqneO8wZDZD';
    const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN || FALLBACK_CAPI_TOKEN;

    if (!accessToken) {
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
        if (body.fbp) userData.fbp = body.fbp;
        if (body.fbc) userData.fbc = body.fbc;

        // Meta CAPI standard currency conversion: USD is the primary accepted currency for Algerian Ad accounts & fbevents.js
        const metaCurrency = (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'USD').toUpperCase();
        const effectiveCurrency = metaCurrency === 'DZD' ? 'DZD' : (metaCurrency === 'EUR' ? 'EUR' : 'USD');
        const effectiveValue = effectiveCurrency === 'USD'
          ? Number((newOrder.totalPrice / 135).toFixed(2))
          : (effectiveCurrency === 'EUR' ? Number((newOrder.totalPrice / 145).toFixed(2)) : newOrder.totalPrice);

        const customData = {
          currency: effectiveCurrency,
          value: effectiveValue,
          order_id: orderCode,
          content_name: newOrder.packageTitle,
          content_type: 'product',
          original_currency: 'DZD',
          original_value: newOrder.totalPrice,
          contents: [
            {
              id: 'theoria_eye_massager_pro',
              quantity: 1,
              item_price: effectiveValue,
            },
          ],
        };

        const capiPayload: Record<string, unknown> = {
          data: [
            {
              event_name: 'Purchase',
              event_time: Math.floor(Date.now() / 1000),
              event_id: eventId,
              event_source_url: `https://${req.headers.host || 'fateh-nouiri.vercel.app'}/thank-you?order_id=${orderCode}&token=${fb_token}`,
              action_source: 'website',
              user_data: userData,
              custom_data: customData,
            },
          ],
        };

        if (testEventCode) {
          capiPayload.test_event_code = String(testEventCode).trim();
        }

        console.log(
          `[Meta CAPI] Dispatching Server Purchase: order=${orderCode}, event_id=${eventId}, test_event_code=${capiPayload.test_event_code || 'none'}, pixel=${effectivePixelId}`
        );

        const metaRes = await fetch(`https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capiPayload),
        });

        const metaData = await metaRes.json();
        console.log(`[Meta CAPI Response] HTTP ${metaRes.status}:`, JSON.stringify(metaData));

        if (metaRes.ok && metaData.events_received) {
          console.log(`[Meta CAPI Success] Received ${metaData.events_received} event(s) for order ${orderCode}. event_id: ${eventId}`);
          newOrder.capiStatus = 'sent';
        } else {
          console.error(`[Meta CAPI Error] Meta Graph API returned error:`, JSON.stringify(metaData.error || metaData));
        }
      } catch (capiErr: any) {
        console.error('[Meta CAPI Request Failed]', capiErr?.message || capiErr);
      }
    }

    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    global.__THEORIA_ORDERS__.unshift(newOrder);

    const redirect_url = `/thank-you?order_id=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(fb_token)}`;

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

  // 3. PATCH ORDER STATUS OR NOTES
  if (req.method === 'PATCH') {
    const targetId = (id as string) || req.body?.id;
    const { status, notes } = req.body || {};

    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    const idx = global.__THEORIA_ORDERS__.findIndex((o) => o.id === targetId || o.orderCode === targetId);

    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (status) global.__THEORIA_ORDERS__[idx].status = status;
    if (notes !== undefined) global.__THEORIA_ORDERS__[idx].notes = notes;

    return res.status(200).json({ success: true, order: global.__THEORIA_ORDERS__[idx] });
  }

  // 4. DELETE ORDER
  if (req.method === 'DELETE') {
    const targetId = (id as string) || (req.query?.orderId as string);
    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    global.__THEORIA_ORDERS__ = global.__THEORIA_ORDERS__.filter((o) => o.id !== targetId && o.orderCode !== targetId);

    return res.status(200).json({ success: true, message: 'Order deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
