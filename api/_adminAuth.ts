import crypto from 'crypto';

/**
 * Shared admin authentication for all backends (local Express server.ts and
 * Vercel serverless functions). Stateless HMAC-signed bearer tokens.
 *
 * - Secret comes ONLY from process.env.ADMIN_SECRET_KEY (fail closed: if it
 *   is unset, no login can succeed and no token verifies).
 * - No hardcoded passwords, no self-mintable `admin_token_*` prefixes.
 * - Token format: `adm1.<expMs>.<hexHmac>` where the HMAC covers `adm1.<expMs>`.
 */

const TOKEN_PREFIX = 'adm1';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET_KEY || '';
}

export function isAdminConfigured(): boolean {
  return getAdminSecret().length >= 8;
}

function timingSafeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Constant-time password check against the env secret. Fail closed. */
export function verifyAdminPassword(password: unknown): boolean {
  const secret = getAdminSecret();
  if (!secret || secret.length < 8) return false;
  const clean = (password ?? '').toString();
  if (!clean) return false;
  return timingSafeEq(clean, secret);
}

function sign(expMs: number): string {
  return crypto.createHmac('sha256', getAdminSecret()).update(`${TOKEN_PREFIX}.${expMs}`).digest('hex');
}

/** Issue a signed bearer token, or null when no secret is configured. */
export function issueAdminToken(now: number = Date.now()): string | null {
  if (!isAdminConfigured()) return null;
  const exp = now + TOKEN_TTL_MS;
  return `${TOKEN_PREFIX}.${exp}.${sign(exp)}`;
}

/** Verify a bearer token (signature + expiry). Fail closed. */
export function verifyAdminToken(token: unknown): boolean {
  if (!isAdminConfigured()) return false;
  if (typeof token !== 'string') return false;
  const clean = token.trim();
  const parts = clean.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  return timingSafeEq(parts[2].toLowerCase(), sign(exp).toLowerCase());
}

function firstHeader(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] || '' : v || '';
}

/** Extract a bearer token from Authorization header or ?token= query. */
export function extractBearerToken(
  headers: Record<string, string | string[] | undefined>,
  query?: Record<string, string | string[] | undefined>
): string {
  const auth = firstHeader(headers['authorization'] as string | string[] | undefined);
  if (auth) return auth.replace(/^Bearer\s+/i, '').trim();
  // Express-style lowercase header bag
  const authLower = firstHeader((headers as Record<string, unknown>)['authorization'] as string | string[] | undefined);
  if (authLower) return authLower.replace(/^Bearer\s+/i, '').trim();
  if (query) {
    const q = query['token'];
    const qv = Array.isArray(q) ? q[0] : q;
    if (typeof qv === 'string' && qv) return qv.trim();
  }
  return '';
}
