import { PlacedOrder, OrderStatus } from '../types';

const STORAGE_KEY = 'theoria_orders';
const BROADCAST_CHANNEL_NAME = 'theoria_orders_channel';
const ADMIN_TOKEN_KEY = 'theoria_admin_token';

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

export async function loginAdmin(password: string): Promise<boolean> {
  const cleanPassword = password.trim();

  // Try API first
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
    // Backend API unavailable, fallback below
  }

  // Fallback for static environments
  const validPasswords = ['theoria2026', 'IMAD34', 'imad34', 'admin2026'];
  if (validPasswords.includes(cleanPassword)) {
    const clientFallbackToken = `admin_token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setAdminToken(clientFallbackToken, true);
    return true;
  }

  return false;
}

export async function verifyAdminSession(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;

  try {
    const res = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return true;
  } catch {
    // Backend unavailable, accept valid client session token
  }

  return token.startsWith('admin_token_') || token === 'theoria2026' || token === 'IMAD34';
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
        // Filter out any previous mock seed orders (ord_1, ord_2, ord_3) so merchant starts 100% clean
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
export function clearAllOrders(): void {
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
 * Fetch all orders: tries /api/orders, merges with localStorage
 */
export async function getOrders(): Promise<PlacedOrder[]> {
  const localOrders = getLocalOrders();

  try {
    const token = getAdminToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/orders', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        // Merge API orders with local orders (preserving any newly placed ones)
        const orderMap = new Map<string, PlacedOrder>();
        // Filter out mock IDs if any
        data.orders
          .filter((o: PlacedOrder) => o.id !== 'ord_1' && o.id !== 'ord_2' && o.id !== 'ord_3' && !o.notes?.includes('طلب تجريبي'))
          .forEach((o: PlacedOrder) => orderMap.set(o.id || o.orderCode, o));

        localOrders.forEach((o: PlacedOrder) => {
          if (!orderMap.has(o.id || o.orderCode)) {
            orderMap.set(o.id || o.orderCode, o);
          }
        });
        const merged = Array.from(orderMap.values()).sort((a, b) => b.createdAt - a.createdAt);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      }
    }
  } catch {
    // Backend unavailable, local orders used
  }

  return localOrders;
}

/**
 * Submit a new customer order (persists to localStorage + broadcasts + attempts API)
 */
export async function submitOrder(orderData: Partial<PlacedOrder>): Promise<PlacedOrder> {
  const preparedOrder: PlacedOrder = {
    id: orderData.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    orderCode: orderData.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`,
    customerName: String(orderData.customerName || 'عميل').trim(),
    phone: String(orderData.phone || '').replace(/\s+/g, ''),
    wilaya: orderData.wilaya || 'غير محدد',
    commune: String(orderData.commune || '').trim(),
    packageTitle: orderData.packageTitle || 'جهاز مساج Theoria',
    totalPrice: Number(orderData.totalPrice) || 9500,
    date: orderData.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
    createdAt: orderData.createdAt || Date.now(),
    status: 'جديد',
    notes: orderData.notes || '',
  };

  // 1. Immediately guarantee local storage persistence
  try {
    const current = getLocalOrders();
    const updated = [preparedOrder, ...current.filter((o) => o.id !== preparedOrder.id && o.orderCode !== preparedOrder.orderCode)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('LocalStorage write failed:', e);
  }

  // 2. Broadcast across tabs (BroadcastChannel + Window Storage event)
  if (channel) {
    try {
      channel.postMessage({ type: 'NEW_ORDER', order: preparedOrder });
    } catch {
      // ignore
    }
  }

  // 3. Attempt API sync in background (Vercel Serverless / Express)
  try {
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preparedOrder),
    }).catch(() => {
      // Silently ignore if offline or API is not present
    });
  } catch {
    // ignore
  }

  return preparedOrder;
}

/**
 * Update an order's status or internal notes
 */
export async function updateOrderStatus(
  orderId: string,
  status?: OrderStatus,
  notes?: string
): Promise<boolean> {
  // 1. Update local storage
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

  // 2. Attempt API update
  const token = getAdminToken();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, notes }),
    });
  } catch {
    // ignore
  }

  return true;
}

/**
 * Delete an order
 */
export async function deleteOrder(orderId: string): Promise<boolean> {
  // 1. Update local storage
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

  // 2. Attempt API delete
  const token = getAdminToken();
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await fetch(`/api/orders/${orderId}`, { method: 'DELETE', headers });
  } catch {
    // ignore
  }

  return true;
}

/**
 * Real-time subscription hook:
 * Uses BroadcastChannel + window storage listener + periodic polling fallback.
 * Only attempts SSE if available and doesn't spam errors.
 */
export function subscribeToRealtimeOrders(callbacks: {
  onNewOrder: (order: PlacedOrder) => void;
  onUpdateOrder: (order: PlacedOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  onClearAll?: () => void;
}): () => void {
  let isClosed = false;
  let eventSource: EventSource | null = null;
  let pollingTimer: number | null = null;
  let knownIds = new Set<string>();

  // Mark connection as active via client channels
  callbacks.onConnectionChange?.(true);

  // Initialize known IDs from current storage
  getLocalOrders().forEach((o) => knownIds.add(o.id || o.orderCode));

  // 1. BroadcastChannel handler
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

  // 2. Window Storage Event listener (triggers across tabs in same browser)
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

  // 3. Optional SSE (only attempted once, no annoying continuous 404 loops)
  let sseFailures = 0;
  const trySSE = () => {
    if (isClosed || sseFailures >= 2) return;
    try {
      const token = getAdminToken();
      if (!token) return;
      const sseUrl = `/api/orders/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        sseFailures = 0;
        callbacks.onConnectionChange?.(true);
      };

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'NEW_ORDER' && data.payload) {
            knownIds.add(data.payload.id || data.payload.orderCode);
            callbacks.onNewOrder(data.payload as PlacedOrder);
          } else if (data.type === 'ORDER_UPDATED' && data.payload) {
            callbacks.onUpdateOrder(data.payload as PlacedOrder);
          } else if (data.type === 'ORDER_DELETED' && data.payload?.id) {
            knownIds.delete(data.payload.id);
            callbacks.onDeleteOrder(data.payload.id);
          }
        } catch {
          // ignore
        }
      };

      eventSource.onerror = () => {
        sseFailures++;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // If SSE fails (like on static Vercel), fall back to background polling
        if (sseFailures >= 2) {
          startPolling();
        }
      };
    } catch {
      sseFailures++;
      startPolling();
    }
  };

  // 4. Fallback Polling (polls /api/orders every 10 seconds smoothly)
  const startPolling = () => {
    if (pollingTimer || isClosed) return;
    pollingTimer = window.setInterval(async () => {
      if (isClosed) return;
      try {
        const currentOrders = await getOrders();
        currentOrders.forEach((o) => {
          const key = o.id || o.orderCode;
          if (!knownIds.has(key)) {
            knownIds.add(key);
            callbacks.onNewOrder(o);
          }
        });
      } catch {
        // ignore
      }
    }, 10000);
  };

  trySSE();

  return () => {
    isClosed = true;
    if (pollingTimer) clearInterval(pollingTimer);
    if (eventSource) eventSource.close();
    if (channel) channel.removeEventListener('message', handleBroadcast);
    window.removeEventListener('storage', handleStorageChange);
  };
}
