/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { db, DEMO_USERS } from '../db';
import { Master, Material, MasterRateOverride, AuditLog, RateHistory, UserRole, Profile } from '../types';
import { formatINR, formatDate, generateAuditTrailPDF, generateChallanPDF, generateInvoicePDF } from '../utils/exportUtils';
import { getFolderChallanDateText, getFolderInvoiceDateText } from '../utils/smartDownloader';
import { 
  Settings, 
  Users, 
  Scissors, 
  Layers, 
  Percent, 
  History, 
  Plus, 
  Check, 
  Edit, 
  UserPlus, 
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Cloud,
  LogIn,
  LogOut,
  RefreshCw,
  Database,
  Search,
  Printer,
  Download,
  Calendar
} from 'lucide-react';
import { MasterPanAccount } from '../types';
import { auth, signInWithPopup, signOut, googleProvider } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export const SettingsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'masters' | 'materials' | 'overrides' | 'users' | 'audit_log' | 'cloud'>('masters');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [boundFolderName, setBoundFolderName] = useState<string | null>(null);

  // States for Multi-Compile Batch Document Packager (Offline-Safe Browser ZIP Exporter)
  const [batchDownloadDate, setBatchDownloadDate] = useState<string>(() => {
    // Default to today's date in local user time (YYYY-MM-DD format)
    const local = new Date();
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, '0');
    const d = String(local.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [batchDownloadMasterId, setBatchDownloadMasterId] = useState<string>('all');
  const [batchDownloadType, setBatchDownloadType] = useState<'all' | 'challans' | 'invoices'>('all');
  const [isBatchCompiling, setIsBatchCompiling] = useState<boolean>(false);
  const [batchCompileStatus, setBatchCompileStatus] = useState<string>('');

  // States for Firebase database cleaner / data retention center
  const [purgeRetentionMonths, setPurgeRetentionMonths] = useState<number | 'all'>(6);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState<string>('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);
  const [currentUser, setCurrentUser] = useState(db.getCurrentUser());

  // Entity lists
  const [masters, setMasters] = useState<Master[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [overrides, setOverrides] = useState<MasterRateOverride[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [rateHistories, setRateHistories] = useState<RateHistory[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>(db.getProfiles());

  // Audit log filter states
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

  // Profile editing states
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const handleRoleChange = (profileId: string, newRole: UserRole) => {
    const userProf = profiles.find(p => p.id === profileId);
    if (userProf) {
      if (profileId === currentUser.id && newRole !== 'admin') {
        const confirmSelfDemote = window.confirm("Are you sure you want to change your own role from Admin? You will lose administrator access.");
        if (!confirmSelfDemote) return;
      }
      const updatedProf = { ...userProf, role: newRole };
      db.saveProfile(updatedProf);
      showFeedback(`Employee role for ${userProf.name} successfully updated to ${newRole.toUpperCase()}!`);
    }
  };

  // Form states: Masters
  const [masterName, setMasterName] = useState<string>('');
  const [masterCode, setMasterCode] = useState<string>('');
  const [masterType, setMasterType] = useState<'jacket' | 'pant'>('jacket');
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);

  // Multiple PAN and bank details management state
  const [panAccounts, setPanAccounts] = useState<MasterPanAccount[]>([]);
  const [tempPanNo, setTempPanNo] = useState<string>('');
  const [tempBankName, setTempBankName] = useState<string>('');
  const [tempAccountNo, setTempAccountNo] = useState<string>('');
  const [tempIfscCode, setTempIfscCode] = useState<string>('');
  const [tempBranchName, setTempBranchName] = useState<string>('');
  const [editingPanId, setEditingPanId] = useState<string | null>(null);

  // Form states: Materials
  const [materialName, setMaterialName] = useState<string>('');
  const [materialUnit, setMaterialUnit] = useState<string>('pc');
  const [materialRate, setMaterialRate] = useState<number>(0);
  const [materialStock, setMaterialStock] = useState<number>(100);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

  // Form states: Overrides
  const [overrideMasterId, setOverrideMasterId] = useState<string>('');
  const [overrideMaterialId, setOverrideMaterialId] = useState<string>('');
  const [overrideRate, setOverrideRate] = useState<number>(0);

  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isSeeded, setIsSeeded] = useState<boolean>(localStorage.getItem('hf_database_seeded') === 'true');
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    try {
      const res = await db.seedMastersAndMaterials();
      setIsSeeded(true);
      showFeedback(`Database successfully seeded: ${res.mastersCount} Masters & ${res.materialsCount} Materials populated!`);
    } catch (err: any) {
      console.error(err);
      showFeedback(`Seeding failed: ${err.message || String(err)}`, true);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      showFeedback('Google Cloud Synchronization established successfully!');
    } catch (err: any) {
      console.error(err);
      showFeedback(err.message || 'Failed to authenticate with Google', true);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOut(auth);
      showFeedback('Cloud connection closed. Running in offline fallback.');
    } catch (err: any) {
      showFeedback('Failed to close cloud connection', true);
    }
  };

  useEffect(() => {
    reloadAllData();
    window.addEventListener('db_sync', reloadAllData);
    return () => window.removeEventListener('db_sync', reloadAllData);
  }, []);

  const reloadAllData = () => {
    setMasters(db.getMasters());
    setMaterials(db.getMaterials());
    setOverrides(db.getMasterRateOverrides());
    setAudits(db.getAuditLogs());
    setRateHistories(db.getRateHistory());
    setProfiles(db.getProfiles());
    setCurrentUser(db.getCurrentUser());
  };

  const showFeedback = (text: string, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  useEffect(() => {
    async function loadFolder() {
      try {
        const { getStoredDirectoryHandle } = await import('../utils/smartDownloader');
        const handle = await getStoredDirectoryHandle();
        if (handle) {
          setBoundFolderName(handle.name);
        } else {
          setBoundFolderName(null);
        }
      } catch (e) {
        console.warn(e);
      }
    }
    loadFolder();
  }, [activeSubTab]);

  const handleLinkLocalFolder = async () => {
    if (window.self !== window.top) {
      showFeedback('Iframe Constraint: Click "Open in new window" ↗ in the top right of your preview to bind folders from outside the sandbox!', true);
      return;
    }
    try {
      const { promptForBaseDirectory } = await import('../utils/smartDownloader');
      const handle = await promptForBaseDirectory();
      if (handle) {
        setBoundFolderName(handle.name);
        showFeedback(`Successfully linked folder: "${handle.name}"! Now system saves are categorized.`);
      } else {
        showFeedback('Folder linking was closed or declined.', true);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || String(err);
      if (errMsg.includes('sub frame') || errMsg.includes('cross origin') || errMsg.includes('SecurityError') || errMsg.includes('allowed to show a file picker')) {
        showFeedback('Sandbox active: Click "Open in new window" ↗ in the top right, then link your folder in that standalone tab!', true);
      } else if (!('showDirectoryPicker' in window)) {
        showFeedback('Your browser does not support Directory APIs, or you are in an isolated app iframe. Click "Open in new window" in the top right to link folders!', true);
      } else {
        showFeedback(errMsg || 'Error choosing folder.', true);
      }
    }
  };

  const handleClearLocalFolder = async () => {
    try {
      const { clearDirectoryHandle } = await import('../utils/smartDownloader');
      await clearDirectoryHandle();
      setBoundFolderName(null);
      showFeedback('Local folder link removed. Falling back to standard browser downloads.');
    } catch (err) {
      showFeedback('Failed to remove folder integration.', true);
    }
  };

  const handleBulkZipDownload = async () => {
    setIsBatchCompiling(true);
    setBatchCompileStatus('Initializing ZIP compiler...');
    try {
      const zip = new JSZip();

      // Retrieve lists from index DB model
      const allChallans = db.getChallans();
      const allChallanItems = db.getChallanItems();
      const allInvoices = db.getInvoices();
      const allMasters = db.getMasters();
      const allMaterials = db.getMaterials();

      // Filter challans and invoices based on selected Date and Master
      let filteredChallans = allChallans;
      let filteredInvoices = allInvoices;

      // Filter by Date (match YYYY-MM-DD exactly for challan, matching year & month for invoices)
      if (batchDownloadDate) {
        filteredChallans = filteredChallans.filter(c => c.issued_date === batchDownloadDate);
        
        const dateParts = batchDownloadDate.split('-');
        if (dateParts.length === 3) {
          const yNum = parseInt(dateParts[0], 10);
          const mNum = parseInt(dateParts[1], 10);
          filteredInvoices = filteredInvoices.filter(inv => inv.period_month === mNum && inv.period_year === yNum);
        }
      }

      // Filter by Master ID
      if (batchDownloadMasterId && batchDownloadMasterId !== 'all') {
        filteredChallans = filteredChallans.filter(c => c.master_id === batchDownloadMasterId);
        filteredInvoices = filteredInvoices.filter(inv => inv.master_id === batchDownloadMasterId);
      }

      // Filter by Type
      if (batchDownloadType === 'challans') {
        filteredInvoices = [];
      } else if (batchDownloadType === 'invoices') {
        filteredChallans = [];
      }

      // Check if we have anything to zip
      if (filteredChallans.length === 0 && filteredInvoices.length === 0) {
        showFeedback('No matching challans or invoices found for the selected criteria in database.', true);
        setIsBatchCompiling(false);
        setBatchCompileStatus('');
        return;
      }

      const totalDocs = filteredChallans.length + filteredInvoices.length;
      let compiledCount = 0;

      // 1. Pack Challans
      for (const challan of filteredChallans) {
        compiledCount++;
        setBatchCompileStatus(`Generating Challan [${compiledCount}/${totalDocs}]: ${challan.challan_no}...`);

        const items = allChallanItems.filter(item => item.challan_id === challan.id);
        const master = allMasters.find(m => m.id === challan.master_id) || { name: 'Unknown Master' } as Master;
        
        // Generate the PDF representation as blob on the fly without prompt or browser iframe block
        const blob = await generateChallanPDF(
          challan,
          items,
          master,
          allMaterials,
          false, // autoDownload = false
          false  // shouldPrint = false
        );

        // Naming path: Harry Fashion/Challans/{DateText}/{MasterCleanName}/Challan-{ChallanNo}.pdf
        const dateText = getFolderChallanDateText(challan.issued_date);
        const masterClean = master.name.replace(/[^a-zA-Z0-9_\s-]/g, '').trim().replace(/\s+/g, '_');
        const challanNoClean = challan.challan_no.replace(/\//g, '-');
        const path = `Harry Fashion/Challans/${dateText}/${masterClean}/Challan-${challanNoClean}.pdf`;

        zip.file(path, blob);
      }

      // 2. Pack Invoices
      for (const invoice of filteredInvoices) {
        compiledCount++;
        setBatchCompileStatus(`Generating Invoice [${compiledCount}/${totalDocs}]: ${invoice.invoice_no || ('INV-' + invoice.id)}...`);

        const master = allMasters.find(m => m.id === invoice.master_id) || { name: 'Unknown Master' } as Master;
        
        // Find matching challans for this invoice
        const invoiceChallansRelation = db.getInvoiceChallans(invoice.id);
        const challanIds = invoiceChallansRelation.map(rel => rel.challan_id);
        const invoiceChallans = allChallans.filter(c => challanIds.includes(c.id));

        const blob = await generateInvoicePDF(
          invoice,
          invoiceChallans,
          allChallanItems,
          master,
          allMaterials,
          false, // autoDownload = false
          false  // shouldPrint = false
        );

        const dateText = getFolderInvoiceDateText(invoice.period_month, invoice.period_year);
        const masterClean = master.name.replace(/[^a-zA-Z0-9_\s-]/g, '').trim().replace(/\s+/g, '_');
        const invoiceNoClean = (invoice.invoice_no || `INV-${invoice.id}`).replace(/\//g, '-');
        const path = `Harry Fashion/Invoices/${dateText}/${masterClean}/Invoice-${invoiceNoClean}.pdf`;

        zip.file(path, blob);
      }

      setBatchCompileStatus('Assembling structured ZIP folder container...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Generate standard download
      const userDateText = batchDownloadDate || 'All';
      const userMasterName = batchDownloadMasterId === 'all' ? 'AllMasters' : (allMasters.find(m => m.id === batchDownloadMasterId)?.name || 'Master');
      const userMasterClean = userMasterName.replace(/[^a-zA-Z0-9_\s-]/g, '').trim().replace(/\s+/g, '_');
      
      const downloadName = `Harry_Fashion_Files_${userDateText}_${userMasterClean}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      db.addAuditLog(
        currentUser.email,
        'ZIP EXPORT',
        `Downloaded ZIP archive containing ${totalDocs} documents for period/date ${userDateText}`
      );

      showFeedback(`Successfully compiled and downloaded "${downloadName}" with ${totalDocs} PDFs!`);
    } catch (err: any) {
      console.error(err);
      showFeedback('Zip compiler failed: ' + (err.message || String(err)), true);
    } finally {
      setIsBatchCompiling(false);
      setBatchCompileStatus('');
    }
  };

  const handlePurgeOldRecords = async () => {
    if (currentUser.role !== 'admin') {
      showFeedback('Administrative status is required to execute system-wide data purges.', true);
      return;
    }

    if (purgeConfirmText !== 'PURGE') {
      showFeedback('Please write "PURGE" inside the text box to execute this action.', true);
      return;
    }

    setIsPurging(true);
    try {
      const allChallans = db.getChallans();
      const allInvoices = db.getInvoices();

      // Determine threshold date
      let thresholdDate = new Date();
      if (purgeRetentionMonths === 'all') {
        thresholdDate = new Date(); // delete completely
      } else {
        thresholdDate.setMonth(thresholdDate.getMonth() - Number(purgeRetentionMonths));
      }

      const thresholdStr = thresholdDate.toISOString().split('T')[0];
      
      let toDeleteChallans = allChallans;
      let toDeleteInvoices = allInvoices;

      if (purgeRetentionMonths !== 'all') {
        toDeleteChallans = allChallans.filter(c => c.issued_date < thresholdStr);
        toDeleteInvoices = allInvoices.filter(inv => {
          const invDate = new Date(inv.period_year, inv.period_month - 1, 15);
          return invDate < thresholdDate;
        });
      }

      if (toDeleteChallans.length === 0 && toDeleteInvoices.length === 0) {
        showFeedback('No stored records found older than the chosen timeline settings.', false);
        setIsPurging(false);
        setPurgeConfirmText('');
        return;
      }

      const doubleCheck = window.confirm(
        `⚠️ ATTENTION: PERMANENT DELETION ⚠️\n\nYou are about to purge:\n- ${toDeleteChallans.length} Challans (including all Stitching item logs)\n- ${toDeleteInvoices.length} Invoices\n\nThis will completely erase these from Firestore and local memory, allowing you to free up space. Have you already downloaded a Backup ZIP representing these records first?\n\nClick OK to permanently delete.`
      );

      if (!doubleCheck) {
        setIsPurging(false);
        setPurgeConfirmText('');
        return;
      }

      let deletedRecordsCount = 0;

      // Deleting matching challans
      for (const ch of toDeleteChallans) {
        try {
          db.deleteChallan(ch.id);
          deletedRecordsCount++;
        } catch (e) {
          console.error(`Error deleting challan ${ch.id}:`, e);
        }
      }

      // Deleting matching invoices
      for (const inv of toDeleteInvoices) {
        try {
          db.deleteInvoice(inv.id);
          deletedRecordsCount++;
        } catch (e) {
          console.error(`Error deleting invoice ${inv.id}:`, e);
        }
      }

      db.addAuditLog(
        currentUser.email,
        'DATA PURGE',
        `Cleaned up ${deletedRecordsCount} records from system databases (Setting: ${purgeRetentionMonths === 'all' ? 'All Data' : purgeRetentionMonths + ' months'})`
      );

      showFeedback(`Successfully purged ${deletedRecordsCount} items from server & local databases.`);
      setPurgeConfirmText('');
    } catch (err: any) {
      console.error(err);
      showFeedback('Purger Failure: ' + (err.message || String(err)), true);
    } finally {
      setIsPurging(false);
    }
  };

  // --- Profile Switch handler ---
  const handleUserSwap = (userId: string) => {
    const user = DEMO_USERS.find(u => u.id === userId);
    if (user) {
      db.setCurrentUser(user);
      setCurrentUser(user);
      showFeedback(`Profile swapped! Switched to role: ${user.role.toUpperCase()}`);
      // Hack to reload whole dashboard permissions if parent listens or we just refresh lists
      window.dispatchEvent(new Event('storage'));
      setTimeout(() => window.location.reload(), 400);
    }
  };

  // --- MASTERS HANDLERS ---
  const handleSaveMaster = (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterName.trim() || !masterCode.trim()) {
      showFeedback('Name and Abbreviation Code are required', true);
      return;
    }

    try {
      db.saveMaster({
        id: editingMasterId || undefined,
        name: masterName.trim(),
        code: masterCode.trim().toUpperCase(),
        type: masterType,
        pan_accounts: panAccounts
      });

      showFeedback(editingMasterId ? 'Master craftsman customized successfully!' : 'Stitching Master recorded in database!');
      setMasterName('');
      setMasterCode('');
      setEditingMasterId(null);
      setPanAccounts([]);
      setTempPanNo('');
      setTempBankName('');
      setTempAccountNo('');
      setTempIfscCode('');
      setTempBranchName('');
      setEditingPanId(null);
      reloadAllData();
    } catch (err: any) {
      showFeedback(err.message, true);
    }
  };

  const handleEditMaster = (m: Master) => {
    setMasterName(m.name);
    setMasterCode(m.code);
    setMasterType(m.type);
    setEditingMasterId(m.id);
    setPanAccounts(m.pan_accounts || []);
    // Clear temp states
    setTempPanNo('');
    setTempBankName('');
    setTempAccountNo('');
    setTempIfscCode('');
    setTempBranchName('');
    setEditingPanId(null);
  };

  const handleToggleMasterState = (m: Master) => {
    try {
      db.saveMaster({
        id: m.id,
        is_active: !m.is_active
      });
      showFeedback(`Master state changed! Active status: ${!m.is_active}`);
      reloadAllData();
    } catch (err: any) {
      showFeedback(err.message, true);
    }
  };

  const handleAddOrUpdatePanDetail = () => {
    if (!tempPanNo.trim() || !tempBankName.trim() || !tempAccountNo.trim() || !tempIfscCode.trim()) {
      showFeedback('PAN No, Bank Name, Account No and IFSC Code are all required', true);
      return;
    }

    const panNoClean = tempPanNo.trim().toUpperCase();
    const ifscClean = tempIfscCode.trim().toUpperCase();

    if (editingPanId) {
      // Update
      setPanAccounts(prev => prev.map(p => p.id === editingPanId ? {
        ...p,
        pan_no: panNoClean,
        bank_name: tempBankName.trim(),
        account_no: tempAccountNo.trim(),
        ifsc_code: ifscClean,
        branch_name: tempBranchName.trim() || undefined
      } : p));
      setEditingPanId(null);
      showFeedback('PAN and bank credentials updated in current profile drafting');
    } else {
      // Add
      const newPan: MasterPanAccount = {
        id: 'pan_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        pan_no: panNoClean,
        bank_name: tempBankName.trim(),
        account_no: tempAccountNo.trim(),
        ifsc_code: ifscClean,
        branch_name: tempBranchName.trim() || undefined
      };
      setPanAccounts(prev => [...prev, newPan]);
      showFeedback('PAN and bank credentials appended to current profile');
    }

    // Clear temp states
    setTempPanNo('');
    setTempBankName('');
    setTempAccountNo('');
    setTempIfscCode('');
    setTempBranchName('');
  };

  const handleEditPanDetail = (pan: MasterPanAccount) => {
    setTempPanNo(pan.pan_no);
    setTempBankName(pan.bank_name);
    setTempAccountNo(pan.account_no);
    setTempIfscCode(pan.ifsc_code);
    setTempBranchName(pan.branch_name || '');
    setEditingPanId(pan.id);
  };

  const handleDeletePanDetail = (id: string) => {
    setPanAccounts(prev => prev.filter(p => p.id !== id));
    showFeedback('PAN and bank credentials removed from master definition');
    if (editingPanId === id) {
      setEditingPanId(null);
      setTempPanNo('');
      setTempBankName('');
      setTempAccountNo('');
      setTempIfscCode('');
      setTempBranchName('');
    }
  };

  // --- MATERIALS HANDLERS ---
  const handleSaveMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialName.trim()) {
      showFeedback('Material description is required', true);
      return;
    }

    try {
      db.saveMaterial({
        id: editingMaterialId || undefined,
        name: materialName.trim(),
        unit: materialUnit,
        default_rate: materialRate,
        current_stock: materialStock
      });

      showFeedback(editingMaterialId ? 'Material details modified!' : 'New material recorded inside warehouse registry!');
      setMaterialName('');
      setMaterialRate(0);
      setMaterialStock(100);
      setEditingMaterialId(null);
      reloadAllData();
    } catch (err: any) {
      showFeedback(err.message, true);
    }
  };

  const handleEditMaterial = (mat: Material) => {
    setMaterialName(mat.name);
    setMaterialUnit(mat.unit);
    setMaterialRate(mat.default_rate);
    setMaterialStock(mat.current_stock);
    setEditingMaterialId(mat.id);
  };

  const handleToggleMaterialState = (mat: Material) => {
    try {
      db.saveMaterial({
        id: mat.id,
        is_active: !mat.is_active
      });
      showFeedback(`Material status changed! Active: ${!mat.is_active}`);
      reloadAllData();
    } catch (err: any) {
      showFeedback(err.message, true);
    }
  };

  // --- PRICE OVERRIDES HANDLERS ---
  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideMasterId || !overrideMaterialId || overrideRate <= 0) {
      showFeedback('Select Master, Material and enter positive price override values.', true);
      return;
    }

    try {
      db.saveMasterRateOverride({
        master_id: overrideMasterId,
        material_id: overrideMaterialId,
        rate: overrideRate
      });

      showFeedback('Price rate override saved successfully!');
      setOverrideRate(0);
      reloadAllData();
    } catch (err: any) {
      showFeedback(err.message, true);
    }
  };

  const handleDeleteOverride = (overrideId: string) => {
    try {
      db.deleteMasterRateOverride(overrideId);
      showFeedback('Master price override removed.');
      reloadAllData();
    } catch (err: any) {
      showFeedback(err.message, true);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6" id="settings-view">
      
      {/* Tab Switcher */}
      <div className="bg-slate-100/70 border border-slate-200 p-1 flex gap-1 shadow-xs rounded-xl overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('masters')}
          className={`flex-1 min-w-[110px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'masters' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Scissors className="w-4 h-4" /> Masters Control
        </button>
        <button
          onClick={() => setActiveSubTab('materials')}
          className={`flex-1 min-w-[110px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'materials' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Layers className="w-4 h-4" /> Material Settings
        </button>
        <button
          onClick={() => setActiveSubTab('overrides')}
          className={`flex-1 min-w-[110px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'overrides' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Percent className="w-4 h-4" /> Custom Master Rates
        </button>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex-1 min-w-[110px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'users' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Users className="w-4 h-4" /> Employee Roles & Access
        </button>
        <button
          onClick={() => setActiveSubTab('audit_log')}
          className={`flex-1 min-w-[110px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'audit_log' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <History className="w-4 h-4" /> System Audit Trails
        </button>
        <button
          onClick={() => setActiveSubTab('cloud')}
          className={`flex-1 min-w-[110px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'cloud' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Cloud className="w-4 h-4" /> Cloud Persistence Sync
        </button>
      </div>

      {/* Global alert feedback popup */}
      {message && (
        <div className={`p-4 rounded-xl text-xs font-bold leading-relaxed flex items-center gap-2 ${
          message.isError ? 'bg-rose-50 text-rose-800 border border-rose-200 animate-bounce' : 'bg-green-50 text-green-800 border border-green-200'
        }`}>
          <AlertCircle className="w-4 h-4" /> {message.text}
        </div>
      )}

      {/* --- SUB PANEL 1: MASTERS STITCHERS MANAGER --- */}
      {activeSubTab === 'masters' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider border-b border-slate-100 pb-2.5 mb-4 uppercase">
                {editingMasterId ? 'EDIT MASTER CRAFTSMAN' : 'ADD NEW MASTER CRAFTSMAN'}
              </h3>

              <form onSubmit={handleSaveMaster} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">CRAFTSMAN FULL NAME</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. JUNAID ANDHERI"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-3 text-xs font-semibold text-slate-800"
                    value={masterName}
                    onChange={(e) => setMasterName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">SIGNATURE ABBREVIATION CODE</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. JA"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-slate-800"
                    value={masterCode}
                    onChange={(e) => setMasterCode(e.target.value)}
                  />
                  <span className="text-[9px] text-slate-400 mt-0.5 block font-medium">Used for referencing challan barcodes and index identifiers</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 font-sans">CONTRACT DEPARTMENT DIVISION</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 font-bold cursor-pointer">
                      <input
                        type="radio"
                        checked={masterType === 'jacket'}
                        onChange={() => setMasterType('jacket')}
                        className="w-4 h-4 text-[#1A2E4A] rounded focus:ring-[#1A2E4A]"
                      />
                      Jacket Division
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 font-bold cursor-pointer">
                      <input
                        type="radio"
                        checked={masterType === 'pant'}
                        onChange={() => setMasterType('pant')}
                        className="w-4 h-4 text-[#1A2E4A] rounded focus:ring-[#1A2E4A]"
                      />
                      Pant Division
                    </label>
                  </div>
                </div>

                {/* PAN Cards & Bank Accounts Sub-section */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold tracking-widest text-[#1A2E4A] uppercase">PAN Cards & Bank Accounts</span>
                    <span className="text-[10px] text-slate-500 font-medium">({panAccounts.length} saved)</span>
                  </div>

                  {/* Existing PAN-Bank items list */}
                  {panAccounts.length > 0 && (
                    <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-[180px] overflow-y-auto bg-slate-50">
                      {panAccounts.map(p => (
                        <div key={p.id} className="p-2 flex justify-between items-start text-[11px] hover:bg-slate-100/50 transition">
                          <div className="space-y-0.5">
                            <p className="font-bold text-[#1A2E4A] font-mono">{p.pan_no}</p>
                            <p className="text-slate-600 font-medium">{p.bank_name} - <span className="font-mono text-slate-800">{p.account_no}</span></p>
                            <p className="text-[10px] text-slate-400 font-mono">IFSC: {p.ifsc_code} {p.branch_name ? `(${p.branch_name})` : ''}</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditPanDetail(p)}
                              className="text-slate-500 hover:text-[#1A2E4A] p-0.5"
                              title="Edit PAN profile info"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePanDetail(p.id)}
                              className="text-slate-400 hover:text-red-500 p-0.5"
                              title="Delete PAN record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Embedded Add/Edit PAN profile drawer */}
                  <div className="bg-slate-50/60 border border-slate-200/80 rounded-lg p-2.5 space-y-2">
                    <span className="text-[9px] font-bold text-[#1A2E4A] uppercase tracking-wider block">
                      {editingPanId ? 'Modify PAN-Bank Association' : 'Add PAN-Bank Association'}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-semibold text-slate-600">PAN CARD NO *</label>
                        <input
                          type="text"
                          placeholder="ABCDE1234F"
                          className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] rounded px-1.5 py-1 text-[11px] font-mono uppercase"
                          value={tempPanNo}
                          onChange={(e) => setTempPanNo(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-slate-600">BANK NAME *</label>
                        <input
                          type="text"
                          placeholder="HDFC Bank"
                          className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] rounded px-1.5 py-1 text-[11px] font-medium"
                          value={tempBankName}
                          onChange={(e) => setTempBankName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-semibold text-slate-600">ACCOUNT NUMBER *</label>
                        <input
                          type="text"
                          placeholder="50100234567"
                          className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] rounded px-1.5 py-1 text-[11px] font-mono"
                          value={tempAccountNo}
                          onChange={(e) => setTempAccountNo(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-slate-600">IFSC CODE *</label>
                        <input
                          type="text"
                          placeholder="HDFC0000123"
                          className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] rounded px-1.5 py-1 text-[11px] font-mono uppercase"
                          value={tempIfscCode}
                          onChange={(e) => setTempIfscCode(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-semibold text-slate-600">BRANCH (OPTIONAL)</label>
                      <input
                        type="text"
                        placeholder="Andheri East"
                        className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] rounded px-1.5 py-1 text-[11px]"
                        value={tempBranchName}
                        onChange={(e) => setTempBranchName(e.target.value)}
                      />
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={handleAddOrUpdatePanDetail}
                        className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-bold py-1 px-2 rounded text-[10px] transition cursor-pointer"
                      >
                        {editingPanId ? 'Update Connection' : 'Register PAN-Bank Link'}
                      </button>
                      {editingPanId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPanId(null);
                            setTempPanNo('');
                            setTempBankName('');
                            setTempAccountNo('');
                            setTempIfscCode('');
                            setTempBranchName('');
                          }}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-1 px-2 rounded text-[10px] transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white font-bold py-2 rounded-lg text-xs cursor-pointer transition uppercase"
                  >
                    {editingMasterId ? 'Save Master' : 'Add Master'}
                  </button>
                  {editingMasterId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMasterId(null);
                        setMasterName('');
                        setMasterCode('');
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-12 xl:col-span-7">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider mb-4 border-b border-slate-100 pb-2.5 uppercase">ACTIVE MASTER DIRECTORY</h3>
              
              <div className="overflow-x-auto max-h-[350px] overflow-y-auto pr-1 border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">CODE</th>
                      <th className="py-2.5 px-3">FULL NAME</th>
                      <th className="py-2.5 px-3">DIVISION</th>
                      <th className="py-2.5 px-3">STATUS</th>
                      <th className="py-2.5 px-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {masters.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#1A2E4A]">{m.code}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          <div>{m.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium font-mono">
                            {m.pan_accounts && m.pan_accounts.length > 0 
                              ? `${m.pan_accounts.length} PAN account(s) stored` 
                              : 'No PAN details configured'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="bg-slate-100 text-slate-600 font-bold text-[9px] px-2 py-0.5 rounded-full inline-block">
                            {m.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 uppercase text-[9px] font-bold">
                          <span className={m.is_active ? 'text-emerald-600' : 'text-slate-400'}>
                             {m.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right flex gap-1.5 justify-end">
                          <button
                            onClick={() => handleEditMaster(m)}
                            className="p-1 text-slate-400 hover:text-[#1A2E4A] hover:bg-slate-100 rounded cursor-pointer transition"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleMasterState(m)}
                            className={`p-1 rounded cursor-pointer transition ${m.is_active ? 'text-[#1A2E4A] hover:text-red-500 hover:bg-slate-100' : 'text-slate-400 hover:text-green-500'}`}
                            title={m.is_active ? 'Deactivate Master' : 'Activate Master'}
                          >
                            {m.is_active ? <ToggleRight className="w-5 h-5 text-[#1A2E4A]" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* --- SUB PANEL 2: MATERIALS CATALOG SETTINGS --- */}
      {activeSubTab === 'materials' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider border-b border-slate-100 pb-2.5 mb-4 uppercase">
                {editingMaterialId ? 'MODIFY MATERIAL SPEC' : 'ADD NEW WAREHOUSE SKU'}
              </h3>

              <form onSubmit={handleSaveMaterial} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">MATERIAL/ITEM DESCRIPTION</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. White Pocketing Lining"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-3 text-xs font-semibold text-slate-800"
                    value={materialName}
                    onChange={(e) => setMaterialName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">STANDARD MEASURE UNIT</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800"
                      value={materialUnit}
                      onChange={(e) => setMaterialUnit(e.target.value)}
                    >
                      <option value="mtr">mtr (Meters)</option>
                      <option value="pc">pc (Piece)</option>
                      <option value="dozen">dozen (12 Packs)</option>
                      <option value="roll">roll (Rods)</option>
                      <option value="box">box (Standard Boxes)</option>
                      <option value="bundle">bundle</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">DEFAULT DEPOT RATE (₹)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-slate-800"
                      value={materialRate || ''}
                      onChange={(e) => setMaterialRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">WAREHOUSE CURRENT LEVEL STOCK</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="E.g. 240.5"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-slate-800"
                    value={materialStock || ''}
                    disabled={!!editingMaterialId} // Block direct stock overrides during edit to protect inward entries ledger logs consistency
                    onChange={(e) => setMaterialStock(parseFloat(e.target.value) || 0)}
                  />
                  {editingMaterialId && (
                    <span className="text-[9px] text-amber-600 mt-1 block font-semibold">
                      * Stock edits should be logged chronologically inside Inward Entry panel to track audit ledger trails!
                    </span>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white font-bold py-2 rounded-lg text-xs cursor-pointer transition uppercase"
                  >
                    {editingMaterialId ? 'Update Stock Details' : 'Record SKU'}
                  </button>
                  {editingMaterialId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMaterialId(null);
                        setMaterialName('');
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {/* Rate change trace logs */}
              <div className="mt-5 border-t border-slate-100 pt-3">
                <h4 className="text-[10px] font-bold text-slate-200 tracking-wide uppercase mb-2 flex items-center gap-1">
                  <History className="w-3.5 h-3.5 text-slate-400" /> STOCK RATE CHANGE HISTORY LOGS
                </h4>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {rateHistories.length === 0 ? (
                    <p className="text-[10px] text-slate-400 text-center py-4">No rates modified in current session.</p>
                  ) : (
                    rateHistories.map(h => {
                      const matName = materials.find(m => m.id === h.material_id)?.name || 'Unknown SKU';
                      return (
                        <div key={h.id} className="p-2 bg-slate-50 rounded border border-slate-200 text-[10px] flex justify-between items-center">
                          <div>
                            <span className="font-bold text-slate-750 block">{matName}</span>
                            <span className="text-[9px] text-slate-400 font-medium">Changed By: {h.changed_by}</span>
                          </div>
                          <span className="font-mono text-slate-500 font-semibold">
                            {formatINR(h.old_rate)} → <strong className="text-[#1A2E4A] font-bold">{formatINR(h.new_rate)}</strong>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>

          <div className="lg:col-span-12 xl:col-span-7">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider mb-4 border-b border-slate-100 pb-2.5 uppercase">DEPOT MATERIAL DIRECTORY</h3>
              
              <div className="overflow-x-auto max-h-[460px] overflow-y-auto pr-1 border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">SKU NAME DESCRIPTION</th>
                      <th className="py-2.5 px-3">UNIT</th>
                      <th className="py-2.5 px-3 text-right">STANDARD RATE</th>
                      <th className="py-2.5 px-3 text-right">STOCKS LEVEL</th>
                      <th className="py-2.5 px-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {materials.map(mat => (
                      <tr key={mat.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{mat.name}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-550">{mat.unit}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{formatINR(mat.default_rate)}</td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${mat.current_stock < 15 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {mat.current_stock.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 text-right flex gap-1.5 justify-end">
                          <button
                            onClick={() => handleEditMaterial(mat)}
                            className="p-1 text-slate-400 hover:text-[#1A2E4A] hover:bg-slate-100 rounded cursor-pointer transition"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleMaterialState(mat)}
                            className={`p-1 rounded cursor-pointer transition ${mat.is_active ? 'text-[#1A2E4A]' : 'text-slate-400'}`}
                            title={mat.is_active ? 'Deactivate SKU' : 'Activate SKU'}
                          >
                            {mat.is_active ? <ToggleRight className="w-5 h-5 text-[#1A2E4A]" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      )}
            {/* --- SUB PANEL 3: MASTER VALUE PRICE OVERRIDES --- */}
      {activeSubTab === 'overrides' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider border-b border-slate-100 pb-2.5 mb-4 uppercase flex items-center gap-1.5">
                <Percent className="w-4 h-4 text-[#1A2E4A]" /> ADJUST PER MASTER OVERRIDE RATE
              </h3>

              <form onSubmit={handleSaveOverride} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">SELECT TARGET MASTER</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-semibold text-slate-800"
                    value={overrideMasterId}
                    onChange={(e) => setOverrideMasterId(e.target.value)}
                  >
                    <option value="">-- Choose master craftsman --</option>
                    {masters.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">SELECT MATERIAL ITEM</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-semibold text-slate-800"
                    value={overrideMaterialId}
                    onChange={(e) => setOverrideMaterialId(e.target.value)}
                  >
                    <option value="">-- Choose material catalog --</option>
                    {materials.map(mat => (
                      <option key={mat.id} value={mat.id}>{mat.name} (Unit: {mat.unit})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">OVERRIDE DUST RATE VALUE (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    placeholder="Enter customized rate value (e.g. 40)"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-slate-800"
                    value={overrideRate || ''}
                    onChange={(e) => setOverrideRate(parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-[9px] text-slate-400 mt-1 block font-medium">
                    * If set, issuing this material to selected master will use this rate instead of the catalog rate.
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white font-bold py-2 rounded-lg text-xs cursor-pointer shadow-sm transition uppercase tracking-wider"
                >
                  Save Standard Rule Overrides
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-12 xl:col-span-7">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider mb-4 border-b border-slate-100 pb-2.5 uppercase">ACTIVE MASTER CUSTOM VALUE OVERRIDES</h3>
              
              <div className="overflow-x-auto max-h-[350px] overflow-y-auto pr-1 border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left border-collapse font-sans">
                  <thead>
                    <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3 font-bold">MASTER NAME</th>
                      <th className="py-2.5 px-3 font-bold">MATERIAL SKUS</th>
                      <th className="py-2.5 px-3 text-right font-bold">OVERRIDE PRICE (₹)</th>
                      <th className="py-2.5 px-3 text-right font-bold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {overrides.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400 text-xs font-medium">
                          No custom overrides set. All masters map to standard material rates.
                        </td>
                      </tr>
                    ) : (
                      overrides.map(o => {
                        const mName = masters.find(m => m.id === o.master_id)?.name || 'Deleted Master';
                        const matName = materials.find(m => m.id === o.material_id)?.name || 'Deleted Material';
                        const stdRate = materials.find(m => m.id === o.material_id)?.default_rate || 0;
                        return (
                          <tr key={o.id} className="hover:bg-slate-50/60 transition">
                            <td className="py-2.5 px-3 font-bold text-slate-800">{mName}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-800 block">{matName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">Catalog rate: ₹{stdRate}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1A2E4A]">
                              {formatINR(o.rate)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handleDeleteOverride(o.id)}
                                className="py-1 px-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-lg text-[10px] cursor-pointer transition uppercase"
                                title="Remove customized override"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      )}
      {activeSubTab === 'users' && (
        <div className="space-y-6">
          {/* Real Team Employee Profiles Gated Matrix */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#1A2E4A]" />
                <div>
                  <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">INTERNAL ACCESS ROLES & SECURITY KEYS</h3>
                  <p className="text-[10px] text-slate-400 font-medium font-sans">Configure displayed employee names, system user IDs, and secret passwords</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] bg-slate-100 text-slate-650 font-extrabold px-3 py-1.5 rounded-lg uppercase">
                  ACTIVE USER: {currentUser.name} ({currentUser.role.replace('_', ' ').toUpperCase()})
                </span>
              </div>
            </div>

            {/* List of active real employees from Cloud profiles */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <th className="py-3 px-4">System Access Role</th>
                    <th className="py-3 px-4">Employee Display Name</th>
                    <th className="py-3 px-4">System User ID (Username)</th>
                    <th className="py-3 px-4">Secret Access Password</th>
                    <th className="py-3 px-4 text-center">Actions & Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map((prof) => {
                    const isSelf = prof.id === currentUser.id;
                    const isEditing = editingProfileId === prof.id;
                    return (
                      <tr key={prof.id} className="hover:bg-slate-50/55 transition">
                        {/* System Access Role badge */}
                        <td className="py-4 px-4 font-extrabold text-slate-800 whitespace-nowrap">
                          {prof.role === 'admin' ? (
                            <span className="text-[9px] bg-rose-50 text-rose-600 font-bold px-2 py-0.5 rounded border border-rose-150 uppercase tracking-wider">
                              👑 Owner Admin
                            </span>
                          ) : prof.role === 'billing' ? (
                            <span className="text-[9px] bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded border border-emerald-150 uppercase tracking-wider">
                              💼 Billing Dept
                            </span>
                          ) : (
                            <span className="text-[9px] bg-cyan-50 text-cyan-600 font-bold px-2 py-0.5 rounded border border-cyan-150 uppercase tracking-wider">
                              📦 Issue Dept
                            </span>
                          )}
                          {isSelf && (
                            <span className="text-[9px] text-blue-800 bg-blue-100 font-semibold px-2 py-0.2 rounded-full uppercase ml-1.5">
                              You
                            </span>
                          )}
                        </td>

                        {/* Employee display name */}
                        <td className="py-4 px-4 font-bold text-slate-705">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full text-xs font-semibold bg-white text-slate-800 border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-xs">{prof.name}</span>
                          )}
                        </td>

                        {/* System User ID (Username) */}
                        <td className="py-4 px-4 text-slate-600 font-mono text-[11px] font-bold">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value.toLowerCase())}
                              placeholder="e.g. admin"
                              className="w-full text-xs font-mono bg-white text-slate-800 border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <span>{prof.username || '(not set)'}</span>
                          )}
                        </td>

                        {/* Secret Access Password */}
                        <td className="py-4 px-4 text-slate-650 font-mono text-xs">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              className="w-full text-xs font-mono bg-white text-slate-800 border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-slate-400 font-bold font-sans">•••••••• (Protected)</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {currentUser.role === 'admin' ? (
                            isEditing ? (
                              <div className="flex justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!editName.trim() || !editUsername.trim() || !editPassword.trim()) {
                                      alert("Please complete all credentials fields. No blanks allowed.");
                                      return;
                                    }
                                    if (!/^[a-zA-Z0-9_\-]+$/.test(editUsername)) {
                                      alert("User ID can only contain letters, numbers, hyphens or underscores.");
                                      return;
                                    }
                                    const updatedProf = {
                                      ...prof,
                                      name: editName.trim(),
                                      username: editUsername.trim().toLowerCase(),
                                      password: editPassword.trim()
                                    };
                                    db.saveProfile(updatedProf);
                                    showFeedback(`Successfully updated internal key credentials for ${prof.role.toUpperCase()}!`);
                                    setEditingProfileId(null);
                                    setProfiles(db.getProfiles());
                                  }}
                                  className="py-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] cursor-pointer transition uppercase"
                                >
                                  Save Key
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingProfileId(null)}
                                  className="py-1 px-3 bg-slate-100 hover:bg-slate-250 text-slate-600 font-bold rounded-lg text-[10px] cursor-pointer transition uppercase"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProfileId(prof.id);
                                  setEditName(prof.name);
                                  setEditUsername(prof.username || '');
                                  setEditPassword(prof.password || '');
                                }}
                                className="py-1.5 px-3 bg-[#1A2E4A]/10 text-[#1A2E4A] hover:bg-[#1A2E4A]/20 font-bold rounded-lg text-[10px] cursor-pointer transition uppercase"
                              >
                                Edit Key Card
                              </button>
                            )
                          ) : (
                            <span className="text-[9px] tracking-wider text-slate-400 font-extrabold uppercase bg-slate-100 px-2 py-1 rounded">No Write Privileges</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-650 space-y-2 leading-relaxed">
            <span className="font-bold text-[#1A2E4A] block flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-[#1A2E4A]" /> Dynamic Permissions Access Controls applied on child frames:
            </span>
            <ul className="list-disc pl-4 space-y-1.5 text-[11px] font-medium text-slate-600">
              <li><strong className="font-bold text-slate-700">Issue Department:</strong> Restricted solely to Material Issue + Inwards. Blocks billing actions, reporting, rate books, and masters settings editing.</li>
              <li><strong className="font-bold text-slate-700">Billing Department:</strong> Full operational controls, stitching summaries generation, and reports export blocks. Excludes rate master modifications and logs viewing.</li>
              <li><strong className="font-bold text-slate-750">Owner Admin:</strong> Infinite operational authorizations. Full trace auditing, adding user keys, custom price overrides, and material stock corrections.</li>
            </ul>
          </div>
        </div>
      )}

      {/* --- SUB PANEL 5: SYSTEM AUDIT LOGS --- */}
      {activeSubTab === 'audit_log' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">
                CHRONOLOGICAL SYSTEM AUDIT TRAIL LOGS
              </h3>
              <p className="text-[10px] text-slate-400 mt-1 font-sans">
                Observe, search and filter all creation, deletion, corrections, state transitions & sync actions.
              </p>
            </div>

            {/* Export buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const filtered = audits.filter(log => {
                    const matchSearch = !auditSearchQuery ? true : (
                      log.user_email.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.action.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.details.toLowerCase().includes(auditSearchQuery.toLowerCase())
                    );
                    const matchAction = auditActionFilter === 'all' ? true : (
                      log.action.toUpperCase() === auditActionFilter.toUpperCase()
                    );
                    if (auditStartDate) {
                      const startMs = new Date(auditStartDate + 'T00:00:00').getTime();
                      const logMs = new Date(log.created_at).getTime();
                      if (logMs < startMs) return false;
                    }
                    if (auditEndDate) {
                      const endMs = new Date(auditEndDate + 'T23:59:59').getTime();
                      const logMs = new Date(log.created_at).getTime();
                      if (logMs > endMs) return false;
                    }
                    return matchSearch && matchAction;
                  });
                  generateAuditTrailPDF(filtered, true, false);
                }}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-[#1A2E4A] font-bold py-1.5 px-3 rounded-lg border border-slate-200 flex items-center gap-1 cursor-pointer transition"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
              <button
                onClick={() => {
                  const filtered = audits.filter(log => {
                    const matchSearch = !auditSearchQuery ? true : (
                      log.user_email.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.action.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.details.toLowerCase().includes(auditSearchQuery.toLowerCase())
                    );
                    const matchAction = auditActionFilter === 'all' ? true : (
                      log.action.toUpperCase() === auditActionFilter.toUpperCase()
                    );
                    if (auditStartDate) {
                      const startMs = new Date(auditStartDate + 'T00:00:00').getTime();
                      const logMs = new Date(log.created_at).getTime();
                      if (logMs < startMs) return false;
                    }
                    if (auditEndDate) {
                      const endMs = new Date(auditEndDate + 'T23:59:59').getTime();
                      const logMs = new Date(log.created_at).getTime();
                      if (logMs > endMs) return false;
                    }
                    return matchSearch && matchAction;
                  });
                  generateAuditTrailPDF(filtered, false, true);
                }}
                className="text-xs bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" /> Direct Print Table
              </button>
            </div>
          </div>

          {/* Filtering Layout Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-150">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input 
                type="text"
                placeholder="Search email, action, text..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 font-medium text-slate-800 outline-none"
              />
            </div>

            {/* Action Type drop */}
            <div>
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">ALL OPERATIONS</option>
                <option value="CREATE">CREATE</option>
                <option value="DELETED">DELETED / PURGES</option>
                <option value="VOIDED">VOIDED</option>
                <option value="EDITED">EDITED</option>
                <option value="CLOUD SYNC ENABLED">CLOUD SYNC</option>
                <option value="USER AUTHENTICATION">SECURITY AUTH</option>
              </select>
            </div>

            {/* Date Start */}
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={auditStartDate}
                onChange={(e) => setAuditStartDate(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-2 font-medium text-[#1A2E4A]"
              />
            </div>

            {/* Date End */}
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={auditEndDate}
                onChange={(e) => setAuditEndDate(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-2 font-medium text-[#1A2E4A]"
              />
            </div>
          </div>

          {/* Table list */}
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">RECORD DATE/TIME</th>
                  <th className="py-2.5 px-3">EMPLOYEE EMAIL</th>
                  <th className="py-2.5 px-3">ACTION CATEGORY</th>
                  <th className="py-2.5 px-3">OPERATION DESCRIPTIVE DETAIL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {audits.filter(log => {
                  const matchSearch = !auditSearchQuery ? true : (
                    log.user_email.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                    log.action.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                    log.details.toLowerCase().includes(auditSearchQuery.toLowerCase())
                  );
                  const matchAction = auditActionFilter === 'all' ? true : (
                    log.action.toUpperCase() === auditActionFilter.toUpperCase()
                  );
                  if (auditStartDate) {
                    const startMs = new Date(auditStartDate + 'T00:00:00').getTime();
                    const logMs = new Date(log.created_at).getTime();
                    if (logMs < startMs) return false;
                  }
                  if (auditEndDate) {
                    const endMs = new Date(auditEndDate + 'T23:59:59').getTime();
                    const logMs = new Date(log.created_at).getTime();
                    if (logMs > endMs) return false;
                  }
                  return matchSearch && matchAction;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 text-xs font-medium bg-slate-50 animate-pulse">
                      No system events found matching configured filters.
                    </td>
                  </tr>
                ) : (
                  audits.filter(log => {
                    const matchSearch = !auditSearchQuery ? true : (
                      log.user_email.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.action.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.details.toLowerCase().includes(auditSearchQuery.toLowerCase())
                    );
                    const matchAction = auditActionFilter === 'all' ? true : (
                      log.action.toUpperCase() === auditActionFilter.toUpperCase()
                    );
                    if (auditStartDate) {
                      const startMs = new Date(auditStartDate + 'T00:00:00').getTime();
                      const logMs = new Date(log.created_at).getTime();
                      if (logMs < startMs) return false;
                    }
                    if (auditEndDate) {
                      const endMs = new Date(auditEndDate + 'T23:59:59').getTime();
                      const logMs = new Date(log.created_at).getTime();
                      if (logMs > endMs) return false;
                    }
                    return matchSearch && matchAction;
                  }).map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition bg-white text-slate-700">
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 font-bold whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-650">{log.user_email}</td>
                      <td className="py-2.5 px-3 font-bold uppercase text-[9px] whitespace-nowrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded-sm font-bold ${
                          log.action === 'DELETED' ? 'bg-red-50 text-red-700 border border-red-100' :
                          log.action === 'VOIDED' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          log.action === 'EDITED' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-semibold">
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- SUB PANEL 6: CLOUD PERSISTENCE SYNC MANAGEMENT --- */}
      {activeSubTab === 'cloud' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6 animate-fade-in" id="cloud-manager-panel">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-sm font-bold text-[#1A2E4A] tracking-wider uppercase flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500 animate-pulse" /> Google Cloud Synchronization System
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                Verify exactly where your tailor records and invoices are stored persistently for decade-long preservation.
              </p>
            </div>
            {firebaseUser ? (
              <span className={`px-3 py-1 ${firebaseUser.isAnonymous ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-green-50 text-green-700 border-green-200'} rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-xs`}>
                <span className={`w-2 h-2 rounded-full ${firebaseUser.isAnonymous ? 'bg-indigo-500' : 'bg-green-500'} animate-ping`}></span>
                {firebaseUser.isAnonymous ? 'Shared Background Auto-Sync Active' : 'Personal Google Sync Active'}
              </span>
            ) : (
              <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200 flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Browser Local Session Only
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left/Middle Column status & actions */}
            <div className="md:col-span-2 space-y-6">
              
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Storage Node Allocation Summary</h4>
                
                {firebaseUser ? (
                  <div className="space-y-4">
                    <p className="text-xs font-medium text-slate-650 leading-relaxed">
                      ✓ <strong className="font-bold text-slate-800">Your Tailor Business is Secured in Google Cloud!</strong> All generated material challans, stitching master overrides, and month-end invoicing clearance logs are replicate-broadcasted immediately to a cloud-hosted <strong className="font-bold text-blue-600">Firestore NoSQL</strong> database.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-slate-400 font-medium block text-[10px]">AUTHENTICATION TYPE</span>
                        <span className="font-bold text-slate-800 block">
                          {firebaseUser.isAnonymous 
                            ? 'Shared Silent Background Key' 
                            : 'Personal Google Google Account'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium block text-[10px]">CONNECTED CLIENT EMAIL</span>
                        <span className="font-bold text-slate-800 truncate block">
                          {firebaseUser.email || 'None (Shared Anonymous Device Client)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-404 font-medium block text-[10px]">ESTABLISHED UNIQUE UID</span>
                        <span className="font-mono text-[10px] text-slate-600 truncate block">{firebaseUser.uid}</span>
                      </div>
                      <div>
                        <span className="text-slate-404 font-medium block text-[10px]">FIRESTORE DATABASE NAME</span>
                        <span className="font-bold text-blue-700 block">ai-studio-8cf63be5-8c2c-4ac4-9bc5-3f05fd20bdfb (Default)</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-sky-50 rounded-xl border border-sky-100 text-[11px] text-sky-850 leading-relaxed font-medium">
                      <p className="font-bold text-sky-900 mb-0.5">ℹ️ Multi-User Separation Preserved</p>
                      Your Google or Anonymous connection is used strictly as a database-level secure synchronizer pipeline. The active logged-in terminal employee (<strong className="text-sky-900">{currentUser.name} as {currentUser.role.toUpperCase()}</strong>) remains independent and separate. This ensures Sundar Department (Issue) and Kevin Billing can use separate devices on the same database in real time!
                    </div>
                    
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={handleGoogleSignOut}
                        className="inline-flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold py-2 px-4.5 rounded-lg transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" /> Stop Cloud Sync (Go Offline)
                      </button>
                      
                      {!firebaseUser.isAnonymous && (
                        <button
                          onClick={async () => {
                            try {
                              const { signInAnonymously } = await import('firebase/auth');
                              await signOut(auth);
                              await signInAnonymously(auth);
                              showFeedback('Switched to shared background auto-sync successfully!');
                            } catch (e: any) {
                              showFeedback(e.message || 'Background switch failed', true);
                            }
                          }}
                          className="inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-2 px-4.5 rounded-lg border border-indigo-200 transition cursor-pointer"
                        >
                          <RefreshCw className="w-4 h-4 animate-spin" /> Switch to Shared Auto-Sync
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs font-medium text-slate-650 leading-relaxed">
                      ⚠ <strong className="font-bold text-slate-800">Currently Saving to Local Cache Only!</strong> Local sessions are isolated and prone to getting erased when resetting web histories or swapping systems. Link a Google cloud credential to store your data persistently inside our redundant server nodes for infinite years.
                    </p>
                    
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-[11px] text-amber-800 font-medium flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        All existing offline entries will immediately sync and backup up to Firestore once you authenticate. No existing records will be lost!
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleGoogleSignIn}
                        disabled={isLoggingIn}
                        className="inline-flex items-center justify-center gap-2 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-xs font-bold py-3 px-5 rounded-xl transition cursor-pointer shadow-sm shadow-[#1A2E4A]/10 disabled:opacity-50"
                      >
                        {isLoggingIn ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Connection...
                          </>
                        ) : (
                          <>
                            <LogIn className="w-4 h-4" /> Link Personal Google Account
                          </>
                        )}
                      </button>

                      <button
                        onClick={async () => {
                          setIsLoggingIn(true);
                          try {
                            const { signInAnonymously } = await import('firebase/auth');
                            await signInAnonymously(auth);
                            showFeedback('Connected to shared background synchronizer successfully!');
                          } catch (err: any) {
                            console.error(err);
                            showFeedback(err.message || 'Background connection deferred', true);
                          } finally {
                            setIsLoggingIn(false);
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold py-3 px-5 rounded-xl transition cursor-pointer shadow-sm shadow-indigo-650/10"
                      >
                        <RefreshCw className="w-4 h-4" /> Connect Silent Shared Sync
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* --- LOCAL SYSTEM FOLDER INTEGRATION (FILESYSTEM ACCESS API) --- */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      📁 Local File System Synchronization (Automatic Directory Categorizer)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed font-sans">
                      If linked successfully, generated stitching challans and billing invoices are saved into real physical subdirectories structured by date and masters Name.
                    </p>
                  </div>
                  {boundFolderName ? (
                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 uppercase whitespace-nowrap">
                      Connected: {boundFolderName}
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200 uppercase whitespace-nowrap">
                      Fallback Mode
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 leading-relaxed">
                    <span className="text-[10px] font-bold text-[#1A2E4A] block uppercase">Folder Mapping Blueprint</span>
                    <ul className="text-[10px] text-slate-500 space-y-1 font-mono">
                      <li>📂 <strong className="text-slate-700">{boundFolderName || "Selected Folder"}</strong></li>
                      <li>└ 📂 Harry Fashion</li>
                      <li>&nbsp;&nbsp;├ 📂 Challans</li>
                      <li>&nbsp;&nbsp;│&nbsp;&nbsp;└ 📂 <span className="text-blue-600 font-semibold">12-Jun-2026</span></li>
                      <li>&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└ 📂 <span className="text-blue-600 font-semibold">Sunder-Jacket</span></li>
                      <li>&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└ 📄 <span className="text-slate-850 font-bold">Challan-HF-001.pdf</span></li>
                      <li>&nbsp;&nbsp;└ 📂 Invoices</li>
                    </ul>
                  </div>

                  <div className="space-y-3 leading-relaxed">
                    <div className="text-[11px] text-slate-600 space-y-1.5 font-sans">
                      <p className="font-bold text-slate-800">⚠️ Important Browser Constraint:</p>
                      <ul className="list-disc pl-4 text-[10.5px] text-slate-500 space-y-1 mt-1 leading-normal font-sans">
                        <li>
                          <strong>Iframe Sandbox Limit</strong>: Modern browsers strictly prevent selecting directory folders when running inside iframe preview widgets.
                        </li>
                        <li>
                          <strong>How to Enable Folder Sync</strong>: You must click the <strong className="text-slate-800">"Open in new window"</strong> icon in the top right-hand corner of the screen, and then bind the directory folder inside that tab page!
                        </li>
                      </ul>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleLinkLocalFolder}
                        className="flex-1 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-[11px] font-bold py-2 px-3.5 rounded-lg transition text-center cursor-pointer shadow-xs uppercase tracking-wider"
                      >
                        {boundFolderName ? 'Change Linked Folder' : 'Link Local Directory Folder'}
                      </button>
                      {boundFolderName && (
                        <button
                          onClick={handleClearLocalFolder}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold py-2 px-3.5 rounded-lg border border-rose-150 transition cursor-pointer"
                        >
                          Clear Link
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* --- MULTI-COMPILE BATCH DOCUMENT PACKAGER (OFFLINE-SAFE BROWSER ZIP EXPORTER) --- */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    📦 Multi-Compile Batch Document Packager (Universal ZIP Exporter)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed font-sans">
                    Compile and bundle your entire daily or monthly stitching documents into a real structured ZIP file instantly in your browser. Bypasses all Sandbox iframe constraints perfectly!
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#1A2E4A] uppercase mb-1">Target Date</label>
                    <input
                      type="date"
                      value={batchDownloadDate}
                      onChange={(e) => setBatchDownloadDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#1A2E4A] uppercase mb-1">Stitching Master</label>
                    <select
                      value={batchDownloadMasterId}
                      onChange={(e) => setBatchDownloadMasterId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none"
                    >
                      <option value="all">All Masters (Grouped-Folders)</option>
                      {masters.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.type === 'jacket' ? 'Jackets' : 'Pants'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#1A2E4A] uppercase mb-1">Document Filter</label>
                    <select
                      value={batchDownloadType}
                      onChange={(e) => setBatchDownloadType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none"
                    >
                      <option value="all">Both Challans & Invoices</option>
                      <option value="challans">Challans Only</option>
                      <option value="invoices">Invoices Only</option>
                    </select>
                  </div>
                </div>

                {/* Compile Info Indicator */}
                {(() => {
                  const stats = (() => {
                    const allChallans = db.getChallans();
                    const allInvoices = db.getInvoices();
                    let filteredChallans = allChallans;
                    let filteredInvoices = allInvoices;

                    if (batchDownloadDate) {
                      filteredChallans = filteredChallans.filter(c => c.issued_date === batchDownloadDate);
                      const dateParts = batchDownloadDate.split('-');
                      if (dateParts.length === 3) {
                        const yNum = parseInt(dateParts[0], 10);
                        const mNum = parseInt(dateParts[1], 10);
                        filteredInvoices = filteredInvoices.filter(inv => inv.period_month === mNum && inv.period_year === yNum);
                      }
                    }

                    if (batchDownloadMasterId && batchDownloadMasterId !== 'all') {
                      filteredChallans = filteredChallans.filter(c => c.master_id === batchDownloadMasterId);
                      filteredInvoices = filteredInvoices.filter(inv => inv.master_id === batchDownloadMasterId);
                    }

                    if (batchDownloadType === 'challans') {
                      filteredInvoices = [];
                    } else if (batchDownloadType === 'invoices') {
                      filteredChallans = [];
                    }

                    return {
                      challans: filteredChallans.length,
                      invoices: filteredInvoices.length,
                      total: filteredChallans.length + filteredInvoices.length
                    };
                  })();

                  return (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap justify-between items-center gap-4 text-xs font-medium">
                      <div className="space-y-1 text-left">
                        <span className="text-slate-500 block text-[10px]">RECORDS FOUND FOR RETRIEVAL</span>
                        <div className="flex gap-3 text-[11px]">
                          <span className="text-slate-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded">📦 <strong>{stats.challans}</strong> Challans</span>
                          <span className="text-slate-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded">📄 <strong>{stats.invoices}</strong> Invoices</span>
                        </div>
                      </div>

                      <button
                        onClick={handleBulkZipDownload}
                        disabled={isBatchCompiling || stats.total === 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-2.5 px-4 rounded-xl cursor-pointer shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5 uppercase"
                      >
                        {isBatchCompiling ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Compiling...
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" /> Download Structured ZIP ({stats.total})
                          </>
                        )}
                      </button>
                    </div>
                  );
                })()}

                {isBatchCompiling && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[11px] p-3 rounded-lg flex items-center gap-2 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                    <span>{batchCompileStatus}</span>
                  </div>
                )}
              </div>

              {/* --- FIREBASE DATABASE CLEANUP & DATA RETENTION CENTER --- */}
              <div className="p-5 rounded-2xl bg-rose-50/20 border border-rose-250 shadow-xs space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                    🧹 Firebase Storage & Database Cleanup (Permanent Offline/Cloud Space Purger)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed font-sans">
                    Erase old history records from your terminal and Firestore immediately to free up clutter and cloud resources. We recommend downloading a <strong>consolidated ZIP backup first</strong> for archiving!
                  </p>
                </div>

                {currentUser.role !== 'admin' ? (
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-[11px] font-medium leading-relaxed text-amber-800 text-left">
                    🔒 <strong>Administrative Privileges Required</strong>: Your current profile role is set to <strong className="uppercase">{currentUser.role}</strong>. Old system data purges can only be triggered by the Main business manager (Admin). Swapping to the admin profile inside the "Users" sub-tab unlocks this cleaner!
                  </div>
                ) : (
                  <div className="space-y-4 text-xs text-left">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-rose-900 uppercase mb-1">Target Clean-Up Range</label>
                        <select
                          value={purgeRetentionMonths}
                          onChange={(e) => setPurgeRetentionMonths(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-rose-500 outline-none"
                        >
                          <option value={1}>Older than 30 Days (Delete older than 1 month)</option>
                          <option value={3}>Older than 90 Days (Delete older than 3 months)</option>
                          <option value={6}>Older than 180 Days (Delete older than 6 months)</option>
                          <option value={12}>Older than 365 Days (Delete older than 1 year)</option>
                          <option value="all">Permanent Full Wipeout (Erase all documents completely)</option>
                        </select>
                      </div>

                      <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-150 text-left">
                        <span className="text-[10px] font-bold text-rose-850 uppercase block">Eligible Deletion Candidates</span>
                        {(() => {
                          const stats = (() => {
                            const allChallans = db.getChallans();
                            const allInvoices = db.getInvoices();

                            if (purgeRetentionMonths === 'all') {
                              return {
                                challans: allChallans.length,
                                invoices: allInvoices.length,
                                total: allChallans.length + allInvoices.length
                              };
                            }

                            const cutoff = new Date();
                            cutoff.setMonth(cutoff.getMonth() - Number(purgeRetentionMonths));
                            const cutoffStr = cutoff.toISOString().split('T')[0];

                            const chCount = allChallans.filter(c => c.issued_date < cutoffStr).length;
                            const invCount = allInvoices.filter(inv => {
                              const invDate = new Date(inv.period_year, inv.period_month - 1, 15);
                              return invDate < cutoff;
                            }).length;

                            return {
                              challans: chCount,
                              invoices: invCount,
                              total: chCount + invCount
                            };
                          })();

                          return (
                            <div className="flex gap-2 text-[10.5px] items-center text-rose-700 font-bold mt-1">
                              <span>📂 {stats.challans} Old Challans</span>
                              <span>•</span>
                              <span>📄 {stats.invoices} Old Invoices</span>
                              <span className="bg-rose-50 border border-rose-100 text-[9.5px] px-1.5 py-0.5 rounded ml-auto uppercase">To purge: {stats.total}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-3 leading-relaxed text-left">
                      <div className="text-[11px] text-rose-650 bg-rose-50/50 p-3 rounded-xl border border-rose-150/50 space-y-1">
                        <strong className="text-rose-950 block font-bold">⚠️ Warning: Deletions synchronize automatically</strong>
                        Any records deleted here will be purged permanently from both your local web offline storage and your shared Firebase Cloud DB live. Make absolutely sure you have backup files.
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-rose-900 uppercase mb-1">To verify type the word <strong className="font-mono text-[11px] font-extrabold text-rose-800">PURGE</strong> below:</label>
                          <input
                            type="text"
                            placeholder="Type PURGE here"
                            value={purgeConfirmText}
                            onChange={(e) => setPurgeConfirmText(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-rose-500 outline-none uppercase font-mono tracking-widest text-center"
                          />
                        </div>

                        <button
                          onClick={handlePurgeOldRecords}
                          disabled={isPurging || purgeConfirmText !== 'PURGE'}
                          className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-[11px] font-bold py-2.5 px-5 rounded-lg transition-all cursor-pointer font-sans shadow-sm uppercase tracking-wider flex items-center gap-1.5"
                        >
                          {isPurging ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin animate-fade" /> Purging...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5" /> Execute Permanent Database Purge
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* FRIENDLY SYSTEM COMPLIANCE TROUBLESHOOTING FOR HARRY FASHION TEAM */}
              <div className="bg-rose-50/50 border border-slate-200 p-5 rounded-2xl space-y-4" id="compliance-troubleshooter text-left">
                <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
                  Troubleshooting Guide: Fix Vercel Domains & Sync Issues
                </h4>
                <div className="space-y-3.5 text-xs text-slate-700">
                  <div className="space-y-1">
                    <p className="font-bold text-[#1A2E4A]">1. Facing "Firebase: Error (auth/unauthorized-domain)" on Vercel?</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
                      By default, Firebase prevents signing in or syncing on new domains (like your Vercel or Netlify link) to prevent abuse. Fix it in <strong className="font-bold text-slate-700">30 seconds</strong>:
                    </p>
                    <ol className="list-decimal pl-5 text-[10px] space-y-1 text-slate-500 mt-1 font-sans">
                      <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" className="text-blue-600 font-bold hover:underline">Firebase Console</a>, click your business project.</li>
                      <li>In the left sidebar, click <strong className="font-bold text-slate-700">Authentication</strong>, then click the <strong className="font-bold text-slate-700">Settings</strong> tab at the top.</li>
                      <li>In the side sub-panel, click <strong className="font-bold text-[#1A2E4A]">Authorized Domains</strong>.</li>
                      <li>Click <strong className="text-[#1A2E4A] font-bold">Add Domain</strong>, copy & type <code className="bg-slate-150 py-0.5 px-1 rounded text-red-600 font-mono text-[9px]">harry-fashion-challan-system-esjd.vercel.app</code>, and click Add. You are all set!</li>
                    </ol>
                  </div>

                  <hr className="border-slate-200/50" />

                  <div className="space-y-1">
                    <p className="font-bold text-[#1A2E4A]">2. Enable "Anonymous Sign-In" to Connect Seamlessly WITHOUT Google Passwords</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
                      If you want Sunder (Issue) and Kevin (Billing) to sync data automatically in the background without needing to prompt them for passwords, enable anonymous sign-up:
                    </p>
                    <ol className="list-decimal pl-5 text-[10px] space-y-1 text-slate-500 mt-1 font-sans">
                      <li>In your <strong className="font-bold text-slate-700">Firebase Console &rarr; Authentication</strong> panel, click the <strong className="font-bold text-slate-700">Sign-in Method</strong> tab.</li>
                      <li>Click <strong className="font-bold text-[#1A2E4A]">Add New Provider</strong> and choose <strong className="font-bold text-[#1A2E4A]">Anonymous</strong>.</li>
                      <li>Toggle <strong className="font-bold text-emerald-600">Enable</strong> and click <strong className="font-bold text-slate-700">Save</strong>.</li>
                      <li>The application can now sync silently behind the scenes automatically on all employee devices!</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Data Safety Info Panel */}
              <div className="border border-slate-200 p-5 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-slate-805 uppercase tracking-wider">Decade-Scale Durability Features</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-[#1A2E4A]">Write-Through Local Cache</h5>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      Saves to local memory and cache instantly (0ms) and updates the cloud database in the background. Operates flawlessly even on spotty internet networks!
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-[#1A2E4A]">Real-time Live Broadcasting</h5>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      Uses reactive onSnapshot listeners to automatically synchronize record editions and invoicing registers instantly across all concurrent open tabs.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Database collections statistics and seed controls */}
            <div className="space-y-6">
              {!isSeeded && (
                <div id="seed-database-container" className="p-5 rounded-2xl bg-[#1A2E4A]/5 border border-[#1A2E4A]/10 shadow-xs space-y-4">
                  <h4 className="text-xs font-bold text-[#1A2E4A] uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-blue-600 animate-pulse" /> Database Bootstrap
                  </h4>
                  <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                    Populate the local and Cloud databases with standard <strong>stitching masters data (jackets/pants)</strong> and the official <strong>inventory material rate matrix</strong>.
                  </p>
                  <button
                    id="seed-database-button"
                    onClick={handleSeedDatabase}
                    disabled={isSeeding}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#1A2E4A] hover:bg-opacity-90 text-white text-[11px] font-bold py-2.5 px-4 rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs uppercase tracking-wider animate-bounce"
                  >
                    {isSeeding ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Seeding Database...
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Seed Masters & Materials
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                <h4 className="text-xs font-bold text-slate-805 uppercase tracking-wider border-b border-slate-200 pb-2">
                  Cloud Schema Collections
                </h4>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  Your database service manages the following isolated collections in Google's cloud cluster:
                </p>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs font-medium bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-600 font-bold">masters</span>
                    <span className="text-slate-400 text-[10px] font-mono">Tailor profiles</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-600 font-bold">materials</span>
                    <span className="text-slate-400 text-[10px] font-mono">Inventory items</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-600 font-bold">challans</span>
                    <span className="text-slate-400 text-[10px] font-mono">Material receipts</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-600 font-bold">invoices</span>
                    <span className="text-slate-400 text-[10px] font-mono">Month-end billing</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-600 font-bold">audit_logs</span>
                    <span className="text-slate-400 text-[10px] font-mono">Ledger compliance</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
export default SettingsView;
