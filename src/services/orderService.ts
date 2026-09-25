import { PlacedOrder, OrderStatus } from '../types';

// Lazy Firestore access — keeps `firebase/*` out of the initial storefront
// bundle. The SDK (+ connection warm-up) loads on first actual Firestore use
// (checkout submit, admin views), never on landing paint. All Firestore paths
// are best-effort mirrors; the server API is the source of truth.
type FirestoreDb = import('firebase/firestore').Firestore;
type FirestoreSdk = typeof import('firebase/firestore');
let firestoreLazy: Promise<{ db: FirestoreDb; fs: FirestoreSdk }> | null = null;
async function loadFirestoreLazy(): Promise<{ db: FirestoreDb; fs: FirestoreSdk }> {
  const [fb, fs] = await Promise.all([import('../lib/firebase'), import('firebase/firestore')]);
  // Deferred warm-up (previously ran on import): fire once, in background.
  void fb.testFirestoreConnection().catch(() => {});
  return { db: fb.db, fs };
}
function getFirestoreLazy(): Promise<{ db: FirestoreDb; fs: FirestoreSdk }> {
  if (!firestoreLazy) {
    firestoreLazy = loadFirestoreLazy().catch((err) => {
      firestoreLazy = null;
      throw err;
    });
  }
  return firestoreLazy;
}

const STORAGE_KEY = 'theoria_orders';
const OUTBOX_KEY = 'theoria_outbox_pending';
const BROADCAST_CHANNEL_NAME = 'theoria_orders_channel';
const ADMIN_TOKEN_KEY = 'theoria_admin_token';
const FIRESTORE_ORDERS_COLLECTION = 'orders';

/** Pending outbox: orders accepted locally but not yet confirmed by /api/orders. */
export function loadOutbox(): PlacedOrder[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((o) => o && o.orderCode);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveOutbox(list: PlacedOrder[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
  } catch {
    // ignore (quota)
  }
}

function upsertOutbox(order: PlacedOrder): void {
  const list = loadOutbox().filter((o) => o.orderCode !== order.orderCode && o.id !== order.id);
  list.unshift(order);
  saveOutbox(list.slice(0, 50));
}

function removeFromOutbox(orderCode: string, id?: string): void {
  saveOutbox(loadOutbox().filter((o) => o.orderCode !== orderCode && (!id || o.id !== id)));
}

export function getPendingOutboxCount(): number {
  try {
    return loadOutbox().length;
  } catch {
    return 0;
  }
}

function isFirestorePermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /permission-denied|Missing or insufficient permissions/i.test(msg);
}

async function postOrderWithRetry(
  url: string,
  payload: PlacedOrder,
  headers: Record<string, string>,
  attempts = 3
): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          keepalive: true,
          signal: ctrl.signal,
        });
        // 5xx / 429 are retryable; 4xx (except 408/429) are final.
        if (res.ok || res.status === 200 || res.status === 201) return res;
        if (res.status >= 500 || res.status === 429 || res.status === 408) {
          lastErr = new Error(`Server ${res.status}, retrying`);
        } else {
          return res;
        }
      } finally {
        window.clearTimeout(t);
      }
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) {
      await new Promise((r) => window.setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Network unavailable');
}

// In production, no mock/fake seed orders - only real incoming customer orders
const DEFAULT_SEED_ORDERS: PlacedOrder[] = [];

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string, remember = true): void {
  try {
    if (remember) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    }
  } catch {
    // ignore
  }
}

export function removeAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export interface OrdersApiDiagnostics {
  /** Result of the last GET /api/orders attempt made inside getOrders(). */
  apiStatus: 'ok' | 'unauthorized' | 'forbidden' | 'error' | 'skipped-no-token' | null;
  /** `source` field returned by the API (memory+firestore | memory | empty). */
  apiSource: string | null;
  /** `firestoreConfigured` flag returned by the API, when present. */
  firestoreConfigured: boolean | null;
}

let lastOrdersApiDiagnostics: OrdersApiDiagnostics = {
  apiStatus: null,
  apiSource: null,
  firestoreConfigured: null,
};

/** Read-only snapshot of the last server-API leg of getOrders() for dashboard banners. */
export function getLastOrdersApiStatus(): OrdersApiDiagnostics {
  return { ...lastOrdersApiDiagnostics };
}

export async function loginAdmin(password: string): Promise<boolean> {
  const cleanPassword = password.trim();
  if (!cleanPassword) return false;

  // API-only authentication: no hardcoded passwords, no client-minted tokens.
  // Fails closed when the backend is unreachable or unconfigured.
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cleanPassword }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.token) {
        setAdminToken(data.token, true);
        return true;
      }
    }
  } catch {
    // Backend API unavailable: deny (fail closed), never mint local tokens.
  }

  return false;
}

export async function verifyAdminSession(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;

  // Server-verified only. Any legacy self-minted token fails closed here.
  // A definitive server rejection purges the stale token so it 401s at most
  // once; network errors keep the token (backend may just be unreachable).
  try {
    const res = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.authenticated) return true;
      removeAdminToken();
      return false;
    }
    if (res.status === 401 || res.status === 403) {
      removeAdminToken();
    }
  } catch {
    // Backend unavailable: deny (fail closed), but keep the stored token.
  }

  return false;
}

// In-memory / broadcast channel for multi-tab realtime sync
let channel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch {
  // broadcast channel not available
}

/**
 * Play pleasant two-tone chime notification when a new order arrives
 */
export function playOrderNotificationSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.12);
    gain2.gain.setValueAtTime(0.35, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.8);
  } catch {
    // ignore
  }
}

/**
 * Read local storage safely
 */
export function getLocalOrders(): PlacedOrder[] {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        return parsed.filter((o) => o && o.id !== 'ord_1' && o.id !== 'ord_2' && o.id !== 'ord_3' && !o.notes?.includes('طلب تجريبي'));
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SEED_ORDERS;
}

/**
 * Clear all test / demo orders completely
 */
export async function clearAllOrders(): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    if (channel) {
      channel.postMessage({ type: 'ORDERS_CLEARED' });
    }
  } catch {
    // ignore
  }
}

/**
 * Fetch all orders — server API is the source of truth.
 * 1. GET /api/orders (supports ?since for incremental polling).
 * 2. Firestore direct read is best-effort only (rules deny reads; expected
 *    permission-denied is swallowed quietly).
 * 3. Local cache fills gaps offline and is reconciled with the outbox.
 */
export async function getOrders(since = 0): Promise<PlacedOrder[]> {
  const localOrders = getLocalOrders();
  const orderMap = new Map<string, PlacedOrder>();

  // Start with local cache (instant offline capability)
  localOrders.forEach((o) => {
    orderMap.set(o.id || o.orderCode, o);
  });

  // 1. Server API first (source of truth for the dashboard)
  try {
    const token = getAdminToken();
    if (!token) {
      lastOrdersApiDiagnostics = { apiStatus: 'skipped-no-token', apiSource: null, firestoreConfigured: null };
    } else {
      const headers: Record<string, string> = {};
      headers['Authorization'] = `Bearer ${token}`;

      const url = since > 0 ? `/api/orders?since=${encodeURIComponent(String(since))}&limit=100` : '/api/orders';
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          data.orders
            .filter((o: PlacedOrder) => o.id !== 'ord_1' && o.id !== 'ord_2' && o.id !== 'ord_3' && !o.notes?.includes('طلب تجريبي'))
            .forEach((o: PlacedOrder) => {
              const key = o.id || o.orderCode;
              if (!orderMap.has(key)) {
                orderMap.set(key, o);
              } else {
                const existing = orderMap.get(key)!;
                orderMap.set(key, { ...existing, ...o });
              }
            });
        }
        lastOrdersApiDiagnostics = {
          apiStatus: 'ok',
          apiSource: typeof data?.source === 'string' ? data.source : null,
          firestoreConfigured: typeof data?.firestoreConfigured === 'boolean' ? data.firestoreConfigured : null,
        };
      } else if (res.status === 401 || res.status === 403) {
        // Definitive rejection (e.g. secret rotated since login): purge the
        // stale token so the poller stops spamming 401s. The dashboard
        // reads getLastOrdersApiStatus() and prompts a fresh login.
        removeAdminToken();
        lastOrdersApiDiagnostics = {
          apiStatus: res.status === 401 ? 'unauthorized' : 'forbidden',
          apiSource: null,
          firestoreConfigured: null,
        };
      } else {
        lastOrdersApiDiagnostics = { apiStatus: 'error', apiSource: null, firestoreConfigured: null };
      }
    }
  } catch (serverErr) {
    // Network-level failure (backend unreachable): keep the stored token, but
    // record it so the dashboard can show a connectivity hint.
    if (lastOrdersApiDiagnostics.apiStatus !== 'unauthorized' && lastOrdersApiDiagnostics.apiStatus !== 'forbidden') {
      lastOrdersApiDiagnostics = { apiStatus: 'error', apiSource: null, firestoreConfigured: null };
    }
  }

  // 2. Firestore direct read — best-effort only. Production rules deny client
  // reads (server API is the gate), so permission-denied is expected and quiet.
  try {
    const { db, fs } = await getFirestoreLazy();
    const ordersCol = fs.collection(db, FIRESTORE_ORDERS_COLLECTION);
    const q = fs.query(ordersCol, fs.orderBy('createdAt', 'desc'));
    const snapshot = await fs.getDocs(q);

    if (!snapshot.empty) {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PlacedOrder;
        const finalOrder: PlacedOrder = {
          ...data,
          id: docSnap.id || data.id,
        };
        // Exclude old mock/test orders
        if (finalOrder.id !== 'ord_1' && finalOrder.id !== 'ord_2' && finalOrder.id !== 'ord_3' && !finalOrder.notes?.includes('طلب تجريبي')) {
          const key = finalOrder.id || finalOrder.orderCode;
          if (!orderMap.has(key)) orderMap.set(key, finalOrder);
        }
      });
    }
  } catch (firestoreError) {
    if (!isFirestorePermissionError(firestoreError)) {
      console.warn('Firestore fetch query warning:', firestoreError);
    }
  }

  const merged = Array.from(orderMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

/**
 * Submit a new customer order — zero-loss path:
 * 1. Build order with syncStatus=pending + persist to outbox FIRST.
 * 2. Best-effort Firestore create (rules allow create; failure is recorded, not fatal).
 * 3. POST /api/orders with retry (3 attempts, backoff). Server persists durably first.
 * 4. ONLY when the server confirms (2xx + order_id) → mark synced, remove from
 *    outbox, update local cache, return with serverConfirmed=true.
 * 5. On total failure → keep in outbox, return with serverConfirmed=false so the
 *    form shows an error and does NOT navigate to thank-you (no silent loss).
 */
export async function submitOrder(orderData: Partial<PlacedOrder>): Promise<PlacedOrder> {
  const cleanPhone = String(orderData.phone || '').replace(/\s+/g, '');

  const orderCode = orderData.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`;
  const initialToken = orderData.fb_token || (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2));
  const eventId = orderData.eventId || orderData.fb_event_id || `purchase_${orderCode}`;

  // Capture test_event_code only if explicitly provided in URL query parameters for Meta Events Manager testing
  let testEventCode: string | undefined = undefined;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('test_event_code') || urlParams.get('testEventCode');
    if (codeFromUrl) {
      testEventCode = codeFromUrl;
      sessionStorage.setItem('meta_test_event_code', codeFromUrl);
    } else {
      // Clear any previous test code in production
      sessionStorage.removeItem('meta_test_event_code');
      localStorage.removeItem('meta_test_event_code');
    }
  } catch {
    // browser sandbox
  }

  const effectiveTestCode = testEventCode;

  const preparedOrder: PlacedOrder = {
    id: orderData.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    orderCode,
    customerName: String(orderData.customerName || 'عميل').trim(),
    phone: String(orderData.phone || '').replace(/\s+/g, ''),
    email: orderData.email ? String(orderData.email).trim().toLowerCase() : undefined,
    wilaya: orderData.wilaya || 'غير محدد',
    commune: String(orderData.commune || '').trim(),
    packageTitle: orderData.packageTitle || 'جهاز مساج Theoria',
    totalPrice: Number(orderData.totalPrice) || 9500,
    contentId: orderData.contentId || undefined,
    currency: 'DZD',
    date: orderData.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
    createdAt: orderData.createdAt || Date.now(),
    status: 'جديد',
    notes: orderData.notes || '',
    eventId,
    fb_event_id: eventId,
    fb_token: initialToken,
    fb_sent: 0,
    test_event_code: effectiveTestCode,
    fbp: orderData.fbp || undefined,
    fbc: orderData.fbc || undefined,
    syncStatus: 'pending',
    serverConfirmed: false,
    attempts: 0,
  };

  const saveToLocal = (ord: PlacedOrder) => {
    try {
      const current = getLocalOrders();
      const updated = [ord, ...current.filter((o) => o.id !== ord.id && o.orderCode !== ord.orderCode)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      localStorage.setItem(`theoria_order_${ord.orderCode}`, JSON.stringify(ord));
    } catch (e) {
      console.error('LocalStorage write failed:', e);
    }
  };

  // 0. Outbox first — survives refresh/close; flushed by flushOutbox() + poller.
  upsertOutbox(preparedOrder);
  saveToLocal(preparedOrder);

  // 1. Best-effort Cloud Firestore create (never blocks the order on failure).
  try {
    const { db, fs } = await getFirestoreLazy();
    const orderDocRef = fs.doc(db, FIRESTORE_ORDERS_COLLECTION, preparedOrder.id);
    await fs.setDoc(orderDocRef, { ...preparedOrder, syncStatus: 'pending' });
  } catch (firestoreErr) {
    if (!isFirestorePermissionError(firestoreErr)) {
      console.warn('Firestore save notice (API remains source of truth):', firestoreErr);
    }
  }

  // 2. Server API sync with retry — the durability gate.
  try {
    const apiEndpoint = effectiveTestCode
      ? `/api/orders?test_event_code=${encodeURIComponent(effectiveTestCode)}`
      : `/api/orders`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (effectiveTestCode) {
      headers['x-meta-test-event-code'] = effectiveTestCode;
    }

    const res = await postOrderWithRetry(apiEndpoint, preparedOrder, headers, 3);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.success || data.order_id)) {
        if (data.token) preparedOrder.fb_token = data.token;
        if (data.event_id) {
          preparedOrder.fb_event_id = data.event_id;
          preparedOrder.eventId = data.event_id;
        }
        preparedOrder.fb_sent = 0;
        if (data.order && data.order.orderCode) {
          preparedOrder.orderCode = data.order.orderCode;
        }
        if (data.order && data.order.id) {
          preparedOrder.id = data.order.id;
        }
        if (typeof data.durable === 'boolean') preparedOrder.durable = data.durable;
        preparedOrder.syncStatus = 'synced';
        preparedOrder.serverConfirmed = true;
        preparedOrder.syncError = undefined;
        preparedOrder.attempts = (preparedOrder.attempts || 0) + 1;
        removeFromOutbox(preparedOrder.orderCode, preparedOrder.id);
        saveToLocal(preparedOrder);
        // Best-effort: mirror server-confirmed doc to Firestore (create-only rules).
        try {
          const { db, fs } = await getFirestoreLazy();
          await fs.setDoc(fs.doc(db, FIRESTORE_ORDERS_COLLECTION, preparedOrder.id), { ...preparedOrder });
        } catch {
          // ignore — server already durable
        }
        if (channel) {
          try {
            channel.postMessage({ type: 'NEW_ORDER', order: preparedOrder });
          } catch {
            // ignore
          }
        }
        return preparedOrder;
      }
      throw new Error(data?.error || `Server rejected order (${res.status})`);
    }
    throw new Error(`Server rejected order (${res.status})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Order sync failed — kept in outbox for retry:', msg);
    preparedOrder.syncStatus = 'failed';
    preparedOrder.serverConfirmed = false;
    preparedOrder.syncError = msg;
    preparedOrder.attempts = (preparedOrder.attempts || 0) + 1;
    upsertOutbox(preparedOrder);
    saveToLocal(preparedOrder);
    return preparedOrder;
  }
}

/**
 * Retry all outbox orders against /api/orders. Called on app boot, on
 * `online` events, and periodically while pending orders exist.
 * Returns the number of orders confirmed in this pass.
 */
export async function flushOutbox(): Promise<number> {
  const pending = loadOutbox();
  if (!pending.length) return 0;
  let confirmed = 0;
  for (const item of pending) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const code = (item.test_event_code || '').trim();
      const url = code ? `/api/orders?test_event_code=${encodeURIComponent(code)}` : '/api/orders';
      if (code) headers['x-meta-test-event-code'] = code;
      const res = await postOrderWithRetry(url, item, headers, 2);
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (!data || (!data.success && !data.order_id)) continue;
      const synced: PlacedOrder = {
        ...item,
        fb_token: data.token || item.fb_token,
        fb_event_id: data.event_id || item.fb_event_id,
        eventId: data.event_id || item.eventId,
        orderCode: data.order?.orderCode || data.order_id || item.orderCode,
        id: data.order?.id || item.id,
        syncStatus: 'synced',
        serverConfirmed: true,
        syncError: undefined,
      };
      try {
        const current = getLocalOrders();
        const updated = [synced, ...current.filter((o) => o.id !== synced.id && o.orderCode !== synced.orderCode)];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        localStorage.setItem(`theoria_order_${synced.orderCode}`, JSON.stringify(synced));
      } catch {
        // ignore
      }
      removeFromOutbox(item.orderCode, item.id);
      confirmed++;
    } catch {
      // keep in outbox for the next pass
    }
  }
  return confirmed;
}

if (typeof window !== 'undefined') {
  try {
    window.addEventListener('online', () => {
      flushOutbox().catch(() => {});
    });
    // Best-effort flush shortly after boot (covers refresh-during-submit loss).
    window.setTimeout(() => {
      flushOutbox().catch(() => {});
    }, 3000);
  } catch {
    // ignore
  }
}

/**
 * Update an order's status or internal notes — server API is authoritative.
 * Firestore direct update is best-effort only (production rules deny client
 * updates); permission-denied is expected and quiet.
 * Returns true when the server confirmed, false otherwise (caller toasts).
 */
export async function updateOrderStatus(
  orderId: string,
  status?: OrderStatus,
  notes?: string
): Promise<boolean> {
  // 1. Server API first (source of truth)
  const token = getAdminToken();
  let serverOk = false;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, notes }),
    });
    serverOk = res.ok;
    if (!res.ok && res.status !== 404) {
      console.warn('Order update API notice:', res.status);
    }
  } catch {
    // network — local optimistic update below still applies; poller reconciles
  }

  // 2. Best-effort Firestore mirror (expected to be denied by rules)
  try {
    const { db, fs } = await getFirestoreLazy();
    const orderDocRef = fs.doc(db, FIRESTORE_ORDERS_COLLECTION, orderId);
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    await fs.updateDoc(orderDocRef, updates);
  } catch (err) {
    if (!isFirestorePermissionError(err)) {
      console.warn('Firestore updateDoc notice:', err);
    }
  }

  // 3. Update local storage
  try {
    const existing = getLocalOrders();
    const idx = existing.findIndex((o) => o.id === orderId || o.orderCode === orderId);
    if (idx !== -1) {
      if (status) existing[idx].status = status;
      if (notes !== undefined) existing[idx].notes = notes;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      if (channel) {
        channel.postMessage({ type: 'ORDER_UPDATED', order: existing[idx] });
      }
    }
  } catch {
    // ignore
  }

  return serverOk;
}

/**
 * Delete an order — server API is authoritative. Firestore delete is
 * best-effort (rules deny it). Returns true when the server confirmed.
 */
export async function deleteOrder(orderId: string): Promise<boolean> {
  const token = getAdminToken();
  let serverOk = false;
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE', headers });
    serverOk = res.ok;
  } catch {
    // ignore
  }

  // Best-effort Firestore mirror (expected denied)
  try {
    const { db, fs } = await getFirestoreLazy();
    const orderDocRef = fs.doc(db, FIRESTORE_ORDERS_COLLECTION, orderId);
    await fs.deleteDoc(orderDocRef);
  } catch (err) {
    if (!isFirestorePermissionError(err)) {
      console.warn('Firestore deleteDoc notice:', err);
    }
  }

  // 2. Update local storage
  try {
    const existing = getLocalOrders();
    const updated = existing.filter((o) => o.id !== orderId && o.orderCode !== orderId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (channel) {
      channel.postMessage({ type: 'ORDER_DELETED', id: orderId });
    }
  } catch {
    // ignore
  }

  return serverOk;
}

/**
 * Real-time subscription hook:
 * 1. Server API incremental polling (?since) is the primary cross-device path.
 * 2. Firestore onSnapshot is best-effort only (rules deny reads → quiet).
 * 3. SSE (VPS) + BroadcastChannel + storage event cover same-browser tabs.
 */
export function subscribeToRealtimeOrders(callbacks: {
  onNewOrder: (order: PlacedOrder) => void;
  onUpdateOrder: (order: PlacedOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  onClearAll?: () => void;
}): () => void {
  let isClosed = false;
  let unsubscribeFirestore: (() => void) | null = null;
  let pollingTimer: number | null = null;
  const knownIds = new Set<string>();

  // Mark connection as active
  callbacks.onConnectionChange?.(true);

  // Initialize known IDs from local storage
  getLocalOrders().forEach((o) => knownIds.add(o.id || o.orderCode));

  // 1. Best-effort Firestore onSnapshot (production rules deny client reads,
  // so permission-denied is the normal closed state — stay quiet, polling covers it).
  // Lazy: the SDK chunk loads in the background; polling + SSE cover the gap.
  getFirestoreLazy()
    .then(({ db, fs }) => {
      if (isClosed) return;
      const ordersCol = fs.collection(db, FIRESTORE_ORDERS_COLLECTION);
      const q = fs.query(ordersCol, fs.orderBy('createdAt', 'desc'));

      unsubscribeFirestore = fs.onSnapshot(
        q,
      (snapshot) => {
        callbacks.onConnectionChange?.(true);
        snapshot.docChanges().forEach((change) => {
          const docData = change.doc.data() as PlacedOrder;
          const order: PlacedOrder = {
            ...docData,
            id: change.doc.id || docData.id,
          };

          // Ignore demo/test orders
          if (order.id === 'ord_1' || order.id === 'ord_2' || order.id === 'ord_3' || order.notes?.includes('طلب تجريبي')) {
            return;
          }

          const key = order.id || order.orderCode;

          if (change.type === 'added') {
            if (!knownIds.has(key)) {
              knownIds.add(key);
              callbacks.onNewOrder(order);
            }
          } else if (change.type === 'modified') {
            callbacks.onUpdateOrder(order);
          } else if (change.type === 'removed') {
            knownIds.delete(key);
            callbacks.onDeleteOrder(order.id);
          }
        });
      },
        (error) => {
          if (!isFirestorePermissionError(error)) {
            console.warn('Firestore onSnapshot subscription warning:', error);
          }
          // Do NOT flip connection to false here: server-API polling is the
          // real connection signal on locked-down rules.
        }
      );
    })
    .catch((err) => {
      if (!isFirestorePermissionError(err)) {
        console.warn('Could not initialize Firestore onSnapshot listener:', err);
      }
    });

  // 2. Server-Sent Events (SSE) stream for real-time notifications across multiple devices/phones
  let eventSource: EventSource | null = null;
  try {
    const adminToken = getAdminToken();
    const sseUrl = adminToken ? `/api/orders/stream?token=${encodeURIComponent(adminToken)}` : '/api/orders/stream';
    eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (e) => {
      try {
        if (!e.data || e.data.startsWith(':')) return;
        const msg = JSON.parse(e.data);
        if (msg.type === 'CONNECTED') {
          callbacks.onConnectionChange?.(true);
        } else if (msg.type === 'NEW_ORDER' && msg.payload) {
          const order: PlacedOrder = msg.payload;
          const key = order.id || order.orderCode;
          if (!knownIds.has(key)) {
            knownIds.add(key);
            callbacks.onNewOrder(order);
          }
        } else if (msg.type === 'ORDER_UPDATED' && msg.payload) {
          callbacks.onUpdateOrder(msg.payload);
        } else if (msg.type === 'ORDER_DELETED' && msg.payload) {
          const id = msg.payload.id || msg.payload;
          knownIds.delete(id);
          callbacks.onDeleteOrder(id);
        }
      } catch (err) {
        console.warn('Error handling SSE order stream message:', err);
      }
    };

    eventSource.onerror = () => {
      // EventSource automatically attempts reconnect
    };
  } catch (sseErr) {
    console.warn('Could not initialize SSE connection:', sseErr);
  }

  // 3. BroadcastChannel handler
  const handleBroadcast = (event: MessageEvent) => {
    if (!event.data) return;
    const { type, order, id } = event.data;
    if (type === 'NEW_ORDER' && order) {
      knownIds.add(order.id || order.orderCode);
      callbacks.onNewOrder(order);
    } else if (type === 'ORDER_UPDATED' && order) {
      callbacks.onUpdateOrder(order);
    } else if (type === 'ORDER_DELETED' && id) {
      knownIds.delete(id);
      callbacks.onDeleteOrder(id);
    } else if (type === 'ORDERS_CLEARED') {
      knownIds.clear();
      callbacks.onClearAll?.();
    }
  };

  if (channel) {
    channel.addEventListener('message', handleBroadcast);
  }

  // 4. Window Storage Event listener (triggers across tabs in same browser)
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const latest: PlacedOrder[] = JSON.parse(e.newValue);
        if (latest.length === 0) {
          knownIds.clear();
          callbacks.onClearAll?.();
          return;
        }
        latest.forEach((order) => {
          const key = order.id || order.orderCode;
          if (!knownIds.has(key)) {
            knownIds.add(key);
            callbacks.onNewOrder(order);
          }
        });
      } catch {
        // ignore
      }
    }
  };
  window.addEventListener('storage', handleStorageChange);

  // 5. Primary cross-device polling: incremental server API (?since) every 15s.
  // Cheap (only rows newer than maxKnownCreatedAt) and the source of truth.
  const getMaxKnownCreatedAt = (): number => {
    let max = 0;
    try {
      const local = getLocalOrders();
      for (const o of local) {
        const t = Number(o?.createdAt || 0);
        if (t > max) max = t;
      }
    } catch {
      // ignore
    }
    return max;
  };
  const pollOrders = async () => {
    if (isClosed) return;
    try {
      const since = getMaxKnownCreatedAt();
      const currentOrders = await getOrders(since > 0 ? since : 0);
      currentOrders.forEach((o) => {
        const key = o.id || o.orderCode;
        if (!knownIds.has(key)) {
          knownIds.add(key);
          callbacks.onNewOrder(o);
        }
      });
      if (lastOrdersApiDiagnostics.apiStatus === 'ok') {
        callbacks.onConnectionChange?.(true);
      }
    } catch {
      // ignore
    }
  };

  // Immediate poll after 1s (fast first paint), then every 15s incremental.
  const initialPollTimeout = window.setTimeout(pollOrders, 1000);
  pollingTimer = window.setInterval(pollOrders, 15000);

  return () => {
    isClosed = true;
    clearTimeout(initialPollTimeout);
    if (unsubscribeFirestore) unsubscribeFirestore();
    if (eventSource) {
      eventSource.close();
    }
    if (pollingTimer) clearInterval(pollingTimer);
    if (channel) channel.removeEventListener('message', handleBroadcast);
    window.removeEventListener('storage', handleStorageChange);
  };
}
