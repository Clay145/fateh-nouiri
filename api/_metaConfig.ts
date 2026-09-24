/**
 * Single source of truth for Meta Pixel / CAPI configuration.
 *
 * The pixel ID was previously hardcoded in 7+ places, which made a
 * wrong-ID deploy (the 100/33 "object does not exist / missing
 * permissions" error) hard to spot. All server code must resolve the
 * pixel through getMetaPixelId() so Vercel env META_PIXEL_ID always wins
 * and there is exactly one fallback to audit.
 *
 * NOTE: the CAPI access token lives here only as a reader
 * (getMetaAccessToken). Never import this file from browser code —
 * the token must never leak to the client.
 */

export const META_PIXEL_ID_FALLBACK = '28477410788542282';

/** Effective Meta pixel / dataset ID (env wins, single audited fallback). */
export function getMetaPixelId(): string {
  const fromEnv = (process.env.META_PIXEL_ID || '').trim();
  if (fromEnv) return fromEnv;
  return META_PIXEL_ID_FALLBACK;
}

/** True when META_PIXEL_ID env is missing and the fallback is in effect. */
export function isMetaPixelFallback(): boolean {
  return !(process.env.META_PIXEL_ID || '').trim();
}

/** CAPI access token reader (env-only, never hardcoded). */
export function getMetaAccessToken(): string {
  return process.env.META_CONVERSIONS_API_ACCESS_TOKEN || process.env.FB_CONVERSIONS_API_TOKEN || '';
}

/** Normalized reporting currency (browser + CAPI must agree; DZD is rejected by fbevents.js). */
export function getMetaCurrency(): string {
  return (process.env.META_CURRENCY || process.env.VITE_META_CURRENCY || 'USD').toUpperCase();
}
