import { PlacedOrder, OrderStatus } from '../types';

const STORAGE_KEY = 'theoria_orders';
const BROADCAST_CHANNEL_NAME = 'theoria_orders_channel';
const ADMIN_TOKEN_KEY = 'theoria_admin_token';

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

  // Try backend API first (for fullstack/server deployment)
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
  } catch (err) {
    console.warn('Backend login endpoint unavailable, trying fallback verification:', err);
  }

  // Fallback for Vercel static deployments (where Express server.ts is not running)
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

  // If token is present and starts with admin_token_, keep session valid on client
  return token.startsWith('admin_token_');
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
 * Play a professional real-time chime notification when a new order lands
 */
export function playOrderNotificationSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Pleasant two-tone chime (E5 -> B5)
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.12); // B5
    gain2.gain.setValueAtTime(0.35, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.8);
  } catch {
    // audio autoplay policy might block if no interaction yet
  }
}

/**
 * Fetch all orders from backend API, with fallback to local storage
 */
export async function getOrders(): Promise<PlacedOrder[]> {
  const token = getAdminToken();
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch('/api/orders', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        // Cache to localStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.orders));
        } catch {
          // ignore
        }
        return data.orders;
      }
    }
  } catch {
    // network or backend fallback
  }

  // Fallback to local storage
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      return JSON.parse(local);
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * Submit a new customer order (sent to backend + broadcasted)
 */
export async function submitOrder(orderData: Partial<PlacedOrder>): Promise<PlacedOrder> {
  const preparedOrder: PlacedOrder = {
    id: orderData.id || `ord_${Date.now()}`,
    orderCode: orderData.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`,
    customerName: orderData.customerName || 'عميل مجهول',
    phone: orderData.phone || '',
    wilaya: orderData.wilaya || '',
    commune: orderData.commune || '',
    packageTitle: orderData.packageTitle || 'جهاز مساج Theoria',
    totalPrice: orderData.totalPrice || 9500,
    date: orderData.date || new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }),
    createdAt: Date.now(),
    status: 'جديد',
    notes: orderData.notes || '',
  };

  // Try API first
  let savedOrder = preparedOrder;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preparedOrder),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.order) {
        savedOrder = data.order;
      }
    }
  } catch (err) {
    console.warn('API POST failed, persisting locally:', err);
  }

  // Update local storage
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = [savedOrder, ...existing.filter((o: PlacedOrder) => o.id !== savedOrder.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  // Broadcast to other tabs locally
  if (channel) {
    try {
      channel.postMessage({ type: 'NEW_ORDER', order: savedOrder });
    } catch {
      // ignore
    }
  }

  return savedOrder;
}

/**
 * Update an order's status or internal notes
 */
export async function updateOrderStatus(
  orderId: string,
  status?: OrderStatus,
  notes?: string
): Promise<boolean> {
  const token = getAdminToken();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, notes }),
    });
    if (res.ok) {
      const data = await res.json();
      if (channel && data.order) {
        channel.postMessage({ type: 'ORDER_UPDATED', order: data.order });
      }
      return true;
    }
  } catch {
    // fallback local update
  }

  // Fallback local update
  try {
    const existing: PlacedOrder[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const idx = existing.findIndex((o) => o.id === orderId || o.orderCode === orderId);
    if (idx !== -1) {
      if (status) existing[idx].status = status;
      if (notes !== undefined) existing[idx].notes = notes;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      if (channel) {
        channel.postMessage({ type: 'ORDER_UPDATED', order: existing[idx] });
      }
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Delete an order
 */
export async function deleteOrder(orderId: string): Promise<boolean> {
  const token = getAdminToken();
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE', headers });
    if (res.ok) {
      if (channel) {
        channel.postMessage({ type: 'ORDER_DELETED', id: orderId });
      }
      return true;
    }
  } catch {
    // fallback local
  }

  try {
    const existing: PlacedOrder[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = existing.filter((o) => o.id !== orderId && o.orderCode !== orderId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (channel) {
      channel.postMessage({ type: 'ORDER_DELETED', id: orderId });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Real-time subscription hook to SSE stream with fallback to BroadcastChannel
 */
export function subscribeToRealtimeOrders(callbacks: {
  onNewOrder: (order: PlacedOrder) => void;
  onUpdateOrder: (order: PlacedOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}): () => void {
  let eventSource: EventSource | null = null;
  let isClosed = false;

  // Listen on BroadcastChannel for multi-tab updates
  const handleBroadcast = (event: MessageEvent) => {
    if (!event.data) return;
    const { type, order, id } = event.data;
    if (type === 'NEW_ORDER' && order) {
      callbacks.onNewOrder(order);
    } else if (type === 'ORDER_UPDATED' && order) {
      callbacks.onUpdateOrder(order);
    } else if (type === 'ORDER_DELETED' && id) {
      callbacks.onDeleteOrder(id);
    }
  };

  if (channel) {
    channel.addEventListener('message', handleBroadcast);
  }

  // Connect to SSE
  const connectSSE = () => {
    if (isClosed) return;

    try {
      const token = getAdminToken();
      const sseUrl = token ? `/api/orders/stream?token=${encodeURIComponent(token)}` : '/api/orders/stream';
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        callbacks.onConnectionChange?.(true);
      };

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'NEW_ORDER' && data.payload) {
            callbacks.onNewOrder(data.payload as PlacedOrder);
          } else if (data.type === 'ORDER_UPDATED' && data.payload) {
            callbacks.onUpdateOrder(data.payload as PlacedOrder);
          } else if (data.type === 'ORDER_DELETED' && data.payload?.id) {
            callbacks.onDeleteOrder(data.payload.id);
          }
        } catch {
          // parse error
        }
      };

      eventSource.onerror = () => {
        callbacks.onConnectionChange?.(false);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Auto reconnect after 3 seconds if not closed
        if (!isClosed) {
          setTimeout(connectSSE, 3000);
        }
      };
    } catch {
      callbacks.onConnectionChange?.(false);
    }
  };

  connectSSE();

  return () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
    }
    if (channel) {
      channel.removeEventListener('message', handleBroadcast);
    }
  };
}
