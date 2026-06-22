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
  InvoiceStatus,
  LedgerTransaction,
  TransactionType,
  StockCorrection
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

// Clear hardcoded demo users to prevent credentials exposure in client bundle.

class DatabaseService {
  private activeListeners: (() => void)[] = [];
  private isFirebaseInitialized: boolean = false;
  private profilesAttemptedToWrite = new Set<string>();
  private cloudHealth = {
    lastSuccessfulWrite: localStorage.getItem('hf_health_last_write') || null,
    lastRead: localStorage.getItem('hf_health_last_read') || null,
    pendingOfflineWrites: 0,
    lastError: null as string | null,
    syncFailed: false,
    collectionStatus: {
      profiles: 'offline' as 'healthy' | 'failed' | 'offline',
      masters: 'offline' as 'healthy' | 'failed' | 'offline',
      materials: 'offline' as 'healthy' | 'failed' | 'offline',
      challans: 'offline' as 'healthy' | 'failed' | 'offline',
      invoices: 'offline' as 'healthy' | 'failed' | 'offline',
      ledger_transactions: 'offline' as 'healthy' | 'failed' | 'offline',
      audit_logs: 'offline' as 'healthy' | 'failed' | 'offline',
    }
  };

  private resetCollectionStatuses() {
    this.cloudHealth.collectionStatus = {
      profiles: 'offline',
      masters: 'offline',
      materials: 'offline',
      challans: 'offline',
      invoices: 'offline',
      ledger_transactions: 'offline',
      audit_logs: 'offline',
    };
  }

  private getDeviceId(): string {
    let devId = localStorage.getItem('hf_device_id');
    if (!devId) {
      devId = 'device_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('hf_device_id', devId);
    }
    return devId;
  }

  public getCloudHealth() {
    return { 
      ...this.cloudHealth,
      deviceId: this.getDeviceId()
    };
  }

  public isSyncFailed(): boolean {
    return this.cloudHealth.syncFailed;
  }

  private enrichPayload<T extends object>(payload: T): T & {
    auth: { uid: string };
    employeeName: string;
    role: string;
    deviceId: string;
    createdAt: string;
    updatedAt: string;
  } {
    const currentUser = this.getCurrentUser();
    const systemUid = auth.currentUser?.uid || currentUser.uid || 'guest';
    const email = auth.currentUser?.email || currentUser.email || 'guest@harryfashion.com';
    const employeeName = currentUser.displayName || currentUser.name || email.split('@')[0];
    const role = currentUser.role || 'issue_dept';

    return {
      ...payload,
      auth: {
        uid: systemUid
      },
      employeeName,
      role,
      deviceId: this.getDeviceId(),
      createdAt: (payload as any).created_at || (payload as any).createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private async performCloudWrite<T>(operation: () => Promise<T>): Promise<T> {
    this.cloudHealth.pendingOfflineWrites += 1;
    window.dispatchEvent(new Event('db_sync'));
    try {
      const result = await operation();
      this.cloudHealth.lastSuccessfulWrite = new Date().toISOString();
      localStorage.setItem('hf_health_last_write', this.cloudHealth.lastSuccessfulWrite);
      this.cloudHealth.syncFailed = false;
      this.cloudHealth.lastError = null;
      return result;
    } catch (error: any) {
      console.error("Cloud write failed: ", error);
      const isPermissionError = error?.message?.includes('insufficient permissions') || error?.message?.includes('permission') || error?.message?.includes('PERMISSION_DENIED');
      if (isPermissionError) {
        this.cloudHealth.syncFailed = true;
      }
      this.cloudHealth.lastError = error?.message || String(error);
      throw error;
    } finally {
      this.cloudHealth.pendingOfflineWrites = Math.max(0, this.cloudHealth.pendingOfflineWrites - 1);
      window.dispatchEvent(new Event('db_sync'));
    }
  }

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
      this.cloudHealth.lastRead = new Date().toISOString();
      localStorage.setItem('hf_health_last_read', this.cloudHealth.lastRead);
      this.cloudHealth.syncFailed = false;
      window.dispatchEvent(new Event('db_sync'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration or network status.");
      }
    }
  }

  // Silent background Firebase login so all devices synchronize automatically without popups
  private async attemptBackgroundAuth() {
    // If we're already checking or authenticated, skip
    if (auth.currentUser) return;
    try {
      const { signInAnonymously } = await import('./firebase');
      await signInAnonymously(auth);
      console.log("Background cloud connection successfully synced!");
    } catch (err: any) {
      console.warn("Background cloud connection was deferred or requires explicit console option. Normal offline mode ready:", err.message);
      (window as any)._firebase_init_error = err.message || String(err);
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
      const defaultUser: Profile = {
        uid: 'guest-01',
        id: 'guest-01',
        displayName: 'Guest Profile',
        name: 'Guest Profile',
        email: 'guest@harryfashion.com',
        role: 'issue_dept',
        username: 'guest',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(this.getStorageKey('current_user'), JSON.stringify(defaultUser));
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
    if (!localStorage.getItem(this.getStorageKey('stock_corrections'))) this.save('stock_corrections', []);

    // Ensure Hook & Eye Box has negative stock initially if no corrections have been recorded, to demo the correction workflow.
    const correctionsList = this.load<StockCorrection[]>('stock_corrections', []);
    if (correctionsList.length === 0) {
      const currentMaterials = this.load<Material[]>('materials', []);
      const idx = currentMaterials.findIndex(m => m.name === 'Hook & Eye Box');
      if (idx > -1 && currentMaterials[idx].current_stock >= 0) {
        currentMaterials[idx].current_stock = -15.0;
        this.save('materials', currentMaterials);
        
        // Also sync to cloud if firebase is initialized
        if (this.isFirebaseInitialized) {
          try {
            setDoc(doc(firestore, 'materials', currentMaterials[idx].id), this.enrichPayload(currentMaterials[idx]))
              .catch(e => console.warn('Cloud negative stock init skip:', e));
          } catch (_) {}
        }
      }
    }
  }

  // Listen to Auth changes and enable cloud listeners
  private setupAuthStateListener() {
    let isFirstCheck = true;
    auth.onAuthStateChanged((user) => {
      // Clear active listeners
      this.activeListeners.forEach(unsubscribe => unsubscribe());
      this.activeListeners = [];
      this.resetCollectionStatuses();

      if (user) {
        if (user.isAnonymous) {
          console.warn("Blocking anonymous user sync session. Signing out...");
          auth.signOut();
          return;
        }

        console.log(`Authenticated with Cloud Database as ${user.email} (UID: ${user.uid}). Initializing Firestore Real-time synchronization...`);
        this.isFirebaseInitialized = true;

        // 1. Establish real-time listener for current user's security profile
        const profileRef = doc(firestore, 'profiles', user.uid);
        let cloudSyncStarted = false;

        const unsubscribeProfile = onSnapshot(profileRef, async (snap) => {
          this.cloudHealth.collectionStatus.profiles = 'healthy';
          if (snap.exists()) {
            this.cloudHealth.lastRead = new Date().toISOString();
            localStorage.setItem('hf_health_last_read', this.cloudHealth.lastRead);
            this.cloudHealth.syncFailed = false;

            const data = snap.data();
            const email = data.email || user.email || 'user@harryfashion.com';
            let roleToUse: UserRole = data.role || 'issue_dept';
            if (
              email.toLowerCase() === 'k64561148@gmail.com' ||
              email.toLowerCase() === 'admin@harryfashion.com' ||
              email.toLowerCase().includes('admin') ||
              email.toLowerCase().includes('owner')
            ) {
              roleToUse = 'admin';
            }

            const prof: Profile = {
              uid: data.uid || user.uid,
              id: data.uid || user.uid,
              displayName: data.displayName || data.name || email.split('@')[0],
              name: data.displayName || data.name || email.split('@')[0],
              email: email,
              role: roleToUse,
              username: data.username || email.split('@')[0],
              active: data.active !== undefined ? data.active : true,
              createdAt: data.createdAt || data.created_at || new Date().toISOString(),
              updatedAt: data.updatedAt || data.updated_at || new Date().toISOString()
            };

            if (data.role !== roleToUse) {
              try {
                await setDoc(profileRef, this.enrichPayload(prof));
              } catch (e) {
                console.warn('Silent upgrade profile failed:', e);
              }
            }

            this.save('current_user', prof);
            window.dispatchEvent(new Event('db_sync'));

            // Secure and deferred synchronization launch using official fetched role
            if (!cloudSyncStarted) {
              cloudSyncStarted = true;
              this.setupCloudSyncListeners(prof.role);
            }
          } else {
            // Check if registration is already in progress via system UI form
            if (localStorage.getItem('hf_registration_in_progress') === 'true') {
              console.log('Registration is concurrently in progress in UI. Skipping default profile birth write.');
              return;
            }

            if (this.profilesAttemptedToWrite.has(user.uid)) {
              console.log('Skipping duplicate profile birth write attempt to prevent infinite loop for UID:', user.uid);
              return;
            }
            this.profilesAttemptedToWrite.add(user.uid);

            const email = user.email || 'guest@harryfashion.com';
            let role: UserRole = 'issue_dept';
            // Pre-assign admin to k64561148@gmail.com, admin@harryfashion.com, and owner/admin emails, billing for billing emails
            if (
              email.toLowerCase() === 'k64561148@gmail.com' ||
              email.toLowerCase() === 'admin@harryfashion.com' ||
              email.toLowerCase().includes('admin') ||
              email.toLowerCase().includes('owner')
            ) {
              role = 'admin';
            } else if (email.toLowerCase().includes('billing')) {
              role = 'billing';
            }

            const newProfile: Profile = {
              uid: user.uid,
              id: user.uid,
              displayName: user.displayName || email.split('@')[0],
              name: user.displayName || email.split('@')[0],
              email: email,
              role: role,
              username: email.split('@')[0],
              active: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            try {
              const enrichedProfile = this.enrichPayload(newProfile);
              await this.performCloudWrite(() => setDoc(profileRef, enrichedProfile));
              window.dispatchEvent(new Event('db_sync'));
            } catch (err) {
              console.error('Error creating user profile in cloud:', err);
              // Remove if failed so we can retry on next clean login, but keep to prevent local snapshot loop in the same session
            }
          }
        }, (error) => {
          console.warn('Profile listener blocked or failed:', error);
          this.cloudHealth.collectionStatus.profiles = 'failed';
          const isPermissionError = error?.message?.includes('insufficient permissions') || error?.message?.includes('permission') || error?.message?.includes('PERMISSION_DENIED');
          if (isPermissionError) {
            this.cloudHealth.syncFailed = true;
            window.dispatchEvent(new Event('db_sync'));
          }
        });

        this.activeListeners.push(unsubscribeProfile);
      } else {
        console.log("Database running in Local-first offline mode. Sign in to sync with Cloud!");
        this.isFirebaseInitialized = false;
      }
      isFirstCheck = false;
    });
  }

  // Real-time multi-collection snap listeners (Zero cost for local-first, infinite sync)
  private setupCloudSyncListeners(role?: UserRole) {
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
      'stock_corrections'
    ];

    // Only attempt to synchronize audit logs and ledger transactions if the authenticated user holds required admin privilege
    if (role === 'admin') {
      syncCollections.push('audit_logs', 'ledger_transactions');
    }

    syncCollections.forEach((collName) => {
      try {
        const unsubscribe = onSnapshot(collection(firestore, collName), { includeMetadataChanges: false }, (snapshot) => {
          this.cloudHealth.lastRead = new Date().toISOString();
          localStorage.setItem('hf_health_last_read', this.cloudHealth.lastRead);
          this.cloudHealth.syncFailed = false;

          if (collName in this.cloudHealth.collectionStatus) {
            this.cloudHealth.collectionStatus[collName as keyof typeof this.cloudHealth.collectionStatus] = 'healthy';
          }

          const remoteRecords: any[] = [];
          snapshot.forEach((docSnap) => {
            remoteRecords.push(docSnap.data());
          });

          // Only sync if there are active cloud records to avoid empty-source overwrites initially
          if (snapshot.size > 0) {
            // Robust local-remote merge to prevent local data loss/wipeouts!
            const localRecords = this.load<any[]>(collName, []);
            const getKey = (item: any) => {
              if (collName === 'invoice_challans') {
                return `${item.invoice_id}_${item.challan_id}`;
              }
              return item.id || item.uid;
            };

            const mergedMap = new Map<string, any>();
            
            // First load all local records
            localRecords.forEach(item => {
              const key = getKey(item);
              if (key) mergedMap.set(key, item);
            });

            // Overwrite/merge with remote records (remote is source of truth, but we don't discard local-only ones)
            // We use standard Last-Write-Wins based on timestamps to guarantee local pending writes aren't overwritten by old remote cache snapshots
            remoteRecords.forEach(item => {
              const key = getKey(item);
              if (key) {
                const localItem = mergedMap.get(key);
                if (localItem) {
                  const getStampTime = (obj: any) => {
                    const val = obj.updatedAt || obj.updated_at || obj.lastEditedAt || obj.timestamp || obj.created_at || obj.createdAt || 0;
                    return typeof val === 'number' ? val : new Date(val).getTime();
                  };
                  const localTime = getStampTime(localItem);
                  const remoteTime = getStampTime(item);
                  if (remoteTime >= localTime) {
                    mergedMap.set(key, item);
                  }
                } else {
                  mergedMap.set(key, item);
                }
              }
            });

            const mergedRecords = Array.from(mergedMap.values());

            // Re-order by createdAt desc if applicable
            if (collName === 'audit_logs' || collName === 'rate_history') {
              mergedRecords.sort((a, b) => new Date(b.created_at || b.createdAt || 0).getTime() - new Date(a.created_at || a.createdAt || 0).getTime());
            }
            this.save(collName, mergedRecords);
            // Trigger customized global event so UI knows data synced
            window.dispatchEvent(new Event('db_sync'));
          } else {
            // If Firestore collection is completely empty, upload local seed or items as initial cloud backup!
            this.backupLocalCollectionToCloud(collName);
          }
        }, (error) => {
          console.warn(`Firestore listener error on selection ${collName}. Non-fatal, continuing offline.`, error);
          if (collName in this.cloudHealth.collectionStatus) {
            this.cloudHealth.collectionStatus[collName as keyof typeof this.cloudHealth.collectionStatus] = 'failed';
          }
          const isPermissionError = error?.message?.includes('insufficient permissions') || error?.message?.includes('permission') || error?.message?.includes('PERMISSION_DENIED');
          if (isPermissionError) {
            this.cloudHealth.syncFailed = true;
            window.dispatchEvent(new Event('db_sync'));
          }
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
    const defaultUser: Profile = {
      uid: 'guest-01',
      id: 'guest-01',
      displayName: 'Guest Profile',
      name: 'Guest Profile',
      email: 'guest@harryfashion.com',
      role: 'issue_dept',
      username: 'guest',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.load<Profile>('current_user', defaultUser);
  }

  setCurrentUser(user: Profile): void {
    this.save('current_user', user);
    this.addAuditLog(user.email, 'User Authentication', `Switched active user profile to ${user.displayName || user.name} (${user.role})`);
    
    // Write back profile to Firebase if synced
    if (this.isFirebaseInitialized && user.uid && user.uid !== 'guest-01') {
      const idToUse = user.uid || user.id;
      this.performCloudWrite(() => setDoc(doc(firestore, 'profiles', idToUse), this.enrichPayload(user)))
        .catch(err => console.warn('Could not sync user swap to cloud:', err));
    }
  }

  getProfiles(): Profile[] {
    return this.load<Profile[]>('profiles', []);
  }

  saveProfile(profile: Profile): void {
    const list = this.getProfiles();
    const idToFind = profile.uid || profile.id;
    if (!idToFind) return;
    const index = list.findIndex(p => p.uid === idToFind || p.id === idToFind);
    if (index > -1) {
      list[index] = profile;
    } else {
      list.push(profile);
    }
    this.save('profiles', list);

    if (this.isFirebaseInitialized) {
      this.performCloudWrite(() => setDoc(doc(firestore, 'profiles', idToFind), this.enrichPayload(profile)))
        .catch(err => handleFirestoreError(err, OperationType.WRITE, `profiles/${idToFind}`));
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

    // Validate duplicates
    const nameCheck = (master.name || '').trim().toLowerCase();
    const codeCheck = (master.code || '').trim().toLowerCase();

    if (nameCheck) {
      const duplicateName = list.find(m => m.id !== master.id && m.name.trim().toLowerCase() === nameCheck);
      if (duplicateName) {
        throw new Error(`Master insertion/update failed: A Master with the name "${duplicateName.name}" already exists.`);
      }
    }
    if (codeCheck) {
      const duplicateCode = list.find(m => m.id !== master.id && m.code.trim().toLowerCase() === codeCheck);
      if (duplicateCode) {
        throw new Error(`Master insertion/update failed: A Master with the short code "${duplicateCode.code}" already exists.`);
      }
    }

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
      this.performCloudWrite(() => setDoc(doc(firestore, 'masters', result.id), this.enrichPayload(result)))
        .catch(error => handleFirestoreError(error, OperationType.WRITE, `masters/${result.id}`));
    }

    return result;
  }

  mergeMasters(sourceId: string, targetId: string): void {
    if (sourceId === targetId) {
      throw new Error("Cannot merge a master into itself.");
    }

    const masters = this.getMasters();
    const sourceMaster = masters.find(m => m.id === sourceId);
    const targetMaster = masters.find(m => m.id === targetId);

    if (!sourceMaster || !targetMaster) {
      throw new Error("Source or target master not found.");
    }

    const currentUser = this.getCurrentUser();

    // 1. Migrate Challans
    const challanList = this.getChallans();
    let migratedChallansCount = 0;
    challanList.forEach(ch => {
      if (ch.master_id === sourceId) {
        ch.master_id = targetId;
        migratedChallansCount++;
      }
    });

    // 2. Migrate Invoices
    const invoiceList = this.getInvoices();
    let migratedInvoicesCount = 0;
    invoiceList.forEach(inv => {
      if (inv.master_id === sourceId) {
        inv.master_id = targetId;
        migratedInvoicesCount++;
      }
    });

    // 3. Migrate Ledger Transactions
    const ledgerTransList = this.getTransactions();
    let migratedLedgerCount = 0;
    ledgerTransList.forEach(tx => {
      if (tx.master_id === sourceId) {
        tx.master_id = targetId;
        migratedLedgerCount++;
      }
    });

    // 4. Migrate Rate Overrides
    const overridesList = this.getMasterRateOverrides();
    overridesList.forEach(o => {
      if (o.master_id === sourceId) {
        // check if target already has an override for the same material
        const exists = overridesList.some(tg => tg.master_id === targetId && tg.material_id === o.material_id);
        if (!exists) {
          o.master_id = targetId;
        }
      }
    });

    // 5. Merge pan_accounts of source master into target master if not present
    const sourcePANs = sourceMaster.pan_accounts || [];
    const targetPANs = targetMaster.pan_accounts || [];
    sourcePANs.forEach(span => {
      const exists = targetPANs.some(tpan => tpan.pan_no.toLowerCase() === span.pan_no.toLowerCase());
      if (!exists) {
        targetPANs.push(span);
      }
    });
    targetMaster.pan_accounts = targetPANs;

    // 6. Delete source master
    const filteredMasters = masters.filter(m => m.id !== sourceId);

    // Save lists
    this.save('masters', filteredMasters);
    this.save('challans', challanList);
    this.save('invoices', invoiceList);
    this.save('transactions', ledgerTransList);
    this.save('master_rate_overrides', overridesList);

    // Write audit log
    this.addAuditLog(
      currentUser.email,
      'Master Merged',
      `Merged Master "${sourceMaster.name}" (${sourceMaster.code}) into "${targetMaster.name}" (${targetMaster.code}). Migrated ${migratedChallansCount} challans, ${migratedInvoicesCount} invoices, and ${migratedLedgerCount} ledger entries.`
    );

    // Sync changes to cloud if initialized
    if (this.isFirebaseInitialized) {
      // update target
      this.performCloudWrite(() => setDoc(doc(firestore, 'masters', targetId), this.enrichPayload(targetMaster)))
        .catch(err => console.error("Cloud write target master failed in merge:", err));
      // delete source
      this.performCloudWrite(() => deleteDoc(doc(firestore, 'masters', sourceId)))
        .catch(err => console.error("Cloud write source delete failed in merge:", err));
    }
  }

  // --- Materials ---
  getMaterials(): Material[] {
    return this.load<Material[]>('materials', []);
  }

  hasNegativeStock(): boolean {
    return this.getMaterials().some(m => m.current_stock < 0);
  }

  saveMaterial(material: Partial<Material>): Material {
    const list = this.getMaterials();
    const currentUser = this.getCurrentUser();
    let result: Material;

    if (material.current_stock !== undefined && material.current_stock < 0) {
      throw new Error("Material stock can never go below zero.");
    }

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
      this.performCloudWrite(() => setDoc(doc(firestore, 'materials', result.id), this.enrichPayload(result)))
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
          this.performCloudWrite(() => deleteDoc(doc(firestore, 'master_rate_overrides', itemRem.id)))
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
      this.performCloudWrite(() => setDoc(doc(firestore, 'master_rate_overrides', result.id), this.enrichPayload(result)))
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
        this.performCloudWrite(() => deleteDoc(doc(firestore, 'master_rate_overrides', id)))
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
    if (this.hasNegativeStock()) {
      throw new Error("Stock trust blocked until negative stock is corrected.");
    }
    const challanList = this.getChallans();
    const allItemsList = this.getChallanItems();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();

    // Validate stock levels before saving - Aggregate by material_id first
    const aggregatedQtys: { [matId: string]: number } = {};
    items.forEach((item) => {
      if (item.material_id) {
        aggregatedQtys[item.material_id] = (aggregatedQtys[item.material_id] || 0) + item.qty;
      }
    });

    Object.entries(aggregatedQtys).forEach(([materialId, totalQty]) => {
      const mat = materialsList.find(m => m.id === materialId);
      if (mat && totalQty > mat.current_stock) {
        throw new Error(`Save blocked: Total requested quantity for ${mat.name} (${totalQty} ${mat.unit}) exceeds available stock (${mat.current_stock.toFixed(1)} ${mat.unit}).`);
      }
    });

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
        const nextStock = materialsList[matIndex].current_stock - item.qty;
        if (nextStock < 0) {
          throw new Error(`Transaction aborted: Operation would make material ${materialsList[matIndex].name} stock negative (${nextStock.toFixed(1)}).`);
        }
        materialsList[matIndex].current_stock = nextStock;
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
        batch.set(doc(firestore, 'challans', newChallan.id), this.enrichPayload(newChallan));

        // Write Challan Items
        savedChallanItems.forEach(item => {
          batch.set(doc(firestore, 'challan_items', item.id), this.enrichPayload(item));
        });

        // Write Modified Stocks atomatically using server-side increment to prevent concurrent-write bugs
        items.forEach(item => {
          const enrichUpdate = this.enrichPayload({});
          batch.update(doc(firestore, 'materials', item.material_id), {
            current_stock: increment(-item.qty),
            ...enrichUpdate
          });
        });

        this.performCloudWrite(() => batch.commit())
          .catch(error => handleFirestoreError(error, OperationType.WRITE, `challans_batch/${newChallan.id}`));
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
            const enrichUpdate = this.enrichPayload({});
            batch.update(doc(firestore, 'materials', item.material_id), {
              current_stock: increment(item.qty),
              ...enrichUpdate
            });
          });
          this.performCloudWrite(() => batch.commit())
            .catch(error => handleFirestoreError(error, OperationType.DELETE, `challans_void/${challanId}`));
        } catch (err) {
          console.warn(err);
        }
      }
    }
  }

  permanentlyDeleteChallan(challanId: string): void {
    const challanList = this.getChallans();
    const allItemsList = this.getChallanItems();
    const currentUser = this.getCurrentUser();
    const mastersList = this.getMasters();

    const idx = challanList.findIndex(c => c.id === challanId);
    if (idx > -1) {
      const challan = challanList[idx];
      if (challan.status === 'billed') {
        throw new Error('Completed/Billed challans cannot be deleted unless the bill is first reversed');
      }
      const masterObj = mastersList.find(m => m.id === challan.master_id);
      const masterName = masterObj ? masterObj.name : 'Unknown';
      const deletedItems = allItemsList.filter(item => item.challan_id === challanId);

      // Remove from local Lists
      challanList.splice(idx, 1);
      const remainingItems = allItemsList.filter(item => item.challan_id !== challanId);

      this.save('challans', challanList);
      this.save('challan_items', remainingItems);

      this.addAuditLog(currentUser.email, 'DELETED', `Permanently deleted Challan ${challan.challan_no} for Master ${masterName}`);

      if (this.isFirebaseInitialized) {
        try {
          const batch = writeBatch(firestore);
          batch.delete(doc(firestore, 'challans', challanId));
          deletedItems.forEach(item => {
            batch.delete(doc(firestore, 'challan_items', item.id));
          });
          this.performCloudWrite(() => batch.commit())
            .catch(error => handleFirestoreError(error, OperationType.DELETE, `challans_delete/${challanId}`));
        } catch (err) {
          console.warn(err);
        }
      }
    }
  }

  voidAndReverseChallan(challanId: string, reason: string): void {
    const challanList = this.getChallans();
    const allItemsList = this.getChallanItems();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();
    const mastersList = this.getMasters();

    const idx = challanList.findIndex(c => c.id === challanId);
    if (idx > -1) {
      const challan = challanList[idx];
      if (challan.status === 'billed') {
        throw new Error('Completed/Billed challans cannot be voided');
      }
      if (challan.status === ('voided' as any)) {
        throw new Error('Challan is already voided');
      }

      // Update status to VOIDED
      challan.status = 'voided' as any;
      if (reason) {
        challan.notes = (challan.notes ? challan.notes + '\n' : '') + `VOID REASON: ${reason}`;
      }

      const masterObj = mastersList.find(m => m.id === challan.master_id);
      const masterName = masterObj ? masterObj.name : 'Unknown';

      // Restore stocks
      const matchingItems = allItemsList.filter(item => item.challan_id === challanId);
      matchingItems.forEach(item => {
        const matIdx = materialsList.findIndex(m => m.id === item.material_id);
        if (matIdx > -1) {
          materialsList[matIdx].current_stock += item.qty;
        }
      });

      this.save('challans', challanList);
      this.save('materials', materialsList);

      this.addAuditLog(currentUser.email, 'VOIDED', `Voided Challan ${challan.challan_no} for Master ${masterName}. Reason: ${reason}`);

      if (this.isFirebaseInitialized) {
        try {
          const batch = writeBatch(firestore);
          batch.update(doc(firestore, 'challans', challanId), this.enrichPayload({
            status: 'voided',
            notes: challan.notes
          }));
          matchingItems.forEach(item => {
            const enrichUpdate = this.enrichPayload({});
            batch.update(doc(firestore, 'materials', item.material_id), {
              current_stock: increment(item.qty),
              ...enrichUpdate
            });
          });
          this.performCloudWrite(() => batch.commit())
            .catch(error => handleFirestoreError(error, OperationType.WRITE, `challans_void/${challanId}`));
        } catch (err) {
          console.warn(err);
        }
      }
    }
  }

  editChallan(
    challanId: string,
    updatedItems: { material_id: string; qty: number; rate: number }[],
    notes: string,
    reason: string
  ): void {
    const challanList = this.getChallans();
    const allItemsList = this.getChallanItems();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();
    const mastersList = this.getMasters();

    const idx = challanList.findIndex(c => c.id === challanId);
    if (idx > -1) {
      const challan = challanList[idx];
      if (challan.status === 'billed') {
        throw new Error('Completed/Billed challans cannot be edited');
      }

      const masterObj = mastersList.find(m => m.id === challan.master_id);
      const masterName = masterObj ? masterObj.name : 'Unknown';

      // Reconcile material stock
      const previousItems = allItemsList.filter(item => item.challan_id === challanId);

      // Revert previous stock changes (restoring what was issued)
      previousItems.forEach(item => {
        const matIdx = materialsList.findIndex(m => m.id === item.material_id);
        if (matIdx > -1) {
          materialsList[matIdx].current_stock += item.qty;
        }
      });

      // Validate stock levels for the newly updated items - Aggregated by material_id
      const aggregatedQtys: { [matId: string]: number } = {};
      updatedItems.forEach((item) => {
        if (item.material_id) {
          aggregatedQtys[item.material_id] = (aggregatedQtys[item.material_id] || 0) + item.qty;
        }
      });

      Object.entries(aggregatedQtys).forEach(([materialId, totalQty]) => {
        const mat = materialsList.find(m => m.id === materialId);
        if (mat && totalQty > mat.current_stock) {
          throw new Error(`Edit blocked: Total requested quantity for ${mat.name} (${totalQty} ${mat.unit || 'pc'}) exceeds available stock plus refunded stock (${mat.current_stock.toFixed(1)} ${mat.unit || 'pc'}).`);
        }
      });

      // Deduct new items from stock
      updatedItems.forEach(item => {
        const matIdx = materialsList.findIndex(m => m.id === item.material_id);
        if (matIdx > -1) {
          const nextStock = materialsList[matIdx].current_stock - item.qty;
          if (nextStock < 0) {
            throw new Error(`Transaction aborted: Operation would make material ${materialsList[matIdx].name} stock negative (${nextStock.toFixed(1)}).`);
          }
          materialsList[matIdx].current_stock = nextStock;
        }
      });

      // Remove old items from allItemsList
      const remainingItems = allItemsList.filter(item => item.challan_id !== challanId);

      // Create new items list
      const savedChallanItems: ChallanItem[] = [];
      updatedItems.forEach(item => {
        const challanItem: ChallanItem = {
          id: generateUUID(),
          challan_id: challanId,
          material_id: item.material_id,
          qty: item.qty,
          rate: item.rate,
          amount: parseFloat((item.qty * item.rate).toFixed(2)),
          created_at: new Date().toISOString()
        };
        savedChallanItems.push(challanItem);
      });

      // Combine
      const newItemsList = [...remainingItems, ...savedChallanItems];

      // Build version history
      const previousItemsMapped = previousItems.map(item => ({
        material_id: item.material_id,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount
      }));

      const latestItemsMapped = savedChallanItems.map(item => ({
        material_id: item.material_id,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount
      }));

      let originalItems: any[] = [];
      if (!challan.editHistory || challan.editHistory.length === 0) {
        originalItems = previousItemsMapped;
      } else {
        originalItems = challan.editHistory[0].originalItems || challan.editHistory[0].previousItems || [];
      }

      const changedFields: string[] = [];
      if (notes !== undefined && notes !== challan.notes) {
        changedFields.push("Notes updated");
      }

      const prevMap = new Map(previousItemsMapped.map(i => [i.material_id, i]));
      const nextMap = new Map(latestItemsMapped.map(i => [i.material_id, i]));

      for (const [matId, prev] of prevMap.entries()) {
        const next = nextMap.get(matId);
        const matName = materialsList.find(m => m.id === matId)?.name || matId;
        if (!next) {
          changedFields.push(`Removed material: ${matName}`);
        } else {
          if (prev.qty !== next.qty) {
            changedFields.push(`Quantity change for ${matName} (${prev.qty} → ${next.qty})`);
          }
          if (prev.rate !== next.rate) {
            changedFields.push(`Rate change for ${matName} (₹${prev.rate} → ₹${next.rate})`);
          }
        }
      }

      for (const [matId, next] of nextMap.entries()) {
        if (!prevMap.has(matId)) {
          const matName = materialsList.find(m => m.id === matId)?.name || matId;
          changedFields.push(`Added material: ${matName} (qty: ${next.qty}, rate: ₹${next.rate})`);
        }
      }

      const stockDelta: { material_id: string; delta: number; name: string }[] = [];
      const allMatIds = new Set([...prevMap.keys(), ...nextMap.keys()]);
      allMatIds.forEach(matId => {
        const prev = prevMap.get(matId);
        const next = nextMap.get(matId);
        const pQty = prev ? prev.qty : 0;
        const nQty = next ? next.qty : 0;
        const diff = pQty - nQty; // positive is inventory returned to stock, negative is extra inventory consumed
        if (diff !== 0) {
          const matObj = materialsList.find(m => m.id === matId);
          stockDelta.push({
            material_id: matId,
            delta: parseFloat(diff.toFixed(2)),
            name: matObj ? matObj.name : 'Unknown Material'
          });
        }
      });

      const editVersion = {
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        user: currentUser.email,
        reason: reason,
        originalItems: originalItems,
        previousItems: previousItemsMapped,
        latestItems: latestItemsMapped,
        changedFields: changedFields.length > 0 ? changedFields : ["No material field changes"],
        stockDelta: stockDelta
      };

      if (!challan.editHistory) {
        challan.editHistory = [];
      }
      challan.editHistory.push(editVersion);

      // Update remaining fields on Challan
      if (notes !== undefined) {
        challan.notes = notes;
      }
      if (reason) {
        challan.notes = (challan.notes ? challan.notes + '\n' : '') + `EDIT REASON: ${reason}`;
      }

      challan.lastEditedAt = new Date().toISOString();
      challan.lastEditedBy = currentUser.email;
      challan.editReason = reason;

      this.save('challans', challanList);
      this.save('challan_items', newItemsList);
      this.save('materials', materialsList);

      this.addAuditLog(currentUser.email, 'EDITED', `Edited Challan ${challan.challan_no} for Master ${masterName}. Reason: ${reason}`);

      if (this.isFirebaseInitialized) {
        try {
          const batch = writeBatch(firestore);
          // Update Challan fields
          batch.update(doc(firestore, 'challans', challanId), this.enrichPayload({
            notes: challan.notes,
            lastEditedAt: challan.lastEditedAt,
            lastEditedBy: challan.lastEditedBy,
            editReason: challan.editReason,
            editHistory: challan.editHistory
          }));
          
          // Delete old items on cloud
          previousItems.forEach(item => {
            batch.delete(doc(firestore, 'challan_items', item.id));
          });

          // Upload new items to cloud
          savedChallanItems.forEach(item => {
            batch.set(doc(firestore, 'challan_items', item.id), this.enrichPayload(item));
          });

          // Reconcile stocks atomically on Firestore: add back old, subtract new
          previousItems.forEach(item => {
            const enrichUpdate = this.enrichPayload({});
            batch.update(doc(firestore, 'materials', item.material_id), {
              current_stock: increment(item.qty),
              ...enrichUpdate
            });
          });
          updatedItems.forEach(item => {
            const enrichUpdate = this.enrichPayload({});
            batch.update(doc(firestore, 'materials', item.material_id), {
              current_stock: increment(-item.qty),
              ...enrichUpdate
            });
          });

          this.performCloudWrite(() => batch.commit())
            .catch(error => handleFirestoreError(error, OperationType.WRITE, `challans_edit/${challanId}`));
        } catch (err) {
          console.warn(err);
        }
      }
    }
  }

  adjustBilledChallan(
    challanId: string,
    amount: number,
    refNo: string,
    reason: string
  ): void {
    const challanList = this.getChallans();
    const challan = challanList.find(c => c.id === challanId);
    if (!challan) {
      throw new Error(`Challan ID ${challanId} not found.`);
    }

    if (challan.status !== 'billed') {
      throw new Error(`Adjustment can only be performed on BILLED challans.`);
    }

    const currentUser = this.getCurrentUser();

    // 1. Save adjustment manual ledger transaction
    this.saveManualTransaction({
      type: 'ADJUSTMENT',
      master_id: challan.master_id,
      amount: -amount, // credit is a deduction (negative) from master balance
      ref_no: refNo.trim(),
      notes: `POST-BILL ADJ: "${reason.trim()}" for locked Challan ${challan.challan_no}`,
      date: new Date().toISOString().split('T')[0],
    });

    // 2. Add to edit history
    const allItemsList = this.getChallanItems();
    const currentItemsMapped = allItemsList.filter(item => item.challan_id === challanId);

    const editVersion = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      user: currentUser.email,
      reason: `POST-BILL AUDIT CORRECTION: ${reason} (Credit Note ${refNo} of ₹${amount})`,
      originalItems: currentItemsMapped,
      previousItems: currentItemsMapped,
      latestItems: currentItemsMapped,
      changedFields: ['POST_BILLING_CREDIT_NOTE', 'LEDGER_ADJUSTMENT'],
      stockDelta: []
    };

    if (!challan.editHistory) {
      challan.editHistory = [];
    }
    challan.editHistory.push(editVersion);

    challan.lastEditedAt = new Date().toISOString();
    challan.lastEditedBy = currentUser.email;
    challan.editReason = `Billed credit note issued: ₹${amount} (Ref: ${refNo}). Reason: ${reason}`;

    this.save('challans', challanList);

    this.addAuditLog(currentUser.email, 'BILLED_ADJUSTED', `Registered Credit Note ${refNo} for Challan ${challan.challan_no}. Reason: ${reason}`);

    if (this.isFirebaseInitialized) {
      try {
        const docRef = doc(firestore, 'challans', challan.id);
        this.performCloudWrite(() => setDoc(docRef, this.enrichPayload(challan)))
          .catch(err => console.warn('Firestore err writing adjusted challan:', err));
      } catch (err) {
        console.warn('Firestore write failed:', err);
      }
    }
  }

  // --- Single Source-of-Truth Ledger Engine ---
  getTransactions(): LedgerTransaction[] {
    const manual = this.load<LedgerTransaction[]>('ledger_transactions', []);
    const list: LedgerTransaction[] = [...manual];

    // 1. Synthesize MATERIAL_ISSUE from active Challans & ChallanItems
    const challans = this.getChallans();
    const challanItems = this.getChallanItems();
    challans.forEach(ch => {
      if (ch.status === 'issued' || ch.status === 'billed') {
        const items = challanItems.filter(item => item.challan_id === ch.id);
        items.forEach(item => {
          const m = parseInt(ch.issued_date.split('-')[1], 10);
          const y = parseInt(ch.issued_date.split('-')[0], 10);
          list.push({
            id: `gen_mi_${item.id}`,
            type: 'MATERIAL_ISSUE',
            date: ch.issued_date,
            master_id: ch.master_id,
            material_id: item.material_id,
            qty: item.qty,
            rate: item.rate,
            amount: item.amount, // represents deduction charge to master
            ref_id: item.id,
            ref_no: ch.challan_no,
            notes: ch.notes,
            created_at: ch.created_at,
            period_month: m,
            period_year: y
          });
        });
      } else if (ch.status === 'voided') {
        const m = parseInt(ch.issued_date.split('-')[1], 10);
        const y = parseInt(ch.issued_date.split('-')[0], 10);
        list.push({
          id: `gen_void_ch_${ch.id}`,
          type: 'VOID',
          date: ch.issued_date,
          master_id: ch.master_id,
          amount: 0,
          ref_id: ch.id,
          ref_no: ch.challan_no,
          notes: `Voided Challan: ${ch.notes}`,
          created_at: ch.created_at,
          period_month: m,
          period_year: y
        });
      }
    });

    // 2. Synthesize STOCK_INWARD from InwardEntries
    const inwards = this.getInwardEntries();
    inwards.forEach(inw => {
      const m = parseInt(inw.inward_date.split('-')[1], 10);
      const y = parseInt(inw.inward_date.split('-')[0], 10);
      list.push({
        id: `gen_si_${inw.id}`,
        type: 'STOCK_INWARD',
        date: inw.inward_date,
        material_id: inw.material_id,
        qty: inw.qty_received,
        amount: 0, // inwards don't affect master accounts directly
        ref_id: inw.id,
        ref_no: inw.bill_no,
        notes: inw.notes,
        created_at: inw.created_at,
        period_month: m,
        period_year: y
      });
    });

    // 3. Synthesize BILL_DRAFT / BILL_FINALIZED from Invoices
    const invoices = this.getInvoices();
    invoices.forEach(inv => {
      const isFinal = inv.status === 'finalised';
      list.push({
        id: `gen_inv_${inv.id}`,
        type: isFinal ? 'BILL_FINALIZED' : 'BILL_DRAFT',
        date: inv.created_at.split('T')[0],
        master_id: inv.master_id,
        amount: inv.net_payable, // credits master account
        ref_id: inv.id,
        ref_no: inv.invoice_no,
        notes: `Billing Cycle Summary (${inv.period_month}/${inv.period_year})`,
        created_at: inv.created_at,
        work_amount: inv.work_amount,
        material_deduction: inv.material_deduction,
        discount: inv.discount,
        tds_amount: inv.tds_amount,
        net_payable: inv.net_payable,
        period_month: inv.period_month,
        period_year: inv.period_year
      });
    });

    // Sort chronologically and then by creation date
    return list.sort((a, b) => a.date.localeCompare(b.date) || (a.created_at || '').localeCompare(b.created_at || ''));
  }

  getLedgerSummaryForMasterMonth(masterId: string, month: number, year: number) {
    const txs = this.getTransactions().filter(tx => 
      tx.master_id === masterId && 
      tx.period_month === month && 
      tx.period_year === year
    );

    const invoices = txs.filter(tx => tx.type === 'BILL_DRAFT' || tx.type === 'BILL_FINALIZED');

    let material_deduction = 0;
    let work_credit = 0;
    let discount = 0;
    let tds = 0;
    let net_payable = 0;
    let is_billed = invoices.length > 0;

    if (is_billed) {
      // Sum components from invoices belonging to this month
      invoices.forEach(inv => {
        material_deduction += inv.material_deduction || 0;
        work_credit += inv.work_amount || 0;
        discount += inv.discount || 0;
        tds += inv.tds_amount || 0;
        net_payable += inv.net_payable || 0;
      });
    } else {
      // fallback: if no invoices exist, calculate material_deduction from MATERIAL_ISSUE transactions in that month
      const issues = txs.filter(tx => tx.type === 'MATERIAL_ISSUE');
      material_deduction = issues.reduce((acc, curr) => acc + curr.amount, 0);
      work_credit = 0;
      discount = 0;
      tds = 0;
      net_payable = work_credit - material_deduction;
    }

    // Include other transactions like Payments or Adjustments for that master and month
    const payments = txs.filter(tx => tx.type === 'PAYMENT').reduce((acc, curr) => acc + curr.amount, 0);
    const adjustments = txs.filter(tx => tx.type === 'ADJUSTMENT').reduce((acc, curr) => acc + curr.amount, 0);

    return {
      material_deduction: Math.round(material_deduction),
      work_credit: Math.round(work_credit),
      discount: Math.round(discount),
      tds: Math.round(tds),
      net_payable: Math.round(net_payable),
      payments: Math.round(payments),
      adjustments: Math.round(adjustments),
      final_balance: Math.round(net_payable - payments + adjustments),
      is_billed
    };
  }

  saveManualTransaction(tx: Partial<LedgerTransaction>): LedgerTransaction {
    const list = this.load<LedgerTransaction[]>('ledger_transactions', []);
    const txDate = tx.date || new Date().toISOString().split('T')[0];
    const parsedM = parseInt(txDate.split('-')[1], 10) || (new Date().getMonth() + 1);
    const parsedY = parseInt(txDate.split('-')[0], 10) || new Date().getFullYear();

    const newTx: LedgerTransaction = {
      id: tx.id || generateUUID(),
      type: tx.type || 'PAYMENT',
      date: txDate,
      master_id: tx.master_id,
      material_id: tx.material_id,
      qty: tx.qty,
      rate: tx.rate,
      amount: tx.amount || 0,
      ref_id: tx.ref_id || generateUUID(),
      ref_no: tx.ref_no || 'NA',
      notes: tx.notes || '',
      created_at: tx.created_at || new Date().toISOString(),
      period_month: tx.period_month || parsedM,
      period_year: tx.period_year || parsedY
    };

    const idx = list.findIndex(item => item.id === newTx.id);
    if (idx > -1) {
      list[idx] = newTx;
    } else {
      list.push(newTx);
    }

    this.save('ledger_transactions', list);

    const currentUser = this.getCurrentUser();
    this.addAuditLog(currentUser.email, 'Manual Ledger Record Saved', `${newTx.type} recorded for master. Ref: ${newTx.ref_no}, Amount: ₹${newTx.amount}`);

    if (this.isFirebaseInitialized) {
      const docRef = doc(firestore, 'ledger_transactions', newTx.id);
      this.performCloudWrite(() => setDoc(docRef, this.enrichPayload(newTx)))
        .catch(err => console.warn('Firestore err writing manual transaction:', err));
    }

    window.dispatchEvent(new Event('db_sync'));
    return newTx;
  }

  deleteManualTransaction(txId: string): void {
    const list = this.load<LedgerTransaction[]>('ledger_transactions', []);
    const idx = list.findIndex(item => item.id === txId);
    if (idx > -1) {
      const tx = list[idx];
      list.splice(idx, 1);
      this.save('ledger_transactions', list);

      const currentUser = this.getCurrentUser();
      this.addAuditLog(currentUser.email, 'Manual Ledger Record Deleted', `Removed manual ${tx.type} transaction (${tx.ref_no})`);

      if (this.isFirebaseInitialized) {
        this.performCloudWrite(() => deleteDoc(doc(firestore, 'ledger_transactions', txId)))
          .catch(err => console.warn('Firestore err deleting manual transaction:', err));
      }

      window.dispatchEvent(new Event('db_sync'));
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

    // Material must exist in stock settings
    const matId = entry.material_id || entry.materialId;
    const mat = materialsList.find(m => m.id === matId);
    if (!mat) {
      throw new Error("Create SKU in Material Settings first.");
    }

    const qty = entry.qty_received !== undefined ? entry.qty_received : (entry.quantity || 0);

    const newEntry: InwardEntry = {
      id: generateUUID(),
      material_id: mat.id,
      qty_received: qty,
      supplier_name: entry.supplier_name || entry.supplier || 'Generic Supplier',
      bill_no: entry.bill_no || entry.billNo || 'NA',
      inward_date: entry.inward_date || entry.date || new Date().toISOString().split('T')[0],
      notes: entry.notes || '',
      created_by: currentUser.name || 'Store Department',
      created_at: new Date().toISOString(),

      // New requested properties
      materialId: mat.id,
      materialNameSnapshot: mat.name,
      unit: mat.unit,
      quantity: qty,
      rateSnapshot: mat.default_rate,
      supplier: entry.supplier_name || entry.supplier || 'Generic Supplier',
      billNo: entry.bill_no || entry.billNo || 'NA',
      date: entry.inward_date || entry.date || new Date().toISOString().split('T')[0],
    };

    list.push(newEntry);

    // Increment material stock
    let updatedMaterial: Material | null = null;
    const matIdx = materialsList.findIndex(m => m.id === newEntry.material_id);
    if (matIdx > -1) {
      materialsList[matIdx].current_stock += newEntry.qty_received;
      updatedMaterial = materialsList[matIdx];
    }

    this.addAuditLog(currentUser.email, 'Inward Stock Recorded', `Inward entry recorded for ${mat.name}: +${newEntry.qty_received} ${mat.unit} from ${newEntry.supplier_name}`);

    this.save('inward_entries', list);
    this.save('materials', materialsList);

    // Firebase write-behind batch
    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, 'inward_entries', newEntry.id), this.enrichPayload(newEntry));
        if (updatedMaterial) {
          const enrichUpdate = this.enrichPayload({});
          batch.update(doc(firestore, 'materials', updatedMaterial.id), {
            current_stock: increment(newEntry.qty_received),
            ...enrichUpdate
          });
        }
        this.performCloudWrite(() => batch.commit())
          .catch(error => handleFirestoreError(error, OperationType.WRITE, `inward_entries/${newEntry.id}`));
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

  getNextInvoiceNo(periodYear?: number): string {
    const list = this.getInvoices();
    let maxNum = 0;
    const yearStr = periodYear ? String(periodYear) : String(new Date().getFullYear());
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
    return `INV-${yearStr}-${nextNum}`;
  }

  saveInvoice(invoice: Partial<Invoice>, challanIds: string[]): Invoice {
    if (this.hasNegativeStock()) {
      throw new Error("Stock trust blocked until negative stock is corrected.");
    }
    const invoiceList = this.getInvoices();
    const invoiceChallanList = this.getInvoiceChallans();
    const challanList = this.getChallans();
    const currentUser = this.getCurrentUser();

    const newInvoice: Invoice = {
      id: generateUUID(),
      invoice_no: this.getNextInvoiceNo(invoice.period_year),
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
      selected_branch_name: invoice.selected_branch_name,
      stitching_deduction_amount: invoice.stitching_deduction_amount !== undefined ? invoice.stitching_deduction_amount : 0,
      stitching_deduction_reason: invoice.stitching_deduction_reason || '',
      base_work_amount: invoice.base_work_amount !== undefined ? invoice.base_work_amount : (invoice.work_amount || 0)
    };

    invoiceList.push(newInvoice);

    const linkedInvoiceChallans: InvoiceChallan[] = [];
    const updatedChallans: Challan[] = [];

    // Save linked challans & update their status based on draft/finalised
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
        if (newInvoice.status === 'finalised') {
          challanList[cIdx].status = 'billed';
          challanList[cIdx].billedInvoiceId = newInvoice.id;
          challanList[cIdx].billedAt = new Date().toISOString();
          challanList[cIdx].billedBy = currentUser.name || currentUser.username || currentUser.email;
        } else {
          challanList[cIdx].status = 'issued';
          delete challanList[cIdx].billedInvoiceId;
          delete challanList[cIdx].billedAt;
          delete challanList[cIdx].billedBy;
        }
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
        batch.set(doc(firestore, 'invoices', newInvoice.id), this.enrichPayload(newInvoice));

        // Write Linked entries
        linkedInvoiceChallans.forEach(bridge => {
          const idHash = `${bridge.invoice_id}_${bridge.challan_id}`;
          batch.set(doc(firestore, 'invoice_challans', idHash), this.enrichPayload(bridge));
        });

        // Update Challans
        updatedChallans.forEach(ch => {
          batch.set(doc(firestore, 'challans', ch.id), this.enrichPayload(ch));
        });

        this.performCloudWrite(() => batch.commit())
          .catch(error => handleFirestoreError(error, OperationType.WRITE, `invoices/${newInvoice.id}`));
      } catch (err) {
        console.warn(err);
      }
    }

    return newInvoice;
  }

  editInvoice(invoiceId: string, fields: Partial<Invoice>): Invoice {
    if (this.hasNegativeStock()) {
      throw new Error("Stock trust blocked until negative stock is corrected.");
    }
    const invoiceList = this.getInvoices();
    const currentUser = this.getCurrentUser();
    
    const idx = invoiceList.findIndex(inv => inv.id === invoiceId);
    if (idx === -1) {
      throw new Error(`Invoice with ID ${invoiceId} not found.`);
    }

    const original = invoiceList[idx];
    const updatedInvoice: Invoice = {
      ...original,
      ...fields,
      work_amount: fields.work_amount !== undefined ? fields.work_amount : original.work_amount,
      material_deduction: fields.material_deduction !== undefined ? fields.material_deduction : original.material_deduction,
      discount: fields.discount !== undefined ? fields.discount : original.discount,
      pcs: fields.pcs !== undefined ? fields.pcs : original.pcs,
    };

    // Recompute accounting values
    const subTotal = updatedInvoice.work_amount - updatedInvoice.material_deduction - updatedInvoice.discount;
    updatedInvoice.tds_amount = subTotal > 0 ? parseFloat((subTotal * 0.01).toFixed(2)) : 0;
    updatedInvoice.grand_total = subTotal - updatedInvoice.tds_amount;
    updatedInvoice.net_payable = Math.round(updatedInvoice.grand_total);

    invoiceList[idx] = updatedInvoice;
    this.save('invoices', invoiceList);

    // Sync challan states if the invoice transitions between draft and finalised
    if (original.status !== updatedInvoice.status) {
      const invoiceChallanList = this.getInvoiceChallans();
      const linkedChallanIds = invoiceChallanList
        .filter(ic => ic.invoice_id === invoiceId)
        .map(ic => ic.challan_id);

      const challanList = this.getChallans();
      const updatedChallans: Challan[] = [];

      linkedChallanIds.forEach(cid => {
        const cIdx = challanList.findIndex(c => c.id === cid);
        if (cIdx > -1) {
          if (updatedInvoice.status === 'finalised') {
            challanList[cIdx].status = 'billed';
            challanList[cIdx].billedInvoiceId = invoiceId;
            challanList[cIdx].billedAt = new Date().toISOString();
            challanList[cIdx].billedBy = currentUser.name || currentUser.username || currentUser.email;
          } else {
            challanList[cIdx].status = 'issued';
            delete challanList[cIdx].billedInvoiceId;
            delete challanList[cIdx].billedAt;
            delete challanList[cIdx].billedBy;
          }
          updatedChallans.push(challanList[cIdx]);
        }
      });

      this.save('challans', challanList);

      if (this.isFirebaseInitialized) {
        try {
          const batch = writeBatch(firestore);
          updatedChallans.forEach(ch => {
            batch.set(doc(firestore, 'challans', ch.id), this.enrichPayload(ch));
          });
          this.performCloudWrite(() => batch.commit())
            .catch(err => console.warn('Error updating challan states on invoice edit:', err));
        } catch (err) {
          console.warn('Error updating challan states on invoice edit Firestore:', err);
        }
      }
    }

    const masterName = this.getMasters().find(m => m.id === updatedInvoice.master_id)?.name || 'Unknown Master';
    this.addAuditLog(
      currentUser.email,
      'Invoice Edited',
      `Modified Invoice ${updatedInvoice.invoice_no} for Master ${masterName}. Revised Net Payable: ₹${updatedInvoice.net_payable}`
    );

    if (this.isFirebaseInitialized) {
      try {
        const docRef = doc(firestore, 'invoices', invoiceId);
        this.performCloudWrite(() => setDoc(docRef, this.enrichPayload(updatedInvoice)))
          .catch(err => console.warn('Error updating edited invoice in Firestore:', err));
      } catch (err) {
        console.warn('Error updating edited invoice in Firestore:', err);
      }
    }

    // Dispatch global event so UI knows data updated
    window.dispatchEvent(new Event('db_sync'));

    return updatedInvoice;
  }

  deleteInvoice(invoiceId: string, reason?: string): void {
    const invoiceList = this.getInvoices();
    const invoiceChallanList = this.getInvoiceChallans();
    const challanList = this.getChallans();
    const currentUser = this.getCurrentUser();

    const idx = invoiceList.findIndex(inv => inv.id === invoiceId);
    if (idx > -1) {
      const invoice = invoiceList[idx];
      const linkedChallans = invoiceChallanList.filter(ic => ic.invoice_id === invoiceId);
      const updatedChallans: Challan[] = [];

      // Revert challan status back to 'issued' and clear billed meta
      linkedChallans.forEach(ic => {
        const cIdx = challanList.findIndex(c => c.id === ic.challan_id);
        if (cIdx > -1) {
          challanList[cIdx].status = 'issued';
          delete challanList[cIdx].billedInvoiceId;
          delete challanList[cIdx].billedAt;
          delete challanList[cIdx].billedBy;
          updatedChallans.push(challanList[cIdx]);
        }
      });

      // Remove links
      const newLinks = invoiceChallanList.filter(ic => ic.invoice_id !== invoiceId);
      
      const reasonMsg = reason ? ` Audit Reason: ${reason}.` : '';
      this.addAuditLog(currentUser.email, 'Invoice Deleted / Reversed', `Voided/Reversed Invoice ${invoice.invoice_no} (Value: ₹${invoice.net_payable}).${reasonMsg} Restored included challans to pending status.`);

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
            batch.set(doc(firestore, 'challans', ch.id), this.enrichPayload(ch));
          });

          this.performCloudWrite(() => batch.commit())
            .catch(error => handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceId}`));
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
        this.performCloudWrite(() => setDoc(doc(firestore, 'invoices', invoiceId), this.enrichPayload(list[idx])))
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
      this.performCloudWrite(() => setDoc(doc(firestore, 'audit_logs', record.id), this.enrichPayload(record)))
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
      this.performCloudWrite(() => setDoc(doc(firestore, 'rate_history', record.id), this.enrichPayload(record)))
        .catch(err => console.warn('Cloud rate history log skip:', err));
    }
  }

  // --- Stock Corrections ---
  getStockCorrections(): StockCorrection[] {
    return this.load<StockCorrection[]>('stock_corrections', []);
  }

  saveStockCorrection(materialId: string, afterStock: number, reason: string): StockCorrection {
    const list = this.getStockCorrections();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();

    if (afterStock < 0) {
      throw new Error("Material stock can never go below zero.");
    }

    const matIdx = materialsList.findIndex(m => m.id === materialId);
    if (matIdx === -1) {
      throw new Error("Material not found.");
    }

    const mat = materialsList[matIdx];
    const beforeStock = mat.current_stock;

    // Perform the correction
    materialsList[matIdx].current_stock = afterStock;

    const correction: StockCorrection = {
      id: generateUUID(),
      material_id: materialId,
      before_stock: beforeStock,
      after_stock: afterStock,
      reason,
      admin_user: currentUser.email || currentUser.name || 'Admin',
      timestamp: new Date().toISOString()
    };

    list.unshift(correction);
    this.save('stock_corrections', list);
    this.save('materials', materialsList);

    this.addAuditLog(
      currentUser.email,
      'Stock Correction Saved',
      `Corrected ${mat.name} stock from ${beforeStock} to ${afterStock}. Reason: ${reason}`
    );

    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, 'stock_corrections', correction.id), this.enrichPayload(correction));
        
        const enrichUpdate = this.enrichPayload({});
        batch.update(doc(firestore, 'materials', materialId), {
          current_stock: afterStock,
          ...enrichUpdate
        });

        this.performCloudWrite(() => batch.commit())
          .catch(error => handleFirestoreError(error, OperationType.WRITE, `stock_corrections/${correction.id}`));
      } catch (err) {
        console.warn('Firebase sync failed for stock correction - running local fallback', err);
      }
    }

    // Trigger customized global event so UI knows data synced
    window.dispatchEvent(new Event('db_sync'));

    return correction;
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
          batch.set(doc(firestore, 'masters', master.id), this.enrichPayload(master));
        });

        // Add all materials to batch
        updatedMaterials.forEach(material => {
          batch.set(doc(firestore, 'materials', material.id), this.enrichPayload(material));
        });

        await this.performCloudWrite(() => batch.commit());
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
