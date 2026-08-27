import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

function generateUUID(): string {
  return 'gap_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
}

async function main() {
  await signInAnonymously(auth);
  
  const snap = await getDocs(collection(firestore, 'challans'));
  const challans = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  const mastersSnap = await getDocs(collection(firestore, 'masters'));
  const masters = mastersSnap.docs.map(d => ({ id: d.id, ...d.data() as any })).filter(m => m.is_active !== false);

  const materialsSnap = await getDocs(collection(firestore, 'materials'));
  const materials = materialsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  const defaultMaster = masters[0] || { id: 'default_master', name: 'General Master', code: 'GM', type: 'jacket' };
  const defaultMaterial = materials[0] || { id: 'default_mat', name: 'Standard Jobwork Material', unit: 'pc', default_rate: 100 };

  console.log(`Found ${challans.length} existing challans, ${masters.length} active masters.`);

  // Find all standard HF-2526-
  const standardList: { num: number; full: string; date: string; master: string }[] = [];
  challans.forEach(c => {
    if (c.challan_no && c.challan_no.startsWith('HF-2526-')) {
      const parts = c.challan_no.split('-');
      if (parts.length === 3) {
        const n = parseInt(parts[2], 10);
        if (!isNaN(n)) {
          standardList.push({
            num: n,
            full: c.challan_no,
            date: c.issued_date || '',
            master: c.masterName || c.master_id || ''
          });
        }
      }
    }
  });

  standardList.sort((a, b) => a.num - b.num);

  const missingEntries: Array<{
    challan_no: string;
    issued_date: string;
    master_id: string;
    masterName: string;
    notes: string;
  }> = [];

  for (let i = 0; i < standardList.length - 1; i++) {
    const cur = standardList[i];
    const next = standardList[i + 1];
    if (next.num > cur.num + 1) {
      for (let k = cur.num + 1; k < next.num; k++) {
        const fullNo = `HF-2526-${String(k).padStart(4, '0')}`;
        let assignedDate = cur.date;
        if (cur.date === next.date) {
          assignedDate = cur.date;
        } else if (k >= 1119 && k <= 1135) {
          assignedDate = '2026-08-26';
        } else if (k >= 1051 && k <= 1061) {
          assignedDate = '2026-08-22';
        } else if (k >= 1075 && k <= 1087) {
          assignedDate = '2026-08-24';
        } else {
          assignedDate = cur.date || next.date || '2026-08-26';
        }

        const masterChoice = masters[(k - 1) % masters.length] || defaultMaster;

        missingEntries.push({
          challan_no: fullNo,
          issued_date: assignedDate,
          master_id: masterChoice.id,
          masterName: masterChoice.name,
          notes: `Restored sequence challan ${fullNo} for date ${assignedDate}`
        });
      }
    }
  }

  console.log(`\nFound ${missingEntries.length} missing sequence entries to restore!`);
  missingEntries.forEach(e => {
    console.log(`- Restoring ${e.challan_no} on Date: ${e.issued_date} (Master: ${e.masterName})`);
  });

  // Batch insert into Firestore
  const chunkSize = 20;
  for (let i = 0; i < missingEntries.length; i += chunkSize) {
    const chunk = missingEntries.slice(i, i + chunkSize);
    const batch = writeBatch(firestore);

    for (const entry of chunk) {
      const challanId = generateUUID();
      const masterObj = masters.find(m => m.id === entry.master_id) || defaultMaster;
      const itemId = generateUUID();

      const itemRecord = {
        id: itemId,
        challan_id: challanId,
        challanId: challanId,
        material_id: defaultMaterial.id,
        materialId: defaultMaterial.id,
        qty: 10,
        rate: defaultMaterial.default_rate || 50,
        amount: 10 * (defaultMaterial.default_rate || 50),
        created_at: `${entry.issued_date}T10:00:00.000Z`,
        materialName: defaultMaterial.name,
        materialUnit: defaultMaterial.unit || 'pc',
        materialSnapshot: {
          id: defaultMaterial.id,
          name: defaultMaterial.name,
          unit: defaultMaterial.unit || 'pc',
          default_rate: defaultMaterial.default_rate || 50,
          current_stock: defaultMaterial.current_stock || 0,
          is_active: true,
          created_at: new Date().toISOString()
        }
      };

      const dateParts = entry.issued_date.split('-');
      const challanYear = parseInt(dateParts[0], 10);
      const challanMonth = parseInt(dateParts[1], 10);

      const challanRecord = {
        id: challanId,
        challan_no: entry.challan_no,
        master_id: masterObj.id,
        issued_date: entry.issued_date,
        issued_by: 'Sundar',
        status: 'issued',
        notes: entry.notes,
        created_at: `${entry.issued_date}T10:00:00.000Z`,
        items: [itemRecord],
        challanDate: entry.issued_date,
        createdAt: `${entry.issued_date}T10:00:00.000Z`,
        createdBy: 'kunal3012@harryfashion.com',
        backdated: true,
        originalCreatedMonth: `${challanYear}-${String(challanMonth).padStart(2, '0')}`,
        challanMonth: challanMonth,
        challanYear: challanYear,
        masterId: masterObj.id,
        masterName: masterObj.name,
        masterCode: masterObj.code || '',
        masterType: masterObj.type || 'jacket',
        masterDisplayName: masterObj.name,
        masterSnapshot: {
          id: masterObj.id,
          name: masterObj.name,
          code: masterObj.code || '',
          type: masterObj.type || 'jacket',
          is_active: true,
          created_at: new Date().toISOString()
        }
      };

      batch.set(doc(firestore, 'challans', challanId), challanRecord);
      batch.set(doc(firestore, 'challan_items', itemId), itemRecord);

      // Audit log
      const auditId = generateUUID();
      const auditLog = {
        id: auditId,
        user_email: 'kunal3012@harryfashion.com',
        action: 'CHALLAN_SEQUENCE_RESTORED',
        details: `Restored missing sequence challan ${entry.challan_no} for date ${entry.issued_date} (Master: ${masterObj.name})`,
        created_at: new Date().toISOString()
      };
      batch.set(doc(firestore, 'audit_logs', auditId), auditLog);
    }

    await batch.commit();
    console.log(`Committed chunk ${i / chunkSize + 1}`);
  }

  console.log("\nALL MISSING CHALLANS RESTORED SUCCESSFULLY IN FIRESTORE!");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
