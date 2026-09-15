import { trackAddToCart, trackInitiateCheckout, trackPurchase, trackPageView, getFbpCookie, getFbcCookie } from '../utils/pixel';

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

const STORAGE_KEY = 'theoria_funnel_analytics';
const BACKUP_STORAGE_KEY = 'theoria_analytics_permanent_vault';
const SESSION_KEY = 'theoria_current_session';
const BROADCAST_KEY = 'theoria_analytics_channel';

export const STEP_WEIGHT: Record<FunnelStep, number> = {
  page_view: 1,
  content_engaged: 2,
  add_to_cart: 3,
  initiate_checkout: 4,
  form_started: 5,
  validation_failed: 5,
  purchase: 6,
};

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
 * Intelligent Monotonic Merge: Ensures analytics data NEVER decreases or gets wiped.
 * Merges local cache and server state taking the maximum values and union of sessions.
 */
export function mergeFunnelStats(local: FunnelStats, server: FunnelStats): FunnelStats {
  const merged: FunnelStats = {
    totalVisitors: Math.max(local.totalVisitors || 0, server.totalVisitors || 0),
    contentEngaged: Math.max(local.contentEngaged || 0, server.contentEngaged || 0),
    clickedAddToCart: Math.max(local.clickedAddToCart || 0, server.clickedAddToCart || 0),
    reachedCheckoutForm: Math.max(local.reachedCheckoutForm || 0, server.reachedCheckoutForm || 0),
    startedFillingForm: Math.max(local.startedFillingForm || 0, server.startedFillingForm || 0),
    validationFailed: Math.max(local.validationFailed || 0, server.validationFailed || 0),
    completedPurchases: Math.max(local.completedPurchases || 0, server.completedPurchases || 0),
    devices: {
      mobile: Math.max(local.devices?.mobile || 0, server.devices?.mobile || 0),
      desktop: Math.max(local.devices?.desktop || 0, server.devices?.desktop || 0),
    },
    fieldDropOffs: {
      fullname: Math.max(local.fieldDropOffs?.fullname || 0, server.fieldDropOffs?.fullname || 0),
      phone: Math.max(local.fieldDropOffs?.phone || 0, server.fieldDropOffs?.phone || 0),
      wilaya: Math.max(local.fieldDropOffs?.wilaya || 0, server.fieldDropOffs?.wilaya || 0),
      address: Math.max(local.fieldDropOffs?.address || 0, server.fieldDropOffs?.address || 0),
    },
    sources: {},
    lastUpdated: Math.max(local.lastUpdated || 0, server.lastUpdated || 0, Date.now()),
    recentSessions: [],
  };

  // Merge traffic sources
  const allSourceKeys = new Set([
    ...Object.keys(local.sources || {}),
    ...Object.keys(server.sources || {}),
  ]);
  allSourceKeys.forEach((k) => {
    merged.sources[k] = Math.max(local.sources?.[k] || 0, server.sources?.[k] || 0);
  });

  // Merge recent sessions by unique Session ID
  const sessionMap = new Map<string, VisitorSession>();

  (local.recentSessions || []).forEach((s) => {
    if (s && s.id) sessionMap.set(s.id, { ...s });
  });

  (server.recentSessions || []).forEach((srv) => {
    if (!srv || !srv.id) return;
    if (!sessionMap.has(srv.id)) {
      sessionMap.set(srv.id, { ...srv });
    } else {
      const existing = sessionMap.get(srv.id)!;
      const srvWeight = STEP_WEIGHT[srv.furthestStep] || 1;
      const exWeight = STEP_WEIGHT[existing.furthestStep] || 1;
      if (srvWeight > exWeight) {
        existing.furthestStep = srv.furthestStep;
      }
      existing.lastActiveTime = Math.max(existing.lastActiveTime || 0, srv.lastActiveTime || 0);
      if (srv.orderCompleted) existing.orderCompleted = true;
      if (srv.selectedPackage) existing.selectedPackage = srv.selectedPackage;
      if (srv.lastActiveField) existing.lastActiveField = srv.lastActiveField;
    }
  });

  merged.recentSessions = Array.from(sessionMap.values())
    .sort((a, b) => (b.lastActiveTime || b.startTime || 0) - (a.lastActiveTime || a.startTime || 0))
    .slice(0, 250);

  // Consistency constraint: totalVisitors cannot be smaller than recorded unique sessions
  merged.totalVisitors = Math.max(merged.totalVisitors, merged.recentSessions.length);

  return merged;
}

/**
 * Load persisted funnel stats from localStorage cache with vault fallback
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

  // Check permanent backup vault if primary key was empty
  try {
    const backupRaw = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (backupRaw) {
      const parsedBackup = JSON.parse(backupRaw);
      if (parsedBackup && typeof parsedBackup.totalVisitors === 'number') {
        saveFunnelStats(parsedBackup, false);
        return parsedBackup;
      }
    }
  } catch {
    // ignore
  }

  return getInitialStats();
}

/**
 * Save funnel stats to cache, permanent vault, and broadcast
 */
export function saveFunnelStats(stats: FunnelStats, broadcast = true): void {
  stats.lastUpdated = Date.now();
  try {
    const serialized = JSON.stringify(stats);
    localStorage.setItem(STORAGE_KEY, serialized);
    // Write to secondary vault so data is never lost even if one key is cleared
    localStorage.setItem(BACKUP_STORAGE_KEY, serialized);

    if (broadcast && channel) {
      channel.postMessage({ type: 'STATS_UPDATED', stats });
    }
  } catch {
    // ignore
  }
}

/**
 * Sync merged stats to the server so that server restarts/cold-starts restore from client
 */
async function syncMergedStatsToServer(stats: FunnelStats): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/analytics/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats }),
    });
  } catch {
    // ignore
  }
}

/**
 * Send event to backend server so ANY visitor (phone, laptop, tablet) is saved centrally
 */
function postEventToServer(
  event: FunnelStep,
  extra?: {
    fieldName?: 'fullname' | 'phone' | 'wilaya' | 'address';
    selectedPackage?: string;
    totalPrice?: number;
    eventId?: string;
  }
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
    eventId: extra?.eventId,
    fbp: getFbpCookie() || undefined,
    fbc: getFbcCookie() || undefined,
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
 * Fetch latest aggregated analytics stats from the backend server with monotonic merge protection.
 * NEVER allows server response to wipe out or reduce client statistics!
 */
export async function fetchServerStats(): Promise<FunnelStats | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/analytics');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.stats) {
        const localStats = getFunnelStats();
        const merged = mergeFunnelStats(localStats, data.stats as FunnelStats);

        // Save safely
        saveFunnelStats(merged, false);

        // If local had sessions or stats missing on the server, push merged to server to keep it updated!
        if (
          localStats.totalVisitors > (data.stats.totalVisitors || 0) ||
          (localStats.recentSessions?.length || 0) > (data.stats.recentSessions?.length || 0)
        ) {
          syncMergedStatsToServer(merged);
        }

        return merged;
      }
    }
  } catch {
    // offline or backend unreachable
  }
  return getFunnelStats();
}

/**
 * Reset all analytics stats explicitly by Admin only (Clean slate for new Ad Campaign)
 */
export async function clearAnalytics(): Promise<void> {
  try {
    const fresh = getInitialStats();
    saveFunnelStats(fresh, true);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem('theoria_tracked_pv');
      localStorage.removeItem(BACKUP_STORAGE_KEY);
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
 * Check if the current context is Admin (to prevent admin actions from logging as abandoned customer sessions)
 */
function isAdminContext(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hash.includes('admin') ||
    window.location.pathname.includes('/admin') ||
    !!localStorage.getItem('theoria_admin_token')
  );
}

/**
 * Get or create the current visitor session.
 * Generates a unique session per 30-minute visit while maintaining a persistent visitor ID.
 */
export function getCurrentSession(): VisitorSession {
  if (typeof window === 'undefined') {
    return {
      id: 'server_session',
      startTime: Date.now(),
      lastActiveTime: Date.now(),
      source: 'زيارة مباشرة',
      device: 'هاتف محمول',
      furthestStep: 'page_view',
      validationErrorsCount: 0,
    };
  }

  // 1. Check existing active session in this browser window
  try {
    const existingRaw = sessionStorage.getItem(SESSION_KEY);
    if (existingRaw) {
      const parsed: VisitorSession = JSON.parse(existingRaw);
      // If session is active and less than 30 minutes since last activity, keep using it
      const thirtyMinutes = 30 * 60 * 1000;
      if (parsed && Date.now() - (parsed.lastActiveTime || parsed.startTime) < thirtyMinutes) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  // 2. Detect Device
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768;
  const device: 'هاتف محمول' | 'كمبيوتر' = isMobile ? 'هاتف محمول' : 'كمبيوتر';

  // 3. Detect Ad Traffic Source
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

  // 4. Ensure unique persistent visitor identifier + unique visit session ID
  let visitorId = '';
  try {
    visitorId = localStorage.getItem('theoria_visitor_id') || '';
    if (!visitorId) {
      visitorId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem('theoria_visitor_id', visitorId);
    }
  } catch {
    visitorId = `v_${Date.now()}`;
  }

  // Unique session ID for each visit session
  const sessionId = `sess_${visitorId}_${Date.now()}`;

  const newSession: VisitorSession = {
    id: sessionId,
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

/**
 * Update the session's furthest step in stats & sync to server
 */
function advanceStep(
  newStep: FunnelStep,
  fieldName?: 'fullname' | 'phone' | 'wilaya' | 'address',
  extra?: { selectedPackage?: string; totalPrice?: number }
) {
  // If in admin mode, do not pollute customer conversion funnel
  if (isAdminContext()) return;

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
    if (stats.recentSessions.length > 250) stats.recentSessions.pop();
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
  // If admin, never track as customer visit
  if (isAdminContext()) return;

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

    const srcKey = session.source;
    stats.sources[srcKey] = (stats.sources[srcKey] || 0) + 1;

    // Add session to recentSessions
    if (!stats.recentSessions.some((s) => s.id === session.id)) {
      stats.recentSessions.unshift(session);
      if (stats.recentSessions.length > 250) stats.recentSessions.pop();
    }

    saveFunnelStats(stats, true);
    const pvEventId = `pv_${session.id}_${Date.now()}`;
    postEventToServer('page_view', { eventId: pvEventId });
  }

  // Meta Pixel PageView tracking (guards against double firing via window.__theoria_initial_pv_fired)
  trackPageView();
}

/**
 * 2. Content Engaged Tracking (Deep scroll / reading features)
 */
export function trackContentEngagement(): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  if (!sessionStorage.getItem('theoria_tracked_eng')) {
    sessionStorage.setItem('theoria_tracked_eng', 'true');
    advanceStep('content_engaged');
  }
}

/**
 * 3. Add to Cart (CTA "اطلب الآن" clicked)
 */
export function trackAddToCartClick(packageName?: string): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  trackAddToCart({
    content_name: packageName || 'جهاز مساج Theoria Pro',
    value: 9500,
    currency: 'DZD',
  });
  advanceStep('add_to_cart', undefined, { selectedPackage: packageName });
}

/**
 * 4. Initiate Checkout (Reached the Order Form)
 */
export function trackInitiateCheckoutView(): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  if (!sessionStorage.getItem('theoria_tracked_checkout')) {
    sessionStorage.setItem('theoria_tracked_checkout', 'true');
    trackInitiateCheckout({
      content_name: 'جهاز مساج Theoria Pro',
      value: 9500,
      currency: 'DZD',
    });
    advanceStep('initiate_checkout');
  }
}

/**
 * Backward compatibility alias for trackInitiateCheckoutView
 */
export function trackFormOpened(_context?: string): void {
  trackInitiateCheckoutView();
}

/**
 * 5. Form Interaction (Started typing in an input field)
 */
export function trackFormFieldFocus(fieldName: 'fullname' | 'phone' | 'wilaya' | 'address'): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  const session = getCurrentSession();
  const formStarted = session.furthestStep === 'form_started' || session.furthestStep === 'purchase';
  if (!formStarted) {
    advanceStep('form_started', fieldName);
  } else {
    advanceStep(session.furthestStep, fieldName);
  }
}

export const trackFormFieldEngagement = trackFormFieldFocus;

/**
 * 6. Form Validation Error
 */
export function trackFormValidationError(fieldOrMessage?: string): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  const desc = fieldOrMessage || '';
  let fieldName: 'fullname' | 'phone' | 'wilaya' | 'address' = 'phone';
  if (desc.includes('اسم') || desc.includes('name')) fieldName = 'fullname';
  else if (desc.includes('هاتف') || desc.includes('phone')) fieldName = 'phone';
  else if (desc.includes('ولاية') || desc.includes('wilaya')) fieldName = 'wilaya';
  else if (desc.includes('عنوان') || desc.includes('بلدية') || desc.includes('address')) fieldName = 'address';

  const session = getCurrentSession();
  session.validationErrorsCount = (session.validationErrorsCount || 0) + 1;
  saveCurrentSession(session);

  const stats = getFunnelStats();
  stats.validationFailed = (stats.validationFailed || 0) + 1;
  saveFunnelStats(stats, true);

  postEventToServer('validation_failed', { fieldName });
}

export const trackValidationFailed = trackFormValidationError;

/**
 * 7. Purchase Completed - flexible signature to accept (orderId, amount, name, eventId)
 */
export function trackPurchaseSuccess(
  param1: string | number,
  param2: string | number,
  packageName?: string,
  eventId?: string
): void {
  const orderId = typeof param1 === 'string' ? param1 : String(param2);
  const amount = typeof param1 === 'number' ? param1 : (typeof param2 === 'number' ? param2 : 9500);

  if (typeof window === 'undefined') return;
  const didFire = trackPurchase({
    order_id: orderId,
    value: amount,
    currency: 'DZD',
    content_name: packageName || 'جهاز مساج Theoria Pro',
    event_id: eventId,
  });

  const session = getCurrentSession();
  session.orderCompleted = true;
  saveCurrentSession(session);

  if (didFire) {
    advanceStep('purchase', undefined, { selectedPackage: packageName, totalPrice: amount });
  }
}

export const trackPurchaseComplete = trackPurchaseSuccess;

/**
 * Realtime hook listener for Admin Dashboard with multi-device polling & channel sync.
 * Always merges incoming data so nothing is ever forgotten or zeroed out.
 */
export function subscribeToAnalytics(callback: (stats: FunnelStats) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // 1. Deliver immediate local cache with vault fallback
  callback(getFunnelStats());

  // 2. Fetch latest server state immediately and merge safely
  fetchServerStats().then((serverStats) => {
    if (serverStats) {
      callback(serverStats);
    }
  });

  // 3. Poll server every 3 seconds so mobile phone visits appear live in dashboard
  const pollTimer = window.setInterval(async () => {
    const freshStats = await fetchServerStats();
    if (freshStats) {
      callback(freshStats);
    }
  }, 3000);

  // 4. Tab-to-tab Broadcast listener
  const handleBroadcast = (event: MessageEvent) => {
    if (event.data?.type === 'STATS_UPDATED' && event.data.stats) {
      const merged = mergeFunnelStats(getFunnelStats(), event.data.stats);
      callback(merged);
    } else if (event.data?.type === 'ANALYTICS_CLEARED') {
      callback(getInitialStats());
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        callback(parsed);
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
