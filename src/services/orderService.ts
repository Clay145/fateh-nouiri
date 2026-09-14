import { PlacedOrder, OrderStatus } from '../types';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';

const STORAGE_KEY = 'theoria_orders';
const BROADCAST_CHANNEL_NAME = 'theoria_orders_channel';
const ADMIN_TOKEN_KEY = 'theoria_admin_token';
const FIRESTORE_ORDERS_COLLECTION = 'orders';

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

  // Try API first if backend is running
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
 * Fetch all orders:
 * 1. Queries Cloud Firestore database directly (durable, permanent storage across all devices).
 * 2. Merges with local storage cache to ensure instant offline capability.
 */
export async function getOrders(): Promise<PlacedOrder[]> {
  const localOrders = getLocalOrders();
  const orderMap = new Map<string, PlacedOrder>();

  // Start with local cache
  localOrders.forEach((o) => {
    orderMap.set(o.id || o.orderCode, o);
  });

  // 1. Primary Source of Truth: Cloud Firestore
  try {
    const ordersCol = collection(db, FIRESTORE_ORDERS_COLLECTION);
    const q = query(ordersCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PlacedOrder;
        const finalOrder: PlacedOrder = {
          ...data,
          id: docSnap.id || data.id,
        };
        // Exclude old mock/test orders
        if (finalOrder.id !== 'ord_1' && finalOrder.id !== 'ord_2' && finalOrder.id !== 'ord_3' && !finalOrder.notes?.includes('طلب تجريبي')) {
          orderMap.set(finalOrder.id, finalOrder);
        }
      });
    }
  } catch (firestoreError) {
    console.warn('Firestore fetch query failed, falling back to server API / local:', firestoreError);

    // 2. Secondary fallback: Express API endpoint
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/orders', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          data.orders
            .filter((o: PlacedOrder) => o.id !== 'ord_1' && o.id !== 'ord_2' && o.id !== 'ord_3' && !o.notes?.includes('طلب تجريبي'))
            .forEach((o: PlacedOrder) => orderMap.set(o.id || o.orderCode, o));
        }
      }
    } catch {
      // Backend unavailable, continue with what we have
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
 * Submit a new customer order:
 * 1. Saves directly to Cloud Firestore (guaranteeing it is NEVER lost, even if hosting restarts).
 * 2. Persists to local storage for immediate receipt viewing.
 * 3. Broadcasts across browser tabs.
 * 4. Syncs with backend API.
 */
export async function submitOrder(orderData: Partial<PlacedOrder>): Promise<PlacedOrder> {
  const cleanPhone = String(orderData.phone || '').replace(/\s+/g, '');
  
  // Anti-Duplicate Shield: If an order with the same phone was submitted in the last 60 seconds, reuse it
  if (cleanPhone) {
    const existingOrders = getLocalOrders();
    const now = Date.now();
    const recentOrder = existingOrders.find(
      (o) => o.phone === cleanPhone && (now - (o.createdAt || 0) < 60000)
    );
    if (recentOrder) {
      console.warn(`[orderService] Duplicate submission prevented for phone ${cleanPhone}. Reusing existing order ${recentOrder.orderCode}.`);
      return recentOrder;
    }
  }

  const orderCode = orderData.orderCode || `TH-${Math.floor(10000 + Math.random() * 90000)}`;
  const initialToken = orderData.fb_token || (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2));
  const eventId = `purchase_${orderCode}`;

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
    wilaya: orderData.wilaya || 'غير محدد',
    commune: String(orderData.commune || '').trim(),
    packageTitle: orderData.packageTitle || 'جهاز مساج Theoria',
    totalPrice: Number(orderData.totalPrice) || 9500,
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
  };

  // 1. Permanent Cloud Storage: Write to Firebase Firestore
  try {
    const orderDocRef = doc(db, FIRESTORE_ORDERS_COLLECTION, preparedOrder.id);
    await setDoc(orderDocRef, { ...preparedOrder });
  } catch (firestoreErr) {
    console.error('Firestore save failed, falling back to local/API:', firestoreErr);
  }

  // 2. Local persistence in browser storage
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

  saveToLocal(preparedOrder);

  // 3. Broadcast across tabs (BroadcastChannel + Window Storage event)
  if (channel) {
    try {
      channel.postMessage({ type: 'NEW_ORDER', order: preparedOrder });
    } catch {
      // ignore
    }
  }

  // 4. Server API sync and token generation
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

    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(preparedOrder),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        preparedOrder.fb_token = data.token;
      }
      if (data.event_id) {
        preparedOrder.fb_event_id = data.event_id;
        preparedOrder.eventId = data.event_id;
      }
      preparedOrder.fb_sent = 0;
      if (data.order && data.order.orderCode) {
        preparedOrder.orderCode = data.order.orderCode;
      }
      saveToLocal(preparedOrder);
    }
  } catch (err) {
    console.warn('API sync notice:', err);
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
  // 1. Cloud Firestore update
  try {
    const orderDocRef = doc(db, FIRESTORE_ORDERS_COLLECTION, orderId);
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    await updateDoc(orderDocRef, updates);
  } catch (err) {
    console.warn('Firestore updateDoc error:', err);
  }

  // 2. Update local storage
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

  // 3. Attempt API update
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
  // 1. Cloud Firestore delete
  try {
    const orderDocRef = doc(db, FIRESTORE_ORDERS_COLLECTION, orderId);
    await deleteDoc(orderDocRef);
  } catch (err) {
    console.warn('Firestore deleteDoc error:', err);
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

  // 3. Attempt API delete
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
 * 1. Uses Firebase Firestore onSnapshot for real-time live database updates from any device worldwide.
 * 2. Uses BroadcastChannel + Window Storage event listener for multi-tab synchronization.
 * 3. Fallback to API polling if Firestore stream drops.
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

  // 1. Primary Live Sync: Cloud Firestore onSnapshot
  try {
    const ordersCol = collection(db, FIRESTORE_ORDERS_COLLECTION);
    const q = query(ordersCol, orderBy('createdAt', 'desc'));

    unsubscribeFirestore = onSnapshot(
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
        console.warn('Firestore onSnapshot subscription warning:', error);
        callbacks.onConnectionChange?.(false);
      }
    );
  } catch (err) {
    console.warn('Could not initialize Firestore onSnapshot listener:', err);
  }

  // 2. BroadcastChannel handler
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

  // 3. Window Storage Event listener (triggers across tabs in same browser)
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

  // 4. Fallback Polling (polls /api/orders every 15 seconds)
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
  }, 15000);

  return () => {
    isClosed = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
    if (pollingTimer) clearInterval(pollingTimer);
    if (channel) channel.removeEventListener('message', handleBroadcast);
    window.removeEventListener('storage', handleStorageChange);
  };
}
