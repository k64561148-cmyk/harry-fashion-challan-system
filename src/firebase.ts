/// <reference types="vite/client" />
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import rawFirebaseConfig from '../firebase-applet-config.json';

// Silence internal Firestore SDK WebChannel backoff delay logs when free tier daily write limit is active
try {
  setLogLevel('silent');
} catch (_) {}

const metaEnv = (import.meta as any).env || {};

// Support both embedded firebase-applet-config.json AND Vercel/Vite environment variables
const firebaseConfig = {
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || rawFirebaseConfig.projectId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || rawFirebaseConfig.appId,
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || rawFirebaseConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || rawFirebaseConfig.authDomain,
  firestoreDatabaseId: metaEnv.VITE_FIRESTORE_DATABASE_ID || rawFirebaseConfig.firestoreDatabaseId || '(default)',
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || rawFirebaseConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || rawFirebaseConfig.messagingSenderId,
  measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || rawFirebaseConfig.measurementId || ''
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// EXPORT ALL REQUIRED FIREBASE COMPONENTS
export const firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const db = firestore;

// Export active config for diagnostics
export const activeFirebaseConfig = firebaseConfig;

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, signInAnonymously };
