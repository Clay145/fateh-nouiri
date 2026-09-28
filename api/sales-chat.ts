import { applyCors } from './_cors.js';
import { handleSalesChatRequest, ChatMessage } from './_salesAgentLogic.js';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const result = await handleSalesChatRequest(messages);
    return res.status(200).json({
      success: true,
      reply: result.reply,
      orderData: result.orderData,
    });
  } catch (error: any) {
    console.error('[api/sales-chat] Uncaught handler error:', error);
    return res.status(500).json({
      success: false,
      error: 'حدث خطأ غير متوقع أثناء معالجة المحادثة.',
    });
  }
}
