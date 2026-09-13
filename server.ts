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
const ANALYTICS_FILE = path.join(process.cwd(), 'analytics_data.json');

// Real customer orders only (no fake demo orders)
const INITIAL_ORDERS: OrderItem[] = [];

let orders: OrderItem[] = [];

interface VisitorSession {
  id: string;
  startTime: number;
  lastActiveTime: number;
  source: string;
  device: 'هاتف محمول' | 'كمبيوتر';
  furthestStep: string;
  lastActiveField?: 'fullname' | 'phone' | 'wilaya' | 'address';
  validationErrorsCount: number;
  selectedPackage?: string;
  orderCompleted?: boolean;
}

interface FunnelStats {
  totalVisitors: number;
  contentEngaged: number;
  clickedAddToCart: number;
  reachedCheckoutForm: number;
  startedFillingForm: number;
  validationFailed: number;
  completedPurchases: number;
  fieldDropOffs: {
    fullname: number;
    phone: number;
    wilaya: number;
    address: number;
  };
  devices: {
    mobile: number;
    desktop: number;
  };
  sources: Record<string, number>;
  lastUpdated: number;
  recentSessions: VisitorSession[];
}

function getInitialAnalytics(): FunnelStats {
  return {
    totalVisitors: 0,
    contentEngaged: 0,
    clickedAddToCart: 0,
    reachedCheckoutForm: 0,
    startedFillingForm: 0,
    validationFailed: 0,
    completedPurchases: 0,
    fieldDropOffs: { fullname: 0, phone: 0, wilaya: 0, address: 0 },
    devices: { mobile: 0, desktop: 0 },
    sources: {},
    lastUpdated: Date.now(),
    recentSessions: [],
  };
}

let funnelStats: FunnelStats = getInitialAnalytics();

function loadAnalytics(): void {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      const content = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.totalVisitors === 'number') {
        funnelStats = parsed;
        return;
      }
    }
    funnelStats = getInitialAnalytics();
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(funnelStats, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error reading analytics file:', err);
    funnelStats = getInitialAnalytics();
  }
}

function persistAnalytics(): void {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(funnelStats, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving analytics file:', err);
  }
}

loadAnalytics();

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

  // Admin passwords & session validation
  const VALID_ADMIN_PASSWORDS = ['theoria2026', 'IMAD34', 'imad34', 'admin2026'];
  if (process.env.ADMIN_SECRET_KEY) {
    VALID_ADMIN_PASSWORDS.push(process.env.ADMIN_SECRET_KEY);
  }

  function isValidAdminToken(token: string | undefined | null): boolean {
    if (!token) return false;
    const clean = token.trim();
    if (VALID_ADMIN_PASSWORDS.includes(clean)) return true;
    if (clean.startsWith('admin_token_')) return true;
    return false;
  }

  // Admin authentication middleware helper
  function checkAdminAuth(req: Request, res: Response, next: () => void) {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;
    const provided = (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '') || queryToken;

    if (isValidAdminToken(provided)) {
      return next();
    }
    return res.status(401).json({ success: false, error: 'غير مصرح لك. يرجى تسجيل الدخول مجدداً.' });
  }

  // Favicon handler
  app.get('/favicon.ico', (req: Request, res: Response) => {
    res.status(204).end();
  });

  // Admin login endpoint
  app.post('/api/admin/login', (req: Request, res: Response) => {
    const { password } = req.body;
    const clean = (password || '').toString().trim();
    if (VALID_ADMIN_PASSWORDS.includes(clean)) {
      const sessionToken = `admin_token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return res.json({ success: true, token: sessionToken });
    }
    return res.status(401).json({ success: false, error: 'كلمة مرور لوحة الإدارة غير صحيحة' });
  });

  // Admin verify session endpoint
  app.get('/api/admin/verify', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;
    const provided = (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '') || queryToken;
    if (isValidAdminToken(provided)) {
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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const token = req.query.token as string;
    if (!isValidAdminToken(token)) {
      res.write(`data: ${JSON.stringify({ type: 'UNAUTHORIZED', error: 'Authentication required' })}\n\n`);
      return res.end();
    }

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

    // Auto-update funnel analytics with purchase
    funnelStats.completedPurchases = (funnelStats.completedPurchases || 0) + 1;
    if (body.sessionId) {
      const matchSession = funnelStats.recentSessions.find((s) => s.id === body.sessionId);
      if (matchSession) {
        matchSession.furthestStep = 'purchase';
        matchSession.orderCompleted = true;
      }
    }
    funnelStats.lastUpdated = Date.now();
    persistAnalytics();

    // Broadcast to real-time Admin listeners
    broadcastSse('NEW_ORDER', newOrder);
    broadcastSse('ANALYTICS_UPDATED', funnelStats);

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

  const STEP_WEIGHT: Record<string, number> = {
    page_view: 1,
    content_engaged: 2,
    add_to_cart: 3,
    initiate_checkout: 4,
    form_started: 5,
    validation_failed: 5,
    purchase: 6,
  };

  // GET Funnel Analytics - Open for Admin Dashboard
  app.get('/api/analytics', (req: Request, res: Response) => {
    res.json({ success: true, stats: funnelStats });
  });

  // POST Track funnel event from any visitor device (mobile phone, desktop, etc.)
  app.post('/api/analytics/track', (req: Request, res: Response) => {
    const { sessionId, event, device, source, fieldName, selectedPackage } = req.body || {};
    if (!sessionId || !event) {
      return res.status(400).json({ success: false, error: 'sessionId and event are required' });
    }

    const now = Date.now();
    funnelStats.lastUpdated = now;

    let session = funnelStats.recentSessions.find((s) => s.id === sessionId);
    if (!session) {
      session = {
        id: sessionId,
        startTime: now,
        lastActiveTime: now,
        source: source || 'زيارة مباشرة',
        device: device || 'هاتف محمول',
        furthestStep: 'page_view',
        validationErrorsCount: 0,
      };
      funnelStats.recentSessions.unshift(session);
      if (funnelStats.recentSessions.length > 80) {
        funnelStats.recentSessions.pop();
      }

      funnelStats.totalVisitors = (funnelStats.totalVisitors || 0) + 1;
      if (session.device === 'هاتف محمول') {
        funnelStats.devices.mobile = (funnelStats.devices.mobile || 0) + 1;
      } else {
        funnelStats.devices.desktop = (funnelStats.devices.desktop || 0) + 1;
      }

      const srcKey = session.source;
      funnelStats.sources[srcKey] = (funnelStats.sources[srcKey] || 0) + 1;
    } else {
      session.lastActiveTime = now;
      if (device && !session.device) session.device = device;
      if (source && session.source === 'زيارة مباشرة') session.source = source;
    }

    if (selectedPackage) {
      session.selectedPackage = selectedPackage;
    }

    const currWeight = STEP_WEIGHT[session.furthestStep] || 1;
    const newWeight = STEP_WEIGHT[event] || 1;

    if (newWeight > currWeight) {
      session.furthestStep = event;
      if (event === 'content_engaged') funnelStats.contentEngaged = (funnelStats.contentEngaged || 0) + 1;
      if (event === 'add_to_cart') funnelStats.clickedAddToCart = (funnelStats.clickedAddToCart || 0) + 1;
      if (event === 'initiate_checkout') funnelStats.reachedCheckoutForm = (funnelStats.reachedCheckoutForm || 0) + 1;
      if (event === 'form_started') funnelStats.startedFillingForm = (funnelStats.startedFillingForm || 0) + 1;
      if (event === 'purchase') {
        funnelStats.completedPurchases = (funnelStats.completedPurchases || 0) + 1;
        session.orderCompleted = true;
      }
    }

    if (fieldName) {
      session.lastActiveField = fieldName;
      if (funnelStats.fieldDropOffs[fieldName] !== undefined) {
        funnelStats.fieldDropOffs[fieldName] = (funnelStats.fieldDropOffs[fieldName] || 0) + 1;
      }
    }

    if (event === 'validation_failed') {
      session.validationErrorsCount = (session.validationErrorsCount || 0) + 1;
      funnelStats.validationFailed = (funnelStats.validationFailed || 0) + 1;
    }

    persistAnalytics();
    broadcastSse('ANALYTICS_UPDATED', funnelStats);

    return res.json({ success: true, stats: funnelStats });
  });

  // POST Clear funnel analytics
  app.post('/api/analytics/clear', checkAdminAuth, (req: Request, res: Response) => {
    funnelStats = getInitialAnalytics();
    persistAnalytics();
    broadcastSse('ANALYTICS_UPDATED', funnelStats);
    return res.json({ success: true, stats: funnelStats });
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
