import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Client config resolution order (first set wins per field):
// 1. VITE_FIREBASE_* env vars (Vercel Dashboard > Settings > Environment
//    Variables, exposed to the browser at build time). This lets the live
//    project be fixed without committing new keys.
// 2. firebase-applet-config.json (local fallback).
// `firestoreDatabaseId` is NOT overridable — the (default) DB is canonical.
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const firebaseConfig = {
  ...firebaseConfigJson,
  ...(viteEnv.VITE_FIREBASE_API_KEY ? { apiKey: viteEnv.VITE_FIREBASE_API_KEY } : {}),
  ...(viteEnv.VITE_FIREBASE_AUTH_DOMAIN ? { authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN } : {}),
  ...(viteEnv.VITE_FIREBASE_PROJECT_ID ? { projectId: viteEnv.VITE_FIREBASE_PROJECT_ID } : {}),
  ...(viteEnv.VITE_FIREBASE_STORAGE_BUCKET ? { storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET } : {}),
  ...(viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID
    ? { messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID }
    : {}),
  ...(viteEnv.VITE_FIREBASE_APP_ID ? { appId: viteEnv.VITE_FIREBASE_APP_ID } : {}),
  ...(viteEnv.VITE_FIREBASE_MEASUREMENT_ID ? { measurementId: viteEnv.VITE_FIREBASE_MEASUREMENT_ID } : {}),
};

// Canonical backend — must match api/_firestoreAdmin.ts (server). Client and
// server must hit the same project + database or checkout writes and admin
// reads silently split across projects.
export const CANONICAL_PROJECT_ID = 'theoria-store-24aa3';
export const CANONICAL_DATABASE_ID = '(default)';

const cfgProjectId = (firebaseConfig as { projectId?: string }).projectId;
const cfgDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
if (cfgProjectId && cfgProjectId !== CANONICAL_PROJECT_ID) {
  console.error(
    `[Firebase] Client config projectId="${cfgProjectId}" but canonical="${CANONICAL_PROJECT_ID}". ` +
      `Replace firebase-applet-config.json with the ${CANONICAL_PROJECT_ID} web config ` +
      `(Firebase console > Project settings > Your apps) so checkout writes land where the server reads.`
  );
}
if (cfgDatabaseId && cfgDatabaseId !== CANONICAL_DATABASE_ID) {
  console.error(
    `[Firebase] Client firestoreDatabaseId="${cfgDatabaseId}" but canonical="${CANONICAL_DATABASE_ID}". ` +
      `Fix firebase-applet-config.json — orders live in "(default)".`
  );
}

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with specific databaseId from config if provided
export const db: Firestore = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId)
  : getFirestore(app);

// Test Firestore connection on boot
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'status'));
    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('the client is offline')) {
      console.warn('Firestore is currently offline, using offline cache');
      return false;
    }
    if (/database .* not found|NOT_FOUND/i.test(errorMsg)) {
      // The database id does not resolve through the Firestore API in this
      // project — NOT a connectivity problem. Log once, loudly: check the
      // DB exists in Firestore Native mode, the Cloud Firestore API is
      // enabled, and the project switcher is on the right project.
      console.error(
        `[Firebase] Database "${cfgDatabaseId || '(default)'}" not found in project "${cfgProjectId}". ` +
          `Verify: 1) Firebase console > ${cfgProjectId} > Firestore Database lists this id in Firestore Native mode ` +
          `(Datastore-mode DBs 404 every query). 2) Cloud Firestore API enabled. 3) Correct project selected.`
      );
      return false;
    }
    // Permission-denied means we reached the server (rules locked down) — fine.
    return true;
  }
}

// Automatically initiate test in background
testFirestoreConnection();
