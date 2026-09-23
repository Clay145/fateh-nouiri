import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * Lazy Firebase Admin SDK accessor for Vercel serverless functions.
 * Lets admin-gated endpoints read the durable `orders` collection after
 * Firestore rules are locked down for web clients (create-only).
 *
 * Credentials (any one of):
 * - FIREBASE_SERVICE_ACCOUNT_JSON: full service-account JSON (preferred)
 * - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * Optional: FIRESTORE_DATABASE_ID (defaults to the Theoria database).
 *
 * All helpers fail soft (null/false) when unconfigured so endpoints can
 * fall back to in-memory state with a clear log line.
 */

const DEFAULT_DATABASE_ID = 'ai-studio-theoria-c8e9318c-768a-45a3-a424-f43b64f7ef3c';
const EXPECTED_PROJECT_ID = 'charged-flux-nghtt';

let db: Firestore | null = null;
let fallbackDb: Firestore | null = null;
let initAttempted = false;
let fallbackAttempted = false;
let initLogged = false;
let effectiveProjectId = '';
let effectiveDatabaseId = '';
let lastErrorCode: string | number | null = null;
let lastErrorMessage: string | null = null;
let lastErrorOp: string | null = null;

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
    console.warn(
      `[FirestoreAdmin] NOT_FOUND hint: service-account project must be "${EXPECTED_PROJECT_ID}" ` +
        `and FIRESTORE_DATABASE_ID must name an existing DB (expected "${DEFAULT_DATABASE_ID}"). ` +
        `Check Vercel env FIREBASE_SERVICE_ACCOUNT_JSON project_id + FIRESTORE_DATABASE_ID, ` +
        `and Firebase console > ${EXPECTED_PROJECT_ID} > Firestore Database list.`
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
          `[FirestoreAdmin] Project mismatch: service-account project="${effectiveProjectId}" but expected="${EXPECTED_PROJECT_ID}". ` +
            `listOrders will return 5 NOT_FOUND until FIREBASE_SERVICE_ACCOUNT_JSON is replaced.`
        );
      }
      if (effectiveDatabaseId === '(default)') {
        console.warn(
          `[FirestoreAdmin] FIRESTORE_DATABASE_ID=(default) but Theoria orders live in named DB "${DEFAULT_DATABASE_ID}". ` +
            `Unset FIRESTORE_DATABASE_ID or set it to the named DB id unless you migrated to (default).`
        );
      }
    }
    return db;
  } catch (err) {
    console.warn('[FirestoreAdmin] Init failed:', formatFirestoreError(err));
    return null;
  }
}

/** Lazily open the `(default)` database as a read fallback when the named DB 404s. */
function getFallbackDb(): Firestore | null {
  const primary = getAdminDb();
  if (!primary) return null;
  if (effectiveDatabaseId === '(default)') return null;
  if (fallbackDb) return fallbackDb;
  if (fallbackAttempted) return null;
  fallbackAttempted = true;
  try {
    const app = getApps()[0];
    if (!app) return null;
    fallbackDb = getFirestore(app, '(default)');
    fallbackDb.settings({ ignoreUndefinedProperties: true });
    console.warn('[FirestoreAdmin] Fallback DB opened: database=(default) (used only after primary NOT_FOUND).');
    return fallbackDb;
  } catch (err) {
    console.warn('[FirestoreAdmin] Fallback DB init failed:', formatFirestoreError(err));
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
    if (isNotFoundError(err)) {
      const fb = getFallbackDb();
      if (fb) {
        try {
          const byCode = await fb.collection('orders').where('orderCode', '==', orderCode).limit(1).get();
          if (!byCode.empty) {
            const doc = byCode.docs[0];
            console.warn('[FirestoreAdmin] getOrder recovered via (default) fallback DB.');
            return { ...doc.data(), id: doc.id };
          }
        } catch (fbErr) {
          recordError('getOrder(fallback)', fbErr);
        }
      }
    }
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
    // No fallback write: falling back to (default) would split the dataset.
    recordError('createOrder', err);
    return false;
  }
}

/** List recent orders (admin dashboard cross-device reads). */
export async function adminListOrders(limit = 250): Promise<any[]> {
  const adb = getAdminDb();
  if (!adb) return [];
  try {
    const snap = await adb.collection('orders').orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  } catch (err) {
    recordError('listOrders', err);
    if (isNotFoundError(err)) {
      const fb = getFallbackDb();
      if (fb) {
        try {
          const snap = await fb.collection('orders').orderBy('createdAt', 'desc').limit(limit).get();
          console.warn('[FirestoreAdmin] listOrders recovered via (default) fallback DB.');
          return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        } catch (fbErr) {
          recordError('listOrders(fallback)', fbErr);
        }
      }
    }
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
  const queryDb = async (target: Firestore): Promise<any[]> => {
    const seen = new Map<string, any>();
    for (const v of variants.slice(0, 3)) {
      const snap = await target.collection('orders').where('phone', '==', v).limit(limit).get();
      snap.docs.forEach((d) => {
        if (!seen.has(d.id)) seen.set(d.id, { ...d.data(), id: d.id });
      });
      if (seen.size >= limit) break;
    }
    return Array.from(seen.values()).slice(0, limit);
  };
  try {
    return await queryDb(adb);
  } catch (err) {
    recordError('listOrdersByPhone', err);
    if (isNotFoundError(err)) {
      const fb = getFallbackDb();
      if (fb) {
        try {
          const rows = await queryDb(fb);
          console.warn('[FirestoreAdmin] listOrdersByPhone recovered via (default) fallback DB.');
          return rows;
        } catch (fbErr) {
          recordError('listOrdersByPhone(fallback)', fbErr);
        }
      }
    }
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
      // Missing DB — delegate to adminListOrders which already tries the fallback.
      recordError('listOrdersSince', err);
      const all = await adminListOrders(limit);
      return since > 0 ? all.filter((o) => Number(o?.createdAt || 0) > since) : all;
    }
    // Composite where+orderBy may need an index on older DBs — fall back to
    // full list + in-memory filter so incremental polling never breaks.
    recordError('listOrdersSince fallback to listOrders', err);
    const all = await adminListOrders(limit);
    return since > 0 ? all.filter((o) => Number(o?.createdAt || 0) > since) : all;
  }
}
