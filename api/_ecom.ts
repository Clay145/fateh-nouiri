/**
 * Shared Ecom Delivery (ecom-dz.com) helpers.
 *
 * Dependency-free on purpose: imported both by the local Express server
 * (`server.ts` via `./api/_ecom`) and by Vercel serverless functions
 * (`api/ecom-ship.ts` via `./_ecom.js`). Keep it free of imports.
 *
 * Contract (from merchant): Client - Téléphone - Adresse - Wilaya -
 * Domicile/Stopdesk - Commune - Article - Note - Total à ramasser (Da).
 * Auth: `Token` + `Key` headers. Exact create-path is env-configurable
 * (ECOM_CREATE_PATH) because the /developpement docs page is JS-rendered
 * and could not be scraped — confirm it from your Ecom panel.
 */

export type EcomMode = 'domicile' | 'stopdesk';

export interface EcomOrderInput {
  orderCode: string;
  customerName: string;
  phone: string;
  wilaya: string;
  commune: string;
  packageTitle?: string;
  contentId?: string;
  totalPrice: number;
  notes?: string;
  address?: string;
}

export interface EcomConfig {
  token: string;
  key: string;
  baseUrl: string;
  createPath: string;
  fromWilaya: string;
}

export function getEcomConfig(env: Record<string, string | undefined>): EcomConfig {
  const baseUrl = (env.ECOM_BASE_URL || 'https://ecom-dz.com').replace(/\/+$/, '');
  return {
    token: env.ECOM_API_TOKEN || '',
    key: env.ECOM_API_KEY || '',
    baseUrl,
    createPath: env.ECOM_CREATE_PATH || 'Api_v1/Colis',
    fromWilaya: env.ECOM_FROM_WILAYA || '16',
  };
}

export function isEcomConfigured(env: Record<string, string | undefined>): boolean {
  const c = getEcomConfig(env);
  return Boolean(c.token && c.key);
}

/** Keep Algerian courier format: 10 digits with leading 0 (never 213...). */
export function normalizeEcomPhone(phone: string): string {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('213') && digits.length > 10) {
    const rest = digits.slice(3);
    return `0${rest}`;
  }
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

/** Extract 2-digit wilaya code from "16 - الجزائر العاصمة" style strings. */
export function extractEcomWilayaCode(wilaya: string): string {
  const m = String(wilaya || '').match(/(\d{2})/);
  return m ? m[1] : '';
}

function articleFor(order: EcomOrderInput): string {
  const units = String(order.contentId || '').includes('triple')
    ? 'x3'
    : String(order.contentId || '').includes('double')
      ? 'x2'
      : 'x1';
  return `${order.packageTitle || 'Theoria'} ${units}`.trim();
}

/**
 * Build a tolerant payload: both snake_case and PascalCase keys, because the
 * Procolis-family API accepts French PascalCase while docs variants differ.
 * Unknown keys are ignored server-side by these APIs.
 */
export function buildEcomPayload(
  order: EcomOrderInput,
  mode: EcomMode,
  fromWilaya: string
): Record<string, unknown> {
  const phone = normalizeEcomPhone(order.phone);
  const wilayaCode = extractEcomWilayaCode(order.wilaya);
  const article = articleFor(order);
  const address = (order.address || order.commune || '').trim() || 'وسط المدينة';
  const note = [`Ref:${order.orderCode}`, order.notes || ''].filter(Boolean).join(' | ');
  const total = Number(order.totalPrice) || 0;
  const typeDomicile = mode === 'domicile';
  const commune = (order.commune || '').trim() || 'وسط المدينة';

  return {
    // Canonical snake_case
    client: order.customerName,
    telephone: phone,
    phone,
    adresse: address,
    address,
    wilaya: order.wilaya,
    wilaya_code: wilayaCode,
    code_wilaya: wilayaCode,
    from_wilaya: fromWilaya,
    commune,
    article,
    produit: article,
    product: article,
    note,
    notes: note,
    total,
    montant: total,
    total_a_ramasser: total,
    // Delivery-type expressions used across the DZ courier family
    type: typeDomicile ? 'domicile' : 'stopdesk',
    delivery_type: typeDomicile ? 'domicile' : 'stopdesk',
    stop_desk: typeDomicile ? 0 : 1,
    stopdesk: typeDomicile ? 0 : 1,
    domicile: typeDomicile ? 1 : 0,
    reference: order.orderCode,
    order_id: order.orderCode,
    // PascalCase (Procolis-style French API)
    Client: order.customerName,
    Telephone: phone,
    Adresse: address,
    Wilaya: wilayaCode || order.wilaya,
    Commune: commune,
    Article: article,
    Note: note,
    Total: total,
    Type: typeDomicile ? 'Domicile' : 'Stopdesk',
    Reference: order.orderCode,
  };
}

/** Pull a tracking/reference id out of the many response shapes in use. */
export function extractEcomTracking(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === 'string') {
    const s = data.trim();
    return s ? s : null;
  }
  if (typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const directKeys = [
    'tracking', 'Tracking', 'tracking_number', 'trackingNumber', 'Track',
    'code', 'Code', 'colis', 'Colis', 'id_colis', 'idColis',
    'reference', 'Reference', 'ref', 'Ref', 'order_id', 'id', 'ID',
  ];
  for (const k of directKeys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  for (const k of ['data', 'Data', 'colis', 'Colis', 'result', 'Result', 'order', 'Order']) {
    const nested = obj[k];
    if (nested && typeof nested === 'object') {
      const found = extractEcomTracking(nested);
      if (found) return found;
    }
  }
  return null;
}

export function isEcomSuccess(status: number, data: unknown): boolean {
  if (status >= 200 && status < 300) {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      const err = obj.error ?? obj.Error ?? obj.success ?? obj.Success ?? obj.status ?? obj.Status;
      if (err === false || err === 0 || err === 'false') return false;
      if (typeof err === 'string') {
        const bad = ['error', 'erreur', 'failed', 'fail', 'invalid', 'unauthorized', 'denied'];
        if (bad.includes(err.trim().toLowerCase())) return false;
      }
    }
    return true;
  }
  return false;
}

export function ecomErrorMessage(status: number, data: unknown): string {
  if (status === 404) {
    return 'Ecom endpoint 404 — تحقق من ECOM_BASE_URL / ECOM_CREATE_PATH في صفحة developpement الخاصة بك.';
  }
  if (status === 401 || status === 403) {
    return 'Ecom رفض المفاتيح (401/403) — تحقق من ECOM_API_TOKEN و ECOM_API_KEY.';
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const msg = obj.message ?? obj.Message ?? obj.error ?? obj.Error ?? obj.msg ?? obj.Msg;
    if (typeof msg === 'string' && msg.trim()) return msg.trim().slice(0, 300);
  }
  return `Ecom request failed (HTTP ${status}).`;
}

export interface EcomShipResult {
  ok: boolean;
  tracking: string | null;
  status: number;
  error: string | null;
  raw: unknown;
}

/** POST one parcel to Ecom. Never throws — returns a result object. */
export async function shipOrderToEcom(
  order: EcomOrderInput,
  mode: EcomMode,
  deps: {
    fetchFn?: typeof fetch;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  } = {}
): Promise<EcomShipResult> {
  const env = deps.env || {};
  const cfg = getEcomConfig(env);
  if (!cfg.token || !cfg.key) {
    return { ok: false, tracking: null, status: 0, error: 'Ecom غير مُعد على الخادم (ECOM_API_TOKEN / ECOM_API_KEY).', raw: null };
  }
  const phone = normalizeEcomPhone(order.phone);
  if (!phone) {
    return { ok: false, tracking: null, status: 0, error: 'رقم هاتف غير صالح للإرسال.', raw: null };
  }
  const url = `${cfg.baseUrl}/${cfg.createPath.replace(/^\/+/, '')}`;
  const payload = buildEcomPayload(order, mode, cfg.fromWilaya);
  const fetchFn = deps.fetchFn || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || 12000);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Token: cfg.token,
        Key: cfg.key,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (isEcomSuccess(res.status, data)) {
      const tracking = extractEcomTracking(data);
      return { ok: true, tracking, status: res.status, error: null, raw: data };
    }
    return { ok: false, tracking: null, status: res.status, error: ecomErrorMessage(res.status, data), raw: data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /abort/i.test(msg);
    return {
      ok: false,
      tracking: null,
      status: 0,
      error: timedOut ? 'انتهت مهلة الاتصال بـ Ecom — أعد المحاولة.' : `تعذر الاتصال بـ Ecom (${msg.slice(0, 120)}).`,
      raw: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
