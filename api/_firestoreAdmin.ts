import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * Lazy Firebase Admin SDK accessor for Vercel serverless functions.
 * Lets admin-gated endpoints read the durable `orders` collection after
 * Firestore rules are locked down for web clients (create-only).
 *
 * Canonical backend (unified client+server):
 * - project: theoria-store-24aa3
 * - database: (default)
 *   (The AI-Studio-provisioned named DB id is not resolvable through the
 *   Firestore API in this project on either SDK — canonicalized on
 *   `(default)`, which probes reachable.)
 *
 * Credentials (any one of):
 * - FIREBASE_SERVICE_ACCOUNT_JSON: full service-account JSON (preferred,
 *   its `project_id` must be theoria-store-24aa3)
 * - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * Optional: FIRESTORE_DATABASE_ID (defaults to `(default)`; leave unset
 * unless you intentionally point at another database).
 *
 * All helpers fail soft (null/false/[]) when unconfigured so endpoints can
 * fall back to in-memory state with a clear log line. There is deliberately
 * NO cross-database fallback: silently reading another DB masked the
 * 5 NOT_FOUND misconfiguration and split reads from writes.
 * Misconfig must fail loud via logs + getFirestoreDiagnostics().
 */

const DEFAULT_DATABASE_ID = '(default)';
const EXPECTED_PROJECT_ID = 'theoria-store-24aa3';

let db: Firestore | null = null;
let initAttempted = false;
let initLogged = false;
let effectiveProjectId = '';
let effectiveDatabaseId = '';
let effectiveServiceAccount = '';
let lastErrorCode: string | number | null = null;
let lastErrorMessage: string | null = null;
let lastErrorOp: string | null = null;
let lastNotFoundHintAt = 0;
const NOT_FOUND_HINT_THROTTLE_MS = 60_000;
// One-shot reachability probe state (see probeDatabaseReachability below).
let probeStarted = false;
let dbProbeStatus: 'unprobed' | 'reachable' | 'not_found' | 'denied' | 'error' = 'unprobed';
let dbProbeMessage: string | null = null;

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

function requestResourcePath(): string {
  const p = effectiveProjectId || 'unknown-project';
  const d = effectiveDatabaseId || DEFAULT_DATABASE_ID;
  return `projects/${p}/databases/${d}/documents/orders`;
}

function safeJson(v: unknown, maxLen = 500): string | null {
  if (v === undefined || v === null || v === '') return null;
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  } catch {
    return String(v).slice(0, maxLen);
  }
}

function formatFirestoreError(err: any): string {
  const code = getErrorCode(err);
  const message = (err as Error)?.message || String(err);
  // gRPC errors carry the looked-up resource in assorted fields — surface all
  // of them because `message` alone is often just the bare "5 NOT_FOUND:".
  const meta =
    (err as any)?.metadata ||
    (err as any)?.errorInfo?.metadata ||
    (err as any)?.error?.errorInfo?.metadata;
  const details =
    (err as any)?.details ||
    (err as any)?.errorInfo ||
    (err as any)?.reason ||
    (err as any)?.domain;
  const statusDetails = Array.isArray((err as any)?.statusDetails)
    ? (err as any).statusDetails.map((s: any) => s?.type || s?.reason || JSON.stringify(s)).join(';')
    : null;
  const parts = [
    code !== null ? `code=${code}` : null,
    `lookup=${requestResourcePath()}`,
    effectiveServiceAccount ? `sa=${effectiveServiceAccount}` : null,
    `msg=${message}`,
    safeJson(meta) ? `meta=${safeJson(meta)}` : null,
    safeJson(details) ? `details=${safeJson(details)}` : null,
    statusDetails ? `statusDetails=${statusDetails.slice(0, 300)}` : null,
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
      `[FirestoreAdmin] NOT_FOUND on lookup ${requestResourcePath()}. ` +
        `Canonical backend is project="${EXPECTED_PROJECT_ID}" database="${DEFAULT_DATABASE_ID}". ` +
        `Fix: 1) Firebase console > ${EXPECTED_PROJECT_ID} > Firestore Database — the (default) DB must exist ` +
        `in Firestore Native mode. ` +
        `2) Vercel FIREBASE_SERVICE_ACCOUNT_JSON project_id must be "${EXPECTED_PROJECT_ID}" and the key must not be deleted. ` +
        `3) FIRESTORE_DATABASE_ID must be unset or exactly "${DEFAULT_DATABASE_ID}" (no whitespace). ` +
        `4) Enable Cloud Firestore API on ${EXPECTED_PROJECT_ID} + grant the service account Cloud Datastore User.`
    );
  }
}

function resolveProjectId(): string {
  try {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (rawJson.trim()) {
      const parsed = JSON.parse(rawJson);
      if (parsed?.project_id) return String(parsed.project_id).trim();
    }
  } catch {
    // ignore — buildCredential logs the parse error
  }
  return (process.env.FIREBASE_PROJECT_ID || '').trim();
}

/** Non-secret service-account identifier (client_email is an identifier, not a credential). */
function resolveServiceAccountEmail(): string {
  try {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (rawJson.trim()) {
      const parsed = JSON.parse(rawJson);
      if (parsed?.client_email) return String(parsed.client_email).trim();
    }
  } catch {
    // ignore
  }
  return (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
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
    effectiveServiceAccount = resolveServiceAccountEmail();
    const rawDatabaseId = process.env.FIRESTORE_DATABASE_ID || '';
    effectiveDatabaseId = rawDatabaseId.trim() || DEFAULT_DATABASE_ID;
    if (rawDatabaseId && rawDatabaseId !== effectiveDatabaseId) {
      console.warn(
        `[FirestoreAdmin] FIRESTORE_DATABASE_ID had leading/trailing whitespace (len ${rawDatabaseId.length} -> ${effectiveDatabaseId.length}) — trimmed. ` +
          `Re-save the Vercel env value cleanly to avoid 5 NOT_FOUND on a phantom DB id.`
      );
    }
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
      console.log(`[FirestoreAdmin] Lookup path: ${requestResourcePath()}`);
    }
    // Fire-and-forget: distinguishes "database does not exist" (NOT_FOUND)
    // from "exists but key has no access" (PERMISSION_DENIED) once per instance.
    void probeDatabaseReachability();
    return db;
  } catch (err) {
    console.warn('[FirestoreAdmin] Init failed:', formatFirestoreError(err));
    return null;
  }
}

export function isAdminDbConfigured(): boolean {
  return getAdminDb() !== null;
}

/**
 * One-shot probe: `listCollections` on the canonical DB classifies the outage.
 * - success -> 'reachable' (outage is query-level, not DB-level)
 * - 5 NOT_FOUND -> 'not_found' (DB id doesn't resolve: wrong id, wrong project,
 *   API disabled, or Datastore-mode DB)
 * - 7 PERMISSION_DENIED -> 'denied' (DB exists, service account lacks access)
 * Fire-and-forget from getAdminDb(); result lands in getFirestoreDiagnostics().
 */
async function probeDatabaseReachability(): Promise<void> {
  if (probeStarted || !db) return;
  probeStarted = true;
  try {
    const cols = await db.listCollections();
    dbProbeStatus = 'reachable';
    dbProbeMessage = `ok (${cols.length} collections) @ ${requestResourcePath()}`;
    console.log(`[FirestoreAdmin] Probe: database reachable — ${dbProbeMessage}`);
  } catch (err) {
    const code = getErrorCode(err);
    if (code === 5 || isNotFoundError(err)) {
      dbProbeStatus = 'not_found';
      dbProbeMessage = `NOT_FOUND @ ${requestResourcePath()} — DB id does not resolve under this project/key`;
    } else if (code === 7) {
      dbProbeStatus = 'denied';
      dbProbeMessage = `PERMISSION_DENIED @ ${requestResourcePath()} — DB exists, key lacks Firestore access`;
    } else {
      dbProbeStatus = 'error';
      dbProbeMessage = String((err as Error)?.message || err).slice(0, 300);
    }
    console.warn(`[FirestoreAdmin] Probe: ${dbProbeStatus} —`, formatFirestoreError(err));
  }
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
    lookupPath: requestResourcePath(),
    serviceAccount: effectiveServiceAccount || null,
    dbProbeStatus,
    dbProbeMessage,
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
