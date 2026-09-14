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

  const order_id = ((Array.isArray(req.query.order_id) ? req.query.order_id[0] : req.query.order_id) || req.body?.order_id || '').trim();
  const token = ((Array.isArray(req.query.token) ? req.query.token[0] : req.query.token) || req.body?.token || '').trim();

  if (!order_id) {
    return res.status(400).json({ success: false, error: 'Missing order_id' });
  }

  if (!global.__THEORIA_ORDERS__) {
    global.__THEORIA_ORDERS__ = [];
  }

  const order = global.__THEORIA_ORDERS__.find((o) => o.orderCode === order_id || o.id === order_id);
  if (order) {
    order.fb_sent = 1;
    order.fb_sent_at = Date.now();
  }

  return res.status(200).json({
    success: true,
    order_id,
    fb_sent: 1,
    message: 'Order fb_sent set to 1. Duplicate fires prevented.',
  });
}
