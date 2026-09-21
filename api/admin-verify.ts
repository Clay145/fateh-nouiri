// Vercel Serverless Function compatible types
import { applyCors } from './_cors';
import { extractBearerToken, verifyAdminToken } from './_adminAuth';

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

  return res.status(401).json({ success: false, authenticated: false });
}
