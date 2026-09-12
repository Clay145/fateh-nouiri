import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

interface OrderItem {
  id: string;
  orderCode: string;
  customerName: string;
  phone: string;
  wilaya: string;
  commune: string;
  packageTitle: string;
  totalPrice: number;
  date: string;
  createdAt: number;
  status: 'جديد' | 'تم التأكيد' | 'قيد التوصيل' | 'تم التسليم' | 'ملغي';
  notes?: string;
}

const DATA_FILE = path.join(process.cwd(), 'orders_data.json');

// Initial seed orders for realistic dashboard demo
const INITIAL_ORDERS: OrderItem[] = [
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
    createdAt: Date.now() - 1000 * 60 * 12, // 12 minutes ago
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
    createdAt: Date.now() - 1000 * 60 * 45, // 45 minutes ago
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
    totalPrice: 23500,
    date: '12 سبتمبر 2026',
    createdAt: Date.now() - 1000 * 60 * 180, // 3 hours ago
    status: 'قيد التوصيل',
    notes: 'رقم بوليصة الشحن: YAL-8492048',
  },
  {
    id: 'ord_4',
    orderCode: 'TH-61543',
    customerName: 'نادية بن سالم',
    phone: '0555678912',
    wilaya: '19 - سطيف',
    commune: 'حي 1014 مسكن عمارة C',
    packageTitle: 'الباقة الفردية (جهاز واحد Theoria)',
    totalPrice: 9500,
    date: '11 سبتمبر 2026',
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
    status: 'تم التسليم',
  },
  {
    id: 'ord_5',
    orderCode: 'TH-50912',
    customerName: 'محمد بوعبد الله',
    phone: '0669876543',
    wilaya: '09 - البليدة',
    commune: 'أولاد يعيش، وسط المدينة',
    packageTitle: 'الباقة الفردية (جهاز واحد Theoria)',
    totalPrice: 9500,
    date: '11 سبتمبر 2026',
    createdAt: Date.now() - 1000 * 60 * 60 * 28,
    status: 'تم التسليم',
  },
];

let orders: OrderItem[] = [];

// Load or save orders
function loadOrders(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      orders = JSON.parse(content);
    } else {
      orders = [...INITIAL_ORDERS];
      fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Error reading orders file, using default:', err);
    orders = [...INITIAL_ORDERS];
  }
}

function persistOrders(): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving orders file:', err);
  }
}

loadOrders();

// Real-time SSE Clients list
interface SseClient {
  id: number;
  res: Response;
}
let sseClients: SseClient[] = [];

function broadcastSse(eventType: string, payload: unknown) {
  const data = JSON.stringify({ type: eventType, payload, timestamp: Date.now() });
  sseClients.forEach((client) => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      // client may have disconnected
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Admin secret key
  const ADMIN_PASSWORD = process.env.ADMIN_SECRET_KEY || 'theoria2026';

  // Admin authentication middleware helper
  function checkAdminAuth(req: Request, res: Response, next: () => void) {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;
    const provided = (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '') || queryToken;

    if (provided && provided === ADMIN_PASSWORD) {
      return next();
    }
    return res.status(401).json({ success: false, error: 'غير مصرح لك. كلمة المرور غير صحيحة.' });
  }

  // Admin login endpoint
  app.post('/api/admin/login', (req: Request, res: Response) => {
    const { password } = req.body;
    if (password && password === ADMIN_PASSWORD) {
      return res.json({ success: true, token: ADMIN_PASSWORD });
    }
    return res.status(401).json({ success: false, error: 'كلمة مرور لوحة الإدارة غير صحيحة' });
  });

  // Admin verify session endpoint
  app.get('/api/admin/verify', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const provided = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '';
    if (provided && provided === ADMIN_PASSWORD) {
      return res.json({ success: true, authenticated: true });
    }
    return res.status(401).json({ success: false, authenticated: false });
  });

  // API Routes
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now(), activeSseClients: sseClients.length });
  });

  // Real-time Server-Sent Events stream for Admin Dashboard (protected)
  app.get('/api/orders/stream', (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token || token !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Unauthorized SSE stream' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const clientId = Date.now() + Math.random();
    sseClients.push({ id: clientId, res });

    // Send initial ping
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Real-time order stream established', activeOrders: orders.length })}\n\n`);

    // Keep connection alive every 25s
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });
  });

  // GET all orders - Protected: only authenticated admin can see full customer list
  app.get('/api/orders', checkAdminAuth, (req: Request, res: Response) => {
    res.json({ success: true, orders });
  });

  // POST new order - Open: customer landing page submits their purchase
  app.post('/api/orders', (req: Request, res: Response) => {
    const body = req.body;
    if (!body.customerName || !body.phone) {
      return res.status(400).json({ success: false, error: 'Customer name and phone are required' });
    }

    const newOrder: OrderItem = {
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

    orders.unshift(newOrder);
    persistOrders();

    // Broadcast to real-time Admin listeners
    broadcastSse('NEW_ORDER', newOrder);

    return res.status(201).json({ success: true, order: newOrder });
  });

  // PATCH order status or notes - Protected: only admin can modify
  app.patch('/api/orders/:id', checkAdminAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    const orderIndex = orders.findIndex((o) => o.id === id || o.orderCode === id);
    if (orderIndex === -1) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (status) {
      orders[orderIndex].status = status;
    }
    if (notes !== undefined) {
      orders[orderIndex].notes = notes;
    }

    persistOrders();

    // Broadcast status update
    broadcastSse('ORDER_UPDATED', orders[orderIndex]);

    return res.json({ success: true, order: orders[orderIndex] });
  });

  // DELETE order - Protected: only admin can delete
  app.delete('/api/orders/:id', checkAdminAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = orders.length;
    orders = orders.filter((o) => o.id !== id && o.orderCode !== id);

    if (orders.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    persistOrders();
    broadcastSse('ORDER_DELETED', { id });

    return res.json({ success: true, message: 'Order deleted' });
  });

  // GET stats - Protected
  app.get('/api/stats', checkAdminAuth, (req: Request, res: Response) => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => (o.status !== 'ملغي' ? sum + o.totalPrice : sum), 0);
    const newOrders = orders.filter((o) => o.status === 'جديد').length;
    const confirmedOrders = orders.filter((o) => o.status === 'تم التأكيد' || o.status === 'قيد التوصيل' || o.status === 'تم التسليم').length;
    const deliveredOrders = orders.filter((o) => o.status === 'تم التسليم').length;

    // Wilayas distribution
    const wilayaCounts: Record<string, number> = {};
    orders.forEach((o) => {
      wilayaCounts[o.wilaya] = (wilayaCounts[o.wilaya] || 0) + 1;
    });

    res.json({
      success: true,
      stats: {
        totalOrders,
        totalRevenue,
        newOrders,
        confirmedOrders,
        deliveredOrders,
        confirmationRate: totalOrders > 0 ? Math.round((confirmedOrders / totalOrders) * 100) : 0,
        averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / Math.max(1, totalOrders - orders.filter((o) => o.status === 'ملغي').length)) : 0,
        wilayaCounts,
      },
    });
  });

  // Vite middleware for development vs static in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
