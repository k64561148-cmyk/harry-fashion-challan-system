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
  console.log("Signed in anonymously as:", auth.currentUser?.uid);

  const collectionsToCheck = [
    'challans',
    'challan_items',
    'audit_logs',
    'sandbox_challans',
    'deleted_challans',
    'invoices'
  ];

  for (const col of collectionsToCheck) {
    try {
      const snap = await getDocs(collection(firestore, col));
      console.log(`Collection "${col}": ${snap.docs.length} documents`);
      if (col === 'challans') {
        const challanList = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        challanList.sort((a, b) => (a.challan_no || '').localeCompare(b.challan_no || ''));
        console.log("Sample challans:");
        challanList.forEach(c => {
          console.log(`- ${c.challan_no} | Date: ${c.issued_date} | Master: ${c.masterName || c.master_id} | Created: ${c.created_at} | Status: ${c.status}`);
        });
      }
    } catch (e: any) {
      console.error(`Error querying ${col}:`, e.message);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
