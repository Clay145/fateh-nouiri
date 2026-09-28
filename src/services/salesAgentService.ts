export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  orderData?: {
    customerName?: string;
    phone?: string;
    wilaya?: string;
    commune?: string;
    packageId?: 'single' | 'double' | 'triple';
  };
}

const CHAT_STORAGE_KEY = 'theoria_sales_chat_history_v1';

export function loadStoredChat(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveStoredChat(messages: ChatMessage[]): void {
  try {
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
  } catch {
    // ignore
  }
}

export function clearStoredChat(): void {
  try {
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function sendSalesChatMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ reply: string; orderData?: ChatMessage['orderData'] }> {
  const response = await fetch('/api/sales-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'فشل الاتصال بمستشار المبيعات الذكي');
  }

  const data = await response.json();
  return {
    reply: data.reply || '',
    orderData: data.orderData,
  };
}
