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
  
  const invChallanSnap = await getDocs(collection(firestore, 'invoice_challans'));
  console.log(`Total invoice_challans: ${invChallanSnap.docs.length}`);

  const invoiceSnap = await getDocs(collection(firestore, 'invoices'));
  console.log(`Total invoices: ${invoiceSnap.docs.length}`);

  // Let's check ledger_transactions
  const ledgerSnap = await getDocs(collection(firestore, 'ledger_transactions'));
  console.log(`Total ledger_transactions: ${ledgerSnap.docs.length}`);
  const ledgerList = ledgerSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  const matchingTx = ledgerList.filter(tx => {
    const s = JSON.stringify(tx);
    return s.includes('1119') || s.includes('1120') || s.includes('1121') || s.includes('1122') || s.includes('1123') || s.includes('1125') || s.includes('1135');
  });
  console.log(`Matching ledger transactions for 1119-1135: ${matchingTx.length}`);
  matchingTx.forEach(tx => console.log('Tx:', tx));

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
