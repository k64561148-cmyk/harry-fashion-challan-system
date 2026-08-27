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

  // Group by issued_date for August 2026
  const augustMap = new Map<string, any[]>();
  challans.forEach(c => {
    const d = c.issued_date || '';
    if (d.startsWith('2026-08')) {
      if (!augustMap.has(d)) augustMap.set(d, []);
      augustMap.get(d)!.push(c);
    }
  });

  const sortedDates = Array.from(augustMap.keys()).sort();
  console.log("=== August 2026 Challans Breakdown by Date ===");
  sortedDates.forEach(d => {
    const list = augustMap.get(d)!;
    console.log(`\nDate: ${d} (${list.length} challans):`);
    list.sort((a, b) => (a.challan_no || '').localeCompare(b.challan_no || ''));
    list.forEach(c => {
      console.log(`  - ${c.challan_no} | ${c.masterName || c.master_id} | Created: ${c.created_at} | Status: ${c.status}`);
    });
  });

  // Let's check other months as well!
  const allMonthsMap = new Map<string, number>();
  challans.forEach(c => {
    const ym = (c.issued_date || '').substring(0, 7);
    allMonthsMap.set(ym, (allMonthsMap.get(ym) || 0) + 1);
  });
  console.log("\n=== Total Challans by Month ===");
  Array.from(allMonthsMap.keys()).sort().forEach(ym => {
    console.log(`${ym}: ${allMonthsMap.get(ym)} challans`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
