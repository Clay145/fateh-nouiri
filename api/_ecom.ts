/**
 * Shared Ecom Delivery helpers — API v2.
 *
 * Spec source: https://ecom-dz.com/developpement (public API v2 docs chunk).
 * - Base URL: https://ecom-dz.com/api_v2 (overridable via ECOM_BASE_URL)
 * - Auth headers (both required): X-API-Key (KEY field) + X-API-Token (Token field)
 * - Create: POST {base}/colis with a JSON ARRAY of 1..100 parcels.
 *   Unknown fields are refused (422) — the body below is spec-only.
 * - Response: HTTP 201 { total, crees, echecs, resultats: [{ index, ok,
 *   tracking, id_colis, tarif_si_livrer, ..., erreur }] }. A 201 can still
 *   carry per-line failures — always check resultats[0].ok, never HTTP alone.
 *
 * Dependency-free on purpose: imported both by the local Express server
 * (`server.ts` via `./api/_ecom`) and by Vercel serverless functions
 * (`api/ecom-ship.ts` via `./_ecom.js`). Keep it free of imports.
 */

export type EcomMode = 'domicile' | 'stopdesk';

export interface EcomOrderInput {
  orderCode: string;
  customerName: string;
  phone: string;
  phoneAlt?: string;
  wilaya: string;
  commune: string;
  packageTitle?: string;
  contentId?: string;
  totalPrice: number;
  notes?: string;
  address?: string;
  /** Required when mode === 'stopdesk' (e.g. "16B"). Ignored at domicile. */
  codeStopdesk?: string;
}

export interface EcomConfig {
  token: string;
  key: string;
  baseUrl: string;
  createPath: string;
  /** 1 = create parcels already confirmed (En Traitement), 0 = En Préparation. */
  confirmee: number;
}

export function getEcomConfig(env: Record<string, string | undefined>): EcomConfig {
  const baseUrl = (env.ECOM_BASE_URL || 'https://ecom-dz.com/api_v2').replace(/\/+$/, '');
  const rawConf = (env.ECOM_CONFIRMEE || '1').trim();
  return {
    token: env.ECOM_API_TOKEN || '',
    key: env.ECOM_API_KEY || '',
    baseUrl,
    createPath: (env.ECOM_CREATE_PATH || 'colis').replace(/^\/+/, ''),
    confirmee: rawConf === '0' ? 0 : 1,
  };
}

export function isEcomConfigured(env: Record<string, string | undefined>): boolean {
  const c = getEcomConfig(env);
  return Boolean(c.token && c.key);
}

/** Courier format: 10 digits with leading 0 (Ecom also auto-corrects). */
export function normalizeEcomPhone(phone: string): string {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('213') && digits.length > 10) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith('00213')) {
    return `0${digits.slice(5)}`;
  }
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

/** Extract numeric wilaya id from "16 - الجزائر العاصمة" style strings. */
export function extractEcomWilayaId(wilaya: string): number {
  const m = String(wilaya || '').match(/(\d{1,2})/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 58 ? n : 0;
}

function truncate(s: string, max: number): string {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max).trim() : t;
}

function articleFor(order: EcomOrderInput): string {
  const units = String(order.contentId || '').includes('triple')
    ? 3
    : String(order.contentId || '').includes('double')
      ? 2
      : 1;
  void units;
  return truncate(order.packageTitle || 'Theoria', 255) || 'Theoria';
}

export function quantityFor(contentId?: string): number {
  const id = String(contentId || '');
  if (id.includes('triple')) return 3;
  if (id.includes('double')) return 2;
  return 1;
}

/**
 * Build ONE spec parcel object. Only documented fields — anything unknown
 * yields HTTP 422. Exactly one of commune (domicile) / code_stopdesk
 * (stopdesk) is sent, per the stopdesk flag.
 */
export function buildEcomParcel(
  order: EcomOrderInput,
  mode: EcomMode,
  confirmee: number
): Record<string, unknown> {
  const idWilaya = extractEcomWilayaId(order.wilaya);
  const parcel: Record<string, unknown> = {
    nom_complet: truncate(order.customerName, 60),
    mobile_1: truncate(normalizeEcomPhone(order.phone), 25),
    id_wilaya: idWilaya,
    article: articleFor(order),
    quantite: quantityFor(order.contentId),
    total: Math.max(0, Math.round(Number(order.totalPrice) || 0)),
    stopdesk: mode === 'stopdesk' ? 1 : 0,
    note_fournisseur: truncate(
      [`Ref:${order.orderCode}`, order.notes || ''].filter(Boolean).join(' | '),
      255
    ),
    id_externe: truncate(order.orderCode, 20),
    confirmee,
  };
  const mobile2 = normalizeEcomPhone(order.phoneAlt || '');
  if (mobile2) parcel.mobile_2 = truncate(mobile2, 25);
  const addr = truncate(order.address || order.commune || '', 100);
  if (addr) parcel.adresse = addr;
  if (mode === 'stopdesk') {
    if (order.codeStopdesk) parcel.code_stopdesk = truncate(order.codeStopdesk, 10);
  } else {
    parcel.commune = truncate(order.commune || '', 50);
  }
  return parcel;
}

export interface EcomLineResult {
  ok: boolean;
  tracking: string | null;
  erreur: string | null;
}

function readLineResult(data: unknown): EcomLineResult | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const list = obj.resultats;
  const first = Array.isArray(list) ? (list[0] as Record<string, unknown> | undefined) : undefined;
  if (!first || typeof first !== 'object') {
    // PUT-style single-object responses: { tracking, ok, erreur }
    if (typeof obj.tracking === 'string' || typeof obj.ok === 'boolean') {
      return {
        ok: obj.ok === true,
        tracking: typeof obj.tracking === 'string' && obj.tracking ? obj.tracking : null,
        erreur: typeof obj.erreur === 'string' && obj.erreur ? obj.erreur : null,
      };
    }
    return null;
  }
  return {
    ok: first.ok === true,
    tracking: typeof first.tracking === 'string' && first.tracking ? first.tracking : null,
    erreur: typeof first.erreur === 'string' && first.erreur ? first.erreur : null,
  };
}

function globalErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const err = (data as Record<string, unknown>).error;
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const details = Array.isArray(e.details)
    ? e.details
        .map((d) => {
          const r = d as Record<string, unknown>;
          return typeof r.champ === 'string' ? `${r.champ}: ${String(r.raison || '')}` : null;
        })
        .filter(Boolean)
        .slice(0, 4)
        .join('؛ ')
    : '';
  const head = message || code;
  if (!head) return null;
  return details ? `${head} (${details})` : head;
}

export function ecomErrorMessage(status: number, data: unknown): string {
  const global = globalErrorMessage(data);
  if (status === 401) {
    return global || 'Ecom رفض المفاتيح (401) — تحقق من ECOM_API_TOKEN و ECOM_API_KEY.';
  }
  if (status === 429) {
    return 'Ecom: تجاوزت الحصة (50/دقيقة) — انتظر دقيقة وأعد المحاولة.';
  }
  if (status === 404) {
    return 'Ecom endpoint 404 — تحقق من ECOM_BASE_URL / ECOM_CREATE_PATH.';
  }
  if (status === 422) {
    return global || 'Ecom رفض الحقول (422) — تحقق من الولاية/البلدية ورقم الهاتف.';
  }
  if (status === 400) {
    return global || 'Ecom خطأ في الطلب (400).';
  }
  if (status === 405) {
    return 'Ecom رفض الميثود (405) — تحقق من ECOM_CREATE_PATH (المتوقع: colis).';
  }
  if (global) return global;
  return `Ecom request failed (HTTP ${status}).`;
}

export interface EcomShipResult {
  ok: boolean;
  tracking: string | null;
  status: number;
  error: string | null;
  raw: unknown;
}

/** POST one parcel (as a 1-element array) to Ecom. Never throws. */
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
  if (!extractEcomWilayaId(order.wilaya)) {
    return { ok: false, tracking: null, status: 0, error: 'رمز الولاية غير صالح (يجب 01–58).', raw: null };
  }
  if (mode === 'stopdesk' && !truncate(order.codeStopdesk || '', 10)) {
    return { ok: false, tracking: null, status: 0, error: 'وضع Stopdesk يتطلب code_stopdesk — اختر مكتباً من القائمة.', raw: null };
  }
  if (mode === 'domicile' && !truncate(order.commune || '', 50)) {
    return { ok: false, tracking: null, status: 0, error: 'وضع Domicile يتطلب اسم البلدية.', raw: null };
  }

  const url = `${cfg.baseUrl}/${cfg.createPath}`;
  const body = [buildEcomParcel(order, mode, cfg.confirmee)];
  const fetchFn = deps.fetchFn || fetch;
  // Hobby budget: whole ship response must fit ~10s. Override via ECOM_TIMEOUT_MS.
  const rawTimeout = Number(env.ECOM_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
    ? Math.min(25000, Math.floor(rawTimeout))
    : (deps.timeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.key,
        'X-API-Token': cfg.token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (res.status === 201 || res.status === 200) {
      const line = readLineResult(data);
      if (line && line.ok) {
        return { ok: true, tracking: line.tracking, status: res.status, error: null, raw: data };
      }
      if (line && !line.ok) {
        return { ok: false, tracking: null, status: res.status, error: line.erreur || 'Ecom رفض الطرد — راجع الحقول.', raw: data };
      }
      // No per-line shape: fall back to tracking extraction, else generic.
      const tracking = extractEcomTracking(data);
      if (tracking) return { ok: true, tracking, status: res.status, error: null, raw: data };
      return { ok: false, tracking: null, status: res.status, error: ecomErrorMessage(res.status, data), raw: data };
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

/** Best-effort tracking pull from unshaped success payloads. */
export function extractEcomTracking(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === 'string') {
    const s = data.trim();
    return s ? s : null;
  }
  if (typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const line = readLineResult(data);
  if (line && line.tracking) return line.tracking;
  const keys = ['tracking', 'Tracking', 'code', 'id_colis', 'reference', 'ref', 'id'];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  for (const k of ['data', 'Data', 'result', 'Result', 'colis']) {
    const nested = obj[k];
    if (nested && typeof nested === 'object') {
      const found = extractEcomTracking(nested);
      if (found) return found;
    }
  }
  return null;
}

export interface EcomDirectoryResult {
  ok: boolean;
  items: Array<Record<string, unknown>>;
  status: number;
  error: string | null;
}

/** Authenticated GET against a directory resource (communes, stopdesks, wilayas). */
export async function fetchEcomDirectory(
  resource: 'communes' | 'stopdesks' | 'wilayas',
  query: Record<string, string>,
  deps: {
    fetchFn?: typeof fetch;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  } = {}
): Promise<EcomDirectoryResult> {
  const env = deps.env || {};
  const cfg = getEcomConfig(env);
  if (!cfg.token || !cfg.key) {
    return { ok: false, items: [], status: 0, error: 'Ecom غير مُعد على الخادم.' };
  }
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${cfg.baseUrl}/${resource}${qs ? `?${qs}` : ''}`;
  const fetchFn = deps.fetchFn || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || 8000);
  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { 'X-API-Key': cfg.key, 'X-API-Token': cfg.token },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data)) {
      return { ok: true, items: data as Array<Record<string, unknown>>, status: res.status, error: null };
    }
    return { ok: false, items: [], status: res.status, error: ecomErrorMessage(res.status, data) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, items: [], status: 0, error: /abort/i.test(msg) ? 'انتهت مهلة الاتصال بـ Ecom.' : `تعذر الاتصال بـ Ecom (${msg.slice(0, 120)}).` };
  } finally {
    clearTimeout(timer);
  }
}
