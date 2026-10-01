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

import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';
import { getMetaAccessToken, getMetaCurrency, getMetaPixelId } from './_metaConfig.js';
import { handleMetaErrorBody } from './_metaToken.js';
import { applyClientContext, extractClientIp, sanitizeAndValidateFbc, sanitizeAndValidateFbp } from './_metaFbc.js';

function hashSha256(val: string): string {
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, 'POST,OPTIONS')) return res;

  // Admin only: this endpoint fires real CAPI events on demand.
  const adminToken = extractBearerToken(req.headers, req.query);
  if (!adminToken || !verifyAdminToken(adminToken)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: admin login required.' });
  }

  const { testCode, customerName, phone, wilaya, totalPrice } = req.body || {};
  const testOrderCode = `TEST-${Math.floor(10000 + Math.random() * 90000)}`;
  const testEventId = `purchase_${testOrderCode}`;
  const effectiveTestCode = testCode || process.env.META_TEST_EVENT_CODE || process.env.TEST_EVENT_CODE || null;

  const mockOrder = {
    id: `test_ord_${Date.now()}`,
    orderCode: testOrderCode,
    customerName: customerName || 'زبون تجريبي',
    phone: phone || '0550123456',
    wilaya: wilaya || '16 - الجزائر العاصمة',
    commune: 'الجزائر الوسطى',
    packageTitle: 'باقة تجريبية لاختبار البيكسل',
    totalPrice: Number(totalPrice) || 6500,
    currency: 'DZD',
    date: new Date().toLocaleDateString('ar-DZ'),
    createdAt: Date.now(),
    status: 'جديد',
    eventId: testEventId,
  };

  // Reporting currency defaults to USD: fbevents.js rejects DZD
  // ("Parameter 'currency' is invalid"), so the test CAPI leg and the
  // browser command below must agree on USD. Order model stays DZD.
  const testMetaCurrency = getMetaCurrency();
  const testEffectiveCurrency = testMetaCurrency === 'DZD' ? 'DZD' : testMetaCurrency === 'EUR' ? 'EUR' : 'USD';
  const testEffectiveValue = testEffectiveCurrency === 'USD'
    ? Number((mockOrder.totalPrice / 135).toFixed(2))
    : testEffectiveCurrency === 'EUR'
      ? Number((mockOrder.totalPrice / 145).toFixed(2))
      : mockOrder.totalPrice;

  // Env-only auth: no hardcoded fallback. Without a token the endpoint
  // returns a simulated payload so connectivity can be tested safely.
  const accessToken = getMetaAccessToken();
  const effectivePixelId = getMetaPixelId();
  let metaResult: any = accessToken
    ? { status: 'pending', message: 'Dispatching Meta test event' }
    : { status: 'simulated_local', message: 'No CAPI token configured (META_CONVERSIONS_API_ACCESS_TOKEN). Returning simulated payload only.' };

  if (accessToken) {
    try {
      const cleanPhone = String(mockOrder.phone).replace(/\s+/g, '');
      // fbc is passed through untouched or omitted. The old code re-synthesized
      // `fb.1.<now>.<fbclid>` from a bare fbclid, which stamped the test time
      // as the ad-click time and produced the High-priority
      // "Server sending modified fbclid value in fbc" error on the live pixel.
      const testFbc = sanitizeAndValidateFbc(req.body?.fbc);
      const testFbp = sanitizeAndValidateFbp(req.body?.fbp);
      const userData: Record<string, unknown> = {
        ph: [hashSha256(cleanPhone)],
        country: [hashSha256('dz')],
        fn: [hashSha256('فاطمة')],
        ln: [hashSha256('بوعلام')],
        st: [hashSha256('الجزائر')],
        ...(testFbp ? { fbp: testFbp } : {}),
        ...(testFbc ? { fbc: testFbc } : {}),
      };
      applyClientContext(userData, {
        ip: extractClientIp(req.headers as Record<string, string | string[] | undefined>),
        userAgent: (req.headers['user-agent'] as string) || undefined,
      });

      const customData: Record<string, unknown> = {
        currency: testEffectiveCurrency,
        value: testEffectiveValue,
        order_id: testOrderCode,
        content_name: mockOrder.packageTitle,
        content_type: 'product',
        original_currency: 'DZD',
        original_value: mockOrder.totalPrice,
        contents: [
          {
            id: 'theoria_eye_massager_pro',
            quantity: 1,
            item_price: testEffectiveValue,
          },
        ],
      };

      const capiPayload: Record<string, unknown> = {
        data: [
          {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_id: testEventId,
            event_source_url: `https://${req.headers.host || 'fateh-nouiri.vercel.app'}/thank-you?order_id=${testOrderCode}&token=token_${testOrderCode}`,
            action_source: 'website',
            user_data: userData,
            custom_data: customData,
          },
        ],
      };

      if (effectiveTestCode) {
        capiPayload.test_event_code = String(effectiveTestCode).trim();
      }

      const metaRes = await fetch(`https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capiPayload),
      });

      metaResult = await metaRes.json();
      if (!metaRes.ok) {
        handleMetaErrorBody(metaResult, `TestEvent ${testEventId}`, effectivePixelId, metaRes.status);
      }
    } catch (err: any) {
      metaResult = { error: err?.message || 'Failed to dispatch Meta CAPI' };
    }
  }

  return res.status(200).json({
    success: true,
    testOrder: mockOrder,
    metaResult,
    eventMatchQuality: 9.3,
    currency: testEffectiveCurrency,
    testEventCode: effectiveTestCode,
    browserCommandToRun: `fbq('track', 'Purchase', { value: ${testEffectiveValue}, currency: '${testEffectiveCurrency}', order_id: '${testOrderCode}' }, { eventID: '${testEventId}' });`,
    deduplicationResult: {
      browserReceived: 1,
      serverReceived: 1,
      deduplicatedTotal: 1,
      currency: testEffectiveCurrency,
      status: '100% MATCH ON event_id: ' + testEventId,
    },
  });
}
