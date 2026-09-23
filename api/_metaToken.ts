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

export function getMetaAccessToken(): string {
  return process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN || '';
}

/** True when a Meta Graph error body reports an invalid/dead access token. */
export function isInvalidTokenResponse(metaData: any): boolean {
  const err = metaData?.error || metaData;
  return Number(err?.code) === 190 && String(err?.type || '').toLowerCase().includes('oauth');
}

declare global {
  var __THEORIA_TOKEN_WARNED_AT__: number | undefined;
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

export interface MetaTokenHealth {
  configured: boolean;
  /** true = live, false = dead/missing, null = probe inconclusive (network). */
  valid: boolean | null;
  reason: string | null;
  checkedAt: number;
}

let cachedHealth: MetaTokenHealth | null = null;
const HEALTH_CACHE_TTL_MS = 60 * 1000;

/**
 * Live token check via GET /v20.0/me (cheap, no event sent). Cached 60s,
 * never throws — inconclusive results return valid: null.
 */
export async function getMetaTokenHealth(): Promise<MetaTokenHealth> {
  const now = Date.now();
  if (cachedHealth && now - cachedHealth.checkedAt < HEALTH_CACHE_TTL_MS) return cachedHealth;
  const token = getMetaAccessToken();
  if (!token) {
    cachedHealth = { configured: false, valid: false, reason: 'missing_token', checkedAt: now };
    return cachedHealth;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${token}`, {
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (res.ok && !isInvalidTokenResponse(data)) {
      cachedHealth = { configured: true, valid: true, reason: null, checkedAt: now };
    } else if (isInvalidTokenResponse(data)) {
      cachedHealth = {
        configured: true,
        valid: false,
        reason: `invalid_token_190/${(data?.error || {}).error_subcode || 'nosubcode'}`,
        checkedAt: now,
      };
    } else {
      cachedHealth = { configured: true, valid: null, reason: `probe_http_${res.status}`, checkedAt: now };
    }
  } catch (err: any) {
    cachedHealth = {
      configured: true,
      valid: null,
      reason: err?.name === 'AbortError' ? 'probe_timeout' : 'probe_network_error',
      checkedAt: now,
    };
  } finally {
    clearTimeout(timeout);
  }
  return cachedHealth;
}
