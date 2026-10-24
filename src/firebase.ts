import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

export function readFirebaseConfig(env: Record<string, string | undefined>): FirebaseOptions | null {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  return Object.values(config).every(value => value?.trim()) ? config : null;
}

/** Lazily connect so building and reading setup instructions require no credentials. */
export function createFirebaseClient() {
  const emulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
  const config = readFirebaseConfig(import.meta.env) ?? (emulators ? {
    apiKey: 'demo-key', projectId: 'demo-detective-room',
    authDomain: 'demo-detective-room.firebaseapp.com',
    databaseURL: 'https://demo-detective-room-default-rtdb.firebaseio.com',
    appId: 'demo-app',
  } : null);
  if (!config) throw new Error('Firebase web configuration is incomplete. See .env.example.');
  const app = initializeApp(config);
  const auth = getAuth(app);
  const database = getDatabase(app);
  if (emulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(database, '127.0.0.1', 9000);
  }
  return { app, auth, database };
}
