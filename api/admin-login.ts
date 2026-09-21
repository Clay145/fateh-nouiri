// Vercel Serverless Function compatible types
import { applyCors } from './_cors.js';
import { isAdminConfigured, issueAdminToken, verifyAdminPassword } from './_adminAuth.js';

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

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { password } = body;

  if (!isAdminConfigured()) {
    return res.status(503).json({ success: false, error: 'دخول الإدارة غير مُعد على الخادم (ADMIN_SECRET_KEY).' });
  }

  if (verifyAdminPassword(password)) {
    const token = issueAdminToken();
    return res.status(200).json({ success: true, token });
  }

  return res.status(401).json({ success: false, error: 'كلمة مرور لوحة الإدارة غير صحيحة' });
}
