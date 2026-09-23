import { trackAddToCart, trackInitiateCheckout, trackPurchase, trackPixelEvent, trackPageView, getFbpCookie, getFbcCookie, getMetaConversionAmount } from '../utils/pixel';

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
 * Send event to backend server so ANY visitor (phone, laptop, tablet) is saved centrally.
 * Forwards the shared Meta eventID + event name so the server can fire the matching
 * Conversions API event with the SAME event_id (browser/server deduplication).
 */
function getMetaTestEventCode(): string | undefined {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (
        params.get('test_event_code') ||
        params.get('testEventCode') ||
        sessionStorage.getItem('meta_test_event_code') ||
        undefined
      );
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Partial form identity cache: lets early field touches (name/phone/wilaya)
 * enrich the NEXT server CAPI event (Lead/IC) even though analyticsService
 * never sees the raw form state. Plain values only; server hashes them.
 * Cleared on purchase/validation reset paths via clearAnalytics().
 */
const PARTIAL_IDENTITY_KEY = 'theoria_partial_identity';

export function savePartialIdentity(partial: {
  customerName?: string;
  phone?: string;
  wilaya?: string;
  commune?: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(PARTIAL_IDENTITY_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    const merged = { ...prev };
    if (partial.customerName !== undefined) merged.customerName = partial.customerName;
    if (partial.phone !== undefined) merged.phone = partial.phone;
    if (partial.wilaya !== undefined) merged.wilaya = partial.wilaya;
    if (partial.commune !== undefined) merged.commune = partial.commune;
    sessionStorage.setItem(PARTIAL_IDENTITY_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

function readPartialIdentity(): {
  customerName?: string;
  phone?: string;
  wilaya?: string;
  commune?: string;
} {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(PARTIAL_IDENTITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : undefined,
      phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
      wilaya: typeof parsed.wilaya === 'string' ? parsed.wilaya : undefined,
      commune: typeof parsed.commune === 'string' ? parsed.commune : undefined,
    };
  } catch {
    return {};
  }
}

function postEventToServer(
  event: FunnelStep,
  extra?: {
    fieldName?: 'fullname' | 'phone' | 'wilaya' | 'address';
    selectedPackage?: string;
    totalPrice?: number;
    eventId?: string;
    metaEventName?: 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'PageView' | 'Lead';
    value?: number;
    currency?: string;
    contentName?: string;
    contentIds?: string[];
    numItems?: number;
    // Enrichment: identity captured on the form (forwarded for CAPI hashing).
    customerName?: string;
    phone?: string;
    wilaya?: string;
    commune?: string;
    // Enrichment: real package economics + behavioral context.
    packageId?: string;
    units?: number;
    discountValue?: number;
    wilayaCode?: string;
    ctaLabel?: string;
    fieldCompleted?: string;
  }
) {
  if (typeof window === 'undefined') return;
  const session = getCurrentSession();
  const partial = readPartialIdentity();

  const payload = {
    sessionId: session.id,
    event,
    device: session.device,
    source: session.source,
    fieldName: extra?.fieldName,
    selectedPackage: extra?.selectedPackage || session.selectedPackage,
    totalPrice: extra?.totalPrice,
    eventId: extra?.eventId,
    metaEventName: extra?.metaEventName,
    value: extra?.value ?? extra?.totalPrice,
    currency: extra?.currency,
    contentName: extra?.contentName ?? extra?.selectedPackage,
    contentIds: extra?.contentIds,
    numItems: extra?.numItems ?? extra?.units ?? 1,
    // Identity (explicit arg wins, then form-partial cache). Server hashes.
    customerName: extra?.customerName || partial.customerName || undefined,
    phone: extra?.phone || partial.phone || undefined,
    wilaya: extra?.wilaya || partial.wilaya || undefined,
    commune: extra?.commune || partial.commune || undefined,
    // Economics + context for CAPI custom_data.
    packageId: extra?.packageId || undefined,
    units: extra?.units ?? extra?.numItems ?? undefined,
    discountValue: extra?.discountValue ?? undefined,
    wilayaCode: extra?.wilayaCode || undefined,
    ctaLabel: extra?.ctaLabel || undefined,
    fieldCompleted: extra?.fieldCompleted || extra?.fieldName || undefined,
    trafficSource: session.source,
    deviceType: session.device,
    dwellS: Math.max(0, Math.round((Date.now() - (session.startTime || Date.now())) / 1000)),
    testEventCode: getMetaTestEventCode(),
    fbp: getFbpCookie() || undefined,
    fbc: getFbcCookie() || undefined,
    // Real page URL so server CAPI event_source_url is identical to the
    // browser event's URL (better matching than the Referer header fallback).
    pageUrl: window.location.href,
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
      sessionStorage.removeItem(PARTIAL_IDENTITY_KEY);
      sessionStorage.removeItem('theoria_tracked_pv');
      sessionStorage.removeItem('theoria_tracked_eng');
      sessionStorage.removeItem('theoria_tracked_checkout');
      sessionStorage.removeItem('theoria_fired_atc');
      sessionStorage.removeItem('theoria_fired_lead');
      sessionStorage.removeItem('theoria_field_touched_fullname');
      sessionStorage.removeItem('theoria_field_touched_phone');
      sessionStorage.removeItem('theoria_field_touched_wilaya');
      sessionStorage.removeItem('theoria_field_touched_address');
      localStorage.removeItem(BACKUP_STORAGE_KEY);
      const token = localStorage.getItem('theoria_admin_token') || sessionStorage.getItem('theoria_admin_token') || '';
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
 * Route-only: a stored admin token must NOT disable customer tracking on store
 * pages, otherwise any browser that ever logged into #admin silently stops
 * sending ViewContent/AddToCart/InitiateCheckout (browser + CAPI).
 */
let adminSuppressLogged = false;
function isAdminContext(): boolean {
  if (typeof window === 'undefined') return false;
  const suppressed =
    window.location.hash.includes('admin') ||
    window.location.pathname.includes('/admin');
  if (suppressed && !adminSuppressLogged) {
    adminSuppressLogged = true;
    console.info('[Analytics] suppressed: admin view — funnel + Meta standard events disabled on this page only.');
  }
  return suppressed;
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
  extra?: {
    selectedPackage?: string;
    totalPrice?: number;
    eventId?: string;
    metaEventName?: 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'PageView' | 'Lead';
    value?: number;
    currency?: string;
    contentName?: string;
    contentIds?: string[];
    numItems?: number;
    customerName?: string;
    phone?: string;
    wilaya?: string;
    commune?: string;
    packageId?: string;
    units?: number;
    discountValue?: number;
    wilayaCode?: string;
    ctaLabel?: string;
    fieldCompleted?: string;
  }
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

  // Sync to Backend Server immediately (shares the SAME eventId as the browser pixel)
  postEventToServer(newStep, {
    fieldName,
    selectedPackage: extra?.selectedPackage || session.selectedPackage,
    totalPrice: extra?.totalPrice,
    eventId: extra?.eventId,
    metaEventName: extra?.metaEventName,
    value: extra?.value ?? extra?.totalPrice,
    currency: extra?.currency,
    contentName: extra?.contentName ?? extra?.selectedPackage,
    contentIds: extra?.contentIds,
    numItems: extra?.numItems ?? extra?.units ?? 1,
    customerName: extra?.customerName,
    phone: extra?.phone,
    wilaya: extra?.wilaya,
    commune: extra?.commune,
    packageId: extra?.packageId,
    units: extra?.units ?? extra?.numItems,
    discountValue: extra?.discountValue,
    wilayaCode: extra?.wilayaCode,
    ctaLabel: extra?.ctaLabel,
    fieldCompleted: extra?.fieldCompleted ?? fieldName,
  });
}

// -------------------------------------------------------------
// Public Tracking Functions Called by Customer Interactions
// -------------------------------------------------------------

/**
 * 1. Initial Page View Tracking: funnel count + browser PageView pixel +
 * matching server CAPI PageView sharing the SAME event_id (dedup to one).
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
    const pvEventId = trackPageView();
    postEventToServer('page_view', { eventId: pvEventId, metaEventName: 'PageView' });
  }
}

/**
 * 2. Content Engaged Tracking (Deep scroll / reading features)
 * Enriched: full catalog content_ids (all 3 packs) + category + traffic/device
 * context so ViewContent builds a usable retargeting pool.
 */
export function trackContentEngagement(): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  if (!sessionStorage.getItem('theoria_tracked_eng')) {
    sessionStorage.setItem('theoria_tracked_eng', 'true');
    const vcEventId = `vc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // Same converted value/currency as CAPI so browser + server match on more than event_id.
    const { value: vcValue, currency: vcCurrency } = getMetaConversionAmount(9500);
    const session = getCurrentSession();
    const catalogIds = [
      'theoria_eye_massager_single',
      'theoria_eye_massager_double',
      'theoria_eye_massager_triple',
    ];
    trackPixelEvent('ViewContent', {
      content_name: 'جهاز مساج واسترخاء العينين Theoria',
      content_type: 'product',
      content_category: 'eye_care_device',
      content_ids: catalogIds,
      value: vcValue,
      currency: vcCurrency,
      num_items: 1,
      traffic_source: session.source,
      device_type: session.device,
    }, { eventID: vcEventId });
    advanceStep('content_engaged', undefined, {
      eventId: vcEventId,
      metaEventName: 'ViewContent',
      value: 9500,
      currency: 'DZD',
      contentName: 'جهاز مساج واسترخاء العينين Theoria',
      contentIds: catalogIds,
      numItems: 1,
    });
  }
}

/**
 * 3. Add to Cart (CTA "اطلب الآن" clicked)
 * Enriched opts (4th arg, optional): real package economics + CTA label.
 * Existing 3-arg callers keep working unchanged.
 */
export function trackAddToCartClick(
  packageName?: string,
  value?: number,
  contentIds?: string[],
  opts?: {
    packageId?: string;
    units?: number;
    discountValue?: number;
    wilayaCode?: string;
    ctaLabel?: string;
  }
): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  // Once per session: repeat CTA / package clicks only update the funnel,
  // they must not fire new browser pixel or CAPI events.
  if (!sessionStorage.getItem('theoria_fired_atc')) {
    const atcEventId = `atc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    sessionStorage.setItem('theoria_fired_atc', atcEventId);
    const rawValue = value || 9500;
    const session = getCurrentSession();
    trackAddToCart({
      content_name: packageName || 'جهاز مساج Theoria Pro',
      value: rawValue,
      currency: 'DZD',
      event_id: atcEventId,
      content_ids: contentIds,
      packageId: opts?.packageId,
      units: opts?.units,
      discountValue: opts?.discountValue,
      wilayaCode: opts?.wilayaCode,
      trafficSource: session.source,
      deviceType: session.device,
      ctaLabel: opts?.ctaLabel || packageName,
    });
    advanceStep('add_to_cart', undefined, {
      selectedPackage: packageName,
      eventId: atcEventId,
      metaEventName: 'AddToCart',
      value: rawValue,
      currency: 'DZD',
      contentName: packageName || 'جهاز مساج Theoria Pro',
      contentIds,
      numItems: opts?.units ?? 1,
      packageId: opts?.packageId,
      units: opts?.units,
      discountValue: opts?.discountValue,
      wilayaCode: opts?.wilayaCode,
      ctaLabel: opts?.ctaLabel || packageName,
    });
    return;
  }
  advanceStep('add_to_cart', undefined, { selectedPackage: packageName });
}

/**
 * 4. Initiate Checkout (First real intent inside the Order Form)
 * Fires ONLY on genuine purchase intent: first field focus/typing or
 * package selection inside the form. Mere scrolling/viewing the form
 * must NOT count as InitiateCheckout.
 * Enriched opts: real package economics (fixes generic content_name).
 */
export function trackInitiateCheckoutView(
  value?: number,
  contentIds?: string[],
  opts?: {
    packageId?: string;
    packageName?: string;
    units?: number;
    discountValue?: number;
    wilayaCode?: string;
  }
): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  if (!sessionStorage.getItem('theoria_tracked_checkout')) {
    sessionStorage.setItem('theoria_tracked_checkout', 'true');
    const icEventId = `ic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const rawValue = value || 9500;
    const session = getCurrentSession();
    trackInitiateCheckout({
      content_name: opts?.packageName || 'جهاز مساج Theoria Pro',
      value: rawValue,
      currency: 'DZD',
      event_id: icEventId,
      content_ids: contentIds,
      packageId: opts?.packageId,
      units: opts?.units,
      discountValue: opts?.discountValue,
      wilayaCode: opts?.wilayaCode,
      trafficSource: session.source,
      deviceType: session.device,
    });
    advanceStep('initiate_checkout', undefined, {
      eventId: icEventId,
      metaEventName: 'InitiateCheckout',
      value: rawValue,
      currency: 'DZD',
      contentName: opts?.packageName || 'جهاز مساج Theoria Pro',
      contentIds,
      numItems: opts?.units ?? 1,
      packageId: opts?.packageId,
      units: opts?.units,
      discountValue: opts?.discountValue,
      wilayaCode: opts?.wilayaCode,
    });
  }
}

/**
 * Backward compatibility alias for trackInitiateCheckoutView
 */
export function trackFormOpened(_context?: string): void {
  trackInitiateCheckoutView();
}

/**
 * 5. Form Interaction (first touch of an input field)
 * Counts once per field per session: the first touch advances to form_started
 * (single server POST). Later typing/focus on the same field only refreshes
 * lastActiveField silently — no counter bump, no server POST, no log spam.
 */
const FIELD_TOUCH_PREFIX = 'theoria_field_touched_';
export function trackFormFieldFocus(fieldName: 'fullname' | 'phone' | 'wilaya' | 'address'): void {
  if (typeof window === 'undefined' || isAdminContext()) return;
  // Intent gate: the very first field interaction also counts as InitiateCheckout.
  // This replaces the old view-based trigger so scrollers are not counted.
  if (!sessionStorage.getItem('theoria_tracked_checkout')) {
    trackInitiateCheckoutView();
  }
  // Repeat touch of an already-counted field: silent last-active refresh only.
  try {
    if (sessionStorage.getItem(FIELD_TOUCH_PREFIX + fieldName)) {
      const session = getCurrentSession();
      if (session.lastActiveField !== fieldName) {
        session.lastActiveField = fieldName;
        saveCurrentSession(session);
      }
      return;
    }
    sessionStorage.setItem(FIELD_TOUCH_PREFIX + fieldName, '1');
  } catch {
    // sessionStorage unavailable: fall through to counted path
  }
  const session = getCurrentSession();
  const formStarted = session.furthestStep === 'form_started' || session.furthestStep === 'purchase';
  if (!formStarted) {
    advanceStep('form_started', fieldName);
    // Mid-funnel algorithm signal: one shared-ID Lead per session on the
    // very first form interaction (browser pixel + matching server CAPI).
    try {
      if (!sessionStorage.getItem('theoria_fired_lead')) {
        const ldEventId = `ld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        sessionStorage.setItem('theoria_fired_lead', ldEventId);
        const { value: ldValue, currency: ldCurrency } = getMetaConversionAmount(9500);
        const leadSession = getCurrentSession();
        trackPixelEvent('Lead', {
          content_name: 'Checkout Form Started - Theoria',
          content_type: 'product',
          content_category: 'eye_care_device',
          content_ids: ['theoria_eye_massager_pro'],
          value: ldValue,
          currency: ldCurrency,
          original_value: 9500,
          original_currency: 'DZD',
          field_completed: fieldName,
          traffic_source: leadSession.source,
          device_type: leadSession.device,
        }, { eventID: ldEventId });
        postEventToServer('form_started', {
          fieldName,
          eventId: ldEventId,
          metaEventName: 'Lead',
          value: 9500,
          currency: 'DZD',
          contentName: 'Checkout Form Started - Theoria',
          contentIds: ['theoria_eye_massager_pro'],
          numItems: 1,
          fieldCompleted: fieldName,
        });
      }
    } catch {
      // tracking must never break the form
    }
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
