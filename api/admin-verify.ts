// Vercel Serverless Function compatible types
import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';

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

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, 'GET,OPTIONS,POST')) return res;

  const token = extractBearerToken(req.headers, req.query);

  if (token && verifyAdminToken(token)) {
    return res.status(200).json({ success: true, authenticated: true });
  }

  // Intentionally 200 (not 401): this is a session *check*, and "no session"
  // is an expected state for every storefront visitor. A 4xx makes Chrome
  // print "Failed to load resource" console noise that looks like an error.
  // True protected APIs (/api/orders, /api/meta/*) still return 401.
  return res.status(200).json({ success: false, authenticated: false });
}
