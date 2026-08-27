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
  
  const challanSnap = await getDocs(collection(firestore, 'challans'));
  const challanMap = new Map();
  challanSnap.docs.forEach(d => {
    challanMap.set(d.id, { id: d.id, ...d.data() });
  });
  console.log(`Total existing challans: ${challanMap.size}`);

  const itemSnap = await getDocs(collection(firestore, 'challan_items'));
  const allItems = itemSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  console.log(`Total challan_items: ${allItems.length}`);

  // Find orphaned items whose challan_id is not in challanMap
  const orphanedItems = allItems.filter(item => {
    const cid = item.challan_id || item.challanId;
    return !challanMap.has(cid);
  });

  console.log(`\nOrphaned items count: ${orphanedItems.length}`);

  // Group orphaned items by challan_id
  const orphanedByChallan = new Map<string, any[]>();
  orphanedItems.forEach(item => {
    const cid = item.challan_id || item.challanId;
    if (!orphanedByChallan.has(cid)) orphanedByChallan.set(cid, []);
    orphanedByChallan.get(cid)!.push(item);
  });

  console.log(`Number of distinct missing challans represented in challan_items: ${orphanedByChallan.size}`);

  // Let's inspect some of these orphaned challan items
  for (const [cid, items] of orphanedByChallan.entries()) {
    const sample = items[0];
    console.log(`- Missing Challan ID: ${cid} (${items.length} items) | Sample: Date=${sample.created_at || sample.createdAt} | Mat=${sample.materialName || sample.material_id} | Qty=${sample.qty}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
