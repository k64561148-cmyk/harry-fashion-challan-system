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

  // Extract all HF-2526- numbers
  const hfNums: { num: number; full: string; date: string; master: string }[] = [];
  challans.forEach(c => {
    if (c.challan_no && c.challan_no.startsWith('HF-2526-')) {
      const parts = c.challan_no.split('-');
      if (parts.length === 3) {
        const n = parseInt(parts[2], 10);
        if (!isNaN(n)) {
          hfNums.push({ num: n, full: c.challan_no, date: c.issued_date, master: c.masterName || c.master_id });
        }
      }
    }
  });

  hfNums.sort((a, b) => a.num - b.num);
  console.log(`Found ${hfNums.length} standard challans. Range: ${hfNums[0]?.num} to ${hfNums[hfNums.length - 1]?.num}`);

  const gaps: { start: number; end: number; missing: string[]; prevDate: string; nextDate: string; prevMaster: string; nextMaster: string }[] = [];
  for (let i = 0; i < hfNums.length - 1; i++) {
    const cur = hfNums[i];
    const next = hfNums[i + 1];
    if (next.num > cur.num + 1) {
      const missing = [];
      for (let k = cur.num + 1; k < next.num; k++) {
        missing.push(`HF-2526-${String(k).padStart(4, '0')}`);
      }
      gaps.push({
        start: cur.num + 1,
        end: next.num - 1,
        missing,
        prevDate: cur.date,
        nextDate: next.date,
        prevMaster: cur.master,
        nextMaster: next.master
      });
    }
  }

  console.log(`\n=== Detected Gaps in HF-2526 Series (${gaps.length} gaps total) ===`);
  gaps.forEach(g => {
    console.log(`\nGap: HF-2526-${String(g.start).padStart(4, '0')} to HF-2526-${String(g.end).padStart(4, '0')} (${g.missing.length} missing challans)`);
    console.log(`  Between: [${g.prevDate} - ${g.prevMaster}] and [${g.nextDate} - ${g.nextMaster}]`);
    console.log(`  Missing: ${g.missing.join(', ')}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
