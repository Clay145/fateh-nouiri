// Vercel Serverless Function compatible types
interface VercelRequest {
  method?: string;
  query: Record<string, string | string[]>;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (data: any) => VercelResponse;
  send: (body: any) => VercelResponse;
  end: () => VercelResponse;
  setHeader: (name: string, value: string) => VercelResponse;
}

const VALID_PASSWORDS = ['theoria2026', 'IMAD34', 'imad34', 'admin2026'];

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = (req.headers.authorization || '') as string;
  const queryToken = (req.query?.token || '') as string;
  const token = (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '') || queryToken;

  if (token) {
    const clean = token.trim();
    if (clean.startsWith('admin_token_') || VALID_PASSWORDS.includes(clean)) {
      return res.status(200).json({ success: true, authenticated: true });
    }
  }

  return res.status(401).json({ success: false, authenticated: false });
}
