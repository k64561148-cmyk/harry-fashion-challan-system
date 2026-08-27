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
  
  const possibleCollections = [
    'backups',
    'database_backups',
    'audit_logs',
    'history',
    'deleted_challans',
    'archive_challans',
    'archived_challans',
    'trash',
    'recycled',
    'snapshots',
    'settings',
    'system_logs'
  ];

  for (const name of possibleCollections) {
    try {
      const snap = await getDocs(collection(firestore, name));
      console.log(`Collection "${name}": ${snap.docs.length} docs`);
      if (snap.docs.length > 0 && snap.docs.length < 5) {
        snap.docs.forEach(d => console.log(`  [${d.id}]:`, JSON.stringify(d.data()).slice(0, 200)));
      }
    } catch (e: any) {
      console.log(`Collection "${name}": error (${e.message})`);
    }
  }

  // Let's search all audit logs for any Challan number like 1119, 1120, 1121, etc.
  const auditSnap = await getDocs(collection(firestore, 'audit_logs'));
  console.log(`Total audit logs: ${auditSnap.docs.length}`);
  const allLogs = auditSnap.docs.map(d => d.data() as any);
  
  const deletedLogs = allLogs.filter(l => (l.action && l.action.toLowerCase().includes('delete')) || (l.details && l.details.toLowerCase().includes('deleted')));
  console.log(`Deleted action logs count: ${deletedLogs.length}`);
  deletedLogs.forEach(l => {
    console.log(`- [${l.created_at || l.timestamp}] ${l.action}: ${l.details || l.description}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
