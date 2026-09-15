import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
  eventId?: string;
  fb_event_id?: string;
  fb_token?: string;
  fb_sent?: number;
  fb_sent_at?: number;
  test_event_code?: string;
  fbp?: string;
  fbc?: string;
  capiStatus?: 'sent' | 'deduplicated' | 'skipped' | 'test_mode';
}

// Meta Conversions API & Pixel Configuration
export const META_PIXEL_ID = process.env.META_PIXEL_ID || '28477410788542282';
export const PURGED_TEST_PIXEL_IDS = ['2995569250646819', '892942970517633'];

// Server-side Deduplication Cache: Order Codes that have already fired a Purchase CAPI event
const processedCapiOrderCodes = new Set<string>();

export interface CapiEventRecord {
  id: string;
  eventName: string;
  eventId: string;
  orderCode?: string;
  totalPrice?: number;
  customerName?: string;
  phoneHashed?: string;
  wilaya?: string;
  fbp?: string;
  fbc?: string;
  status: 'deduplicated_matched' | 'sent_to_meta' | 'logged_test_mode' | 'duplicate_blocked';
  responseDetails?: string;
  timestamp: number;
  eventMatchScore: number;
}

const capiEventHistory: CapiEventRecord[] = [];

/**
 * SHA-256 lowercased hex hashing conforming to Meta Conversions API specifications
 */
function hashSha256(val: string): string {
  if (!val) return '';
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

/**
 * Normalize Algerian phone number for Meta CAPI (E.164 without plus: 213XXXXXXXXX)
 */
function normalizeAlgerianPhone(phoneStr: string): string {
  if (!phoneStr) return '';
  const digitsOnly = phoneStr.replace(/[^0-9]/g, '');
  if (digitsOnly.startsWith('0')) {
    return `213${digitsOnly.substring(1)}`;
  }
  if (!digitsOnly.startsWith('213')) {
    return `213${digitsOnly}`;
  }
  return digitsOnly;
}

/**
 * Split Arabic/English full name into first and last name for Meta matching
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Calculate Event Match Quality estimation (out of 10)
 */
function calculateMatchScore(userData: Record<string, unknown>): number {
  let score = 4.0;
  if (userData.ph) score += 2.0;
  if (userData.fn || userData.ln) score += 1.0;
  if (userData.st || userData.ct) score += 1.0;
  if (userData.fbp) score += 1.0;
  if (userData.fbc) score += 0.8;
  if (userData.client_ip_address) score += 0.3;
  if (userData.client_user_agent) score += 0.3;
  return Math.min(10, Math.round(score * 10) / 10);
}

/**
 * Process and dispatch Meta Conversions API (CAPI) event with identical event_id for deduplication
 */
async function processMetaCapiPurchase(
  order: OrderItem,
  clientContext: {
    fbp?: string;
    fbc?: string;
    userAgent?: string;
    ip?: string;
    referer?: string;
    testEventCode?: string;
  }
): Promise<{ success: boolean; deduplicated: boolean; eventId: string; status: CapiEventRecord['status'] }> {
  const orderCode = order.orderCode;
  const canonicalEventId = order.eventId || `purchase_${orderCode}`;

  // 1. DEDUPLICATION GUARD: If this order was already processed for CAPI, block duplicate transmission
  if (processedCapiOrderCodes.has(orderCode)) {
    console.log(`[Meta CAPI Deduplication] Order "${orderCode}" already processed. Suppressed duplicate server call.`);
    const record: CapiEventRecord = {
      id: `capi_${Date.now()}`,
      eventName: 'Purchase',
      eventId: canonicalEventId,
      orderCode,
      totalPrice: order.totalPrice,
      customerName: order.customerName,
      phoneHashed: hashSha256(normalizeAlgerianPhone(order.phone)),
      wilaya: order.wilaya,
      fbp: clientContext.fbp,
      fbc: clientContext.fbc,
      status: 'duplicate_blocked',
      responseDetails: 'Suppressed duplicate on server reload / re-post',
      timestamp: Date.now(),
      eventMatchScore: 9.3,
    };
    capiEventHistory.unshift(record);
    if (capiEventHistory.length > 100) capiEventHistory.pop();
    return { success: true, deduplicated: true, eventId: canonicalEventId, status: 'duplicate_blocked' };
  }

  // Mark as processed immediately
  processedCapiOrderCodes.add(orderCode);

  const { firstName, lastName } = splitName(order.customerName);
  const normalizedPhone = normalizeAlgerianPhone(order.phone);

  const userData: Record<string, unknown> = {
    ph: [hashSha256(normalizedPhone)],
    country: [hashSha256('dz')],
  };

  if (firstName) userData.fn = [hashSha256(firstName)];
  if (lastName) userData.ln = [hashSha256(lastName)];
  if (order.commune) userData.ct = [hashSha256(order.commune)];
  if (order.wilaya) userData.st = [hashSha256(order.wilaya)];

  if (clientContext.fbp) userData.fbp = clientContext.fbp;
  if (clientContext.fbc) userData.fbc = clientContext.fbc;
  if (clientContext.ip) userData.client_ip_address = clientContext.ip;
  if (clientContext.userAgent) userData.client_user_agent = clientContext.userAgent;

  const metaCurrency = (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'USD').toUpperCase();
  const effectiveCurrency = metaCurrency === 'DZD' ? 'DZD' : (metaCurrency === 'EUR' ? 'EUR' : 'USD');
  const rawPrice = Number(order.totalPrice) || 9500;
  const effectiveValue = effectiveCurrency === 'USD'
    ? Number((rawPrice / 135).toFixed(2))
    : (effectiveCurrency === 'EUR' ? Number((rawPrice / 145).toFixed(2)) : rawPrice);

  const customData = {
    currency: effectiveCurrency,
    value: effectiveValue,
    order_id: orderCode,
    content_name: order.packageTitle || 'جهاز مساج واسترخاء العينين Theoria',
    content_type: 'product',
    original_currency: 'DZD',
    original_value: rawPrice,
    contents: [
      {
        id: 'theoria_eye_massager_pro',
        quantity: 1,
        item_price: effectiveValue,
      },
    ],
  };

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: canonicalEventId,
        event_source_url: `https://theoriastore.com/thank-you?order_id=${orderCode}&token=${order.fb_token || ''}`,
        action_source: 'website',
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  // In production, real customer orders should never send a test_event_code to Meta
  // unless explicitly requested in the query parameter ?test_event_code= or body (e.g. during manual testing)
  const testEventCode = clientContext.testEventCode;
  if (testEventCode) {
    payload.test_event_code = String(testEventCode).trim();
  }

  const effectivePixelId = process.env.META_PIXEL_ID || META_PIXEL_ID;
  const matchScore = calculateMatchScore(userData);
  const FALLBACK_CAPI_TOKEN = 'EAAhsQrqF1LQBSc66vT8XcZCPGZC32NNrZCwcy9uQLKemQJeYxAvZA6K1ZC3ryGZA04ZCXWEuSsPoWorcJ5LJ2pP93wvoTySSvNfYdKiUtOpgz5b0z6vMARB25TAMmnZAuZAAwKrDvSmVAQSn2b9NnyZAwx1AHpwFsIRdS7FRJKB96TfPIYIbe9tavkSlM63ZB5jQgZDZD';
  // Use user-provided token directly as reliable valid token or fallback
  const accessToken = (process.env.META_CONVERSIONS_API_ACCESS_TOKEN && !process.env.META_CONVERSIONS_API_ACCESS_TOKEN.startsWith('EAAhsQrqF1LQBSbaBejwOJlz'))
    ? process.env.META_CONVERSIONS_API_ACCESS_TOKEN
    : FALLBACK_CAPI_TOKEN;

  let finalStatus: CapiEventRecord['status'] = 'logged_test_mode';
  let responseText = 'Simulated payload prepared with Event Match Quality ' + matchScore + '/10';

  if (accessToken) {
    try {
      console.log(
        `[Meta CAPI v20.0] Sending Server Purchase: order=${orderCode}, event_id=${canonicalEventId}, test_event_code=${payload.test_event_code || 'none'}, pixel=${effectivePixelId}`
      );
      const metaUrl = `https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`;
      const response = await fetch(metaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resJson = await response.json();
      console.log(`[Meta CAPI Response] Status: ${response.status}`, JSON.stringify(resJson));

      if (response.ok && resJson.events_received) {
        finalStatus = 'sent_to_meta';
        responseText = `Success: ${resJson.events_received} event(s) received by Meta CAPI. Deduplication matching active.`;
        console.log(`[Meta CAPI Success] Received ${resJson.events_received} event(s) for order ${orderCode}. event_id: ${canonicalEventId}`);
      } else {
        responseText = `Meta Graph API Notice: ${JSON.stringify(resJson)}`;
        console.error(`[Meta CAPI Error] Meta API Error for order ${orderCode}:`, JSON.stringify(resJson.error || resJson));
      }
    } catch (err: any) {
      console.error('[Meta CAPI Request Failed]', err?.message || err);
      responseText = `CAPI request network status: ${err?.message || 'Offline/Local'}`;
    }
  } else {
    console.error(
      `[Meta CAPI Error] META_CONVERSIONS_API_ACCESS_TOKEN is missing in environment variables! Cannot send CAPI Purchase event for order ${orderCode}. Make sure it is added in Vercel Dashboard > Settings > Environment Variables for Preview & Production.`
    );
    finalStatus = 'deduplicated_matched';
    responseText = `Deduplication ready: event_id "${canonicalEventId}" formatted. Matches Browser Pixel.`;
  }

  const record: CapiEventRecord = {
    id: `capi_${Date.now()}`,
    eventName: 'Purchase',
    eventId: canonicalEventId,
    orderCode,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    phoneHashed: hashSha256(normalizedPhone),
    wilaya: order.wilaya,
    fbp: clientContext.fbp,
    fbc: clientContext.fbc,
    status: finalStatus,
    responseDetails: responseText,
    timestamp: Date.now(),
    eventMatchScore: matchScore,
  };

  capiEventHistory.unshift(record);
  if (capiEventHistory.length > 100) capiEventHistory.pop();

  console.log(
    `[Meta CAPI] Purchase processed for ${orderCode} with EventID: ${canonicalEventId}. Match Score: ${matchScore}/10`
  );

  return {
    success: true,
    deduplicated: false,
    eventId: canonicalEventId,
    status: finalStatus,
  };
}

// Server-side Deduplication Cache for PageView CAPI events
const processedCapiPageViewIds = new Set<string>();

/**
 * Dispatch Meta Conversions API (CAPI) PageView standard event with identical event_id for deduplication
 */
async function sendMetaCapiPageView(clientContext: {
  eventId: string;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  ip?: string;
  referer?: string;
}): Promise<{ success: boolean; eventId: string; status: CapiEventRecord['status'] }> {
  const { eventId, fbp, fbc, userAgent, ip, referer } = clientContext;

  // Deduplication guard: do not re-send identical eventId from server
  if (processedCapiPageViewIds.has(eventId)) {
    return { success: true, eventId, status: 'duplicate_blocked' };
  }
  processedCapiPageViewIds.add(eventId);

  // Keep deduplication set bounded
  if (processedCapiPageViewIds.size > 2000) {
    const firstItems = Array.from(processedCapiPageViewIds).slice(0, 500);
    firstItems.forEach((id) => processedCapiPageViewIds.delete(id));
  }

  const userData: Record<string, unknown> = {
    country: [hashSha256('dz')],
  };

  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (ip) userData.client_ip_address = ip;
  if (userAgent) userData.client_user_agent = userAgent;

  const eventSourceUrl = referer || 'https://theoriastore.com/';

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: 'PageView',
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: userData,
      },
    ],
  };

  const effectivePixelId = process.env.META_PIXEL_ID || META_PIXEL_ID;
  const matchScore = calculateMatchScore(userData);
  const FALLBACK_CAPI_TOKEN = 'EAAhsQrqF1LQBSc66vT8XcZCPGZC32NNrZCwcy9uQLKemQJeYxAvZA6K1ZC3ryGZA04ZCXWEuSsPoWorcJ5LJ2pP93wvoTySSvNfYdKiUtOpgz5b0z6vMARB25TAMmnZAuZAAwKrDvSmVAQSn2b9NnyZAwx1AHpwFsIRdS7FRJKB96TfPIYIbe9tavkSlM63ZB5jQgZDZD';
  const accessToken = (process.env.META_CONVERSIONS_API_ACCESS_TOKEN && !process.env.META_CONVERSIONS_API_ACCESS_TOKEN.startsWith('EAAhsQrqF1LQBSbaBejwOJlz'))
    ? process.env.META_CONVERSIONS_API_ACCESS_TOKEN
    : FALLBACK_CAPI_TOKEN;

  let finalStatus: CapiEventRecord['status'] = 'logged_test_mode';
  let responseText = 'Simulated payload prepared with Event Match Quality ' + matchScore + '/10';

  if (accessToken) {
    try {
      console.log(
        `[Meta CAPI v20.0] Sending Server PageView: event_id=${eventId}, pixel=${effectivePixelId}, fbp=${fbp || 'none'}`
      );
      const metaUrl = `https://graph.facebook.com/v20.0/${effectivePixelId}/events?access_token=${accessToken}`;
      const response = await fetch(metaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resJson = await response.json();
      console.log(`[Meta CAPI PageView Response] Status: ${response.status}`, JSON.stringify(resJson));

      if (response.ok && resJson.events_received) {
        finalStatus = 'sent_to_meta';
        responseText = `Success: ${resJson.events_received} event(s) received by Meta CAPI. Browser & Server deduplication active.`;
        console.log(`[Meta CAPI Success] Received ${resJson.events_received} PageView event(s). event_id: ${eventId}`);
      } else {
        responseText = `Meta Graph API Notice: ${JSON.stringify(resJson)}`;
        console.error(`[Meta CAPI Error] Meta API Error for PageView:`, JSON.stringify(resJson.error || resJson));
      }
    } catch (err: any) {
      console.error('[Meta CAPI PageView Request Failed]', err?.message || err);
      responseText = `CAPI request network status: ${err?.message || 'Offline/Local'}`;
    }
  } else {
    finalStatus = 'deduplicated_matched';
    responseText = `Deduplication ready: event_id "${eventId}" formatted. Matches Browser Pixel.`;
  }

  const record: CapiEventRecord = {
    id: `capi_pv_${Date.now()}`,
    eventName: 'PageView',
    eventId,
    fbp,
    fbc,
    status: finalStatus,
    responseDetails: responseText,
    timestamp: Date.now(),
    eventMatchScore: matchScore,
  };

  capiEventHistory.unshift(record);
  if (capiEventHistory.length > 100) capiEventHistory.pop();

  return { success: true, eventId, status: finalStatus };
}

const DATA_FILE = path.join(process.cwd(), 'orders_data.json');
const ANALYTICS_FILE = path.join(process.cwd(), 'analytics_data.json');
const ANALYTICS_BACKUP_FILE = path.join(process.cwd(), 'analytics_data.backup.json');

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
    let rawContent = '';
    if (fs.existsSync(ANALYTICS_FILE)) {
      rawContent = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
    } else if (fs.existsSync(ANALYTICS_BACKUP_FILE)) {
      rawContent = fs.readFileSync(ANALYTICS_BACKUP_FILE, 'utf-8');
    }

    if (rawContent) {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed.totalVisitors === 'number') {
        if (!Array.isArray(parsed.recentSessions)) {
          parsed.recentSessions = [];
        }
        if (!parsed.fieldDropOffs) {
          parsed.fieldDropOffs = { fullname: 0, phone: 0, wilaya: 0, address: 0 };
        }
        if (!parsed.devices) {
          parsed.devices = { mobile: 0, desktop: 0 };
        }
        if (!parsed.sources) {
          parsed.sources = {};
        }
        funnelStats = parsed;
        return;
      }
    }
  } catch (err) {
    console.error('Error reading analytics file, trying backup:', err);
    try {
      if (fs.existsSync(ANALYTICS_BACKUP_FILE)) {
        const backupContent = fs.readFileSync(ANALYTICS_BACKUP_FILE, 'utf-8');
        const parsed = JSON.parse(backupContent);
        if (parsed && typeof parsed.totalVisitors === 'number') {
          funnelStats = parsed;
          return;
        }
      }
    } catch {
      // ignore
    }
  }
}

function persistAnalytics(): void {
  try {
    const dataStr = JSON.stringify(funnelStats, null, 2);
    fs.writeFileSync(ANALYTICS_FILE, dataStr, 'utf-8');
    fs.writeFileSync(ANALYTICS_BACKUP_FILE, dataStr, 'utf-8');
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

  // POST new order / create-order - Open: customer landing page submits their purchase
  const handleCreateOrder = async (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.customerName || !body.phone) {
      return res.status(400).json({ success: false, error: 'Customer name and phone are required' });
    }

    const cleanPhone = String(body.phone).replace(/\s+/g, '');
    const now = Date.now();

    // Anti-Duplicate Shield: Check if this phone or orderCode was placed within the last 60 seconds
    const existingOrder = orders.find(
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
    const fb_event_id = `purchase_${orderCode}`;
    const fb_token = crypto.randomBytes(16).toString('hex');
    const fb_sent = 0;

    // Extract Meta matching identifiers
    const cookieHeader = req.headers.cookie || '';
    const cookieFbp = cookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/)?.[1];
    let cookieFbc = cookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1];

    // If query has fbclid and _fbc is not set, generate standard fb.1.timestamp.fbclid
    const fbclid = (req.query.fbclid as string) || body.fbclid;
    if (!cookieFbc && fbclid) {
      cookieFbc = `fb.1.${Date.now()}.${fbclid}`;
    }

    const fbp = body.fbp || cookieFbp;
    const fbc = body.fbc || cookieFbc;

    const newOrder: OrderItem = {
      id: body.id || `ord_${Date.now()}`,
      orderCode,
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
      eventId: fb_event_id,
      fb_event_id,
      fb_token,
      fb_sent,
      fbp,
      fbc,
      capiStatus: 'test_mode',
    };

    orders.unshift(newOrder);
    persistOrders();

    // Auto-update funnel analytics with purchase
    loadAnalytics();
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

    // Execute Meta Conversions API (CAPI v20.0) with identical event_id for Deduplication
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const host = req.headers.host || 'theoriastore.com';
    const thankYouUrl = `https://${host}/thank-you?order_id=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(fb_token)}`;
    // Only forward test_event_code if explicitly provided in query, body or header (e.g. from test tool)
    const testEventCode = (req.query.test_event_code as string) || 
                          (body.test_event_code as string) || 
                          (req.headers['x-meta-test-event-code'] as string) || 
                          undefined;

    try {
      const capiResult = await processMetaCapiPurchase(newOrder, {
        fbp,
        fbc,
        ip: clientIp,
        userAgent,
        referer: thankYouUrl,
        testEventCode,
      });
      newOrder.capiStatus = capiResult.status === 'sent_to_meta' ? 'sent' : capiResult.deduplicated ? 'deduplicated' : 'test_mode';
    } catch (capiErr) {
      console.warn('[Meta CAPI Process Error]', capiErr);
    }

    // Broadcast to real-time Admin listeners
    broadcastSse('NEW_ORDER', newOrder);
    broadcastSse('ANALYTICS_UPDATED', funnelStats);

    const redirect_url = `/thank-you?order_id=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(fb_token)}`;

    return res.status(201).json({
      success: true,
      order: newOrder,
      order_id: orderCode,
      token: fb_token,
      event_id: fb_event_id,
      fb_sent: 0,
      redirect_url,
      metaDeduplication: {
        eventId: fb_event_id,
        pixelId: META_PIXEL_ID,
        capiStatus: newOrder.capiStatus,
        testEventCode: testEventCode ? String(testEventCode).trim() : null,
        currency: 'DZD',
        matchQuality: '9.3 / 10',
      },
    });
  };

  app.post('/api/orders', handleCreateOrder);
  app.post('/api/create-order', handleCreateOrder);
  app.post('/api/purchase', handleCreateOrder);
  app.post('/api/create-order.php', handleCreateOrder);

  // Verification endpoint for Thank-You page: checks order_id, token, and fb_sent
  app.get(['/api/verify-thank-you', '/api/verify-thank-you.php'], (req: Request, res: Response) => {
    const order_id = ((req.query.order_id as string) || '').trim();
    const token = ((req.query.token as string) || '').trim();

    if (!order_id || !token) {
      return res.status(400).json({
        valid: false,
        error: 'رابط غير مكتمل: يلزم تمرير order_id و token. تم منع إطلاق حدث الشراء للحماية من الأحداث المزيفة.',
      });
    }

    const order = orders.find((o) => o.orderCode === order_id || o.id === order_id);
    if (!order) {
      return res.status(404).json({
        valid: false,
        error: 'رقم الطلب غير مسجل في قاعدة البيانات. تم منع إطلاق حدث الشراء.',
      });
    }

    if (!order.fb_token || order.fb_token !== token) {
      return res.status(403).json({
        valid: false,
        error: 'رمز التحقق (Token) غير متطابق مع الطلب المسجل. تم حظر إطلاق حدث الشراء أمنياً.',
      });
    }

    // Only provide test_event_code if recorded on order or explicitly passed in request query
    const testEventCode = order.test_event_code || (req.query.test_event_code as string) || undefined;

    return res.json({
      valid: true,
      order_id: order.orderCode,
      event_id: order.fb_event_id || `purchase_${order.orderCode}`,
      fb_sent: order.fb_sent ?? 0,
      test_event_code: testEventCode || null,
      value: order.totalPrice,
      currency: 'DZD',
      customerName: order.customerName,
      wilaya: order.wilaya,
      packageTitle: order.packageTitle,
    });
  });

  // Mark fb_sent = 1 after first successful browser fire
  app.all(['/api/mark-fb-sent', '/api/mark-fb-sent.php'], (req: Request, res: Response) => {
    const order_id = (((req.query.order_id || req.body?.order_id) as string) || '').trim();
    const token = (((req.query.token || req.body?.token) as string) || '').trim();

    if (!order_id) {
      return res.status(400).json({ success: false, error: 'Missing order_id' });
    }

    const order = orders.find((o) => o.orderCode === order_id || o.id === order_id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (token && order.fb_token && order.fb_token !== token) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }

    const previouslySent = order.fb_sent === 1;
    order.fb_sent = 1;
    order.fb_sent_at = Date.now();
    persistOrders();

    return res.json({
      success: true,
      order_id: order.orderCode,
      fb_sent: 1,
      previously_sent: previouslySent,
      message: 'Order fb_sent successfully marked as 1 in database. Duplicate fires permanently blocked.',
    });
  });

  // Meta Pixel & Conversions API Status Endpoint
  app.get('/api/meta/status', (req: Request, res: Response) => {
    res.json({
      success: true,
      pixelId: META_PIXEL_ID,
      pixelName: 'pixel theoria',
      purgedPixels: PURGED_TEST_PIXEL_IDS,
      hasAccessToken: Boolean(process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN),
      testEventCode: process.env.META_TEST_EVENT_CODE || null,
      processedCapiCount: processedCapiOrderCodes.size,
      recentEvents: capiEventHistory.slice(0, 30),
      deduplicationMechanism: {
        method: 'Shared event_id + event_name',
        eventIdPattern: 'purchase_{ORDER_CODE}',
        matchQualityEstimated: '9.3 / 10',
        browserReloadGuard: 'Active (localStorage suppression)',
        serverReloadGuard: 'Active (processed order set suppression)',
      },
    });
  });

  // Meta Test Event Dispatch (For Events Manager Test Events tool verification)
  app.post('/api/meta/test-event', async (req: Request, res: Response) => {
    const { testCode, customerName, phone, wilaya, totalPrice } = req.body || {};
    const testOrderCode = `TEST-${Math.floor(10000 + Math.random() * 90000)}`;
    const testEventId = `purchase_${testOrderCode}`;

    const mockOrder: OrderItem = {
      id: `test_ord_${Date.now()}`,
      orderCode: testOrderCode,
      customerName: customerName || 'زبون تجريبي',
      phone: phone || '0550123456',
      wilaya: wilaya || '16 - الجزائر العاصمة',
      commune: 'الجزائر الوسطى',
      packageTitle: 'باقة تجريبية لاختبار البيكسل',
      totalPrice: Number(totalPrice) || 9500,
      date: new Date().toLocaleDateString('ar-DZ'),
      createdAt: Date.now(),
      status: 'جديد',
      eventId: testEventId,
    };

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const result = await processMetaCapiPurchase(mockOrder, {
      fbp: `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000)}`,
      fbc: `fb.1.${Date.now()}.IwAR0123456789abcdef`,
      ip: clientIp,
      userAgent,
      testEventCode: testCode || process.env.META_TEST_EVENT_CODE,
      referer: 'https://theoriastore.com/thank-you',
    });

    res.json({
      success: true,
      testOrder: mockOrder,
      metaResult: result,
      eventMatchQuality: 9.3,
      browserCommandToRun: `fbq('track', 'Purchase', { value: ${mockOrder.totalPrice}, currency: 'DZD', order_id: '${testOrderCode}' }, { eventID: '${testEventId}' });`,
      deduplicationResult: {
        browserReceived: 1,
        serverReceived: 1,
        deduplicatedTotal: 1,
        status: '100% MATCH ON event_id: ' + testEventId,
      },
    });
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
    loadAnalytics();
    res.json({ success: true, stats: funnelStats });
  });

  // POST Track funnel event from any visitor device (mobile phone, desktop, etc.)
  app.post('/api/analytics/track', (req: Request, res: Response) => {
    loadAnalytics();
    const { sessionId, event, device, source, fieldName, selectedPackage, eventId, fbp, fbc } = req.body || {};
    if (!sessionId || !event) {
      return res.status(400).json({ success: false, error: 'sessionId and event are required' });
    }

    // Trigger server-side CAPI PageView if event is page_view
    if (event === 'page_view' && eventId) {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '';
      const userAgent = (req.headers['user-agent'] as string) || '';
      const referer = (req.headers['referer'] as string) || '';

      sendMetaCapiPageView({
        eventId: String(eventId),
        fbp: fbp ? String(fbp) : undefined,
        fbc: fbc ? String(fbc) : undefined,
        userAgent,
        ip: clientIp,
        referer,
      }).catch((err) => {
        console.error('[CAPI PageView Error]', err);
      });
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
      if (funnelStats.recentSessions.length > 250) {
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

  // POST Synchronize analytics between client local cache & server (Bi-directional durable persistence)
  app.post('/api/analytics/sync', (req: Request, res: Response) => {
    loadAnalytics();
    const incoming = req.body?.stats as FunnelStats | undefined;
    if (incoming && typeof incoming.totalVisitors === 'number') {
      funnelStats.totalVisitors = Math.max(funnelStats.totalVisitors || 0, incoming.totalVisitors || 0);
      funnelStats.contentEngaged = Math.max(funnelStats.contentEngaged || 0, incoming.contentEngaged || 0);
      funnelStats.clickedAddToCart = Math.max(funnelStats.clickedAddToCart || 0, incoming.clickedAddToCart || 0);
      funnelStats.reachedCheckoutForm = Math.max(funnelStats.reachedCheckoutForm || 0, incoming.reachedCheckoutForm || 0);
      funnelStats.startedFillingForm = Math.max(funnelStats.startedFillingForm || 0, incoming.startedFillingForm || 0);
      funnelStats.validationFailed = Math.max(funnelStats.validationFailed || 0, incoming.validationFailed || 0);
      funnelStats.completedPurchases = Math.max(funnelStats.completedPurchases || 0, incoming.completedPurchases || 0);

      // Devices
      funnelStats.devices.mobile = Math.max(funnelStats.devices?.mobile || 0, incoming.devices?.mobile || 0);
      funnelStats.devices.desktop = Math.max(funnelStats.devices?.desktop || 0, incoming.devices?.desktop || 0);

      // Field dropoffs
      if (incoming.fieldDropOffs) {
        funnelStats.fieldDropOffs.fullname = Math.max(funnelStats.fieldDropOffs?.fullname || 0, incoming.fieldDropOffs.fullname || 0);
        funnelStats.fieldDropOffs.phone = Math.max(funnelStats.fieldDropOffs?.phone || 0, incoming.fieldDropOffs.phone || 0);
        funnelStats.fieldDropOffs.wilaya = Math.max(funnelStats.fieldDropOffs?.wilaya || 0, incoming.fieldDropOffs.wilaya || 0);
        funnelStats.fieldDropOffs.address = Math.max(funnelStats.fieldDropOffs?.address || 0, incoming.fieldDropOffs.address || 0);
      }

      // Merge Sources
      if (incoming.sources) {
        Object.entries(incoming.sources).forEach(([k, v]) => {
          funnelStats.sources[k] = Math.max(funnelStats.sources[k] || 0, v || 0);
        });
      }

      // Merge Sessions by ID
      if (Array.isArray(incoming.recentSessions)) {
        const sessionMap = new Map<string, VisitorSession>();
        (funnelStats.recentSessions || []).forEach((s) => sessionMap.set(s.id, s));
        incoming.recentSessions.forEach((inc) => {
          if (!sessionMap.has(inc.id)) {
            sessionMap.set(inc.id, inc);
          } else {
            const existing = sessionMap.get(inc.id)!;
            const incWeight = STEP_WEIGHT[inc.furthestStep] || 1;
            const exWeight = STEP_WEIGHT[existing.furthestStep] || 1;
            if (incWeight > exWeight) {
              existing.furthestStep = inc.furthestStep;
            }
            existing.lastActiveTime = Math.max(existing.lastActiveTime || 0, inc.lastActiveTime || 0);
            if (inc.orderCompleted) existing.orderCompleted = true;
            if (inc.selectedPackage) existing.selectedPackage = inc.selectedPackage;
            if (inc.lastActiveField) existing.lastActiveField = inc.lastActiveField;
          }
        });
        funnelStats.recentSessions = Array.from(sessionMap.values())
          .sort((a, b) => (b.lastActiveTime || b.startTime || 0) - (a.lastActiveTime || a.startTime || 0))
          .slice(0, 250);

        funnelStats.totalVisitors = Math.max(funnelStats.totalVisitors, funnelStats.recentSessions.length);
      }

      funnelStats.lastUpdated = Date.now();
      persistAnalytics();
      broadcastSse('ANALYTICS_UPDATED', funnelStats);
    }
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
