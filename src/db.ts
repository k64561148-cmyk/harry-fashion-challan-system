/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Master,
  Material,
  Challan,
  ChallanItem,
  InwardEntry,
  Invoice,
  InvoiceChallan,
  MasterRateOverride,
  RateHistory,
  AuditLog,
  Profile,
  UserRole,
  InvoiceStatus
} from './types';

import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocFromServer,
  writeBatch,
  increment
} from 'firebase/firestore';
import { firestore, auth } from './firebase';

// Helper to generate UUID
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ----------------------------------------------------
// Firestore Error Handlers (Mandated by Firebase Skill)
// ----------------------------------------------------
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed Info: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Default Seed Data Definitions
const DEFAULT_JACKETS = [
  { name: 'SG', code: 'SG' },
  { name: 'MUNAZEER', code: 'MZ' },
  { name: 'ZOHA', code: 'ZH' },
  { name: 'FARID (FM)', code: 'FM' },
  { name: 'HABIB BAAZ (KK)', code: 'KK' },
  { name: 'RAJU MASTER (RM)', code: 'RM' },
  { name: 'AKIL MASTER', code: 'AM' },
  { name: 'RAMESH', code: 'RMH' },
  { name: 'MD OWIS (OW)', code: 'OW' },
  { name: 'TAJ (TA)', code: 'TA' },
  { name: 'MD SALLAUDDIN', code: 'SD' },
  { name: 'SHAMIM', code: 'SM' },
  { name: 'SAMEER (SH)', code: 'SH' },
  { name: 'ZAFAR', code: 'ZF' },
  { name: 'SHAHID KURLA (MSK)', code: 'MSK' },
  { name: 'MD FARUK', code: 'FK' },
  { name: 'ALI', code: 'AL' },
  { name: 'JAHID', code: 'JH' },
  { name: 'JUNAID ANDHERI', code: 'JA' },
  { name: 'FIROJ MASTER (FZ)', code: 'FZ' },
  { name: 'MUBARK MASTER (MU)', code: 'MU' }
];

const DEFAULT_PANTS = [
  { name: 'ISLAM (IM)', code: 'IM' },
  { name: 'ABBAS ALI (BL)', code: 'BL' },
  { name: 'RIZWAN (RO)', code: 'RO' },
  { name: 'MD ANSARI', code: 'MA' },
  { name: 'MEERA', code: 'MR' },
  { name: 'Z.R. FASHION (SK)', code: 'SK' },
  { name: 'AJMAL', code: 'AJ' },
  { name: 'SABIR KURLA', code: 'SBK' },
  { name: 'TABREZ', code: 'TB' },
  { name: 'SHANHWAZ', code: 'SW' },
  { name: 'GANESH', code: 'GN' },
  { name: 'ZULFIKAR', code: 'ZF' }
];

const DEFAULT_MATERIALS_RAW = [
  { name: 'Chest Piece/Hair Canvas', unit: 'pc', default_rate: 95, stock: 150 },
  { name: 'Sleeve Head/Munda Patti', unit: 'pc', default_rate: 25, stock: 200 },
  { name: 'Shoulder Pad', unit: 'pc', default_rate: 22, stock: 350 },
  { name: 'Belt Grip Roll', unit: 'roll', default_rate: 600, stock: 12 },
  { name: 'YKK Zip 8"', unit: 'dozen', default_rate: 45, stock: 50 },
  { name: 'YKK Zip 10"', unit: 'dozen', default_rate: 65, stock: 40 },
  { name: 'YKK Zip 15"/12"', unit: 'pc', default_rate: 10, stock: 180 },
  { name: 'Button Box/Gross Box', unit: 'box', default_rate: 150, stock: 30 },
  { name: 'Measurement Tape/Inchi Tape', unit: 'pc', default_rate: 40, stock: 15 },
  { name: 'Collar Felt', unit: 'mtr', default_rate: 175, stock: 85 },
  { name: 'Hook & Eye Box', unit: 'box', default_rate: 850, stock: 8 },
  { name: 'Wool Satin Lining Italian', unit: 'mtr', default_rate: 80, stock: 120 },
  { name: 'Bemberg Satin', unit: 'mtr', default_rate: 55, stock: 160 },
  { name: 'Alter Tag Box', unit: 'box', default_rate: 190, stock: 5 },
  { name: 'Label/Number Tag', unit: 'bundle', default_rate: 0.20, stock: 1000 },
  { name: 'Pocketing', unit: 'mtr', default_rate: 65, stock: 240 },
  { name: 'Waist Coat Buckle', unit: 'pc', default_rate: 15, stock: 110 },
  { name: 'Body Fusing/Front Canvas 60GSM', unit: 'roll', default_rate: 60, stock: 20 },
  { name: 'Collar Canvas/Collar Fusing', unit: 'pc', default_rate: 50, stock: 95 },
  { name: 'Side Tab Buckle', unit: 'pc', default_rate: 20, stock: 140 },
  { name: 'Gurkha Tab Buckle', unit: 'pc', default_rate: 25, stock: 80 },
  { name: 'White Fusing Patti', unit: 'roll', default_rate: 125, stock: 18 },
  { name: 'Paper Canvas/Paper Fusing', unit: 'mtr', default_rate: 35, stock: 220 },
  { name: 'Black Pocketing', unit: 'mtr', default_rate: 65, stock: 150 },
  { name: 'Black/White Pocketing-Pant', unit: 'mtr', default_rate: 65, stock: 190 },
  { name: 'Cherry/Tuxedo Satin', unit: 'mtr', default_rate: 300, stock: 45 },
  { name: 'Coat Asha Thread', unit: 'box', default_rate: 280, stock: 25 },
  { name: 'Thread Tube', unit: 'pc', default_rate: 25, stock: 130 }
];

export const DEMO_USERS: Profile[] = [
  {
    id: 'user-issue-01',
    email: 'issue@harryfashion.com',
    role: 'issue_dept',
    name: 'Sundar Department',
    username: 'issue',
    password: 'issue123'
  },
  {
    id: 'user-billing-01',
    email: 'billing@harryfashion.com',
    role: 'billing',
    name: 'Kevin Billing',
    username: 'billing',
    password: 'billing456'
  },
  {
    id: 'user-admin-01',
    email: 'admin@harryfashion.com',
    role: 'admin',
    name: 'Harry Admin (Owner)',
    username: 'admin',
    password: 'admin789'
  }
];

class DatabaseService {
  private activeListeners: (() => void)[] = [];
  private isFirebaseInitialized: boolean = false;

  private getStorageKey(key: string): string {
    return `hf_${key}`;
  }

  private load<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(this.getStorageKey(key));
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error(`Error loading key ${key}:`, e);
      return defaultValue;
    }
  }

  private save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.getStorageKey(key), JSON.stringify(value));
    } catch (e) {
      console.error(`Error saving key ${key}:`, e);
    }
  }

  constructor() {
    this.initDatabase();
    this.testCloudConnection();
    this.setupAuthStateListener();
  }

  // Mandatory getFromServer connection test (from Firebase Skill guidelines)
  private async testCloudConnection() {
    try {
      await getDocFromServer(doc(firestore, 'test_connection', 'ping'));
      console.log("Firebase Connection Active");
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration or network status.");
      }
    }
  }

  private initDatabase() {
    // 1. Initialize masters
    const masters = this.load<Master[]>('masters', []);
    if (masters.length === 0) {
      const initialMasters: Master[] = [];
      
      DEFAULT_JACKETS.forEach((item) => {
        initialMasters.push({
          id: generateUUID(),
          name: item.name,
          code: item.code,
          type: 'jacket',
          is_active: true,
          created_at: new Date().toISOString()
        });
      });

      DEFAULT_PANTS.forEach((item) => {
        initialMasters.push({
          id: generateUUID(),
          name: item.name,
          code: item.code,
          type: 'pant',
          is_active: true,
          created_at: new Date().toISOString()
        });
      });

      this.save('masters', initialMasters);
    }

    // 2. Initialize materials
    const materials = this.load<Material[]>('materials', []);
    if (materials.length === 0) {
      const initialMaterials: Material[] = DEFAULT_MATERIALS_RAW.map((item) => ({
        id: generateUUID(),
        name: item.name,
        unit: item.unit,
        default_rate: item.default_rate,
        current_stock: item.stock,
        is_active: true,
        created_at: new Date().toISOString()
      }));

      this.save('materials', initialMaterials);
    }

    // 3. Initialize current user if none selected, and migrate existing profiles/current user.
    let profiles = this.load<Profile[]>('profiles', []);
    if (profiles.length > 0) {
      let profilesChanged = false;
      const updatedProfiles = profiles.map(p => {
        if (p.id === 'user-admin-01' && p.name.includes('Anil')) {
          p.name = 'Harry Admin (Owner)';
          profilesChanged = true;
        }
        if (p.id === 'user-issue-01' && p.name.includes('Rakesh')) {
          p.name = 'Sundar Department';
          profilesChanged = true;
        }
        if (p.id === 'user-billing-01' && p.name.includes('Shreya')) {
          p.name = 'Kevin Billing';
          profilesChanged = true;
        }
        return p;
      });
      if (profilesChanged) {
        this.save('profiles', updatedProfiles);
      }
    }

    const currentUser = localStorage.getItem(this.getStorageKey('current_user'));
    if (!currentUser) {
      localStorage.setItem(this.getStorageKey('current_user'), JSON.stringify(DEMO_USERS[2]));
    } else {
      try {
        const parsed = JSON.parse(currentUser) as Profile;
        let userChanged = false;
        if (parsed.id === 'user-admin-01' && parsed.name.includes('Anil')) {
          parsed.name = 'Harry Admin (Owner)';
          userChanged = true;
        }
        if (parsed.id === 'user-issue-01' && parsed.name.includes('Rakesh')) {
          parsed.name = 'Sundar Department';
          userChanged = true;
        }
        if (parsed.id === 'user-billing-01' && parsed.name.includes('Shreya')) {
          parsed.name = 'Kevin Billing';
          userChanged = true;
        }
        if (userChanged) {
          localStorage.setItem(this.getStorageKey('current_user'), JSON.stringify(parsed));
        }
      } catch (err) {
        console.warn('Could not parse or migrate current user:', err);
      }
    }

    // Initialize collections in localStorage as fallback
    if (!localStorage.getItem(this.getStorageKey('challans'))) this.save('challans', []);
    if (!localStorage.getItem(this.getStorageKey('challan_items'))) this.save('challan_items', []);
    if (!localStorage.getItem(this.getStorageKey('inward_entries'))) this.save('inward_entries', []);
    if (!localStorage.getItem(this.getStorageKey('invoices'))) this.save('invoices', []);
    if (!localStorage.getItem(this.getStorageKey('invoice_challans'))) this.save('invoice_challans', []);
    if (!localStorage.getItem(this.getStorageKey('master_rate_overrides'))) this.save('master_rate_overrides', []);
    if (!localStorage.getItem(this.getStorageKey('rate_history'))) this.save('rate_history', []);
    if (!localStorage.getItem(this.getStorageKey('audit_logs'))) this.save('audit_logs', []);
  }

  // Listen to Auth changes and enable cloud listeners
  private setupAuthStateListener() {
    auth.onAuthStateChanged((user) => {
      // Clear active listeners
      this.activeListeners.forEach(unsubscribe => unsubscribe());
      this.activeListeners = [];

      if (user) {
        console.log(`Authenticated with Cloud Database as ${user.email} (UID: ${user.uid}). Initializing Firestore Real-time synchronization...`);
        this.isFirebaseInitialized = true;

        // 1. Establish real-time listener for current user's security profile
        const profileRef = doc(firestore, 'profiles', user.uid);
        const unsubscribeProfile = onSnapshot(profileRef, async (snap) => {
          if (snap.exists()) {
            const profile = snap.data() as Profile;
            this.save('current_user', profile);
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new Event('db_sync'));
          } else {
            const email = user.email || 'guest@harryfashion.com';
            let role: UserRole = 'issue_dept';
            // Pre-assign admin to k64561148@gmail.com and admin@harryfashion.com, billing for billing emails
            if (email.toLowerCase() === 'k64561148@gmail.com' || email.toLowerCase() === 'admin@harryfashion.com') {
              role = 'admin';
            } else if (email.toLowerCase().includes('billing')) {
              role = 'billing';
            } else if (email.toLowerCase().includes('admin')) {
              role = 'admin';
            }

            const newProfile: Profile = {
              id: user.uid,
              email: email,
              name: user.displayName || email.split('@')[0],
              role: role,
              created_at: new Date().toISOString()
            };

            try {
              await setDoc(profileRef, newProfile);
              this.save('current_user', newProfile);
              window.dispatchEvent(new Event('storage'));
              window.dispatchEvent(new Event('db_sync'));
            } catch (err) {
              console.error('Error creating user profile', err);
              this.save('current_user', newProfile);
              window.dispatchEvent(new Event('storage'));
            }
          }
        }, (error) => {
          console.warn('Profile listener blocked or failed:', error);
        });

        this.activeListeners.push(unsubscribeProfile);

        // 2. Load cloud synchronization for lists
        this.setupCloudSyncListeners();
      } else {
        console.log("Database running in Local-first offline mode. Sign in to sync with Cloud!");
        this.isFirebaseInitialized = false;
      }
    });
  }

  // Real-time multi-collection snap listeners (Zero cost for local-first, infinite sync)
  private setupCloudSyncListeners() {
    const syncCollections = [
      'profiles',
      'masters',
      'materials',
      'master_rate_overrides',
      'challans',
      'challan_items',
      'inward_entries',
      'invoices',
      'invoice_challans',
      'rate_history',
      'audit_logs'
    ];

    syncCollections.forEach((collName) => {
      try {
        const unsubscribe = onSnapshot(collection(firestore, collName), { includeMetadataChanges: false }, (snapshot) => {
          const remoteRecords: any[] = [];
          snapshot.forEach((docSnap) => {
            remoteRecords.push(docSnap.data());
          });

          // Only sync if there are active cloud records to avoid empty-source overwrites initially
          if (snapshot.size > 0) {
            // Re-order by createdAt desc if applicable
            if (collName === 'audit_logs' || collName === 'rate_history') {
              remoteRecords.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            }
            this.save(collName, remoteRecords);
            // Trigger customized global event so UI knows data synced
            window.dispatchEvent(new Event('db_sync'));
          } else {
            // If Firestore collection is completely empty, upload local seed or items as initial cloud backup!
            this.backupLocalCollectionToCloud(collName);
          }
        }, (error) => {
          console.warn(`Firestore listener error on selection ${collName}. Non-fatal, continuing offline.`, error);
        });

        this.activeListeners.push(unsubscribe);
      } catch (err) {
        console.warn(`Could not attach snapshot listener on ${collName}:`, err);
      }
    });
  }

  // Helper to sync local database to Cloud when initially connected
  private async backupLocalCollectionToCloud(collName: string) {
    if (!auth.currentUser) return;
    const localData = this.load<any[]>(collName, []);
    if (localData.length === 0) return;

    console.log(`Backing up seed collection "${collName}" (${localData.length} entries) up to Firestore...`);
    try {
      const batch = writeBatch(firestore);
      localData.forEach(item => {
        // Enforce identifier
        const docId = item.id || item.invoice_id + '_' + item.challan_id || generateUUID();
        const docRef = doc(firestore, collName, docId);
        batch.set(docRef, item);
      });
      await batch.commit();
    } catch (err) {
      console.warn(`Backup seeding failed for collection ${collName}`, err);
    }
  }

  // --- Profile / Auth ---
  getCurrentUser(): Profile {
    return this.load<Profile>('current_user', DEMO_USERS[2]);
  }

  setCurrentUser(user: Profile): void {
    this.save('current_user', user);
    this.addAuditLog(user.email, 'User Authentication', `Switched active user profile to ${user.name} (${user.role})`);
    
    // Write back profile to Firebase if synced
    if (this.isFirebaseInitialized) {
      setDoc(doc(firestore, 'profiles', user.id), user)
        .catch(err => console.warn('Could not sync user swap to cloud:', err));
    }
  }

  getProfiles(): Profile[] {
    const list = this.load<Profile[]>('profiles', []);
    if (list.length === 0) {
      return DEMO_USERS;
    }
    // Defensive check: ensure all loaded profiles have their username and password defined from DEMO_USERS defaults
    let changed = false;
    const merged = list.map(profile => {
      const defaultValue = DEMO_USERS.find(d => d.role === profile.role);
      if (defaultValue && (!profile.username || !profile.password)) {
        changed = true;
        return {
          ...profile,
          username: profile.username || defaultValue.username,
          password: profile.password || defaultValue.password
        };
      }
      return profile;
    });
    if (changed) {
      this.save('profiles', merged);
    }
    return merged;
  }

  saveProfile(profile: Profile): void {
    const list = this.getProfiles();
    const index = list.findIndex(p => p.id === profile.id);
    if (index > -1) {
      list[index] = profile;
    } else {
      list.push(profile);
    }
    this.save('profiles', list);

    if (this.isFirebaseInitialized) {
      setDoc(doc(firestore, 'profiles', profile.id), profile)
        .catch(err => handleFirestoreError(err, OperationType.WRITE, `profiles/${profile.id}`));
    }
    window.dispatchEvent(new Event('db_sync'));
  }

  getCloudStatus(): { isSyncing: boolean; email: string | null } {
    return {
      isSyncing: this.isFirebaseInitialized,
      email: auth.currentUser?.email || null
    };
  }

  // --- Masters ---
  getMasters(): Master[] {
    return this.load<Master[]>('masters', []);
  }

  saveMaster(master: Partial<Master>): Master {
    const list = this.getMasters();
    const currentUser = this.getCurrentUser();
    let result: Master;

    if (master.id) {
      // Edit
      const index = list.findIndex(m => m.id === master.id);
      if (index > -1) {
        list[index] = { ...list[index], ...master } as Master;
        result = list[index];
        this.addAuditLog(currentUser.email, 'Master Updated', `Updated master ${result.name} (${result.code})`);
      } else {
        throw new Error('Master not found');
      }
    } else {
      // Create
      result = {
        id: generateUUID(),
        name: master.name || '',
        code: master.code || '',
        type: master.type || 'jacket',
        is_active: master.is_active !== undefined ? master.is_active : true,
        created_at: new Date().toISOString(),
        pan_accounts: master.pan_accounts || []
      };
      list.push(result);
      this.addAuditLog(currentUser.email, 'Master Created', `Added new master ${result.name} (${result.code})`);
    }

    this.save('masters', list);

    // Dynamic Cloud Sync write
    if (this.isFirebaseInitialized) {
      setDoc(doc(firestore, 'masters', result.id), result)
        .catch(error => handleFirestoreError(error, OperationType.WRITE, `masters/${result.id}`));
    }

    return result;
  }

  // --- Materials ---
  getMaterials(): Material[] {
    return this.load<Material[]>('materials', []);
  }

  saveMaterial(material: Partial<Material>): Material {
    const list = this.getMaterials();
    const currentUser = this.getCurrentUser();
    let result: Material;

    if (material.id) {
      const index = list.findIndex(m => m.id === material.id);
      if (index > -1) {
        const old = list[index];
        const newRate = material.default_rate !== undefined ? material.default_rate : old.default_rate;
        
        // Log rate change history if changed
        if (newRate !== old.default_rate) {
          this.addRateHistory(old.id, old.default_rate, newRate, currentUser.name || currentUser.email);
        }

        list[index] = { ...old, ...material } as Material;
        result = list[index];
        this.addAuditLog(currentUser.email, 'Material Updated', `Updated material ${result.name} (Rate: ₹${result.default_rate})`);
      } else {
        throw new Error('Material not found');
      }
    } else {
      result = {
        id: generateUUID(),
        name: material.name || '',
        unit: material.unit || 'pc',
        default_rate: material.default_rate || 0,
        current_stock: material.current_stock || 0,
        is_active: material.is_active !== undefined ? material.is_active : true,
        created_at: new Date().toISOString()
      };
      list.push(result);
      this.addAuditLog(currentUser.email, 'Material Created', `Added material ${result.name} (Rate: ₹${result.default_rate})`);
    }

    this.save('materials', list);

    // Dynamic Cloud Sync write
    if (this.isFirebaseInitialized) {
      setDoc(doc(firestore, 'materials', result.id), result)
        .catch(error => handleFirestoreError(error, OperationType.WRITE, `materials/${result.id}`));
    }

    return result;
  }

  // --- Rate Overrides ---
  getMasterRateOverrides(): MasterRateOverride[] {
    return this.load<MasterRateOverride[]>('master_rate_overrides', []);
  }

  saveMasterRateOverride(override: Partial<MasterRateOverride>): MasterRateOverride {
    const list = this.getMasterRateOverrides();
    const currentUser = this.getCurrentUser();
    let result: MasterRateOverride;

    if (override.id) {
      const index = list.findIndex(o => o.id === override.id);
      if (index > -1) {
        list[index] = { ...list[index], ...override } as MasterRateOverride;
        result = list[index];
      } else {
        throw new Error('Override not found');
      }
    } else {
      result = {
        id: generateUUID(),
        master_id: override.master_id || '',
        material_id: override.material_id || '',
        rate: override.rate || 0,
        created_at: new Date().toISOString()
      };
      // Check existing override and remove it
      const existingIdx = list.findIndex(o => o.master_id === result.master_id && o.material_id === result.material_id);
      if (existingIdx > -1) {
        const itemRem = list[existingIdx];
        list.splice(existingIdx, 1);
        if (this.isFirebaseInitialized) {
          deleteDoc(doc(firestore, 'master_rate_overrides', itemRem.id))
            .catch(err => console.warn(err));
        }
      }
      list.push(result);
    }

    const masterName = this.getMasters().find(m => m.id === result.master_id)?.name || 'Unknown Master';
    const matName = this.getMaterials().find(m => m.id === result.material_id)?.name || 'Unknown Material';
    this.addAuditLog(currentUser.email, 'Rate Override Created', `Set custom rate of ₹${result.rate} on ${matName} for Master ${masterName}`);

    this.save('master_rate_overrides', list);

    // Dynamic Cloud Sync write
    if (this.isFirebaseInitialized) {
      setDoc(doc(firestore, 'master_rate_overrides', result.id), result)
        .catch(error => handleFirestoreError(error, OperationType.WRITE, `master_rate_overrides/${result.id}`));
    }

    return result;
  }

  deleteMasterRateOverride(id: string): void {
    const list = this.getMasterRateOverrides();
    const currentUser = this.getCurrentUser();
    const index = list.findIndex(o => o.id === id);
    if (index > -1) {
      const item = list[index];
      const masterName = this.getMasters().find(m => m.id === item.master_id)?.name || 'Unknown Master';
      const matName = this.getMaterials().find(m => m.id === item.material_id)?.name || 'Unknown Material';
      this.addAuditLog(currentUser.email, 'Rate Override Deleted', `Removed custom rate on ${matName} for Master ${masterName}`);
      list.splice(index, 1);
      this.save('master_rate_overrides', list);

      if (this.isFirebaseInitialized) {
        deleteDoc(doc(firestore, 'master_rate_overrides', id))
          .catch(error => handleFirestoreError(error, OperationType.DELETE, `master_rate_overrides/${id}`));
      }
    }
  }

  // Get active rate for master and material
  getRateForMaster(masterId: string, materialId: string): number {
    const overrides = this.getMasterRateOverrides();
    const match = overrides.find(o => o.master_id === masterId && o.material_id === materialId);
    if (match) {
      return match.rate;
    }
    const material = this.getMaterials().find(m => m.id === materialId);
    return material ? material.default_rate : 0;
  }

  // --- Challans ---
  getChallans(): Challan[] {
    return this.load<Challan[]>('challans', []);
  }

  getChallanItems(challanId?: string): ChallanItem[] {
    const items = this.load<ChallanItem[]>('challan_items', []);
    if (challanId) {
      return items.filter(item => item.challan_id === challanId);
    }
    return items;
  }

  getNextChallanNo(): string {
    const list = this.getChallans();
    let maxNum = 0;
    list.forEach(c => {
      const parts = c.challan_no.split('-');
      if (parts.length === 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    const nextNum = String(maxNum + 1).padStart(4, '0');
    return `HF-2526-${nextNum}`;
  }

  saveChallan(challan: Partial<Challan>, items: { material_id: string; qty: number; rate: number }[]): Challan {
    const challanList = this.getChallans();
    const allItemsList = this.getChallanItems();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();

    // Create Challan record
    const nextNo = challan.challan_no || this.getNextChallanNo();
    const newChallan: Challan = {
      id: generateUUID(),
      challan_no: nextNo,
      master_id: challan.master_id || '',
      issued_date: challan.issued_date || new Date().toISOString().split('T')[0],
      issued_by: currentUser.name || 'Office Desk',
      status: 'issued',
      notes: challan.notes || '',
      created_at: new Date().toISOString()
    };

    challanList.push(newChallan);

    // Save line items and adjust stock
    const savedChallanItems: ChallanItem[] = [];
    const modifiedMaterials: Material[] = [];

    items.forEach((item) => {
      const amount = item.qty * item.rate;
      const challanItem: ChallanItem = {
        id: generateUUID(),
        challan_id: newChallan.id,
        material_id: item.material_id,
        qty: item.qty,
        rate: item.rate,
        amount: amount,
        created_at: new Date().toISOString()
      };
      allItemsList.push(challanItem);
      savedChallanItems.push(challanItem);

      // Decrement stock in materials
      const matIndex = materialsList.findIndex(m => m.id === item.material_id);
      if (matIndex > -1) {
        materialsList[matIndex].current_stock = Math.max(0, materialsList[matIndex].current_stock - item.qty);
        modifiedMaterials.push(materialsList[matIndex]);
      }
    });

    const masterName = this.getMasters().find(m => m.id === newChallan.master_id)?.name || 'Unknown Master';
    this.addAuditLog(currentUser.email, 'Challan Issued', `Issued Challan ${newChallan.challan_no} to Master ${masterName} containing ${items.length} items`);

    this.save('challans', challanList);
    this.save('challan_items', allItemsList);
    this.save('materials', materialsList);

    // Multi-write Firestore Transaction Batch equivalent
    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        
        // Write Challan
        batch.set(doc(firestore, 'challans', newChallan.id), newChallan);

        // Write Challan Items
        savedChallanItems.forEach(item => {
          batch.set(doc(firestore, 'challan_items', item.id), item);
        });

        // Write Modified Stocks atomatically using server-side increment to prevent concurrent-write bugs
        items.forEach(item => {
          batch.update(doc(firestore, 'materials', item.material_id), {
            current_stock: increment(-item.qty)
          });
        });

        batch.commit().catch(error => handleFirestoreError(error, OperationType.WRITE, `challans_batch/${newChallan.id}`));
      } catch (err) {
        console.warn('Batch cloud write failed, logged fallback.', err);
      }
    }

    return newChallan;
  }

  deleteChallan(challanId: string): void {
    const challanList = this.getChallans();
    const allItemsList = this.getChallanItems();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();

    const idx = challanList.findIndex(c => c.id === challanId);
    if (idx > -1) {
      const challan = challanList[idx];
      if (challan.status === 'billed') {
        throw new Error('Completed/Billed challans cannot be deleted');
      }

      const deletedItems = allItemsList.filter(item => item.challan_id === challanId);
      const modifiedMaterials: Material[] = [];

      // Restore material stock
      deletedItems.forEach(item => {
        const matIdx = materialsList.findIndex(m => m.id === item.material_id);
        if (matIdx > -1) {
          materialsList[matIdx].current_stock += item.qty;
          modifiedMaterials.push(materialsList[matIdx]);
        }
      });

      // Filter out deleted items
      const newItemsList = allItemsList.filter(item => item.challan_id !== challanId);
      
      this.addAuditLog(currentUser.email, 'Challan Voided', `Voided Challan ${challan.challan_no} and restored material stocks`);

      challanList.splice(idx, 1);
      
      this.save('challans', challanList);
      this.save('challan_items', newItemsList);
      this.save('materials', materialsList);

      if (this.isFirebaseInitialized) {
        try {
          const batch = writeBatch(firestore);
          // Delete Challan
          batch.delete(doc(firestore, 'challans', challanId));
          // Delete Items
          deletedItems.forEach(item => {
            batch.delete(doc(firestore, 'challan_items', item.id));
          });
          // Update Stocks atomically using server-side increment to prevent concurrent-write bugs
          deletedItems.forEach(item => {
            batch.update(doc(firestore, 'materials', item.material_id), {
              current_stock: increment(item.qty)
            });
          });
          batch.commit().catch(error => handleFirestoreError(error, OperationType.DELETE, `challans_void/${challanId}`));
        } catch (err) {
          console.warn(err);
        }
      }
    }
  }

  // --- Inward Entries ---
  getInwardEntries(): InwardEntry[] {
    return this.load<InwardEntry[]>('inward_entries', []);
  }

  saveInwardEntry(entry: Partial<InwardEntry>): InwardEntry {
    const list = this.getInwardEntries();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();

    const newEntry: InwardEntry = {
      id: generateUUID(),
      material_id: entry.material_id || '',
      qty_received: entry.qty_received || 0,
      supplier_name: entry.supplier_name || 'Generic Supplier',
      bill_no: entry.bill_no || 'NA',
      inward_date: entry.inward_date || new Date().toISOString().split('T')[0],
      notes: entry.notes || '',
      created_by: currentUser.name || 'Store Department',
      created_at: new Date().toISOString()
    };

    list.push(newEntry);

    // Increment material stock
    let updatedMaterial: Material | null = null;
    const matIdx = materialsList.findIndex(m => m.id === newEntry.material_id);
    if (matIdx > -1) {
      materialsList[matIdx].current_stock += newEntry.qty_received;
      updatedMaterial = materialsList[matIdx];
    }

    const matName = materialsList.find(m => m.id === newEntry.material_id)?.name || 'Unknown Material';
    this.addAuditLog(currentUser.email, 'Inward Stock Recorded', `Inward entry recorded for ${matName}: +${newEntry.qty_received} ${materialsList[matIdx]?.unit || ''} from ${newEntry.supplier_name}`);

    this.save('inward_entries', list);
    this.save('materials', materialsList);

    // Firebase write-behind batch
    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, 'inward_entries', newEntry.id), newEntry);
        if (updatedMaterial) {
          batch.update(doc(firestore, 'materials', updatedMaterial.id), {
            current_stock: increment(newEntry.qty_received)
          });
        }
        batch.commit().catch(error => handleFirestoreError(error, OperationType.WRITE, `inward_entries/${newEntry.id}`));
      } catch (err) {
        console.warn(err);
      }
    }

    return newEntry;
  }

  // --- Invoices ---
  getInvoices(): Invoice[] {
    return this.load<Invoice[]>('invoices', []);
  }

  getInvoiceChallans(invoiceId?: string): InvoiceChallan[] {
    const list = this.load<InvoiceChallan[]>('invoice_challans', []);
    if (invoiceId) {
      return list.filter(item => item.invoice_id === invoiceId);
    }
    return list;
  }

  getNextInvoiceNo(): string {
    const list = this.getInvoices();
    let maxNum = 0;
    list.forEach(i => {
      const parts = i.invoice_no.split('-');
      if (parts.length === 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    const nextNum = String(maxNum + 1).padStart(4, '0');
    return `INV-2526-${nextNum}`;
  }

  saveInvoice(invoice: Partial<Invoice>, challanIds: string[]): Invoice {
    const invoiceList = this.getInvoices();
    const invoiceChallanList = this.getInvoiceChallans();
    const challanList = this.getChallans();
    const currentUser = this.getCurrentUser();

    const newInvoice: Invoice = {
      id: generateUUID(),
      invoice_no: this.getNextInvoiceNo(),
      master_id: invoice.master_id || '',
      period_month: invoice.period_month || new Date().getMonth() + 1,
      period_year: invoice.period_year || new Date().getFullYear(),
      work_amount: invoice.work_amount || 0,
      material_deduction: invoice.material_deduction || 0,
      net_payable: invoice.net_payable || 0,
      status: invoice.status || 'draft',
      created_at: new Date().toISOString(),
      pcs: invoice.pcs !== undefined ? invoice.pcs : 0,
      discount: invoice.discount !== undefined ? invoice.discount : 0,
      tds_amount: invoice.tds_amount !== undefined ? invoice.tds_amount : 0,
      grand_total: invoice.grand_total !== undefined ? invoice.grand_total : 0,
      selected_pan_no: invoice.selected_pan_no,
      selected_bank_name: invoice.selected_bank_name,
      selected_account_no: invoice.selected_account_no,
      selected_ifsc_code: invoice.selected_ifsc_code,
      selected_branch_name: invoice.selected_branch_name
    };

    invoiceList.push(newInvoice);

    const linkedInvoiceChallans: InvoiceChallan[] = [];
    const updatedChallans: Challan[] = [];

    // Save linked challans & update their status to billed
    challanIds.forEach(id => {
      const bridge = {
        invoice_id: newInvoice.id,
        challan_id: id
      };
      invoiceChallanList.push(bridge);
      linkedInvoiceChallans.push(bridge);

      // Update challan status
      const cIdx = challanList.findIndex(c => c.id === id);
      if (cIdx > -1) {
        challanList[cIdx].status = 'billed';
        updatedChallans.push(challanList[cIdx]);
      }
    });

    const masterName = this.getMasters().find(m => m.id === newInvoice.master_id)?.name || 'Unknown Master';
    this.addAuditLog(currentUser.email, 'Invoice Created', `Generated ${newInvoice.status} Invoice ${newInvoice.invoice_no} for Master ${masterName}. Net Payable: ₹${newInvoice.net_payable}`);

    this.save('invoices', invoiceList);
    this.save('invoice_challans', invoiceChallanList);
    this.save('challans', challanList);

    // Deep write to Firestore using atomic batch
    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        
        // Write Invoice
        batch.set(doc(firestore, 'invoices', newInvoice.id), newInvoice);

        // Write Linked entries
        linkedInvoiceChallans.forEach(bridge => {
          const idHash = `${bridge.invoice_id}_${bridge.challan_id}`;
          batch.set(doc(firestore, 'invoice_challans', idHash), bridge);
        });

        // Update Challans
        updatedChallans.forEach(ch => {
          batch.set(doc(firestore, 'challans', ch.id), ch);
        });

        batch.commit().catch(error => handleFirestoreError(error, OperationType.WRITE, `invoices/${newInvoice.id}`));
      } catch (err) {
        console.warn(err);
      }
    }

    return newInvoice;
  }

  deleteInvoice(invoiceId: string): void {
    const invoiceList = this.getInvoices();
    const invoiceChallanList = this.getInvoiceChallans();
    const challanList = this.getChallans();
    const currentUser = this.getCurrentUser();

    const idx = invoiceList.findIndex(inv => inv.id === invoiceId);
    if (idx > -1) {
      const invoice = invoiceList[idx];
      const linkedChallans = invoiceChallanList.filter(ic => ic.invoice_id === invoiceId);
      const updatedChallans: Challan[] = [];

      // Revert challan status back to 'issued'
      linkedChallans.forEach(ic => {
        const cIdx = challanList.findIndex(c => c.id === ic.challan_id);
        if (cIdx > -1) {
          challanList[cIdx].status = 'issued';
          updatedChallans.push(challanList[cIdx]);
        }
      });

      // Remove links
      const newLinks = invoiceChallanList.filter(ic => ic.invoice_id !== invoiceId);
      
      this.addAuditLog(currentUser.email, 'Invoice Deleted', `Voided Invoice ${invoice.invoice_no} (Value: ₹${invoice.net_payable}) and restored included challans to pending status`);

      invoiceList.splice(idx, 1);

      this.save('invoices', invoiceList);
      this.save('invoice_challans', newLinks);
      this.save('challans', challanList);

      // Cloud deletion pipeline
      if (this.isFirebaseInitialized) {
        try {
          const batch = writeBatch(firestore);
          // Delete invoice reference
          batch.delete(doc(firestore, 'invoices', invoiceId));

          // Delete bridge connections
          linkedChallans.forEach(bridge => {
            const idHash = `${bridge.invoice_id}_${bridge.challan_id}`;
            batch.delete(doc(firestore, 'invoice_challans', idHash));
          });

          // Revert challan states
          updatedChallans.forEach(ch => {
            batch.set(doc(firestore, 'challans', ch.id), ch);
          });

          batch.commit().catch(error => handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceId}`));
        } catch (err) {
          console.warn(err);
        }
      }
    }
  }

  updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): void {
    const list = this.getInvoices();
    const currentUser = this.getCurrentUser();
    const idx = list.findIndex(inv => inv.id === invoiceId);
    if (idx > -1) {
      list[idx].status = status;
      this.save('invoices', list);
      this.addAuditLog(currentUser.email, 'Invoice State Modified', `Invoice ${list[idx].invoice_no} status changed to ${status}`);

      if (this.isFirebaseInitialized) {
        setDoc(doc(firestore, 'invoices', invoiceId), list[idx])
          .catch(error => handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}`));
      }
    }
  }

  // --- Audit Logs ---
  getAuditLogs(): AuditLog[] {
    return this.load<AuditLog[]>('audit_logs', []);
  }

  addAuditLog(userEmail: string, action: string, details: string): void {
    const logs = this.load<AuditLog[]>('audit_logs', []);
    const record: AuditLog = {
      id: generateUUID(),
      user_email: userEmail,
      action: action,
      details: details,
      created_at: new Date().toISOString()
    };
    logs.unshift(record);
    this.save('audit_logs', logs.slice(0, 1000)); // Maintain last 1000 logs in local cache

    if (this.isFirebaseInitialized) {
      setDoc(doc(firestore, 'audit_logs', record.id), record)
        .catch(err => console.warn('Cloud audit log skip:', err));
    }
  }

  // --- Rate History ---
  getRateHistory(): RateHistory[] {
    return this.load<RateHistory[]>('rate_history', []);
  }

  addRateHistory(materialId: string, oldRate: number, newRate: number, changedBy: string): void {
    const history = this.load<RateHistory[]>('rate_history', []);
    const record: RateHistory = {
      id: generateUUID(),
      material_id: materialId,
      old_rate: oldRate,
      new_rate: newRate,
      changed_by: changedBy,
      created_at: new Date().toISOString()
    };
    history.unshift(record);
    this.save('rate_history', history);

    if (this.isFirebaseInitialized) {
      setDoc(doc(firestore, 'rate_history', record.id), record)
        .catch(err => console.warn('Cloud rate history log skip:', err));
    }
  }

  async seedMastersAndMaterials(): Promise<{ mastersCount: number; materialsCount: number; syncedToCloud: boolean }> {
    const seedJackets = [
      { name: 'SG', code: 'SG' },
      { name: 'MUNAZEER', code: 'MZ' },
      { name: 'ZOHA', code: 'ZH' },
      { name: 'FARID', code: 'FM' },
      { name: 'HABIB BAAZ', code: 'KK' },
      { name: 'RAJU MASTER', code: 'RM' },
      { name: 'AKIL MASTER', code: 'AM' },
      { name: 'RAMESH', code: 'RMH' },
      { name: 'MD OWIS', code: 'OW' },
      { name: 'TAJ', code: 'TA' },
      { name: 'MD SALLAUDDIN', code: 'SD' },
      { name: 'SHAMIM', code: 'SM' },
      { name: 'SAMEER', code: 'SH' },
      { name: 'ZAFAR', code: 'ZF' },
      { name: 'SHAHID KURLA', code: 'MSK' },
      { name: 'MD FARUK', code: 'FK' },
      { name: 'ALI', code: 'AL' },
      { name: 'JAHID', code: 'JH' },
      { name: 'JUNAID ANDHERI', code: 'JA' },
      { name: 'FIROJ MASTER', code: 'FZ' },
      { name: 'MUBARK MASTER', code: 'MU' }
    ];

    const seedPants = [
      { name: 'ISLAM', code: 'IM' },
      { name: 'ABBAS ALI', code: 'BL' },
      { name: 'RIZWAN', code: 'RO' },
      { name: 'MD ANSARI', code: 'MA' },
      { name: 'MEERA', code: 'MR' },
      { name: 'Z.R. FASHION', code: 'SK' },
      { name: 'AJMAL', code: 'AJ' },
      { name: 'SABIR KURLA', code: 'SBK' },
      { name: 'TABREZ', code: 'TB' },
      { name: 'SHANHWAZ', code: 'SW' },
      { name: 'GANESH', code: 'GN' },
      { name: 'ZULFIKAR', code: 'ZF' }
    ];

    const seedMaterials = [
      { name: 'Chest Piece/Hair Canvas', unit: 'pc', default_rate: 95 },
      { name: 'Sleeve Head/Munda Patti', unit: 'pc', default_rate: 25 },
      { name: 'Shoulder Pad', unit: 'pc', default_rate: 22 },
      { name: 'Belt Grip Roll', unit: 'roll', default_rate: 600 },
      { name: 'YKK Zip 8"', unit: 'dozen', default_rate: 45 },
      { name: 'YKK Zip 10"', unit: 'dozen', default_rate: 65 },
      { name: 'YKK Zip 15"/12"', unit: 'pc', default_rate: 10 },
      { name: 'Button Box', unit: 'box', default_rate: 150 },
      { name: 'Measurement Tape', unit: 'pc', default_rate: 40 },
      { name: 'Collar Felt', unit: 'mtr', default_rate: 175 },
      { name: 'Hook & Eye Box', unit: 'box', default_rate: 850 },
      { name: 'Wool Satin Lining', unit: 'mtr', default_rate: 80 },
      { name: 'Bemberg Satin', unit: 'mtr', default_rate: 55 },
      { name: 'Alter Tag Box', unit: 'box', default_rate: 190 },
      { name: 'Label/Number Tag', unit: 'bundle', default_rate: 0.20 },
      { name: 'Pocketing', unit: 'mtr', default_rate: 65 },
      { name: 'Waist Coat Buckle', unit: 'pc', default_rate: 15 },
      { name: 'Body Fusing 60GSM', unit: 'roll', default_rate: 60 },
      { name: 'Collar Canvas/Fusing', unit: 'pc', default_rate: 50 },
      { name: 'Side Tab Buckle', unit: 'pc', default_rate: 20 },
      { name: 'Gurkha Tab Buckle', unit: 'pc', default_rate: 25 },
      { name: 'White Fusing Patti', unit: 'roll', default_rate: 125 },
      { name: 'Paper Canvas/Fusing', unit: 'mtr', default_rate: 35 },
      { name: 'Black Pocketing', unit: 'mtr', default_rate: 65 },
      { name: 'Black/White Pocketing Pant', unit: 'mtr', default_rate: 65 },
      { name: 'Cherry/Tuxedo Satin', unit: 'mtr', default_rate: 300 },
      { name: 'Coat Asha Thread', unit: 'box', default_rate: 280 },
      { name: 'Thread Tube', unit: 'pc', default_rate: 25 }
    ];

    const currentMasters = this.getMasters();
    const currentMaterials = this.getMaterials();

    const updatedMasters: Master[] = [...currentMasters];
    const updatedMaterials: Material[] = [...currentMaterials];

    // Seed jackets
    seedJackets.forEach(jacket => {
      const existsIdx = updatedMasters.findIndex(m => m.name.toLowerCase() === jacket.name.toLowerCase());
      if (existsIdx > -1) {
        updatedMasters[existsIdx] = {
          ...updatedMasters[existsIdx],
          code: jacket.code,
          type: 'jacket'
        };
      } else {
        updatedMasters.push({
          id: generateUUID(),
          name: jacket.name,
          code: jacket.code,
          type: 'jacket',
          is_active: true,
          created_at: new Date().toISOString()
        });
      }
    });

    // Seed pants
    seedPants.forEach(pant => {
      const existsIdx = updatedMasters.findIndex(m => m.name.toLowerCase() === pant.name.toLowerCase());
      if (existsIdx > -1) {
        updatedMasters[existsIdx] = {
          ...updatedMasters[existsIdx],
          code: pant.code,
          type: 'pant'
        };
      } else {
        updatedMasters.push({
          id: generateUUID(),
          name: pant.name,
          code: pant.code,
          type: 'pant',
          is_active: true,
          created_at: new Date().toISOString()
        });
      }
    });

    // Seed materials
    seedMaterials.forEach(mat => {
      const existsIdx = updatedMaterials.findIndex(m => m.name.toLowerCase() === mat.name.toLowerCase());
      if (existsIdx > -1) {
        updatedMaterials[existsIdx] = {
          ...updatedMaterials[existsIdx],
          unit: mat.unit,
          default_rate: mat.default_rate
        };
      } else {
        updatedMaterials.push({
          id: generateUUID(),
          name: mat.name,
          unit: mat.unit,
          default_rate: mat.default_rate,
          current_stock: 100,
          is_active: true,
          created_at: new Date().toISOString()
        });
      }
    });

    // Save locally
    this.save('masters', updatedMasters);
    this.save('materials', updatedMaterials);

    // Save to Firestore if connected
    let syncedToCloud = false;
    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        
        // Add all masters to batch
        updatedMasters.forEach(master => {
          batch.set(doc(firestore, 'masters', master.id), master);
        });

        // Add all materials to batch
        updatedMaterials.forEach(material => {
          batch.set(doc(firestore, 'materials', material.id), material);
        });

        await batch.commit();
        syncedToCloud = true;
        
        this.addAuditLog(this.getCurrentUser().email, 'Database Seeding', `Successfully seeded ${updatedMasters.length} masters and ${updatedMaterials.length} materials directly to Firestore.`);
      } catch (err) {
        console.error('Error seeding to Firestore:', err);
        this.addAuditLog(this.getCurrentUser().email, 'Database Seeding Failed', `Could not write seed data to Firestore: ${String(err)}`);
      }
    }

    localStorage.setItem(this.getStorageKey('database_seeded'), 'true');
    window.dispatchEvent(new Event('db_sync'));

    return {
      mastersCount: updatedMasters.length,
      materialsCount: updatedMaterials.length,
      syncedToCloud
    };
  }
}

export const db = new DatabaseService();
export default db;
