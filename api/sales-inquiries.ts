import { applyCors } from './_cors.js';
import { extractBearerToken, verifyAdminToken } from './_adminAuth.js';
import { loadInquiriesFromFile, clearInquiries } from './_salesInquiriesStorage.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, 'GET,OPTIONS,POST')) return res;

  // Verify Admin Authentication
  const token = extractBearerToken(req.headers, req.query);
  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({
      success: false,
      error: 'غير مصرح: يجب تسجيل الدخول للوحة التحكم لعرض استفسارات العملاء.',
    });
  }

  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const list = loadInquiriesFromFile();
    return res.status(200).json({
      success: true,
      inquiries: list,
    });
  }

  if (method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body.action === 'clear') {
      clearInquiries();
      return res.status(200).json({
        success: true,
        message: 'تم مسح سجل الاستفسارات بنجاح.',
        inquiries: [],
      });
    }
    return res.status(400).json({ success: false, error: 'Unknown action' });
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
