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

let db: Firestore | null = null;
let initAttempted = false;

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
    const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID;
    const app = getApps().length ? getApps()[0] : initializeApp({ credential });
    db = getFirestore(app, databaseId);
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  } catch (err) {
    console.warn('[FirestoreAdmin] Init failed:', (err as Error)?.message || err);
    return null;
  }
}

export function isAdminDbConfigured(): boolean {
  return getAdminDb() !== null;
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
    console.warn('[FirestoreAdmin] getOrder failed:', (err as Error)?.message || err);
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
    console.warn('[FirestoreAdmin] setFbSent failed:', (err as Error)?.message || err);
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
    console.warn('[FirestoreAdmin] patchOrder failed:', (err as Error)?.message || err);
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
    console.warn('[FirestoreAdmin] deleteOrder failed:', (err as Error)?.message || err);
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
    console.warn('[FirestoreAdmin] createOrder failed:', (err as Error)?.message || err);
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
    console.warn('[FirestoreAdmin] listOrders failed:', (err as Error)?.message || err);
    return [];
  }
}
