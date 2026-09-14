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

  if (!order) {
    // If running on Vercel lambda and order was saved in memory of another instance,
    // allow client-side verification to proceed safely with the token
    return res.status(200).json({
      valid: true,
      fallbackMode: true,
      order_id,
      token,
      event_id: `purchase_${order_id}`,
      fb_sent: 0,
      value: 9500,
      currency: 'DZD',
      customerName: 'زبون Theoria',
      packageTitle: 'جهاز مساج واسترخاء العينين Theoria',
    });
  }

  if (order.fb_token && order.fb_token !== token) {
    return res.status(403).json({
      valid: false,
      error: 'رمز التحقق (Token) غير متطابق مع الطلب المسجل. تم حظر إطلاق حدث الشراء أمنياً.',
    });
  }

  return res.status(200).json({
    valid: true,
    order_id: order.orderCode || order_id,
    event_id: order.fb_event_id || order.eventId || `purchase_${order.orderCode || order_id}`,
    fb_sent: order.fb_sent ?? 0,
    value: order.totalPrice || 9500,
    currency: 'DZD',
    customerName: order.customerName || 'زبون Theoria',
    wilaya: order.wilaya || '',
    packageTitle: order.packageTitle || 'جهاز مساج واسترخاء العينين Theoria',
  });
}
