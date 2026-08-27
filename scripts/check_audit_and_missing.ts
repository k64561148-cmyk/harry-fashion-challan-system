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
  
  // Check counters
  const countersSnap = await getDocs(collection(firestore, 'counters'));
  console.log(`Counters: ${countersSnap.docs.length}`);
  countersSnap.docs.forEach(d => console.log(`Counter [${d.id}]:`, d.data()));

  // Check audit logs for Aug 26 and Aug 27
  const auditSnap = await getDocs(collection(firestore, 'audit_logs'));
  console.log(`\nTotal audit logs: ${auditSnap.docs.length}`);
  const logs = auditSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  
  const recentLogs = logs.filter(l => {
    const d = l.timestamp || l.created_at || '';
    return d.startsWith('2026-08-26') || d.startsWith('2026-08-27');
  }).sort((a, b) => (a.timestamp || a.created_at || '').localeCompare(b.timestamp || b.created_at || ''));

  console.log(`Recent audit logs (${recentLogs.length}):`);
  recentLogs.forEach(l => {
    console.log(`[${l.timestamp || l.created_at}] Action: ${l.action} | Target: ${l.target} | User: ${l.user} | Details: ${JSON.stringify(l.details || l.description || l.meta || '')}`);
  });

  // Let's also search all logs for "1119", "1120", "1121", "1122", "1123", "1125", "1135", etc.
  console.log(`\nSearching for missing numbers in all audit logs:`);
  for (let n = 1119; n <= 1135; n++) {
    const str = `11${String(n).slice(2)}`;
    const match = logs.filter(l => JSON.stringify(l).includes(str) || JSON.stringify(l).includes(`HF-2526-${n}`));
    if (match.length > 0) {
      console.log(`Found logs for ${n}:`, match.map(m => `[${m.timestamp}] ${m.action}: ${JSON.stringify(m.details || m.description)}`));
    }
  }

  // Let's also check if there are other collections in Firestore
  // like 'challan_items' that have items with those challan references!
  console.log(`\nSearching challan_items for missing challans:`);
  const itemSnap = await getDocs(collection(firestore, 'challan_items'));
  const items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  for (let n = 1119; n <= 1135; n++) {
    const itemMatch = items.filter(it => JSON.stringify(it).includes(String(n)) || JSON.stringify(it).includes(`HF-2526-${n}`));
    if (itemMatch.length > 0) {
      console.log(`Found items for ${n}:`, itemMatch.length);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
