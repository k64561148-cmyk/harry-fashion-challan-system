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
  console.log(`Total challans in firestore: ${snap.docs.length}`);

  const list = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  const regularChallans = list.filter(c => (c.challan_no || '').startsWith('HF-2526-'));
  const bdChallans = list.filter(c => (c.challan_no || '').startsWith('HF-BD-'));
  const otherChallans = list.filter(c => !(c.challan_no || '').startsWith('HF-2526-') && !(c.challan_no || '').startsWith('HF-BD-'));

  console.log(`Regular (HF-2526-): ${regularChallans.length}`);
  console.log(`Backdated (HF-BD-): ${bdChallans.length}`);
  console.log(`Other: ${otherChallans.length}`);

  // Let's check 26/08/2026 and 27/08/2026 challans
  const aug26 = list.filter(c => c.issued_date === '2026-08-26' || c.created_at?.startsWith('2026-08-26') || c.created_at?.startsWith('2026-08-27'));
  console.log(`\nChallans around 26/27 Aug:`);
  aug26.forEach(c => {
    console.log(`No: ${c.challan_no} | Date: ${c.issued_date} | Master: ${c.masterName || c.master_id} | Created: ${c.created_at} | Status: ${c.status} | Items: ${c.items?.length || 0}`);
  });

  // Let's list all HF-2526- numbers around 1100 - 1140
  console.log(`\nAll HF-2526- from 1100 to 1150:`);
  const range = regularChallans.filter(c => {
    const num = parseInt(c.challan_no.replace('HF-2526-', ''), 10);
    return num >= 1100 && num <= 1150;
  }).sort((a, b) => (a.challan_no || '').localeCompare(b.challan_no || ''));

  range.forEach(c => {
    console.log(`No: ${c.challan_no} | Date: ${c.issued_date} | Master: ${c.masterName || c.master_id} | Created: ${c.created_at} | Status: ${c.status}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
