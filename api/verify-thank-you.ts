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
  var __THEORIA_CAPI_DISPATCHED__: Set<string> | undefined;
}

const META_PIXEL_ID = '28477410788542282';

function hashSha256(val: string): string {
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const order_id = ((Array.isArray(req.query.order_id) ? req.query.order_id[0] : req.query.order_id) || '').trim();
  const token = ((Array.isArray(req.query.token) ? req.query.token[0] : req.query.token) || '').trim();

  if (!order_id || !token) {
    return res.status(400).json({
      valid: false,
      error: 'رابط غير مكتمل: يلزم تمرير order_id و token. تم منع إطلاق حدث الشراء لحماية دقة الإعلانات.',
    });
  }

  const orders = global.__THEORIA_ORDERS__ || [];
  const order = orders.find((o) => o.orderCode === order_id || o.id === order_id);

  if (order && order.fb_token && order.fb_token !== token) {
    return res.status(403).json({
      valid: false,
      error: 'رمز التحقق (Token) غير متطابق مع الطلب المسجل. تم حظر إطلاق حدث الشراء أمنياً.',
    });
  }

  const canonicalEventId = order?.fb_event_id || order?.eventId || `purchase_${order_id}`;
  const orderValue = Number(order?.totalPrice) || 9500;
  const isFbSent = order?.fb_sent === 1;

  // Server-side Meta CAPI dispatch (if not already sent and token is verified)
  if (!isFbSent) {
    if (!global.__THEORIA_CAPI_DISPATCHED__) {
      global.__THEORIA_CAPI_DISPATCHED__ = new Set<string>();
    }

    if (!global.__THEORIA_CAPI_DISPATCHED__.has(canonicalEventId)) {
      global.__THEORIA_CAPI_DISPATCHED__.add(canonicalEventId);

      const effectivePixelId = process.env.META_PIXEL_ID || META_PIXEL_ID;
      const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN;
      const testEventCode = (req.query.test_event_code as string) ||
                            (req.headers['x-meta-test-event-code'] as string) ||
                            process.env.META_TEST_EVENT_CODE ||
                            process.env.TEST_EVENT_CODE ||
                            'TEST45919';

      if (!accessToken) {
        console.error(
          `[Meta CAPI Error] META_CONVERSIONS_API_ACCESS_TOKEN is missing in Vercel environment variables! Cannot send CAPI Purchase event for order ${order_id}. Make sure it is added in Vercel Dashboard > Settings > Environment Variables for Preview & Production.`
        );
      } else {
        try {
          const cleanPhone = order?.phone ? String(order.phone).replace(/\s+/g, '') : '';
          const userData: Record<string, unknown> = {
            country: [hashSha256('dz')],
          };
          if (cleanPhone) userData.ph = [hashSha256(cleanPhone)];
          if (order?.customerName) {
            const parts = String(order.customerName).trim().split(/\s+/);
            if (parts[0]) userData.fn = [hashSha256(parts[0])];
            if (parts.length > 1) userData.ln = [hashSha256(parts.slice(1).join(' '))];
          }
          if (order?.wilaya) userData.st = [hashSha256(order.wilaya)];
          if (order?.fbp) userData.fbp = order.fbp;
          if (order?.fbc) userData.fbc = order.fbc;

          const customData = {
            value: orderValue,
            currency: 'DZD',
            order_id,
            content_name: order?.packageTitle || 'جهاز مساج واسترخاء العينين Theoria',
            content_type: 'product',
          };

          const capiPayload: Record<string, unknown> = {
            data: [
              {
                event_name: 'Purchase',
                event_time: Math.floor(Date.now() / 1000),
                event_id: canonicalEventId,
                action_source: 'website',
                event_source_url: `https://${req.headers.host || 'fateh-nouiri.vercel.app'}/thank-you?order_id=${order_id}&token=${token}`,
                user_data: userData,
                custom_data: customData,
              },
            ],
          };

          if (testEventCode) {
            capiPayload.test_event_code = String(testEventCode).trim();
          }

          console.log(
            `[Meta CAPI Verify] Sending CAPI Purchase: order=${order_id}, event_id=${canonicalEventId}, test_event_code=${capiPayload.test_event_code || 'none'}, pixel=${effectivePixelId}`
          );

          const metaRes = await fetch(`https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(capiPayload),
          });

          const metaData = await metaRes.json();
          console.log(`[Meta CAPI Verify Response] HTTP ${metaRes.status}:`, JSON.stringify(metaData));

          if (metaRes.ok && metaData.events_received) {
            console.log(`[Meta CAPI Verify Success] Meta received ${metaData.events_received} event(s) for order ${order_id}. event_id: ${canonicalEventId}`);
            if (order) order.capiStatus = 'sent';
          } else {
            console.error(`[Meta CAPI Verify Error] Meta Graph API returned error:`, JSON.stringify(metaData.error || metaData));
          }
        } catch (capiErr: any) {
          console.error('[Meta CAPI Verify Network Error]', capiErr?.message || capiErr);
        }
      }
    }
  }

  if (!order) {
    return res.status(200).json({
      valid: true,
      fallbackMode: true,
      order_id,
      token,
      event_id: canonicalEventId,
      fb_sent: 0,
      value: orderValue,
      currency: 'DZD',
      customerName: 'زبون Theoria',
      packageTitle: 'جهاز مساج واسترخاء العينين Theoria',
    });
  }

  return res.status(200).json({
    valid: true,
    order_id: order.orderCode || order_id,
    event_id: canonicalEventId,
    fb_sent: order.fb_sent ?? 0,
    value: orderValue,
    currency: 'DZD',
    customerName: order.customerName || 'زبون Theoria',
    wilaya: order.wilaya || '',
    packageTitle: order.packageTitle || 'جهاز مساج واسترخاء العينين Theoria',
  });
}
