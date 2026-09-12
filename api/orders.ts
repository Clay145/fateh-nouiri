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

if (!global.__THEORIA_ORDERS__) {
  global.__THEORIA_ORDERS__ = [
    {
      id: 'ord_1',
      orderCode: 'TH-94821',
      customerName: 'أمين كواشي',
      phone: '0551234567',
      wilaya: '16 - الجزائر العاصمة',
      commune: 'باب الزوار، حي إسماعيل يفصح',
      packageTitle: 'باقة الراحة الكاملة (جهازين Theoria)',
      totalPrice: 16900,
      date: '12 سبتمبر 2026',
      createdAt: Date.now() - 1000 * 60 * 12,
      status: 'جديد',
      notes: 'يفضل الاتصال بعد الساعة 5 مساءً',
    },
    {
      id: 'ord_2',
      orderCode: 'TH-83149',
      customerName: 'سارة مجاهدي',
      phone: '0662345678',
      wilaya: '31 - وهران',
      commune: 'بئر الجير، بالقرب من الصيدلية المركزية',
      packageTitle: 'الباقة الفردية (جهاز واحد Theoria)',
      totalPrice: 9500,
      date: '12 سبتمبر 2026',
      createdAt: Date.now() - 1000 * 60 * 45,
      status: 'تم التأكيد',
      notes: 'تم تأكيد العنوان هاتفياً، جاهز للإرسال مع شركة ياليدين',
    },
    {
      id: 'ord_3',
      orderCode: 'TH-76290',
      customerName: 'ياسين بوقرة',
      phone: '0773456789',
      wilaya: '25 - قسنطينة',
      commune: 'المدينة الجديدة علي منجلي، الوحدة 14',
      packageTitle: 'باقة العائلة والشركاء (3 أجهزة Theoria)',
      totalPrice: 23900,
      date: '11 سبتمبر 2026',
      createdAt: Date.now() - 1000 * 60 * 60 * 22,
      status: 'تم التسليم',
      notes: 'تم التوصيل بنجاح واستلام المبلغ كاملاً',
    },
  ];
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

  // 1. GET ALL ORDERS
  if (req.method === 'GET' && !id) {
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

    const newOrder = {
      id: body.id || `ord_${Date.now()}`,
      orderCode: body.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`,
      customerName: body.customerName,
      phone: body.phone,
      wilaya: body.wilaya || 'غير محدد',
      commune: body.commune || '',
      packageTitle: body.packageTitle || 'جهاز مساج Theoria',
      totalPrice: Number(body.totalPrice) || 9500,
      date: body.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
      createdAt: Date.now(),
      status: 'جديد',
      notes: body.notes || '',
    };

    if (!global.__THEORIA_ORDERS__) global.__THEORIA_ORDERS__ = [];
    global.__THEORIA_ORDERS__.unshift(newOrder);

    return res.status(201).json({ success: true, order: newOrder });
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
