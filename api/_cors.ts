/**
 * Shared CORS helper: echo the request Origin only when it is allow-listed.
 * Never `*` together with credentials. Preflight (OPTIONS) is answered here.
 */

interface CorsReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface CorsRes {
  status: (statusCode: number) => CorsRes;
  end: () => CorsRes;
  setHeader: (name: string, value: string) => CorsRes;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://theoriastore.com',
  'https://www.theoriastore.com',
  'https://fateh-nouiri.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function getAllowedOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]));
}

function firstHeader(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] || '' : v || '';
}

/**
 * Apply CORS headers. Returns true when the request was a preflight that has
 * been fully answered (caller should return immediately).
 */
export function applyCors(
  req: CorsReq,
  res: CorsRes,
  methods: string,
  extraAllowHeaders?: string
): boolean {
  const origin = firstHeader(req.headers['origin'] as string | string[] | undefined);
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Non-browser callers (curl, server-to-server): mirror nothing, allow same-origin use.
    res.setHeader('Access-Control-Allow-Origin', allowed[0]);
  } else {
    // Unknown origin: do not reflect it; browser blocks the read.
    res.setHeader('Access-Control-Allow-Origin', allowed[0]);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    extraAllowHeaders ||
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
