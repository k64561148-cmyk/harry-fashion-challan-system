/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, disableNetwork } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// EXPORT ALL REQUIRED FIREBASE COMPONENTS
// Note: using the distinct firestoreDatabaseId is required by our applet infrastructure template
export const firestore = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

// If daily quota was exceeded, prevent Firestore SDK from running continuous backoff retries
try {
  if (typeof localStorage !== 'undefined') {
    const quotaExceeded = localStorage.getItem('hf_quota_exceeded') === 'true';
    const timestamp = Number(localStorage.getItem('hf_quota_exceeded_timestamp') || '0');
    // If quota flag was recorded in the last 12 hours
    if (quotaExceeded && (Date.now() - timestamp < 12 * 60 * 60 * 1000)) {
      disableNetwork(firestore).catch(() => {});
    }
  }
} catch (_) {}

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, signInAnonymously };
