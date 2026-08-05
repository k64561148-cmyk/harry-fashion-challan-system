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
  StockCorrection,
  MasterAdvance,
  MasterAdvanceLedger
} from './types';

import { 
  collection, 
  doc as firestoreDoc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocFromServer,
  getDoc,
  writeBatch,
  increment,
  runTransaction
} from 'firebase/firestore';
import { firestore, auth } from './firebase';
import { getLocalTodayString } from './utils/dateUtils';

// Global flag to force resolving live production collections for critical transactions
export let forceLive = true;

// Helper to resolve collection names: all workstations connect to the shared canonical production collections
export function getResolvedCollectionName(collectionName: string): string {
  return collectionName;
}

// Custom wrapper for Firestore doc
function doc(firestoreInstance: any, collectionName: string, docId: string) {
  return firestoreDoc(firestoreInstance, collectionName, docId);
}

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

export function parseErrorMessage(err: any): string {
  if (!err) return 'An unknown error occurred.';
  let msg = typeof err === 'string' ? err : (err?.message || String(err));

  if (typeof msg === 'string') {
    const trimmed = msg.trim();
    if (trimmed.startsWith('{') || trimmed.includes('{"error"')) {
      try {
        const jsonStart = trimmed.indexOf('{');
        const jsonEnd = trimmed.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const parsed = JSON.parse(trimmed.substring(jsonStart, jsonEnd + 1));
          if (parsed && parsed.error) {
            msg = parsed.error;
          }
        }
      } catch (_) {
        // Ignore json parse error
      }
    }
  }

  if (msg.includes('temporarily unavailable') || msg.includes('UNAVAILABLE') || msg.includes('retry with exponential backoff')) {
    return 'The database service was temporarily busy. Please retry in a few moments.';
  }
  if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
    return 'Access Denied: Please ensure you are logged into the portal.';
  }
  if (msg.includes('resource-exhausted') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Cloud database request rate limit reached. Please wait a moment and try again.';
  }

  return msg;
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

export function deduplicateMasters(masters: Master[]): Master[] {
  const uniqueMasters: Master[] = [];
  const seenIds = new Set<string>();
  const seenNormalizedKeys = new Set<string>();
  const seenNormalizedCodes = new Set<string>();

  // Sort masters to prioritize active ones and older ones (stable order)
  const sorted = [...masters].sort((a, b) => {
    const activeA = a.is_active !== false ? 1 : 0;
    const activeB = b.is_active !== false ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;
    
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeA - timeB;
  });

  for (const m of sorted) {
    if (!m.id) continue;
    
    const normName = (m.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .trim();
      
    const normCode = (m.code || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .trim();
      
    const type = (m.type || '').trim().toLowerCase();

    // Deduplicate logic
    if (seenIds.has(m.id)) {
      continue;
    }

    if (normCode && seenNormalizedCodes.has(normCode)) {
      continue;
    }

    const nameTypeKey = `${normName}_${type}`;
    if (seenNormalizedKeys.has(nameTypeKey)) {
      continue;
    }

    uniqueMasters.push(m);
    seenIds.add(m.id);
    if (normCode) seenNormalizedCodes.add(normCode);
    seenNormalizedKeys.add(nameTypeKey);
  }

  return uniqueMasters;
}

class DatabaseService {
  private activeListeners: (() => void)[] = [];
  private activeSyncListeners = new Map<string, () => void>();
  private isFirebaseInitialized: boolean = false;
  
  get isCloudSyncEnabled(): boolean {
    return this.isFirebaseInitialized;
  }
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

    const enriched = {
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

    // Clean up all key-value pairs that have 'undefined' values (which Firestore does not support and fails on)
    const cleanObject = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }
      const cleaned: any = {};
      Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val !== undefined) {
          cleaned[key] = cleanObject(val);
        }
      });
      return cleaned;
    };

    return cleanObject(enriched);
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

  public isSandboxModeActive(): boolean {
    if (forceLive) {
      return false;
    }
    const currentUser = this.getCurrentUser();
    const email = currentUser?.email || '';
    const name = currentUser?.name || '';
    const displayName = currentUser?.displayName || '';
    const username = currentUser?.username || '';
    const isKunalUser = 
      email.toLowerCase().includes('kunal') || 
      email.toLowerCase() === 'k64561148@gmail.com' ||
      email.toLowerCase() === 'kunal3012@harryfashion.com' ||
      name.toLowerCase().includes('kunal') || 
      displayName.toLowerCase().includes('kunal') ||
      username.toLowerCase().includes('kunal') ||
      username.toLowerCase() === 'kunal3012';
      
    if (!isKunalUser) {
      return false;
    }
    return false;
  }

  public setSandboxMode(enabled: boolean): void {
    localStorage.setItem('hf_sandbox_mode_enabled', enabled ? 'true' : 'false');
    this.reinitializeCloudListeners();
    window.dispatchEvent(new Event('db_sync'));
  }

  public async promoteSandboxToLive(): Promise<void> {
    const keysToCopy = [
      'masters',
      'materials',
      'master_rate_overrides',
      'challans',
      'challan_items',
      'inward_entries',
      'invoices',
      'invoice_challans',
      'rate_history',
      'stock_corrections',
      'audit_logs',
      'ledger_transactions'
    ];

    for (const key of keysToCopy) {
      const sandboxStorageKey = `sandbox_kunal_${key}`;
      const liveStorageKey = `hf_${key}`;
      const sandboxDataStr = localStorage.getItem(sandboxStorageKey);
      
      if (sandboxDataStr) {
        localStorage.setItem(liveStorageKey, sandboxDataStr);

        if (this.isFirebaseInitialized) {
          try {
            const items = JSON.parse(sandboxDataStr);
            if (Array.isArray(items) && items.length > 0) {
              const batchLimit = 500;
              for (let i = 0; i < items.length; i += batchLimit) {
                const chunk = items.slice(i, i + batchLimit);
                const batch = writeBatch(firestore);
                chunk.forEach((item: any) => {
                  const docId = item.id || (item.invoice_id && item.challan_id ? `${item.invoice_id}_${item.challan_id}` : null) || generateUUID();
                  const liveDocRef = firestoreDoc(firestore, key, docId);
                  batch.set(liveDocRef, this.enrichPayload(item));
                });
                await this.performCloudWrite(() => batch.commit());
              }
            }
          } catch (err) {
            console.error(`Error promoting sandbox key ${key} to live Firestore:`, err);
          }
        }
      }
    }

    const currentUser = this.getCurrentUser();
    this.addAuditLog(currentUser.email, 'SANDBOX_PROMOTED', `Successfully unified all tested data across production database.`);
    localStorage.setItem('hf_sandbox_mode_enabled', 'false');
    this.reinitializeCloudListeners();
    window.dispatchEvent(new Event('db_sync'));
  }

  public getCollectionName(baseName: string): string {
    return getResolvedCollectionName(baseName);
  }

  private getDocRef(collectionName: string, docId: string) {
    const resolvedColl = this.getCollectionName(collectionName);
    return doc(firestore, resolvedColl, docId);
  }

  public reinitializeCloudListeners() {
    this.activeListeners.forEach(unsubscribe => unsubscribe());
    this.activeListeners = [];
    this.activeSyncListeners.forEach(unsubscribe => unsubscribe());
    this.activeSyncListeners.clear();
    this.resetCollectionStatuses();

    const currentUser = this.getCurrentUser();
    this.setupCloudSyncListeners(currentUser.role);
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
    // 0. Auto-migrate legacy sandbox data to canonical live storage
    const sandboxKeys = [
      'masters',
      'materials',
      'master_rate_overrides',
      'challans',
      'challan_items',
      'inward_entries',
      'invoices',
      'invoice_challans',
      'rate_history',
      'stock_corrections',
      'audit_logs',
      'ledger_transactions'
    ];
    sandboxKeys.forEach((key) => {
      const sbKey = `sandbox_kunal_${key}`;
      const liveKey = `hf_${key}`;
      const sbDataStr = localStorage.getItem(sbKey);
      if (sbDataStr) {
        try {
          const sbItems = JSON.parse(sbDataStr);
          if (Array.isArray(sbItems) && sbItems.length > 0) {
            const liveDataStr = localStorage.getItem(liveKey);
            const liveItems = liveDataStr ? JSON.parse(liveDataStr) : [];
            if (!Array.isArray(liveItems) || liveItems.length === 0) {
              localStorage.setItem(liveKey, sbDataStr);
            } else {
              const map = new Map<string, any>();
              liveItems.forEach((it: any) => {
                const id = it.id || (it.invoice_id && it.challan_id ? `${it.invoice_id}_${it.challan_id}` : null);
                if (id) map.set(id, it);
              });
              sbItems.forEach((it: any) => {
                const id = it.id || (it.invoice_id && it.challan_id ? `${it.invoice_id}_${it.challan_id}` : null);
                if (id) map.set(id, it);
              });
              localStorage.setItem(liveKey, JSON.stringify(Array.from(map.values())));
            }
          }
        } catch (_) {}
      }
    });

    // 1. Initialize masters
    const masters = this.load<Master[]>('masters', []);
    if (masters.length === 0) {
      const initialMasters: Master[] = [];
      
      DEFAULT_JACKETS.forEach((item) => {
        const id = 'master_jacket_' + item.code.toLowerCase().trim();
        initialMasters.push({
          id,
          name: item.name,
          code: item.code,
          type: 'jacket',
          is_active: true,
          created_at: new Date().toISOString()
        });
      });

      DEFAULT_PANTS.forEach((item) => {
        const id = 'master_pant_' + item.code.toLowerCase().trim();
        initialMasters.push({
          id,
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
      const initialMaterials: Material[] = DEFAULT_MATERIALS_RAW.map((item) => {
        const id = 'material_' + item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        return {
          id,
          name: item.name,
          unit: item.unit,
          default_rate: item.default_rate,
          current_stock: item.stock,
          is_active: true,
          created_at: new Date().toISOString()
        };
      });

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
      this.activeSyncListeners.forEach(unsubscribe => unsubscribe());
      this.activeSyncListeners.clear();
      this.resetCollectionStatuses();

      if (user) {
        if (user.isAnonymous) {
          console.warn("Blocking anonymous user sync session. Signing out...");
          auth.signOut();
          return;
        }

        console.log(`Authenticated with Cloud Database as ${user.email} (UID: ${user.uid}). Initializing Firestore Real-time synchronization...`);
        this.isFirebaseInitialized = true;

        // Immediately start multi-collection real-time synchronization so all clients see live data
        this.setupCloudSyncListeners();

        // 1. Establish real-time listener for current user's security profile
        const profileRef = doc(firestore, 'profiles', user.uid);

        const unsubscribeProfile = onSnapshot(profileRef, async (snap) => {
          this.cloudHealth.collectionStatus.profiles = 'healthy';
          if (snap.exists()) {
            this.cloudHealth.lastRead = new Date().toISOString();
            localStorage.setItem('hf_health_last_read', this.cloudHealth.lastRead);
            this.cloudHealth.syncFailed = false;

            const data = snap.data();
            const email = data.email || user.email || 'user@harryfashion.com';
            const normEmail = email.trim().toLowerCase();
            const normUsername = (data.username || email.split('@')[0] || '').trim().toLowerCase();

            let roleToUse: UserRole = data.role || 'issue_dept';
            if (
              normUsername === 'kunal3012' ||
              email.toLowerCase() === 'k64561148@gmail.com' ||
              email.toLowerCase() === 'admin@harryfashion.com' ||
              email.toLowerCase() === 'kunal@harryfashion.com' ||
              email.toLowerCase() === 'kunal3012@harryfashion.com' ||
              email.toLowerCase().includes('admin') ||
              email.toLowerCase().includes('owner') ||
              email.toLowerCase().includes('kunal')
            ) {
              roleToUse = 'admin';
            }

            const canBackdate = normUsername === 'kunal3012';

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
              updatedAt: data.updatedAt || data.updated_at || new Date().toISOString(),
              canCreateBackdatedChallan: canBackdate
            };

            if (data.role !== roleToUse || data.canCreateBackdatedChallan !== canBackdate) {
              try {
                await setDoc(profileRef, this.enrichPayload(prof));
              } catch (e) {
                console.warn('Silent upgrade profile failed:', e);
              }
            }

            this.save('current_user', prof);
            window.dispatchEvent(new Event('db_sync'));
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
              email.toLowerCase() === 'kunal@harryfashion.com' ||
              email.toLowerCase() === 'kunal3012@harryfashion.com' ||
              email.toLowerCase().includes('admin') ||
              email.toLowerCase().includes('owner') ||
              email.toLowerCase().includes('kunal')
            ) {
              role = 'admin';
            } else if (email.toLowerCase().includes('billing')) {
              role = 'billing';
            }

            const normEmail = email.trim().toLowerCase();
            const normUsername = (user.displayName || email.split('@')[0] || '').trim().toLowerCase();
            const canBackdate = normUsername === 'kunal3012';

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
              updatedAt: new Date().toISOString(),
              canCreateBackdatedChallan: canBackdate
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
      'stock_corrections',
      'master_advances',
      'master_advance_ledger',
      'audit_logs',
      'ledger_transactions'
    ];

    syncCollections.forEach((collName) => {
      try {
        const resolvedCollName = this.getCollectionName(collName);

        // Clean up any duplicate listener for this collection
        if (this.activeSyncListeners.has(collName)) {
          this.activeSyncListeners.get(collName)!();
          this.activeSyncListeners.delete(collName);
        }

        const unsubscribe = onSnapshot(collection(firestore, resolvedCollName), { includeMetadataChanges: false }, (snapshot) => {
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
            if (collName === 'masters' || collName === 'materials' || collName === 'challans' || collName === 'challan_items' || collName === 'master_rate_overrides') {
              // 1. Single source of truth: replace entirely with snapshot results, do not merge or append
              this.save(collName, remoteRecords);
              window.dispatchEvent(new Event('db_sync'));
              return;
            }

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

            // Overwrite/merge with remote records (remote is source of truth, and always overwrites local duplicates to handle live sync instantly)
            remoteRecords.forEach(item => {
              const key = getKey(item);
              if (key) {
                mergedMap.set(key, item);
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

        this.activeSyncListeners.set(collName, unsubscribe);
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
        const docRef = this.getDocRef(collName, docId);
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
    const user = this.load<Profile>('current_user', defaultUser);
    if (user) {
      const email = (user.email || '').toLowerCase().trim();
      const name = (user.displayName || user.name || '').toLowerCase().trim();
      const username = (user.username || '').toLowerCase().trim();
      const isKunal = 
        email.includes('kunal') || 
        email === 'k64561148@gmail.com' ||
        email === 'kunal3012@harryfashion.com' ||
        name.includes('kunal') || 
        username.includes('kunal') ||
        username === 'kunal3012';
      if (isKunal) {
        user.role = 'admin';
      }
      user.canCreateBackdatedChallan = username === 'kunal3012';
    }
    return user;
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
    this.reinitializeCloudListeners();
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
    const rawMasters = this.load<Master[]>('masters', []);
    return deduplicateMasters(rawMasters);
  }

  saveMaster(master: Partial<Master>): Master {
    const list = this.getMasters();
    const currentUser = this.getCurrentUser();
    let result: Master;

    // 6. Prevent future duplicates
    // When creating or editing master, check existing active masters using normalized name/code/category
    const normName = (master.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .trim();

    const normCode = (master.code || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .trim();

    const type = (master.type || '').trim().toLowerCase();

    // If master is being toggled inactive, we bypass the duplicate check
    const isTogglingInactive = master.id && master.is_active === false;

    if (!isTogglingInactive && (normName || normCode)) {
      const activeMasters = list.filter(m => m.id !== master.id && m.is_active !== false);
      for (const m of activeMasters) {
        const existingNormName = m.name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
          .trim();
          
        const existingNormCode = m.code
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
          .trim();

        const existingType = (m.type || '').trim().toLowerCase();

        const nameMatch = normName && existingNormName === normName && existingType === type;
        const codeMatch = normCode && existingNormCode === normCode;

        if (nameMatch || codeMatch) {
          throw new Error("Master already exists. Please use existing master.");
        }
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
      const exists = targetPANs.some(tpan => 
        tpan.pan_no.toUpperCase() === span.pan_no.toUpperCase() &&
        tpan.account_no.trim() === span.account_no.trim()
      );
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

  getBankAccountUsage(masterId: string, accountNo: string, panAccountId?: string, customLimit?: number) {
    const invoices = this.getInvoices().filter(inv => 
      inv.master_id === masterId &&
      (inv.status === 'finalised' || inv.status === 'draft') &&
      (
        (panAccountId && inv.selected_pan_account_id === panAccountId) ||
        (accountNo && inv.selected_account_no && inv.selected_account_no.trim().replaceAll(' ', '') === accountNo.trim().replaceAll(' ', ''))
      )
    );

    const totalBilled = invoices.reduce((sum, inv) => sum + (inv.net_payable !== undefined ? inv.net_payable : (inv.grand_total || 0)), 0);
    const limitAmount = customLimit || 2000000; // Default 20 Lakhs (2,000,000)
    const remainingLimit = Math.max(0, limitAmount - totalBilled);
    const percentUsed = limitAmount > 0 ? (totalBilled / limitAmount) * 100 : 0;
    const isExceeded = totalBilled >= limitAmount;
    const isNearLimit = totalBilled >= (limitAmount * 0.8) && totalBilled < limitAmount;

    return {
      totalBilled,
      limitAmount,
      remainingLimit,
      percentUsed,
      isExceeded,
      isNearLimit,
      invoices
    };
  }

  getAllMasterBankLimitsSummary() {
    const masters = this.getMasters();
    const allInvoices = this.getInvoices().filter(inv => inv.status === 'finalised' || inv.status === 'draft');

    return masters.map(m => {
      const accounts = (m.pan_accounts || []).map(acc => {
        const matchingInvoices = allInvoices.filter(inv => 
          inv.master_id === m.id &&
          (
            (inv.selected_pan_account_id === acc.id) ||
            (acc.account_no && inv.selected_account_no && inv.selected_account_no.trim().replaceAll(' ', '') === acc.account_no.trim().replaceAll(' ', ''))
          )
        );

        const totalBilled = matchingInvoices.reduce((sum, inv) => sum + (inv.net_payable !== undefined ? inv.net_payable : (inv.grand_total || 0)), 0);
        const limitAmount = acc.limit_amount || 2000000; // 20 Lakhs
        const remainingLimit = Math.max(0, limitAmount - totalBilled);
        const percentUsed = limitAmount > 0 ? (totalBilled / limitAmount) * 100 : 0;
        const isExceeded = totalBilled >= limitAmount;
        const isNearLimit = totalBilled >= (limitAmount * 0.8) && !isExceeded;

        return {
          account: acc,
          totalBilled,
          limitAmount,
          remainingLimit,
          percentUsed,
          isExceeded,
          isNearLimit,
          invoices: matchingInvoices
        };
      });

      const totalBilledMaster = accounts.reduce((sum, a) => sum + a.totalBilled, 0);
      const hasExceededAccount = accounts.some(a => a.isExceeded);
      const hasNearLimitAccount = accounts.some(a => a.isNearLimit);

      return {
        masterId: m.id || '',
        masterName: m.name || 'Unnamed Master',
        masterCode: m.code || '',
        masterType: m.type || '',
        accounts,
        totalBilledMaster,
        hasExceededAccount,
        hasNearLimitAccount
      };
    });
  }

  updateMasterBankAccountLimit(masterId: string, accountId: string, newLimit: number) {
    const masters = this.getMasters();
    const idx = masters.findIndex(m => m.id === masterId);
    if (idx > -1 && masters[idx].pan_accounts) {
      const accIdx = masters[idx].pan_accounts!.findIndex(a => a.id === accountId);
      if (accIdx > -1) {
        masters[idx].pan_accounts![accIdx].limit_amount = newLimit;
        masters[idx].pan_accounts![accIdx].updatedAt = new Date().toISOString();
        this.save('masters', masters);
        
        if (this.isFirebaseInitialized) {
          setDoc(doc(firestore, 'masters', masterId), this.enrichPayload(masters[idx]))
            .catch(err => console.error("Cloud write master limit update failed:", err));
        }
        window.dispatchEvent(new Event('db_sync'));
        return true;
      }
    }
    return false;
  }

  detectDuplicateMasters(): { key: string, name: string, code: string, type: string, records: Master[] }[] {
    // We load raw masters from localStorage to see actual duplicates
    const masters = this.load<Master[]>('masters', []);
    const groupsMap = new Map<string, Master[]>();

    masters.forEach(m => {
      const normName = (m.name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .trim();
        
      const normCode = (m.code || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .trim();
        
      const type = (m.type || '').trim().toLowerCase();
      
      const key = `${normName}_${type}`;
      
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(m);
    });

    const duplicateGroups: { key: string, name: string, code: string, type: string, records: Master[] }[] = [];
    groupsMap.forEach((records, key) => {
      if (records.length > 1) {
        duplicateGroups.push({
          key,
          name: records[0].name,
          code: records[0].code,
          type: records[0].type,
          records
        });
      }
    });

    return duplicateGroups;
  }

  async mergeDuplicateGroup(duplicateIds: string[], canonicalId: string): Promise<{ affectedChallans: number, affectedInvoices: number }> {
    const masters = this.load<Master[]>('masters', []);
    const canonicalMaster = masters.find(m => m.id === canonicalId);
    if (!canonicalMaster) {
      throw new Error("Canonical master not found.");
    }

    const currentUser = this.getCurrentUser();
    let totalAffectedChallans = 0;
    let totalAffectedInvoices = 0;

    const challanList = this.getChallans();
    const invoiceList = this.getInvoices();
    const ledgerTransList = this.getTransactions();
    const overridesList = this.getMasterRateOverrides();

    for (const dupId of duplicateIds) {
      if (dupId === canonicalId) continue;
      
      const dupMaster = masters.find(m => m.id === dupId);
      if (!dupMaster) continue;

      let affectedChallans = 0;
      let affectedInvoices = 0;

      // 1. Migrate Challans
      challanList.forEach(ch => {
        if (ch.master_id === dupId) {
          ch.master_id = canonicalId;
          ch.masterId = canonicalId;
          ch.masterName = canonicalMaster.name;
          ch.masterCode = canonicalMaster.code;
          ch.masterType = canonicalMaster.type;
          ch.masterDisplayName = (canonicalMaster as any).displayName || canonicalMaster.name;
          ch.masterSnapshot = {
            id: canonicalMaster.id,
            name: canonicalMaster.name,
            code: canonicalMaster.code,
            type: canonicalMaster.type,
            activeStatus: canonicalMaster.is_active !== false
          };
          affectedChallans++;
        }
      });

      // 2. Migrate Invoices
      invoiceList.forEach(inv => {
        if (inv.master_id === dupId) {
          inv.master_id = canonicalId;
          affectedInvoices++;
        }
      });

      // 3. Migrate Ledger
      ledgerTransList.forEach(tx => {
        if (tx.master_id === dupId) {
          tx.master_id = canonicalId;
        }
      });

      // 4. Migrate overrides
      overridesList.forEach(o => {
        if (o.master_id === dupId) {
          const exists = overridesList.some(tg => tg.master_id === canonicalId && tg.material_id === o.material_id);
          if (!exists) {
            o.master_id = canonicalId;
          }
        }
      });

      // 5. Merge pan accounts
      const dupPANs = dupMaster.pan_accounts || [];
      const canonPANs = canonicalMaster.pan_accounts || [];
      dupPANs.forEach(span => {
        const exists = canonPANs.some(tpan => tpan.pan_no.toLowerCase() === span.pan_no.toLowerCase());
        if (!exists) {
          canonPANs.push(span);
        }
      });
      canonicalMaster.pan_accounts = canonPANs;

      // 6. Mark duplicate master as inactive and merged, do not hard delete initially
      dupMaster.is_active = false;
      (dupMaster as any).merged_into = canonicalId;
      (dupMaster as any).is_merged = true;

      totalAffectedChallans += affectedChallans;
      totalAffectedInvoices += affectedInvoices;

      // Write specialized audit log
      const auditPayload = {
        action: "MERGED_DUPLICATE_MASTER",
        duplicateMasterId: dupId,
        canonicalMasterId: canonicalId,
        masterName: dupMaster.name,
        affectedChallans: affectedChallans,
        affectedInvoices: affectedInvoices,
        mergedBy: currentUser.email || currentUser.username || 'admin',
        mergedAt: new Date().toISOString()
      };
      this.addAuditLog(currentUser.email, 'MERGED_DUPLICATE_MASTER', JSON.stringify(auditPayload));

      // Sync duplicate update to cloud
      if (this.isFirebaseInitialized) {
        await this.performCloudWrite(() => setDoc(doc(firestore, 'masters', dupId), this.enrichPayload(dupMaster)))
          .catch(err => console.error(`Cloud write duplicate merge failed for ${dupId}:`, err));
      }
    }

    // Save lists locally
    this.save('masters', masters);
    this.save('challans', challanList);
    this.save('invoices', invoiceList);
    this.save('transactions', ledgerTransList);
    this.save('master_rate_overrides', overridesList);

    // Sync canonical master update to cloud
    if (this.isFirebaseInitialized) {
      await this.performCloudWrite(() => setDoc(doc(firestore, 'masters', canonicalId), this.enrichPayload(canonicalMaster)))
        .catch(err => console.error("Cloud write canonical master failed:", err));
    }

    // Dispatch global sync event
    window.dispatchEvent(new Event('db_sync'));

    return {
      affectedChallans: totalAffectedChallans,
      affectedInvoices: totalAffectedInvoices
    };
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

    // Negative stock is allowed now as per user request

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

  getNextChallanNo(isBackdated?: boolean): string {
    const list = this.getChallans();
    let maxNum = 0;
    if (isBackdated) {
      list.forEach(c => {
        if (c.challan_no && c.challan_no.startsWith('HF-BD-')) {
          const parts = c.challan_no.split('-');
          if (parts.length === 3) {
            const num = parseInt(parts[2], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
      });
      const nextNum = String(maxNum + 1).padStart(4, '0');
      return `HF-BD-${nextNum}`;
    } else {
      list.forEach(c => {
        if (c.challan_no && c.challan_no.startsWith('HF-2526-')) {
          const parts = c.challan_no.split('-');
          if (parts.length === 3) {
            const num = parseInt(parts[2], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
      });
      const nextNum = String(maxNum + 1).padStart(4, '0');
      return `HF-2526-${nextNum}`;
    }
  }

  async saveChallan(challan: Partial<Challan>, items: { material_id: string; qty: number; rate: number }[], isSandboxWrite: boolean = false): Promise<Challan> {
    if (!isSandboxWrite) {
      forceLive = true;
    } else {
      forceLive = false;
    }

    try {
      if (!this.isFirebaseInitialized) {
        throw new Error("Challan was not synced to cloud. Please retry.");
      }

      const currentUser = this.getCurrentUser();
      const todayStr = getLocalTodayString();
      const challanDate = challan.issued_date || todayStr;

      // Future date block
      if (challanDate > todayStr) {
        throw new Error("Future dated challans are not allowed.");
      }

      // Backdated logic validation
      const isBackdated = challanDate < todayStr;
      if (isBackdated) {
        if (!currentUser.canCreateBackdatedChallan) {
          throw new Error("Backdated challan is allowed only for authorized user.");
        }
        if (!challan.backdatedReason || !challan.backdatedReason.trim()) {
          throw new Error("Reason is required for backdated challan.");
        }
      }

      // Master validation
      const masterId = challan.master_id || '';
      if (!masterId) {
        throw new Error("Invalid Master selected. Please choose a valid active master.");
      }

      const dateParts = challanDate.split('-');
      const challanYear = parseInt(dateParts[0], 10);
      const challanMonth = parseInt(dateParts[1], 10); // 1-indexed
      const originalCreatedMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

      if (items.length === 0) {
        throw new Error("Please add at least one material to issue.");
      }

      const masterRef = doc(firestore, this.getCollectionName('masters'), masterId);
      const challanId = generateUUID();
      const challanRef = doc(firestore, this.getCollectionName('challans'), challanId);
      const auditId = generateUUID();
      const auditRef = doc(firestore, this.getCollectionName('audit_logs'), auditId);

      let masterSnapshotData: any = null;
      let generatedChallanNo = '';
      const savedChallanItems: ChallanItem[] = [];
      let finalChallan: Challan | null = null;

      const uid = auth.currentUser?.uid || currentUser.uid || 'guest-01';
      const profileRef = doc(firestore, this.getCollectionName('profiles'), uid);
      const counterRef = doc(firestore, this.getCollectionName('counters'), 'challan_backdated');
      const materialRefs = items.map((item) => doc(firestore, this.getCollectionName('materials'), item.material_id));

      // RUN EVERYTHING INSIDE A SECURE FIRESTORE TRANSACTION WITH EXPONENTIAL RETRY
      let lastTxError: any = null;
      let txSuccess = false;

      for (let txAttempt = 1; txAttempt <= 3; txAttempt++) {
        try {
          await runTransaction(firestore, async (transaction) => {
            // --- 1. ALL READS FIRST ---
            // Read Profile document
            const profileSnap = await transaction.get(profileRef);

            // Read Master document
            const masterSnap = await transaction.get(masterRef);

            // Read Backdated Counter
            const counterSnap = await transaction.get(counterRef);

            // Read all Material documents
            const materialSnaps = [];
            for (const matRef of materialRefs) {
              const matSnap = await transaction.get(matRef);
              materialSnaps.push(matSnap);
            }

            // --- 2. VALIDATIONS AND COMPUTATIONS AFTER ALL READS ---
            const profile = profileSnap.data();
            const username = (profile?.username || '').trim().toLowerCase();

            if (isBackdated) {
              if (!profile || username !== "kunal3012") {
                throw new Error("Backdated challan is allowed only for Kunal ID.");
              }
              if (!challan.backdatedReason || !challan.backdatedReason.trim()) {
                throw new Error("Reason is required for backdated challan.");
              }
            }

            if (!masterSnap.exists()) {
              throw new Error("Selected master/material is not synced to cloud. Please refresh and select again.");
            }
            masterSnapshotData = masterSnap.data();
            if (!masterSnapshotData || masterSnapshotData.is_active === false) {
              throw new Error("Invalid Master selected. Please choose a valid active master.");
            }

            const matSnapsMap = new Map<string, any>();
            materialSnaps.forEach((snap, idx) => {
              const item = items[idx];
              if (!snap.exists()) {
                throw new Error("Selected material is not synced to cloud. Refresh and select again.");
              }
              matSnapsMap.set(item.material_id, snap);
            });

            let nextNum = 1;
            if (counterSnap.exists()) {
              const data = counterSnap.data();
              if (data && typeof data.nextNumber === 'number') {
                nextNum = data.nextNumber;
              }
            }

            if (isBackdated) {
              generatedChallanNo = `HF-BD-${String(nextNum).padStart(4, '0')}`;
            } else {
              generatedChallanNo = challan.challan_no || this.getNextChallanNo(false);
              if (generatedChallanNo.startsWith('HF-BD-')) {
                generatedChallanNo = this.getNextChallanNo(false);
              }
            }

            savedChallanItems.length = 0; // Clear array on retry
            for (const item of items) {
              const matSnap = matSnapsMap.get(item.material_id);
              const matData = matSnap.data() as Material;
              if (!matData || matData.is_active === false) {
                throw new Error(`Material is inactive and cannot be issued.`);
              }

              const amount = item.qty * item.rate;
              const challanItem: ChallanItem = {
                id: generateUUID(),
                challan_id: challanId,
                material_id: item.material_id,
                qty: item.qty,
                rate: item.rate,
                amount: amount,
                created_at: new Date().toISOString(),
                materialName: matData.name || '',
                materialUnit: matData.unit || '',
                materialSnapshot: {
                  id: matData.id || item.material_id,
                  name: matData.name || '',
                  unit: matData.unit || '',
                  default_rate: matData.default_rate || 0,
                  current_stock: matData.current_stock || 0,
                  is_active: matData.is_active !== undefined ? matData.is_active : true,
                  created_at: matData.created_at || new Date().toISOString()
                }
              };
              savedChallanItems.push(challanItem);
            }

            // Construct Final Challan Payload
            finalChallan = {
              id: challanId,
              challan_no: generatedChallanNo,
              master_id: masterId,
              issued_date: challanDate,
              issued_by: challan.issued_by || currentUser.displayName || currentUser.name || 'Office Desk',
              status: 'issued',
              notes: challan.notes || '',
              created_at: new Date().toISOString(),

              challanDate: challanDate,
              createdAt: new Date().toISOString(),
              createdBy: currentUser.username || currentUser.email || 'unknown',
              backdated: isBackdated,
              backdatedBy: isBackdated ? (currentUser.username || currentUser.name || 'Office Desk') : undefined,
              backdatedReason: isBackdated ? challan.backdatedReason.trim() : undefined,
              originalCreatedMonth: originalCreatedMonth,
              challanMonth: challanMonth,
              challanYear: challanYear,

              // Master snapshot details
              masterId: masterId,
              masterName: masterSnapshotData.name || '',
              masterCode: masterSnapshotData.code || '',
              masterType: masterSnapshotData.type || masterSnapshotData.category || '',
              masterDisplayName: masterSnapshotData.displayName || masterSnapshotData.name || '',
              masterSnapshot: {
                id: masterSnapshotData.id || masterId,
                name: masterSnapshotData.name || '',
                code: masterSnapshotData.code || '',
                type: masterSnapshotData.type || masterSnapshotData.category || '',
                activeStatus: masterSnapshotData.is_active !== undefined ? masterSnapshotData.is_active : true
              },
              deviceId: this.getDeviceId()
            };

            // Construct Audit Log payload
            const masterName = masterSnapshotData.name || 'Unknown Master';
            let auditPayload: AuditLog;
            if (isBackdated) {
              const auditDetails = `challanNo: ${generatedChallanNo}, challanDate: ${challanDate}, createdAt: ${finalChallan.created_at}, createdBy: ${currentUser.username || currentUser.name || 'Office Desk'}, backdatedReason: "${challan.backdatedReason?.trim()}", affectedMonth: ${challanMonth}, affectedYear: ${challanYear}`;
              auditPayload = {
                id: auditId,
                user_email: currentUser.email,
                action: 'BACKDATED_CHALLAN_CREATED',
                details: auditDetails,
                created_at: new Date().toISOString()
              };
            } else {
              auditPayload = {
                id: auditId,
                user_email: currentUser.email,
                action: 'Challan Issued',
                details: `Issued Challan ${generatedChallanNo} to Master ${masterName} containing ${items.length} items`,
                created_at: new Date().toISOString()
              };
            }

            // --- 3. ALL WRITES AFTER ALL READS ---
            if (isBackdated) {
              transaction.set(counterRef, { nextNumber: nextNum + 1 }, { merge: true });
            }

            // Set Challan Doc
            transaction.set(challanRef, this.enrichPayload(finalChallan));

            // Set Challan Items
            savedChallanItems.forEach((item) => {
              const itemRef = doc(firestore, this.getCollectionName('challan_items'), item.id);
              transaction.set(itemRef, this.enrichPayload(item));
            });

            // Update Materials Stock
            items.forEach((item) => {
              const matRef = doc(firestore, this.getCollectionName('materials'), item.material_id);
              const enrichUpdate = this.enrichPayload({});
              transaction.update(matRef, {
                current_stock: increment(-item.qty),
                ...enrichUpdate
              });
            });

            // Set Audit Log Doc
            transaction.set(auditRef, this.enrichPayload(auditPayload));
          });
          txSuccess = true;
          break;
        } catch (txErr: any) {
          lastTxError = txErr;
          const msg = String(txErr?.message || txErr);
          const isUnavailable = msg.includes('temporarily unavailable') || msg.includes('UNAVAILABLE') || msg.includes('retry with exponential backoff');
          if (isUnavailable && txAttempt < 3) {
            console.warn(`Firestore transaction attempt ${txAttempt} failed due to temporary service unavailability. Retrying in ${txAttempt * 500}ms...`);
            await new Promise(res => setTimeout(res, txAttempt * 500));
          } else {
            throw txErr;
          }
        }
      }

      if (!txSuccess && lastTxError) {
        throw lastTxError;
      }

      if (!finalChallan) {
        throw new Error("Challan transaction could not be completed.");
      }

      // Update local cache collections immediately so the UI is responsive on all tabs
      const localChallans = this.load<Challan[]>('challans', []);
      localChallans.unshift(finalChallan);
      this.save('challans', localChallans);

      const localChallanItems = this.load<ChallanItem[]>('challan_items', []);
      this.save('challan_items', [...savedChallanItems, ...localChallanItems]);

      const localMaterials = this.load<Material[]>('materials', []);
      items.forEach((item) => {
        const matIdx = localMaterials.findIndex(m => m.id === item.material_id);
        if (matIdx > -1) {
          localMaterials[matIdx].current_stock = (localMaterials[matIdx].current_stock || 0) - item.qty;
        }
      });
      this.save('materials', localMaterials);

      // Maintain last 1000 logs in local cache as well
      const localLogs = this.load<AuditLog[]>('audit_logs', []);
      const masterNameVal = masterSnapshotData?.name || 'Unknown Master';
      const auditPayloadLocal: AuditLog = {
        id: auditId,
        user_email: currentUser.email,
        action: isBackdated ? 'BACKDATED_CHALLAN_CREATED' : 'Challan Issued',
        details: isBackdated
          ? `challanNo: ${finalChallan.challan_no}, challanDate: ${challanDate}, createdAt: ${finalChallan.created_at}, createdBy: ${currentUser.username || currentUser.name || 'Office Desk'}, backdatedReason: "${finalChallan.backdatedReason}", affectedMonth: ${challanMonth}, affectedYear: ${challanYear}`
          : `Issued Challan ${finalChallan.challan_no} to Master ${masterNameVal} containing ${items.length} items`,
        created_at: new Date().toISOString()
      };
      localLogs.unshift(auditPayloadLocal);
      this.save('audit_logs', localLogs.slice(0, 1000));

      // Trigger local events to refresh active UI screens immediately
      window.dispatchEvent(new Event('db_sync'));

      return finalChallan;

    } catch (err: any) {
      console.error('Firestore transaction or re-read verification failed:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `challans_transaction`);
      } catch (_) {}
      const cleanMsg = parseErrorMessage(err);
      throw new Error(cleanMsg);
    } finally {
      forceLive = false;
    }
  }

  async runDataRepair(): Promise<void> {
    // 1. Existing SG Master repair logic
    const isRepaired = localStorage.getItem('hf_challans_repaired_sg_v2') === 'true';
    if (!isRepaired) {
      // Delay briefly to allow Firestore listeners to sync initial collections
      await new Promise(resolve => setTimeout(resolve, 3000));

      const masters = this.getMasters();
      const sgMaster = masters.find(m => m.name === 'SG');
      if (sgMaster) {
        const challans = this.getChallans();
        const targetNos = ['HF-BD-0006', 'HF-BD-0005', 'HF-BD-0003'];
        const toRepair = challans.filter(c => targetNos.includes(c.challan_no));

        if (toRepair.length > 0) {
          let updatedAny = false;
          for (const c of toRepair) {
            if (c.masterDisplayName === 'SG' && c.master_id === sgMaster.id) {
              continue;
            }

            console.log(`Repairing backdated challan ${c.challan_no}: setting master to SG master (snapshot + masterId).`);
            
            c.master_id = sgMaster.id;
            c.masterId = sgMaster.id;
            c.masterName = sgMaster.name;
            c.masterCode = sgMaster.code;
            c.masterType = sgMaster.type;
            c.masterDisplayName = sgMaster.name;
            c.masterSnapshot = {
              id: sgMaster.id,
              name: sgMaster.name,
              code: sgMaster.code,
              type: sgMaster.type,
              activeStatus: sgMaster.is_active
            };

            updatedAny = true;
          }

          if (updatedAny) {
            this.save('challans', challans);

            if (this.isFirebaseInitialized) {
              try {
                const batch = writeBatch(firestore);
                for (const c of toRepair) {
                  batch.update(doc(firestore, 'challans', c.id), {
                    master_id: sgMaster.id,
                    masterId: sgMaster.id,
                    masterName: sgMaster.name,
                    masterCode: sgMaster.code,
                    masterType: sgMaster.type,
                    masterDisplayName: sgMaster.name,
                    masterSnapshot: c.masterSnapshot,
                    ...this.enrichPayload({})
                  });
                }
                await this.performCloudWrite(() => batch.commit());
                console.log("[Repair] Firestore update committed successfully for target challans.");
              } catch (err) {
                console.error("[Repair] Cloud write failed, local updated.", err);
              }
            }
            window.dispatchEvent(new Event('db_sync'));
          }
        }
      }
      localStorage.setItem('hf_challans_repaired_sg_v2', 'true');
    }

    // 2. Custom repair for Sagir Master's backdated challan HF-BD-0015
    try {
      await this.repairSagirChallan();
    } catch (e) {
      console.error("[Repair] Error running Sagir Master HF-BD-0015 check & repair:", e);
    }
  }

  private async repairSagirChallan(): Promise<void> {
    const KEY_REPAIRED = 'hf_challan_hf_bd_0015_repaired_v3';
    if (localStorage.getItem(KEY_REPAIRED) === 'true') {
      return;
    }

    console.log("[Repair] Running Sagir Master HF-BD-0015 check & repair...");

    // Find if the challan exists in any local/sandbox cache
    let existingChallan: any = null;
    const localChallansRaw = localStorage.getItem('hf_challans');
    const sandboxChallansRaw = localStorage.getItem('sandbox_kunal_challans');

    if (localChallansRaw) {
      try {
        const list = JSON.parse(localChallansRaw);
        existingChallan = list.find((c: any) => c.challan_no === 'HF-BD-0015' || c.challanNo === 'HF-BD-0015');
      } catch (_) {}
    }

    if (!existingChallan && sandboxChallansRaw) {
      try {
        const list = JSON.parse(sandboxChallansRaw);
        existingChallan = list.find((c: any) => c.challan_no === 'HF-BD-0015' || c.challanNo === 'HF-BD-0015');
      } catch (_) {}
    }

    // Find or create SAGIR MASTER
    let sagirMaster = this.getMasters().find(m => m.name.toUpperCase() === 'SAGIR MASTER');
    if (!sagirMaster) {
      console.log("[Repair] Creating missing SAGIR MASTER entry...");
      const newSagir: Master = {
        id: 'sagir-master-repaired-id',
        name: 'SAGIR MASTER',
        code: 'SGR',
        type: 'jacket',
        is_active: true,
        created_at: new Date().toISOString()
      };
      
      const currentMasters = this.getMasters();
      currentMasters.push(newSagir);
      this.save('masters', currentMasters);

      if (this.isFirebaseInitialized) {
        try {
          // Write directly to both live and sandbox collections to guarantee its existence
          await setDoc(firestoreDoc(firestore, 'masters', newSagir.id), this.enrichPayload(newSagir));
          await setDoc(firestoreDoc(firestore, 'sandbox_kunal_masters', newSagir.id), this.enrichPayload(newSagir));
        } catch (err) {
          console.warn("[Repair] Could not save SAGIR MASTER to firestore, continuing.", err);
        }
      }
      sagirMaster = newSagir;
    }

    const challanId = existingChallan?.id || 'hf-bd-0015-repaired-uuid-sagir';
    
    // Construct robust repaired challan object conforming to schema and requirement
    const repairedChallan: any = {
      id: challanId,
      challan_no: 'HF-BD-0015',
      challanNo: 'HF-BD-0015',
      issued_date: '2026-06-23',
      challanDate: '2026-06-23',
      created_at: existingChallan?.created_at || new Date().toISOString(),
      createdAt: existingChallan?.createdAt || new Date().toISOString(),
      createdBy: 'Sundar',
      status: 'issued',
      notes: existingChallan?.notes || 'Repaired missing backdated challan',
      backdated: true,
      isBackdated: true,
      backdatedBy: 'Sundar',
      backdatedReason: existingChallan?.backdatedReason || 'System data migration repair',
      originalCreatedMonth: '2026-07',
      challanMonth: 6,
      challanYear: 2026,
      master_id: sagirMaster.id,
      masterId: sagirMaster.id,
      masterName: 'SAGIR MASTER',
      masterCode: sagirMaster.code,
      masterType: sagirMaster.type,
      masterDisplayName: 'SAGIR MASTER',
      masterSnapshot: {
        id: sagirMaster.id,
        name: 'SAGIR MASTER',
        code: sagirMaster.code,
        type: sagirMaster.type,
        activeStatus: true
      }
    };

    // Save to production Firestore directly (Bypassing sandbox collection name prefix routing)
    if (this.isFirebaseInitialized) {
      try {
        const prodDocRef = firestoreDoc(firestore, 'challans', challanId);
        await setDoc(prodDocRef, this.enrichPayload(repairedChallan));
        console.log("[Repair] HF-BD-0015 successfully written/copied to production Firestore.");

        // Write custom audit log as explicitly specified in Requirement 8
        const auditLogId = 'audit_repair_hf_bd_0015_' + Date.now();
        const auditLog: AuditLog = {
          id: auditLogId,
          user_email: 'system-repair@harryfashion.com',
          action: 'REPAIRED_MISSING_CLOUD_CHALLAN',
          details: `challanNo: HF-BD-0015, masterName: SAGIR MASTER, repairedBy: Sundar, repairedAt: ${new Date().toISOString()}`,
          created_at: new Date().toISOString()
        };
        await setDoc(firestoreDoc(firestore, 'audit_logs', auditLogId), this.enrichPayload(auditLog));
        this.addAuditLog('system-repair@harryfashion.com', 'REPAIRED_MISSING_CLOUD_CHALLAN', `challanNo: HF-BD-0015, masterName: SAGIR MASTER, repairedBy: Sundar, repairedAt: ${new Date().toISOString()}`);
        console.log("[Repair] Repair audit log saved successfully to cloud.");
      } catch (err) {
        console.error("[Repair] Failed to write HF-BD-0015 or audit log to production Firestore:", err);
      }
    }

    // Always ensure it exists in the local prod 'hf_challans' list
    const prodChallans = this.load<any[]>('challans', []);
    const existsInProdIdx = prodChallans.findIndex((c: any) => c.challan_no === 'HF-BD-0015');
    if (existsInProdIdx > -1) {
      prodChallans[existsInProdIdx] = repairedChallan;
    } else {
      prodChallans.push(repairedChallan);
    }
    localStorage.setItem('hf_challans', JSON.stringify(prodChallans));

    // Also write it to the sandbox local storage key to make sure they are equal
    const sandboxChallans = this.load<any[]>('sandbox_kunal_challans', []);
    const existsInSandboxIdx = sandboxChallans.findIndex((c: any) => c.challan_no === 'HF-BD-0015');
    if (existsInSandboxIdx > -1) {
      sandboxChallans[existsInSandboxIdx] = repairedChallan;
    } else {
      sandboxChallans.push(repairedChallan);
    }
    localStorage.setItem('sandbox_kunal_challans', JSON.stringify(sandboxChallans));

    // Trigger local sync refresh
    window.dispatchEvent(new Event('db_sync'));

    localStorage.setItem(KEY_REPAIRED, 'true');
    console.log("[Repair] Sagir Master HF-BD-0015 repair process completed successfully.");
  }

  deleteChallan(challanId: string): void {
    const challanList = this.getChallans();
    const allItemsList = this.getChallanItems();
    const materialsList = this.getMaterials();
    const currentUser = this.getCurrentUser();

    // Verify only Kunal is authorized to delete challans
    const email = currentUser?.email || '';
    const name = currentUser?.displayName || currentUser?.name || '';
    const username = currentUser?.username || '';
    const isKunal = 
      email.toLowerCase().includes('kunal') || 
      email.toLowerCase() === 'k64561148@gmail.com' ||
      name.toLowerCase().includes('kunal') || 
      username.toLowerCase().includes('kunal');
    if (!isKunal) {
      throw new Error("Unauthorized: Only Kunal (the developer) is allowed to delete challans.");
    }

    const idx = challanList.findIndex(c => c.id === challanId);
    if (idx > -1) {
      const challan = challanList[idx];
      if (challan.status === 'billed') {
        const isBackdated = challan.backdated === true || (challan.issued_date && challan.issued_date < getLocalTodayString());
        if (!(isKunal && isBackdated)) {
          throw new Error('Completed/Billed challans cannot be deleted');
        }
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

    // Verify only Kunal is authorized to permanently delete challans
    const email = currentUser?.email || '';
    const name = currentUser?.displayName || currentUser?.name || '';
    const username = currentUser?.username || '';
    const isKunal = 
      email.toLowerCase().includes('kunal') || 
      email.toLowerCase() === 'k64561148@gmail.com' ||
      name.toLowerCase().includes('kunal') || 
      username.toLowerCase().includes('kunal');
    if (!isKunal) {
      throw new Error("Unauthorized: Only Kunal (the developer) is allowed to delete challans.");
    }

    const mastersList = this.getMasters();

    const idx = challanList.findIndex(c => c.id === challanId);
    if (idx > -1) {
      const challan = challanList[idx];
      if (challan.status === 'billed') {
        const isBackdated = challan.backdated === true || (challan.issued_date && challan.issued_date < getLocalTodayString());
        if (!(isKunal && isBackdated)) {
          throw new Error('Completed/Billed challans cannot be deleted unless the bill is first reversed');
        }
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

    // Verify only Kunal is authorized to void challans
    const email = currentUser?.email || '';
    const name = currentUser?.displayName || currentUser?.name || '';
    const username = currentUser?.username || '';
    const isKunal = 
      email.toLowerCase().includes('kunal') || 
      email.toLowerCase() === 'k64561148@gmail.com' ||
      name.toLowerCase().includes('kunal') || 
      username.toLowerCase().includes('kunal');
    if (!isKunal) {
      throw new Error("Unauthorized: Only Kunal (the developer) is allowed to void challans.");
    }

    const idx = challanList.findIndex(c => c.id === challanId);
    if (idx > -1) {
      const challan = challanList[idx];
      if (challan.status === 'billed') {
        const isBackdated = challan.backdated === true || (challan.issued_date && challan.issued_date < getLocalTodayString());
        if (!(isKunal && isBackdated)) {
          throw new Error('Completed/Billed challans cannot be voided');
        }
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

      // No negative stock validation check as per user request to allow negative stock operations everywhere.

      // Deduct new items from stock (allowing negative stock)
      updatedItems.forEach(item => {
        const matIdx = materialsList.findIndex(m => m.id === item.material_id);
        if (matIdx > -1) {
          const nextStock = materialsList[matIdx].current_stock - item.qty;
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
      date: getLocalTodayString(),
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
      const s = (ch.status || '').toLowerCase();
      if (s === 'issued' || s === 'billed') {
        const items = challanItems.filter(item => item.challan_id === ch.id || (item as any).challanId === ch.id);
        items.forEach(item => {
          const dateStr = ch.issued_date || (ch as any).challanDate || '';
          const parts = dateStr.split('-');
          const m = parts.length > 1 ? parseInt(parts[1], 10) : new Date().getMonth() + 1;
          const y = parts.length > 0 ? parseInt(parts[0], 10) : new Date().getFullYear();
          const itemQty = Number(item.qty) || 0;
          const itemRate = Number(item.rate) || 0;
          const itemAmount = Number(item.amount) !== undefined && !isNaN(Number(item.amount)) ? Number(item.amount) : (itemQty * itemRate);
          list.push({
            id: `gen_mi_${item.id}`,
            type: 'MATERIAL_ISSUE',
            date: dateStr,
            master_id: ch.master_id || (ch as any).masterId || '',
            material_id: item.material_id || (item as any).materialId || '',
            qty: itemQty,
            rate: itemRate,
            amount: itemAmount, // represents deduction charge to master
            ref_id: item.id,
            ref_no: ch.challan_no || '',
            notes: ch.notes || '',
            created_at: ch.created_at || (ch as any).createdAt || new Date().toISOString(),
            period_month: m,
            period_year: y
          });
        });
      } else if (s === 'voided') {
        const dateStr = ch.issued_date || (ch as any).challanDate || '';
        const parts = dateStr.split('-');
        const m = parts.length > 1 ? parseInt(parts[1], 10) : new Date().getMonth() + 1;
        const y = parts.length > 0 ? parseInt(parts[0], 10) : new Date().getFullYear();
        list.push({
          id: `gen_void_ch_${ch.id}`,
          type: 'VOID',
          date: dateStr,
          master_id: ch.master_id || (ch as any).masterId || '',
          amount: 0,
          ref_id: ch.id,
          ref_no: ch.challan_no || '',
          notes: `Voided Challan: ${ch.notes || ''}`,
          created_at: ch.created_at || (ch as any).createdAt || new Date().toISOString(),
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
    const txDate = tx.date || getLocalTodayString();
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
      inward_date: entry.inward_date || entry.date || getLocalTodayString(),
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
      date: entry.inward_date || entry.date || getLocalTodayString(),
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

  // --- Master Advances ---
  getMasterAdvances(): MasterAdvance[] {
    return this.load<MasterAdvance[]>('master_advances', []);
  }

  getMasterAdvanceLedger(): MasterAdvanceLedger[] {
    return this.load<MasterAdvanceLedger[]>('master_advance_ledger', []);
  }

  getMasterAdvanceBalance(masterId: string): number {
    const advances = this.getMasterAdvances();
    const activeAdvanceIds = new Set(
      advances.filter(a => a.masterId === masterId && a.status === 'active').map(a => a.id)
    );
    const ledger = this.getMasterAdvanceLedger().filter(item => item.masterId === masterId);
    
    let balance = 0;
    ledger.forEach(entry => {
      if (entry.type === 'ADVANCE_GIVEN') {
        if (!entry.advanceId || activeAdvanceIds.has(entry.advanceId)) {
          balance += entry.amount;
        }
      } else if (entry.type === 'ADVANCE_SET_OFF') {
        balance -= entry.amount;
      } else if (entry.type === 'ADVANCE_REVERSAL') {
        balance -= entry.amount;
      }
    });
    return Math.max(0, balance);
  }

  async saveMasterAdvance(advanceData: Omit<MasterAdvance, 'id' | 'status' | 'createdBy' | 'createdAt' | 'updatedAt'>): Promise<MasterAdvance> {
    const advances = this.getMasterAdvances();
    const ledger = this.getMasterAdvanceLedger();
    const currentUser = this.getCurrentUser();

    const newAdvance: MasterAdvance = {
      ...advanceData,
      id: generateUUID(),
      status: 'active',
      createdBy: currentUser.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newLedgerEntry: MasterAdvanceLedger = {
      id: generateUUID(),
      masterId: newAdvance.masterId,
      type: 'ADVANCE_GIVEN',
      amount: newAdvance.amount,
      date: newAdvance.advanceDate,
      advanceId: newAdvance.id,
      notes: newAdvance.notes || `Advance given via ${newAdvance.paymentMode}`,
      createdBy: currentUser.email,
      createdAt: new Date().toISOString()
    };

    const auditRecord: AuditLog = {
      id: generateUUID(),
      user_email: currentUser.email,
      action: 'Advance Saved',
      details: `Advance of ₹${newAdvance.amount} saved for Master ${newAdvance.masterNameSnapshot}. Mode: ${newAdvance.paymentMode}`,
      created_at: new Date().toISOString()
    };

    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, this.getCollectionName('master_advances'), newAdvance.id), this.enrichPayload(newAdvance));
        batch.set(doc(firestore, this.getCollectionName('master_advance_ledger'), newLedgerEntry.id), this.enrichPayload(newLedgerEntry));
        batch.set(doc(firestore, this.getCollectionName('audit_logs'), auditRecord.id), this.enrichPayload(auditRecord));
        await this.performCloudWrite(() => batch.commit());
      } catch (error: any) {
        throw new Error(`Failed to save advance: ${error.message || error}`);
      }
    }

    advances.push(newAdvance);
    ledger.push(newLedgerEntry);

    this.save('master_advances', advances);
    this.save('master_advance_ledger', ledger);

    // Save audit log local cache
    const logs = this.load<AuditLog[]>('audit_logs', []);
    logs.unshift(auditRecord);
    this.save('audit_logs', logs.slice(0, 1000));

    window.dispatchEvent(new Event('db_sync'));
    return newAdvance;
  }

  async voidMasterAdvance(advanceId: string): Promise<void> {
    const advances = this.getMasterAdvances();
    const ledger = this.getMasterAdvanceLedger();
    const currentUser = this.getCurrentUser();

    const idx = advances.findIndex(a => a.id === advanceId);
    if (idx === -1) {
      throw new Error(`Advance with ID ${advanceId} not found.`);
    }

    const advance = advances[idx];
    if (advance.status === 'voided') {
      throw new Error(`Advance is already voided.`);
    }

    advance.status = 'voided';
    advance.updatedAt = new Date().toISOString();

    const newLedgerEntry: MasterAdvanceLedger = {
      id: generateUUID(),
      masterId: advance.masterId,
      type: 'ADVANCE_REVERSAL',
      amount: advance.amount,
      date: new Date().toISOString().split('T')[0],
      advanceId: advance.id,
      notes: `Voided advance: ${advance.notes || ''}`,
      createdBy: currentUser.email,
      createdAt: new Date().toISOString()
    };

    const auditRecord: AuditLog = {
      id: generateUUID(),
      user_email: currentUser.email,
      action: 'Advance Voided',
      details: `Voided advance of ₹${advance.amount} for Master ${advance.masterNameSnapshot}`,
      created_at: new Date().toISOString()
    };

    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, this.getCollectionName('master_advances'), advance.id), this.enrichPayload(advance));
        batch.set(doc(firestore, this.getCollectionName('master_advance_ledger'), newLedgerEntry.id), this.enrichPayload(newLedgerEntry));
        batch.set(doc(firestore, this.getCollectionName('audit_logs'), auditRecord.id), this.enrichPayload(auditRecord));
        await this.performCloudWrite(() => batch.commit());
      } catch (error: any) {
        throw new Error(`Failed to void advance: ${error.message || error}`);
      }
    }

    advances[idx] = advance;
    ledger.push(newLedgerEntry);

    this.save('master_advances', advances);
    this.save('master_advance_ledger', ledger);

    // Save audit log local cache
    const logs = this.load<AuditLog[]>('audit_logs', []);
    logs.unshift(auditRecord);
    this.save('audit_logs', logs.slice(0, 1000));

    window.dispatchEvent(new Event('db_sync'));
  }

  async editMasterAdvance(advanceId: string, fields: Partial<MasterAdvance>): Promise<MasterAdvance> {
    const advances = this.getMasterAdvances();
    const ledger = this.getMasterAdvanceLedger();
    const currentUser = this.getCurrentUser();

    const idx = advances.findIndex(a => a.id === advanceId);
    if (idx === -1) {
      throw new Error(`Advance with ID ${advanceId} not found.`);
    }

    const original = advances[idx];
    const updatedAdvance: MasterAdvance = {
      ...original,
      ...fields,
      updatedAt: new Date().toISOString()
    };

    const auditRecord: AuditLog = {
      id: generateUUID(),
      user_email: currentUser.email,
      action: 'Advance Updated',
      details: `Updated advance details for Master ${updatedAdvance.masterNameSnapshot}. Previous amount: ₹${original.amount}, New amount: ₹${updatedAdvance.amount}`,
      created_at: new Date().toISOString()
    };

    const ledgerIdx = ledger.findIndex(entry => entry.advanceId === advanceId && entry.type === 'ADVANCE_GIVEN');
    if (ledgerIdx > -1) {
      ledger[ledgerIdx].amount = updatedAdvance.amount;
      ledger[ledgerIdx].date = updatedAdvance.advanceDate;
      ledger[ledgerIdx].notes = updatedAdvance.notes || `Advance given via ${updatedAdvance.paymentMode}`;
    }

    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, this.getCollectionName('master_advances'), updatedAdvance.id), this.enrichPayload(updatedAdvance));
        if (ledgerIdx > -1) {
          batch.set(doc(firestore, this.getCollectionName('master_advance_ledger'), ledger[ledgerIdx].id), this.enrichPayload(ledger[ledgerIdx]));
        }
        batch.set(doc(firestore, this.getCollectionName('audit_logs'), auditRecord.id), this.enrichPayload(auditRecord));
        await this.performCloudWrite(() => batch.commit());
      } catch (error: any) {
        throw new Error(`Failed to update advance: ${error.message || error}`);
      }
    }

    advances[idx] = updatedAdvance;
    this.save('master_advances', advances);
    if (ledgerIdx > -1) {
      this.save('master_advance_ledger', ledger);
    }

    // Save audit log local cache
    const logs = this.load<AuditLog[]>('audit_logs', []);
    logs.unshift(auditRecord);
    this.save('audit_logs', logs.slice(0, 1000));

    window.dispatchEvent(new Event('db_sync'));
    return updatedAdvance;
  }

  async migrateDiscountToAdvanceSetoff(invoiceId: string, amountToConvert: number): Promise<Invoice> {
    const invoices = this.getInvoices();
    const ledger = this.getMasterAdvanceLedger();
    const currentUser = this.getCurrentUser();

    const idx = invoices.findIndex(inv => inv.id === invoiceId);
    if (idx === -1) {
      throw new Error(`Invoice with ID ${invoiceId} not found.`);
    }

    const invoice = invoices[idx];
    const currentDiscount = invoice.discount || 0;
    if (amountToConvert > currentDiscount) {
      throw new Error(`Cannot convert ₹${amountToConvert} because current discount is only ₹${currentDiscount}`);
    }

    const newDiscount = currentDiscount - amountToConvert;
    const currentAdvanceSetoff = invoice.advanceSetoffAmount || 0;
    const newAdvanceSetoff = currentAdvanceSetoff + amountToConvert;

    const subTotal = invoice.work_amount - invoice.material_deduction - newDiscount - (invoice.stitching_deduction_amount || 0);
    const netTaxableForTds = Math.max(0, subTotal - newAdvanceSetoff);
    const newTds = netTaxableForTds > 0 ? parseFloat((netTaxableForTds * 0.01).toFixed(2)) : 0;
    const baseGrandTotal = subTotal - newTds;
    
    const updatedInvoice: Invoice = {
      ...invoice,
      discount: newDiscount,
      advanceSetoffAmount: newAdvanceSetoff,
      tds_amount: newTds,
      grand_total: baseGrandTotal,
      net_payable: Math.max(0, Math.round(baseGrandTotal - newAdvanceSetoff)),
      advanceBalanceBefore: invoice.advanceBalanceBefore !== undefined ? invoice.advanceBalanceBefore : this.getMasterAdvanceBalance(invoice.master_id),
    };
    updatedInvoice.advanceBalanceAfter = (updatedInvoice.advanceBalanceBefore || 0) - amountToConvert;

    const newLedgerEntry: MasterAdvanceLedger = {
      id: generateUUID(),
      masterId: invoice.master_id,
      type: 'ADVANCE_SET_OFF',
      amount: amountToConvert,
      date: new Date().toISOString().split('T')[0],
      invoiceId: invoice.id,
      invoiceNo: invoice.invoice_no,
      notes: `Converted ₹${amountToConvert} discount to advance setoff`,
      createdBy: currentUser.email,
      createdAt: new Date().toISOString()
    };

    const auditRecord: AuditLog = {
      id: generateUUID(),
      user_email: currentUser.email,
      action: 'Discount Migrated to Advance Setoff',
      details: `Converted ₹${amountToConvert} discount to advance setoff on Invoice ${invoice.invoice_no} for Master ID ${invoice.master_id}`,
      created_at: new Date().toISOString()
    };

    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, this.getCollectionName('invoices'), updatedInvoice.id), this.enrichPayload(updatedInvoice));
        batch.set(doc(firestore, this.getCollectionName('master_advance_ledger'), newLedgerEntry.id), this.enrichPayload(newLedgerEntry));
        batch.set(doc(firestore, this.getCollectionName('audit_logs'), auditRecord.id), this.enrichPayload(auditRecord));
        await this.performCloudWrite(() => batch.commit());
      } catch (error: any) {
        throw new Error(`Failed to migrate discount in Firestore: ${error.message || error}`);
      }
    }

    invoices[idx] = updatedInvoice;
    ledger.push(newLedgerEntry);

    this.save('invoices', invoices);
    this.save('master_advance_ledger', ledger);

    const logs = this.load<AuditLog[]>('audit_logs', []);
    logs.unshift(auditRecord);
    this.save('audit_logs', logs.slice(0, 1000));

    window.dispatchEvent(new Event('db_sync'));
    return updatedInvoice;
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

  async checkDuplicateChallans(challanIds: string[]): Promise<string | null> {
    if (!this.isFirebaseInitialized) return null;
    for (const challanId of challanIds) {
      try {
        const docRef = doc(firestore, 'challans', challanId);
        const docSnap = await getDocFromServer(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const status = (data.status || '').toLowerCase();
          const invoiceId = data.invoiceId || data.billedInvoiceId || (data as any).invoice_id;
          const invoiceNo = data.invoiceNo || (data as any).invoice_no;
          if (status === 'billed' || status === 'voided' || status === 'void' || invoiceId) {
            return invoiceNo || 'unknown';
          }
        }
      } catch (err) {
        console.warn(`Failed to re-read challan ${challanId} from server:`, err);
      }
    }
    return null;
  }

  async saveInvoice(invoice: Partial<Invoice>, challanIds: string[]): Promise<Invoice> {
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
      selected_pan_name: invoice.selected_pan_name,
      selected_bank_name: invoice.selected_bank_name,
      selected_account_no: invoice.selected_account_no,
      selected_ifsc_code: invoice.selected_ifsc_code,
      selected_branch_name: invoice.selected_branch_name,
      stitching_deduction_amount: invoice.stitching_deduction_amount !== undefined ? invoice.stitching_deduction_amount : 0,
      stitching_deduction_reason: invoice.stitching_deduction_reason || '',
      base_work_amount: invoice.base_work_amount !== undefined ? invoice.base_work_amount : (invoice.work_amount || 0),
      advanceSetoffAmount: invoice.advanceSetoffAmount !== undefined ? invoice.advanceSetoffAmount : 0,
      advanceBalanceBefore: invoice.advanceBalanceBefore !== undefined ? invoice.advanceBalanceBefore : 0,
      advanceBalanceAfter: invoice.advanceBalanceAfter !== undefined ? invoice.advanceBalanceAfter : 0
    };

    const linkedInvoiceChallans: InvoiceChallan[] = [];
    const updatedChallans: Challan[] = [];

    // Save linked challans & update their status based on draft/finalised
    challanIds.forEach(id => {
      const bridge = {
        invoice_id: newInvoice.id,
        challan_id: id
      };
      linkedInvoiceChallans.push(bridge);

      // Update challan status
      const cIdx = challanList.findIndex(c => c.id === id);
      if (cIdx > -1) {
        if (newInvoice.status === 'finalised') {
          challanList[cIdx].status = 'BILLED';
          challanList[cIdx].billedInvoiceId = newInvoice.id;
          challanList[cIdx].invoiceId = newInvoice.id;
          challanList[cIdx].invoiceNo = newInvoice.invoice_no;
          challanList[cIdx].billedAt = new Date().toISOString();
          challanList[cIdx].billedBy = currentUser.email || currentUser.name || currentUser.username || currentUser.email;
          challanList[cIdx].locked = true;
        } else {
          challanList[cIdx].status = 'issued';
          delete challanList[cIdx].billedInvoiceId;
          delete challanList[cIdx].billedAt;
          delete challanList[cIdx].billedBy;
          delete (challanList[cIdx] as any).invoiceId;
          delete (challanList[cIdx] as any).invoiceNo;
          delete (challanList[cIdx] as any).locked;
        }
        updatedChallans.push(challanList[cIdx]);
      }
    });

    const masterName = this.getMasters().find(m => m.id === newInvoice.master_id)?.name || 'Unknown Master';
    const auditRecord: AuditLog = {
      id: generateUUID(),
      user_email: currentUser.email,
      action: 'Invoice Created',
      details: `Generated ${newInvoice.status} Invoice ${newInvoice.invoice_no} for Master ${masterName}. Net Payable: ₹${newInvoice.net_payable}`,
      created_at: new Date().toISOString()
    };

    // Prepare advance setoff ledger entry if finalized and setoff is used
    const masterAdvanceLedgerList = this.getMasterAdvanceLedger();
    let advanceLedgerEntry: MasterAdvanceLedger | null = null;

    if (newInvoice.status === 'finalised' && (newInvoice.advanceSetoffAmount || 0) > 0) {
      advanceLedgerEntry = {
        id: generateUUID(),
        masterId: newInvoice.master_id,
        type: 'ADVANCE_SET_OFF',
        amount: newInvoice.advanceSetoffAmount || 0,
        date: newInvoice.created_at.split('T')[0],
        invoiceId: newInvoice.id,
        invoiceNo: newInvoice.invoice_no,
        notes: `Advance adjusted against Invoice ${newInvoice.invoice_no}`,
        createdBy: currentUser.email,
        createdAt: new Date().toISOString()
      };
    }

    // Deep write to Firestore using atomic batch. Save ledger only after successes.
    if (this.isFirebaseInitialized) {
      try {
        const batch = writeBatch(firestore);
        
        // Write Invoice
        batch.set(doc(firestore, this.getCollectionName('invoices'), newInvoice.id), this.enrichPayload(newInvoice));

        // Write Linked entries
        linkedInvoiceChallans.forEach(bridge => {
          const idHash = `${bridge.invoice_id}_${bridge.challan_id}`;
          batch.set(doc(firestore, this.getCollectionName('invoice_challans'), idHash), this.enrichPayload(bridge));
        });

        // Update Challans
        updatedChallans.forEach(ch => {
          batch.set(doc(firestore, this.getCollectionName('challans'), ch.id), this.enrichPayload(ch));
        });

        // Write advance ledger entry if applicable
        if (advanceLedgerEntry) {
          batch.set(doc(firestore, this.getCollectionName('master_advance_ledger'), advanceLedgerEntry.id), this.enrichPayload(advanceLedgerEntry));
        }

        // Write audit log
        batch.set(doc(firestore, this.getCollectionName('audit_logs'), auditRecord.id), this.enrichPayload(auditRecord));

        // Wait for Firestore to successfully complete
        await this.performCloudWrite(() => batch.commit());
      } catch (error: any) {
        throw new Error(`Firestore settlement transaction failed: ${error.message || error}`);
      }
    }

    // Committing to local ledger only after cloud success (or in offline mode)
    invoiceList.push(newInvoice);
    linkedInvoiceChallans.forEach(bridge => {
      invoiceChallanList.push(bridge);
    });

    if (advanceLedgerEntry) {
      masterAdvanceLedgerList.push(advanceLedgerEntry);
      this.save('master_advance_ledger', masterAdvanceLedgerList);
    }

    this.save('invoices', invoiceList);
    this.save('invoice_challans', invoiceChallanList);
    this.save('challans', challanList);

    // Write audit log local cache
    const logs = this.load<AuditLog[]>('audit_logs', []);
    logs.unshift(auditRecord);
    this.save('audit_logs', logs.slice(0, 1000));

    window.dispatchEvent(new Event('db_sync'));

    return newInvoice;
  }

  editInvoice(invoiceId: string, fields: Partial<Invoice>): Invoice {
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
    const subTotal = updatedInvoice.work_amount - updatedInvoice.material_deduction - updatedInvoice.discount - (updatedInvoice.stitching_deduction_amount || 0);
    const currentSetoff = updatedInvoice.advanceSetoffAmount || 0;
    const netTaxableForTds = Math.max(0, subTotal - currentSetoff);
    updatedInvoice.tds_amount = netTaxableForTds > 0 ? parseFloat((netTaxableForTds * 0.01).toFixed(2)) : 0;
    updatedInvoice.grand_total = subTotal - updatedInvoice.tds_amount;
    updatedInvoice.net_payable = Math.max(0, Math.round(updatedInvoice.grand_total - currentSetoff));

    // Sync advance ledger entry if setoff was present
    if (currentSetoff > 0) {
      const advanceLedgers = this.getMasterAdvanceLedger();
      const existingIdx = advanceLedgers.findIndex(e => e.invoiceId === invoiceId && e.type === 'ADVANCE_SET_OFF');
      if (updatedInvoice.status === 'finalised') {
        if (existingIdx > -1) {
          advanceLedgers[existingIdx].amount = currentSetoff;
        } else {
          advanceLedgers.push({
            id: generateUUID(),
            masterId: updatedInvoice.master_id,
            type: 'ADVANCE_SET_OFF',
            amount: currentSetoff,
            date: updatedInvoice.created_at.split('T')[0],
            invoiceId: updatedInvoice.id,
            invoiceNo: updatedInvoice.invoice_no,
            notes: `Advance adjusted against Invoice ${updatedInvoice.invoice_no}`,
            createdBy: currentUser.email,
            createdAt: new Date().toISOString()
          });
        }
        this.save('master_advance_ledger', advanceLedgers);
      } else if (existingIdx > -1) {
        advanceLedgers.splice(existingIdx, 1);
        this.save('master_advance_ledger', advanceLedgers);
      }
    }

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
            challanList[cIdx].status = 'BILLED';
            challanList[cIdx].billedInvoiceId = invoiceId;
            challanList[cIdx].invoiceId = invoiceId;
            challanList[cIdx].invoiceNo = updatedInvoice.invoice_no;
            challanList[cIdx].billedAt = new Date().toISOString();
            challanList[cIdx].billedBy = currentUser.email || currentUser.name || currentUser.username || currentUser.email;
            challanList[cIdx].locked = true;
          } else {
            challanList[cIdx].status = 'issued';
            delete challanList[cIdx].billedInvoiceId;
            delete challanList[cIdx].billedAt;
            delete challanList[cIdx].billedBy;
            delete (challanList[cIdx] as any).invoiceId;
            delete (challanList[cIdx] as any).invoiceNo;
            delete (challanList[cIdx] as any).locked;
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
          delete (challanList[cIdx] as any).invoiceId;
          delete (challanList[cIdx] as any).invoiceNo;
          delete (challanList[cIdx] as any).locked;
          updatedChallans.push(challanList[cIdx]);
        }
      });

      // Remove links
      const newLinks = invoiceChallanList.filter(ic => ic.invoice_id !== invoiceId);
      
      // Find and remove any linked ADVANCE_SET_OFF ledger entries
      const advanceLedger = this.load<MasterAdvanceLedger[]>('master_advance_ledger', []);
      const linkedAdvanceLedgers = advanceLedger.filter(entry => entry.invoiceId === invoiceId);
      const remainingAdvanceLedgers = advanceLedger.filter(entry => entry.invoiceId !== invoiceId);

      const reasonMsg = reason ? ` Audit Reason: ${reason}.` : '';
      this.addAuditLog(currentUser.email, 'Invoice Deleted / Reversed', `Voided/Reversed Invoice ${invoice.invoice_no} (Value: ₹${invoice.net_payable}).${reasonMsg} Restored included challans to pending status.`);

      invoiceList.splice(idx, 1);

      this.save('invoices', invoiceList);
      this.save('invoice_challans', newLinks);
      this.save('challans', challanList);
      this.save('master_advance_ledger', remainingAdvanceLedgers);

      // Cloud deletion pipeline
      if (this.isFirebaseInitialized) {
        try {
          const batch = writeBatch(firestore);
          // Delete invoice reference
          batch.delete(doc(firestore, this.getCollectionName('invoices'), invoiceId));

          // Delete bridge connections
          linkedChallans.forEach(bridge => {
            const idHash = `${bridge.invoice_id}_${bridge.challan_id}`;
            batch.delete(doc(firestore, this.getCollectionName('invoice_challans'), idHash));
          });

          // Delete associated advance setoffs from cloud ledger
          linkedAdvanceLedgers.forEach(entry => {
            batch.delete(doc(firestore, this.getCollectionName('master_advance_ledger'), entry.id));
          });

          // Revert challan states
          updatedChallans.forEach(ch => {
            batch.set(doc(firestore, this.getCollectionName('challans'), ch.id), this.enrichPayload(ch));
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
      const inv = list[idx];
      inv.status = status;
      this.save('invoices', list);

      if ((inv.advanceSetoffAmount || 0) > 0) {
        const advanceLedgers = this.getMasterAdvanceLedger();
        const existingIdx = advanceLedgers.findIndex(e => e.invoiceId === invoiceId && e.type === 'ADVANCE_SET_OFF');
        if (status === 'finalised' && existingIdx === -1) {
          advanceLedgers.push({
            id: generateUUID(),
            masterId: inv.master_id,
            type: 'ADVANCE_SET_OFF',
            amount: inv.advanceSetoffAmount || 0,
            date: inv.created_at.split('T')[0],
            invoiceId: inv.id,
            invoiceNo: inv.invoice_no,
            notes: `Advance adjusted against Invoice ${inv.invoice_no}`,
            createdBy: currentUser.email,
            createdAt: new Date().toISOString()
          });
          this.save('master_advance_ledger', advanceLedgers);
        } else if (status !== 'finalised' && existingIdx > -1) {
          advanceLedgers.splice(existingIdx, 1);
          this.save('master_advance_ledger', advanceLedgers);
        }
      }

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

    // Negative stock correction allowed as per user request

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
      const normJacketName = jacket.name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .trim();

      const existsIdx = updatedMasters.findIndex(m => {
        const normMName = m.name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
          .trim();
        return normMName === normJacketName && m.type === 'jacket';
      });

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
      const normPantName = pant.name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .trim();

      const existsIdx = updatedMasters.findIndex(m => {
        const normMName = m.name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
          .trim();
        return normMName === normPantName && m.type === 'pant';
      });

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
