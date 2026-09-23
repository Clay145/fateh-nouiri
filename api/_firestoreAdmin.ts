import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * Lazy Firebase Admin SDK accessor for Vercel serverless functions.
 * Lets admin-gated endpoints read the durable `orders` collection after
 * Firestore rules are locked down for web clients (create-only).
 *
 * Canonical backend (unified client+server):
 * - project: theoria-store-24aa3
 * - database: ai-studio-theoria-c8e9318c-768a-45a3-a424-f43b64f7ef3c
 *
 * Credentials (any one of):
 * - FIREBASE_SERVICE_ACCOUNT_JSON: full service-account JSON (preferred,
 *   its `project_id` must be theoria-store-24aa3)
 * - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * Optional: FIRESTORE_DATABASE_ID (defaults to the canonical named database;
 * never set it to `(default)` — orders do not live there).
 *
 * All helpers fail soft (null/false/[]) when unconfigured so endpoints can
 * fall back to in-memory state with a clear log line. There is deliberately
 * NO fallback to the `(default)` database: silently reading another (usually
 * empty) DB masked the 5 NOT_FOUND misconfiguration and split reads from
 * writes. Misconfig must fail loud via logs + getFirestoreDiagnostics().
 */

const DEFAULT_DATABASE_ID = 'ai-studio-theoria-c8e9318c-768a-45a3-a424-f43b64f7ef3c';
const EXPECTED_PROJECT_ID = 'theoria-store-24aa3';

let db: Firestore | null = null;
let initAttempted = false;
let initLogged = false;
let effectiveProjectId = '';
let effectiveDatabaseId = '';
let lastErrorCode: string | number | null = null;
let lastErrorMessage: string | null = null;
let lastErrorOp: string | null = null;
let lastNotFoundHintAt = 0;
const NOT_FOUND_HINT_THROTTLE_MS = 60_000;

function getErrorCode(err: any): string | number | null {
  if (err == null) return null;
  if (typeof err.code === 'number' || typeof err.code === 'string') return err.code;
  const msg = String(err?.message || err);
  const m = msg.match(/\b(\d)\s+(NOT_FOUND|PERMISSION_DENIED|UNAVAILABLE|UNAUTHENTICATED)\b/);
  if (m) return Number(m[1]);
  return null;
}

function isNotFoundError(err: any): boolean {
  if (getErrorCode(err) === 5) return true;
  const msg = String((err as Error)?.message || err || '').toUpperCase();
  return msg.includes('NOT_FOUND') || msg.includes('DATABASE DOES NOT EXIST');
}

function formatFirestoreError(err: any): string {
  const code = getErrorCode(err);
  const details =
    (err as any)?.details || (err as any)?.errorInfo?.metadata || (err as any)?.reason || '';
  const message = (err as Error)?.message || String(err);
  const parts = [
    code !== null ? `code=${code}` : null,
    `project=${effectiveProjectId || 'unknown'}`,
    `database=${effectiveDatabaseId || 'unknown'}`,
    `msg=${message}`,
    details ? `details=${typeof details === 'string' ? details : JSON.stringify(details)}` : null,
  ].filter(Boolean);
  return parts.join(' | ');
}

function recordError(op: string, err: any) {
  lastErrorOp = op;
  lastErrorCode = getErrorCode(err);
  lastErrorMessage = (err as Error)?.message || String(err);
  console.warn(`[FirestoreAdmin] ${op} failed:`, formatFirestoreError(err));
  if (isNotFoundError(err)) {
    // Dashboard polls every ~15s; throttle the (long) hint so one outage
    // doesn't spam two lines per poll (listOrdersSince -> listOrders).
    const now = Date.now();
    if (now - lastNotFoundHintAt < NOT_FOUND_HINT_THROTTLE_MS) return;
    lastNotFoundHintAt = now;
    console.warn(
      `[FirestoreAdmin] NOT_FOUND: database "${effectiveDatabaseId || DEFAULT_DATABASE_ID}" not found ` +
        `under project "${effectiveProjectId || 'unknown'}". Canonical backend is ` +
        `project="${EXPECTED_PROJECT_ID}" database="${DEFAULT_DATABASE_ID}". ` +
        `Fix: 1) Firebase console > ${EXPECTED_PROJECT_ID} > Firestore Database — the named DB must exist. ` +
        `2) Vercel env FIREBASE_SERVICE_ACCOUNT_JSON project_id must be "${EXPECTED_PROJECT_ID}". ` +
        `3) FIRESTORE_DATABASE_ID must be unset or exactly "${DEFAULT_DATABASE_ID}" (never "(default)"). ` +
        `4) Enable Firestore API + grant the service account Cloud Datastore User.`
    );
  }
}

function resolveProjectId(): string {
  try {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (rawJson.trim()) {
      const parsed = JSON.parse(rawJson);
      if (parsed?.project_id) return String(parsed.project_id);
    }
  } catch {
    // ignore — buildCredential logs the parse error
  }
  return process.env.FIREBASE_PROJECT_ID || '';
}

function buildCredential() {
  try {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (rawJson.trim()) {
      const parsed = JSON.parse(rawJson);
      return cert(parsed);
    }
    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    if (projectId && clientEmail && privateKey) {
      // Vercel env editors often store the key with literal \n sequences.
      privateKey = privateKey.replace(/\\n/g, '\n');
      return cert({ projectId, clientEmail, privateKey });
    }
  } catch (err) {
    console.warn('[FirestoreAdmin] Invalid service-account credentials:', (err as Error)?.message || err);
  }
  return null;
}

export function getAdminDb(): Firestore | null {
  if (db) return db;
  if (initAttempted) return null;
  initAttempted = true;
  try {
    const credential = buildCredential();
    if (!credential) {
      console.warn('[FirestoreAdmin] No service-account configured (FIREBASE_SERVICE_ACCOUNT_JSON). Server Firestore reads disabled.');
      return null;
    }
    effectiveProjectId = resolveProjectId();
    effectiveDatabaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID;
    const app = getApps().length
      ? getApps()[0]
      : initializeApp(effectiveProjectId ? { credential, projectId: effectiveProjectId } : { credential });
    db = getFirestore(app, effectiveDatabaseId);
    db.settings({ ignoreUndefinedProperties: true });
    if (!initLogged) {
      initLogged = true;
      console.log(`[FirestoreAdmin] Init ok: project=${effectiveProjectId || 'unknown'} database=${effectiveDatabaseId}`);
      if (effectiveProjectId && effectiveProjectId !== EXPECTED_PROJECT_ID) {
        console.warn(
          `[FirestoreAdmin] Project mismatch: service-account project="${effectiveProjectId}" but canonical="${EXPECTED_PROJECT_ID}". ` +
            `Reads/writes will 5 NOT_FOUND until FIREBASE_SERVICE_ACCOUNT_JSON is replaced with a ${EXPECTED_PROJECT_ID} key.`
        );
      }
      if (effectiveDatabaseId !== DEFAULT_DATABASE_ID) {
        console.warn(
          `[FirestoreAdmin] Database mismatch: using "${effectiveDatabaseId}" but canonical="${DEFAULT_DATABASE_ID}". ` +
            `Unset FIRESTORE_DATABASE_ID unless you intentionally migrated.`
        );
      }
    }
    return db;
  } catch (err) {
    console.warn('[FirestoreAdmin] Init failed:', formatFirestoreError(err));
    return null;
  }
}

export function isAdminDbConfigured(): boolean {
  return getAdminDb() !== null;
}

/** Non-secret diagnostics safe to return to authed admin callers. */
export function getFirestoreDiagnostics(): Record<string, unknown> {
  getAdminDb();
  return {
    configured: db !== null,
    projectId: effectiveProjectId || null,
    projectExpected: EXPECTED_PROJECT_ID,
    projectMatch: effectiveProjectId ? effectiveProjectId === EXPECTED_PROJECT_ID : null,
    databaseId: effectiveDatabaseId || null,
    databaseExpected: DEFAULT_DATABASE_ID,
    lastErrorOp,
    lastErrorCode,
    lastErrorMessage,
  };
}

/** Find one order by orderCode (or document id fallback). */
export async function adminGetOrderByCode(orderCode: string): Promise<any | null> {
  const adb = getAdminDb();
  if (!adb || !orderCode) return null;
  try {
    const byCode = await adb.collection('orders').where('orderCode', '==', orderCode).limit(1).get();
    if (!byCode.empty) {
      const doc = byCode.docs[0];
      return { ...doc.data(), id: doc.id };
    }
    const byId = await adb.collection('orders').doc(orderCode).get();
    if (byId.exists) return { ...byId.data(), id: byId.id };
  } catch (err) {
    recordError('getOrder', err);
  }
  return null;
}

/** Mark fb_sent=1 on the durable record. Returns true when persisted. */
export async function adminSetFbSent(orderCode: string): Promise<boolean> {
  const adb = getAdminDb();
  if (!adb || !orderCode) return false;
  try {
    const byCode = await adb.collection('orders').where('orderCode', '==', orderCode).limit(1).get();
    const target = byCode.empty ? adb.collection('orders').doc(orderCode) : byCode.docs[0].ref;
    await target.set({ fb_sent: 1, fb_sent_at: Date.now() }, { merge: true });
    return true;
  } catch (err) {
    recordError('setFbSent', err);
    return false;
  }
}

/** Patch a durable order record by document id. Best-effort. */
export async function adminPatchOrder(docId: string, patch: Record<string, unknown>): Promise<boolean> {
  const adb = getAdminDb();
  if (!adb || !docId) return false;
  try {
    await adb.collection('orders').doc(docId).set(patch, { merge: true });
    return true;
  } catch (err) {
    recordError('patchOrder', err);
    return false;
  }
}

/** Delete a durable order by document id or orderCode. Best-effort. */
export async function adminDeleteOrder(key: string): Promise<boolean> {
  const adb = getAdminDb();
  if (!adb || !key) return false;
  try {
    const existing = await adminGetOrderByCode(key);
    const docId = existing?.id || key;
    await adb.collection('orders').doc(docId).delete();
    return true;
  } catch (err) {
    recordError('deleteOrder', err);
    return false;
  }
}
/** Persist a new order to the durable `orders` collection. Best-effort. */
export async function adminCreateOrder(order: Record<string, unknown>): Promise<boolean> {
  const adb = getAdminDb();
  if (!adb || !order) return false;
  const docId = order.id || order.orderCode;
  if (!docId) return false;
  try {
    await adb.collection('orders').doc(String(docId)).set(order, { merge: true });
    return true;
  } catch (err) {
    recordError('createOrder', err);
    return false;
  }
}

/** Raw recent-orders query against the already-opened canonical DB (no error logging here). */
async function queryRecentOrders(adb: Firestore, limit: number): Promise<any[]> {
  const snap = await adb.collection('orders').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

/** List recent orders (admin dashboard cross-device reads). */
export async function adminListOrders(limit = 250): Promise<any[]> {
  const adb = getAdminDb();
  if (!adb) return [];
  try {
    return await queryRecentOrders(adb, limit);
  } catch (err) {
    recordError('listOrders', err);
    return [];
  }
}

/** Repeat-buyer lookup for predicted_ltv: prior orders sharing a normalized phone. */
export async function adminListOrdersByPhone(phone: string, limit = 20): Promise<any[]> {
  const adb = getAdminDb();
  if (!adb || !phone) return [];
  const digits = String(phone).replace(/[^0-9]/g, '');
  const variants = Array.from(
    new Set([String(phone).trim(), digits, digits.startsWith('0') ? `213${digits.substring(1)}` : digits])
  ).filter(Boolean);
  try {
    const seen = new Map<string, any>();
    for (const v of variants.slice(0, 3)) {
      const snap = await adb.collection('orders').where('phone', '==', v).limit(limit).get();
      snap.docs.forEach((d) => {
        if (!seen.has(d.id)) seen.set(d.id, { ...d.data(), id: d.id });
      });
      if (seen.size >= limit) break;
    }
    return Array.from(seen.values()).slice(0, limit);
  } catch (err) {
    recordError('listOrdersByPhone', err);
    return [];
  }
}

/** Incremental list for dashboard polling: only orders newer than `since` (createdAt ms). */
export async function adminListOrdersSince(since = 0, limit = 100): Promise<any[]> {
  const adb = getAdminDb();
  if (!adb) return [];
  try {
    let q: FirebaseFirestore.Query = adb.collection('orders').orderBy('createdAt', 'desc');
    if (since > 0) {
      // createdAt is stored as epoch ms number on all new orders.
      q = q.where('createdAt', '>', since);
    }
    const snap = await q.limit(limit).get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  } catch (err) {
    if (isNotFoundError(err)) {
      // Missing DB — log once here; fall back to the plain list inline
      // (calling adminListOrders would log the same NOT_FOUND a second time
      // on every 15s dashboard poll).
      recordError('listOrdersSince', err);
      try {
        const all = await queryRecentOrders(adb, limit);
        return since > 0 ? all.filter((o) => Number(o?.createdAt || 0) > since) : all;
      } catch (inner) {
        return [];
      }
    }
    // Composite where+orderBy may need an index on older DBs — fall back to
    // full list + in-memory filter so incremental polling never breaks.
    recordError('listOrdersSince fallback to listOrders', err);
    try {
      const all = await queryRecentOrders(adb, limit);
      return since > 0 ? all.filter((o) => Number(o?.createdAt || 0) > since) : all;
    } catch {
      return [];
    }
  }
}
