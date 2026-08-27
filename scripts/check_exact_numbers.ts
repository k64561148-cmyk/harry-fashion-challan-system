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
  
  const snap = await getDocs(collection(firestore, 'challans'));
  const challans = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Check where numbers 1056-1061, 1075-1087, 1119-1123, 1125-1135 are
  const targetNumbers = [];
  for (let i = 1050; i <= 1140; i++) targetNumbers.push(i);

  console.log("Checking presence of HF-2526 numbers 1050 to 1140 in Firestore:");
  targetNumbers.forEach(num => {
    const padded = String(num).padStart(4, '0');
    const fullNo = `HF-2526-${padded}`;
    const found = challans.find(c => c.challan_no === fullNo || c.challan_no === `HF-2526-${num}`);
    if (found) {
      console.log(`FOUND: ${found.challan_no} | Date: ${found.issued_date} | Master: ${found.masterName || found.master_id} | Created: ${found.created_at}`);
    } else {
      // Check if maybe it's in HF-BD-
      const foundBD = challans.find(c => c.challan_no === `HF-BD-${padded}` || c.challan_no === `HF-BD-${num}`);
      if (foundBD) {
        console.log(`FOUND AS BACKDATED: ${foundBD.challan_no} | Date: ${foundBD.issued_date} | Master: ${foundBD.masterName}`);
      } else {
        console.log(`MISSING FROM FIRESTORE: ${fullNo}`);
      }
    }
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
