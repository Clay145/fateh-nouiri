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

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
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
    const orderCode = body.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`;
    const eventId = body.eventId || `purchase_${orderCode}`;
    const fb_token = body.fb_token || (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2));
    const fb_sent = 0;

    const newOrder = {
      id: body.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderCode,
      customerName: String(body.customerName).trim(),
      phone: cleanPhone,
      wilaya: body.wilaya || 'غير محدد',
      commune: String(body.commune || '').trim(),
      packageTitle: body.packageTitle || 'جهاز مساج Theoria',
      totalPrice: Number(body.totalPrice) || 9500,
      date: body.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
      createdAt: body.createdAt || Date.now(),
      status: 'جديد',
      notes: body.notes || '',
      eventId,
      fb_event_id: eventId,
      fb_token,
      fb_sent,
      fbp: body.fbp,
      fbc: body.fbc,
      capiStatus: 'test_mode',
    };

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
        pixelId: '28477410788542282',
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
