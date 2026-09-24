/**
 * Shared Meta Conversions API token helpers (server-side only — never import
 * from browser code; the access token must never leak to the client).
 *
 * Meta error 190 (OAuthException, e.g. subcode 460 "session invalidated")
 * means the CAPI access token is dead — typically a user-bound token killed
 * by a password change. No code can revive it: an admin must generate a
 * System User token and update META_CONVERSIONS_API_ACCESS_TOKEN. These
 * helpers make that failure loud and actionable instead of a raw body dump.
 */

import { getMetaAccessToken } from './_metaConfig.js';
export { getMetaAccessToken };

export type MetaErrorDisposition = 'ok' | 'definitive' | 'retryable';

/**
 * Classify a Meta Graph response so every CAPI caller shares one
 * retry policy:
 * - ok: HTTP 2xx with events_received (or fbtrace_id without error).
 * - definitive: 100/33 (no pixel grant), 190 (dead token), any other
 *   4xx — retrying with the same payload can never succeed. Caller must
 *   claim SENT/deduped and stop.
 * - retryable: 429 / 5xx / network / timeout — caller must release its
 *   in-flight guard so the next beacon retries with the SAME event_id
 *   (Meta dedupes by event_id, so a retry can never double-count).
 */
export function classifyMetaError(httpStatus: number, metaData: any): MetaErrorDisposition {
  const err = metaData?.error;
  if (httpStatus >= 200 && httpStatus < 300 && !err) return 'ok';
  if (err && (isInvalidTokenResponse(metaData) || isPixelAccessDeniedResponse(metaData))) {
    return 'definitive';
  }
  if (httpStatus >= 400 && httpStatus < 500) return 'definitive';
  return 'retryable';
}

/**
 * Report a failed Meta body with the actionable throttled loggers and
 * return its disposition. Callers branch on the return value instead of
 * re-implementing status-code checks inline.
 */
export function handleMetaErrorBody(metaData: any, context: string, pixelId: string, httpStatus: number): MetaErrorDisposition {
  reportMetaTokenIfInvalid(metaData, context);
  reportMetaPixelAccessIfDenied(metaData, context, pixelId);
  return classifyMetaError(httpStatus, metaData);
}

/** True when a Meta Graph error body reports an invalid/dead access token. */
export function isInvalidTokenResponse(metaData: any): boolean {
  const err = metaData?.error || metaData;
  return Number(err?.code) === 190 && String(err?.type || '').toLowerCase().includes('oauth');
}

/**
 * True when Meta reports the target object (pixel/dataset) as inaccessible:
 * GraphMethodException 100/33 on POST /{pixel}/events, or OAuthException
 * 100 "(#100) Missing Permission" on GET /{pixel} — both mean the token is
 * alive but has no grant on that dataset. Typical right after minting a
 * fresh System User token before assigning the pixel asset to that user.
 */
export function isPixelAccessDeniedResponse(metaData: any): boolean {
  const err = metaData?.error || metaData;
  if (Number(err?.code) !== 100) return false;
  if (Number((err as any)?.error_subcode) === 33) return true;
  const msg = String((err as any)?.message || '').toLowerCase();
  return msg.includes('missing permission') || msg.includes('does not exist');
}

declare global {
  var __THEORIA_TOKEN_WARNED_AT__: number | undefined;
  var __THEORIA_PIXEL_WARNED_AT__: number | undefined;
}

const INVALID_TOKEN_WARN_THROTTLE_MS = 10 * 60 * 1000;

/**
 * Log a throttled, actionable error when Meta reports code 190.
 * Returns true when the body was a 190 (caller keeps its own claim/retry logic).
 */
export function reportMetaTokenIfInvalid(metaData: any, context: string): boolean {
  if (!isInvalidTokenResponse(metaData)) return false;
  const now = Date.now();
  if (now - (global.__THEORIA_TOKEN_WARNED_AT__ || 0) < INVALID_TOKEN_WARN_THROTTLE_MS) return true;
  global.__THEORIA_TOKEN_WARNED_AT__ = now;
  const subcode = (metaData?.error || metaData)?.error_subcode;
  console.error(
    `[Meta CAPI] ACCESS TOKEN INVALID (code 190${subcode ? `/subcode ${subcode}` : ''}) on ${context}: ` +
      `the token was invalidated (password change / session rotation). ` +
      `Fix: Meta Business Settings > System Users > generate a token with ads_management, ` +
      `set Vercel env META_CONVERSIONS_API_ACCESS_TOKEN, redeploy. ` +
      `System User tokens have no password and are immune to this.`
  );
  return true;
}

/**
 * Log a throttled, actionable error when Meta reports 100/33 on the pixel.
 * The token is alive but has no grant on the dataset — assign the pixel
 * asset to the System User, then regenerate the token (post-grant minting
 * is the safe ordering). Returns true on match.
 */
export function reportMetaPixelAccessIfDenied(
  metaData: any,
  context: string,
  pixelId: string
): boolean {
  if (!isPixelAccessDeniedResponse(metaData)) return false;
  const now = Date.now();
  if (now - (global.__THEORIA_PIXEL_WARNED_AT__ || 0) < INVALID_TOKEN_WARN_THROTTLE_MS) return true;
  global.__THEORIA_PIXEL_WARNED_AT__ = now;
  console.error(
    `[Meta CAPI] PIXEL ACCESS DENIED (code 100/subcode 33) on ${context}: ` +
      `token has no grant on pixel ${pixelId}. ` +
      `Fix: Meta Business Settings > System Users > select user > Add Assets > dataset ${pixelId} (Manage pixel), ` +
      `then regenerate the token, set Vercel env META_CONVERSIONS_API_ACCESS_TOKEN, redeploy.`
  );
  return true;
}

export interface MetaTokenHealth {
  configured: boolean;
  /** true = live, false = dead/missing, null = probe inconclusive (network). */
  valid: boolean | null;
  reason: string | null;
  /** Pixel grant check: true = token can read the pixel, false = 100/33, null = unchecked/inconclusive. */
  pixelAccess: boolean | null;
  pixelId: string | null;
  checkedAt: number;
}

let cachedHealth: MetaTokenHealth | null = null;
const HEALTH_CACHE_TTL_MS = 60 * 1000;

/**
 * Live token check: GET /v20.0/me (token alive?) then GET /v20.0/{pixel}
 * (token granted on the dataset?). Cheap, sends no event. Cached 60s,
 * never throws — inconclusive results return valid/pixelAccess: null.
 */
export async function getMetaTokenHealth(pixelId?: string): Promise<MetaTokenHealth> {
  const now = Date.now();
  if (cachedHealth && now - cachedHealth.checkedAt < HEALTH_CACHE_TTL_MS) return cachedHealth;
  const token = getMetaAccessToken();
  if (!token) {
    cachedHealth = { configured: false, valid: false, reason: 'missing_token', pixelAccess: null, pixelId: pixelId || null, checkedAt: now };
    return cachedHealth;
  }
  const probe = async (url: string): Promise<{ res: Response; data: any } | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json().catch(() => null);
      return { res, data };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
  const me = await probe(`https://graph.facebook.com/v20.0/me?access_token=${token}`);
  if (!me) {
    cachedHealth = { configured: true, valid: null, reason: 'probe_timeout', pixelAccess: null, pixelId: pixelId || null, checkedAt: now };
    return cachedHealth;
  }
  if (isInvalidTokenResponse(me.data)) {
    cachedHealth = {
      configured: true,
      valid: false,
      reason: `invalid_token_190/${(me.data?.error || {}).error_subcode || 'nosubcode'}`,
      pixelAccess: null,
      pixelId: pixelId || null,
      checkedAt: now,
    };
    return cachedHealth;
  }
  if (!me.res.ok) {
    cachedHealth = { configured: true, valid: null, reason: `probe_http_${me.res.status}`, pixelAccess: null, pixelId: pixelId || null, checkedAt: now };
    return cachedHealth;
  }
  // Token alive — check the pixel grant (this is what bit us with 100/33).
  if (!pixelId) {
    cachedHealth = { configured: true, valid: true, reason: null, pixelAccess: null, pixelId: null, checkedAt: now };
    return cachedHealth;
  }
  const px = await probe(`https://graph.facebook.com/v20.0/${pixelId}?fields=id&access_token=${token}`);
  if (!px) {
    cachedHealth = { configured: true, valid: true, reason: null, pixelAccess: null, pixelId, checkedAt: now };
    return cachedHealth;
  }
  if (isPixelAccessDeniedResponse(px.data)) {
    cachedHealth = { configured: true, valid: true, reason: 'pixel_access_denied_100_33', pixelAccess: false, pixelId, checkedAt: now };
    return cachedHealth;
  }
  cachedHealth = {
    configured: true,
    valid: true,
    reason: null,
    pixelAccess: px.res.ok ? true : null,
    pixelId,
    checkedAt: now,
  };
  return cachedHealth;
}
