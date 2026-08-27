import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getStorage, ref, listAll } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

async function main() {
  await signInAnonymously(auth);
  console.log("Checking Firebase Storage...");
  try {
    const listRef = ref(storage, '');
    const res = await listAll(listRef);
    console.log("Storage prefixes (folders):", res.prefixes.map(p => p.fullPath));
    console.log("Storage items (files):", res.items.map(i => i.fullPath));
    for (const prefix of res.prefixes) {
      const subRes = await listAll(prefix);
      console.log(`Subfolder ${prefix.fullPath}:`, subRes.items.map(i => i.fullPath));
    }
  } catch (e: any) {
    console.error("Storage list error:", e.message);
  }
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
