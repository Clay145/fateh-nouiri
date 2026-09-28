/**
 * Shared Meta click-id (fbc) / browser-id (fbp) validation for every CAPI leg.
 *
 * Why this file exists: "Server sending modified fbclid value in fbc" is a
 * High-priority Events Manager error, and its only cause is a server that
 * rewrites the value it received. sanitizeAndValidateFbc() used to be copy
 * pasted across four files and one of those copies (api/meta-test-event.ts)
 * re-synthesized fbc from a bare fbclid using Date.now() as the click time —
 * an instant, guaranteed diagnosis for Meta.
 *
 * Rules enforced here (identical for all events, browser and server):
 * - fbc format is exactly fb.{subdomainIndex}.{creationTimeMs}.{fbclid}
 * - NEVER lowercased, truncated, re-encoded, or rebuilt
 * - a valid fbc whose click time is in the future or older than 90 days is
 *   dropped (Meta: omit the field entirely rather than send a wrong value)
 * - fbc is NEVER synthesized on the server. The original click time only
 *   exists in the browser (getFbcCookie() in src/utils/pixel.ts), so a
 *   server-side fbc would always carry a fabricated timestamp.
 *
 * fbp is a Meta-format browser id: fb.{index}.{creationTimeMs}.{random}.
 * It is validated, never invented, for the same reason.
 */

const FBC_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const FBC_CLOCK_SKEW_MS = 5 * 60 * 1000;

const FBC_PATTERN = /^fb\.([0-9]+)\.([0-9]{10,15})\.([a-zA-Z0-9_-]+)$/;
const FBP_PATTERN = /^fb\.([0-9]+)\.([0-9]{10,15})\.([a-zA-Z0-9_-]+)$/;

const BLOCKED_FBCLID_PLACEHOLDERS = [
  'test',
  'dummy',
  'undefined',
  'null',
  'none',
  'iwar0123456789abcdef',
  '123456',
  'fake',
];

/**
 * True when an fbclid is authentic and intact (base64url-ish, 25..500 chars).
 * A truncated or placeholder click id is rejected outright so it can never
 * reach Meta inside fbc.
 */
export function isValidFbclid(fbclid?: string | null): boolean {
  if (!fbclid || typeof fbclid !== 'string') return false;
  const clean = fbclid.trim().replace(/^["']|["']$/g, '');
  if (BLOCKED_FBCLID_PLACEHOLDERS.includes(clean.toLowerCase())) return false;
  if (clean.length < 25 || clean.length > 500) return false;
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return false;
  return true;
}

/**
 * Validate a browser-supplied fbc and return it UNCHANGED, or undefined when
 * it must be omitted. Takes no fbclid argument on purpose: rebuilding fbc
 * server-side is the exact behavior that triggered the Meta error.
 */
export function sanitizeAndValidateFbc(rawFbc?: string | null): string | undefined {
  if (!rawFbc || typeof rawFbc !== 'string') return undefined;

  let clean = rawFbc.trim().replace(/^["']|["']$/g, '');
  // decodeURIComponent only undoes percent-encoding from cookie transport; it
  // is a round-trip, not a rewrite (the character set is preserved).
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // keep the raw value
  }

  const match = clean.match(FBC_PATTERN);
  if (!match) return undefined;

  const subdomainIndex = match[1];
  const creationTimeMs = Number(match[2]);
  const fbclid = match[3];
  if (!isValidFbclid(fbclid)) return undefined;

  const now = Date.now();
  if (!Number.isFinite(creationTimeMs)) return undefined;
  if (creationTimeMs > now + FBC_CLOCK_SKEW_MS) return undefined;
  if (creationTimeMs < now - FBC_MAX_AGE_MS) return undefined;

  return `fb.${subdomainIndex}.${creationTimeMs}.${fbclid}`;
}

/**
 * Validate a Meta-format _fbp value. Never invented server-side: a fabricated
 * fbp pollutes the browser-id space and is treated as a mismatched user.
 */
export function sanitizeAndValidateFbp(rawFbp?: string | null): string | undefined {
  if (!rawFbp || typeof rawFbp !== 'string') return undefined;
  let clean = rawFbp.trim().replace(/^["']|["']$/g, '');
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // keep the raw value
  }
  if (!FBP_PATTERN.test(clean)) return undefined;
  return clean;
}

/**
 * Read _fbp from a raw Cookie header.
 */
export function readFbpFromCookieHeader(cookieHeader?: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  return sanitizeAndValidateFbp(cookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/)?.[1]);
}

/**
 * Read _fbc from a raw Cookie header.
 */
export function readFbcFromCookieHeader(cookieHeader?: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  return sanitizeAndValidateFbc(cookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1]);
}

/**
 * First hop of x-forwarded-for / x-real-ip, or undefined. Used only to decide
 * whether to send a client_ip_address at all — the raw value never reaches CAPI
 * user_data directly (see withClientIpAndUa).
 */
export function extractClientIp(headers: Record<string, string | string[] | undefined>): string | undefined {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const candidate =
    first(headers['x-forwarded-for'])?.split(',')[0]?.trim() ||
    first(headers['x-real-ip'])?.trim() ||
    '';
  return isUsableClientIp(candidate) ? candidate : undefined;
}

/**
 * Drop anything that is not a routable public IPv4/IPv6 address: loopback,
 * RFC1918, link-local, unique-local (fc00::/7) and the placeholder Vercel sets
 * for internal hops. Sending one of those to Meta guarantees a
 * "client IP associated with multiple users" flag because thousands of
 * visitors share the value.
 */
export function isUsableClientIp(ip?: string | null): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const value = ip.trim().replace(/^::ffff:/i, '');
  if (!value) return false;
  if (value === 'unknown') return false;

  if (value.includes(':')) {
    const v = value.toLowerCase().split('%')[0];
    if (v === '::' || v === '::1') return false;
    if (/^f[cd]/.test(v)) return false;
    if (v.startsWith('fe80')) return false;
    return /^[0-9a-f:]+$/.test(v);
  }

  const parts = value.split('.');
  if (parts.length !== 4) return false;
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return false;
  const octets = parts.map(Number);
  if (octets.some((o) => o > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

/**
 * Attach client_ip_address + client_user_agent to a CAPI user_data object as a
 * PAIR. Meta expects the IP to be the one the browser event came from; an IP
 * with no user agent (or the reverse) is what makes Meta treat one address as
 * "multiple users". When the user agent is missing we send neither, and
 * matching falls back to fbp / external_id instead.
 */
export function applyClientContext(
  userData: Record<string, unknown>,
  context: { ip?: string | null; userAgent?: string | null }
): void {
  const ip = context.ip ? context.ip.trim() : '';
  const userAgent = context.userAgent ? String(context.userAgent).trim() : '';
  if (!ip || !userAgent) return;
  if (!isUsableClientIp(ip)) return;
  userData.client_ip_address = ip;
  userData.client_user_agent = userAgent;
}
