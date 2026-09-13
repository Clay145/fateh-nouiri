import { trackAddToCart, trackInitiateCheckout, trackPurchase } from '../utils/pixel';

export type FunnelStep =
  | 'page_view'
  | 'content_engaged'
  | 'add_to_cart'
  | 'initiate_checkout'
  | 'form_started'
  | 'validation_failed'
  | 'purchase';

export interface VisitorSession {
  id: string;
  startTime: number;
  lastActiveTime: number;
  source: string;
  device: 'هاتف محمول' | 'كمبيوتر';
  furthestStep: FunnelStep;
  lastActiveField?: 'fullname' | 'phone' | 'wilaya' | 'address';
  validationErrorsCount: number;
  selectedPackage?: string;
  orderCompleted?: boolean;
}

export interface FunnelStats {
  totalVisitors: number;
  contentEngaged: number;
  clickedAddToCart: number;
  reachedCheckoutForm: number;
  startedFillingForm: number;
  validationFailed: number;
  completedPurchases: number;
  // Field-level drop-offs
  fieldDropOffs: {
    fullname: number;
    phone: number;
    wilaya: number;
    address: number;
  };
  // Device breakdown
  devices: {
    mobile: number;
    desktop: number;
  };
  // Traffic sources
  sources: Record<string, number>;
  lastUpdated: number;
  recentSessions: VisitorSession[];
}

const STORAGE_KEY = 'theoria_funnel_analytics';
const SESSION_KEY = 'theoria_current_session';
const BROADCAST_KEY = 'theoria_analytics_channel';

let channel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(BROADCAST_KEY);
  }
} catch {
  // ignore
}

export function getInitialStats(): FunnelStats {
  return {
    totalVisitors: 0,
    contentEngaged: 0,
    clickedAddToCart: 0,
    reachedCheckoutForm: 0,
    startedFillingForm: 0,
    validationFailed: 0,
    completedPurchases: 0,
    fieldDropOffs: {
      fullname: 0,
      phone: 0,
      wilaya: 0,
      address: 0,
    },
    devices: {
      mobile: 0,
      desktop: 0,
    },
    sources: {},
    lastUpdated: Date.now(),
    recentSessions: [],
  };
}

/**
 * Load persisted funnel stats from localStorage cache
 */
export function getFunnelStats(): FunnelStats {
  if (typeof window === 'undefined') return getInitialStats();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.totalVisitors === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return getInitialStats();
}

/**
 * Save funnel stats to cache and broadcast
 */
function saveFunnelStats(stats: FunnelStats, broadcast = true): void {
  stats.lastUpdated = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    if (broadcast && channel) {
      channel.postMessage({ type: 'STATS_UPDATED', stats });
    }
  } catch {
    // ignore
  }
}

/**
 * Send event to backend server so ANY visitor (phone, laptop, tablet) is saved centrally
 */
function postEventToServer(
  event: FunnelStep,
  extra?: { fieldName?: 'fullname' | 'phone' | 'wilaya' | 'address'; selectedPackage?: string; totalPrice?: number }
) {
  if (typeof window === 'undefined') return;
  const session = getCurrentSession();

  const payload = {
    sessionId: session.id,
    event,
    device: session.device,
    source: session.source,
    fieldName: extra?.fieldName,
    selectedPackage: extra?.selectedPackage,
    totalPrice: extra?.totalPrice,
  };

  try {
    const jsonStr = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const success = navigator.sendBeacon('/api/analytics/track', blob);
      if (success) return;
    }
  } catch {
    // fallback to fetch
  }

  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // offline or silent fail
  });
}

/**
 * Fetch latest aggregated analytics stats from the backend server
 */
export async function fetchServerStats(): Promise<FunnelStats | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/analytics');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.stats) {
        saveFunnelStats(data.stats, false);
        return data.stats as FunnelStats;
      }
    }
  } catch {
    // offline or backend unreachable
  }
  return null;
}

/**
 * Reset all analytics stats on both server and client (Clean slate for new Ad Campaign)
 */
export async function clearAnalytics(): Promise<void> {
  try {
    const fresh = getInitialStats();
    saveFunnelStats(fresh, true);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem('theoria_tracked_pv');
      const token = localStorage.getItem('theoria_admin_token') || 'theoria2026';
      await fetch('/api/analytics/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {});
    }
    if (channel) {
      channel.postMessage({ type: 'ANALYTICS_CLEARED' });
    }
  } catch {
    // ignore
  }
}

/**
 * Get or create the current visitor session
 */
export function getCurrentSession(): VisitorSession {
  if (typeof window === 'undefined') {
    return {
      id: 'server',
      startTime: Date.now(),
      lastActiveTime: Date.now(),
      source: 'مباشر',
      device: 'هاتف محمول',
      furthestStep: 'page_view',
      validationErrorsCount: 0,
    };
  }

  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      return JSON.parse(existing);
    }
  } catch {
    // ignore
  }

  // Detect Device
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768;
  const device: 'هاتف محمول' | 'كمبيوتر' = isMobile ? 'هاتف محمول' : 'كمبيوتر';

  // Detect Ad Traffic Source
  const urlParams = new URLSearchParams(window.location.search);
  let source = 'زيارة مباشرة';
  if (
    urlParams.has('fbclid') ||
    urlParams.get('utm_source')?.includes('facebook') ||
    urlParams.get('utm_source')?.includes('fb')
  ) {
    source = 'إعلان فيسبوك / انستغرام';
  } else if (urlParams.get('utm_source')?.includes('tiktok') || urlParams.has('ttclid')) {
    source = 'إعلان تيك توك';
  } else if (urlParams.get('utm_source')) {
    source = `حملة: ${urlParams.get('utm_source')}`;
  } else if (document.referrer && document.referrer.includes('facebook.com')) {
    source = 'فيسبوك (Referral)';
  } else if (document.referrer && document.referrer.includes('instagram.com')) {
    source = 'انستغرام';
  }

  // Ensure unique ID per visitor session
  const storedVisId = localStorage.getItem('theoria_vis_id');
  const visitorId =
    storedVisId || `vis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  if (!storedVisId) {
    try {
      localStorage.setItem('theoria_vis_id', visitorId);
    } catch {
      // ignore
    }
  }

  const newSession: VisitorSession = {
    id: visitorId,
    startTime: Date.now(),
    lastActiveTime: Date.now(),
    source,
    device,
    furthestStep: 'page_view',
    validationErrorsCount: 0,
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
  } catch {
    // ignore
  }

  return newSession;
}

/**
 * Save current session
 */
function saveCurrentSession(session: VisitorSession): void {
  session.lastActiveTime = Date.now();
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

const STEP_WEIGHT: Record<FunnelStep, number> = {
  page_view: 1,
  content_engaged: 2,
  add_to_cart: 3,
  initiate_checkout: 4,
  form_started: 5,
  validation_failed: 5,
  purchase: 6,
};

/**
 * Update the session's furthest step in stats & sync to server
 */
function advanceStep(
  newStep: FunnelStep,
  fieldName?: 'fullname' | 'phone' | 'wilaya' | 'address',
  extra?: { selectedPackage?: string; totalPrice?: number }
) {
  const session = getCurrentSession();
  const currentWeight = STEP_WEIGHT[session.furthestStep] || 0;
  const newWeight = STEP_WEIGHT[newStep] || 0;

  let stepAdvanced = false;
  if (newWeight > currentWeight) {
    session.furthestStep = newStep;
    stepAdvanced = true;
  }
  if (fieldName) {
    session.lastActiveField = fieldName;
  }
  if (extra?.selectedPackage) {
    session.selectedPackage = extra.selectedPackage;
  }

  saveCurrentSession(session);

  // Update aggregated local cache
  const stats = getFunnelStats();

  if (stepAdvanced) {
    if (newStep === 'content_engaged') stats.contentEngaged = (stats.contentEngaged || 0) + 1;
    if (newStep === 'add_to_cart') stats.clickedAddToCart = (stats.clickedAddToCart || 0) + 1;
    if (newStep === 'initiate_checkout') stats.reachedCheckoutForm = (stats.reachedCheckoutForm || 0) + 1;
    if (newStep === 'form_started') stats.startedFillingForm = (stats.startedFillingForm || 0) + 1;
    if (newStep === 'purchase') stats.completedPurchases = (stats.completedPurchases || 0) + 1;
  }

  if (fieldName) {
    stats.fieldDropOffs[fieldName] = (stats.fieldDropOffs[fieldName] || 0) + 1;
  }

  // Update session in recentSessions list
  const existingIdx = stats.recentSessions.findIndex((s) => s.id === session.id);
  if (existingIdx !== -1) {
    stats.recentSessions[existingIdx] = session;
  } else {
    stats.recentSessions.unshift(session);
    if (stats.recentSessions.length > 60) stats.recentSessions.pop();
  }

  saveFunnelStats(stats, true);

  // Sync to Backend Server immediately
  postEventToServer(newStep, {
    fieldName,
    selectedPackage: extra?.selectedPackage || session.selectedPackage,
    totalPrice: extra?.totalPrice,
  });
}

// -------------------------------------------------------------
// Public Tracking Functions Called by Customer Interactions
// -------------------------------------------------------------

/**
 * 1. Initial Page View Tracking
 */
export function trackPageViewVisitor(): void {
  if (typeof window === 'undefined') return;
  const session = getCurrentSession();
  const stats = getFunnelStats();

  const isNew = !sessionStorage.getItem('theoria_tracked_pv');
  if (isNew) {
    sessionStorage.setItem('theoria_tracked_pv', 'true');
    stats.totalVisitors = (stats.totalVisitors || 0) + 1;

    if (session.device === 'هاتف محمول') {
      stats.devices.mobile = (stats.devices.mobile || 0) + 1;
    } else {
      stats.devices.desktop = (stats.devices.desktop || 0) + 1;
    }

    const src = session.source;
    stats.sources[src] = (stats.sources[src] || 0) + 1;

    stats.recentSessions.unshift(session);
    if (stats.recentSessions.length > 60) stats.recentSessions.pop();

    saveFunnelStats(stats, true);
  }

  // Always register page view with the server
  postEventToServer('page_view');
}

/**
 * 2. Scrolled & Engaged with Content
 */
export function trackContentEngagement(): void {
  advanceStep('content_engaged');
}

/**
 * 3. User clicked any "اطلب الآن" button
 * -> Triggers: fbq('track', 'AddToCart')
 */
export function trackAddToCartClick(sourceButton = 'زر اطلب الآن'): void {
  console.log(`[Funnel] AddToCart Clicked via: ${sourceButton}`);
  // Pixel Event
  trackAddToCart();

  // Also advance funnel & note user entered checkout journey
  advanceStep('add_to_cart');
}

/**
 * 4. User opened / reached the order form
 * -> Triggers: fbq('track', 'InitiateCheckout')
 */
let checkoutTrackedForSession = false;
export function trackFormOpened(source = 'عرض استمارة الطلب'): void {
  if (!checkoutTrackedForSession) {
    checkoutTrackedForSession = true;
    console.log(`[Funnel] InitiateCheckout triggered via: ${source}`);
    // Pixel Event
    trackInitiateCheckout();
  }

  // Funnel Event
  advanceStep('initiate_checkout');
}

/**
 * 5. User started interacting with form inputs
 */
export function trackFormFieldEngagement(fieldName: 'fullname' | 'phone' | 'wilaya' | 'address'): void {
  // Ensure initiate_checkout was marked
  trackFormOpened(`حقل: ${fieldName}`);
  advanceStep('form_started', fieldName);
}

/**
 * 6. User clicked submit but validation failed (e.g. invalid phone)
 */
export function trackValidationFailed(reason: string): void {
  const session = getCurrentSession();
  session.validationErrorsCount = (session.validationErrorsCount || 0) + 1;
  saveCurrentSession(session);

  const stats = getFunnelStats();
  stats.validationFailed = (stats.validationFailed || 0) + 1;
  saveFunnelStats(stats, true);

  postEventToServer('validation_failed');
}

/**
 * 7. User completed purchase successfully
 * -> Triggers: fbq('track', 'Purchase')
 */
export function trackPurchaseComplete(orderCode: string, amount: number, packageName: string): void {
  console.log(`[Funnel] Purchase Completed: ${orderCode}`);
  // Pixel Event
  trackPurchase({
    order_id: orderCode,
    value: amount,
    currency: 'DZD',
    content_name: packageName,
  });

  const session = getCurrentSession();
  session.orderCompleted = true;
  session.selectedPackage = packageName;
  saveCurrentSession(session);

  advanceStep('purchase', undefined, { selectedPackage: packageName, totalPrice: amount });
}

/**
 * Realtime hook listener for Admin Dashboard with multi-device polling & channel sync
 */
export function subscribeToAnalytics(callback: (stats: FunnelStats) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // 1. Deliver immediate local cache
  callback(getFunnelStats());

  // 2. Fetch latest server state immediately
  fetchServerStats().then((serverStats) => {
    if (serverStats) {
      callback(serverStats);
    }
  });

  // 3. Poll server every 3.5 seconds so mobile phone visits appear live in dashboard
  const pollTimer = window.setInterval(async () => {
    const freshStats = await fetchServerStats();
    if (freshStats) {
      callback(freshStats);
    }
  }, 3500);

  // 4. Tab-to-tab Broadcast listener
  const handleBroadcast = (event: MessageEvent) => {
    if (event.data?.type === 'STATS_UPDATED' && event.data.stats) {
      callback(event.data.stats);
    } else if (event.data?.type === 'ANALYTICS_CLEARED') {
      callback(getInitialStats());
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        callback(JSON.parse(e.newValue));
      } catch {
        // ignore
      }
    }
  };

  if (channel) {
    channel.addEventListener('message', handleBroadcast);
  }
  window.addEventListener('storage', handleStorage);

  return () => {
    window.clearInterval(pollTimer);
    if (channel) channel.removeEventListener('message', handleBroadcast);
    window.removeEventListener('storage', handleStorage);
  };
}
