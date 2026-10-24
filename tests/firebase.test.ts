import { describe, expect, it } from 'vitest';
import { readFirebaseConfig } from '../src/firebase';

describe('Firebase configuration', () => {
  const env = {
    VITE_FIREBASE_API_KEY: 'public-web-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
    VITE_FIREBASE_DATABASE_URL: 'https://example-default-rtdb.firebaseio.com',
    VITE_FIREBASE_PROJECT_ID: 'example',
    VITE_FIREBASE_APP_ID: 'example-app',
  };
  it('accepts complete configuration', () => {
    expect(readFirebaseConfig(env)?.projectId).toBe('example');
  });
  it.each(Object.keys(env))('rejects a missing %s', key => {
    expect(readFirebaseConfig({ ...env, [key]: '' })).toBeNull();
  });
  it('rejects whitespace-only configuration', () => {
    expect(readFirebaseConfig({ ...env, VITE_FIREBASE_API_KEY: '  ' })).toBeNull();
  });
});
