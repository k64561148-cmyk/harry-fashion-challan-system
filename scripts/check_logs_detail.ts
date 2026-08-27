import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

async function main() {
  await signInAnonymously(auth);
  
  const auditSnap = await getDocs(collection(firestore, 'audit_logs'));
  const logs = auditSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  
  const targetLogs = logs.filter(l => {
    const d = l.timestamp || l.created_at || '';
    return d.startsWith('2026-08-27');
  }).sort((a, b) => (a.timestamp || a.created_at || '').localeCompare(b.timestamp || b.created_at || ''));

  console.log(`All logs on 2026-08-27 (${targetLogs.length}):`);
  targetLogs.forEach(l => {
    console.log(`[${l.timestamp || l.created_at}] [${l.action}] [User: ${l.user || l.user_email}] Details: ${l.details || l.description || JSON.stringify(l)}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
