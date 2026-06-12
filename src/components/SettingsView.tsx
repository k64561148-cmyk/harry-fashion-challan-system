/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, DEMO_USERS } from '../db';
import { Master, Material, MasterRateOverride, AuditLog, RateHistory, UserRole, Profile } from '../types';
import { formatINR, formatDate } from '../utils/exportUtils';
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
  Database
} from 'lucide-react';
import { MasterPanAccount } from '../types';
import { auth, signInWithPopup, signOut, googleProvider } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export const SettingsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'masters' | 'materials' | 'overrides' | 'users' | 'audit_log' | 'cloud'>('masters');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

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
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider mb-4 border-b border-slate-200 pb-2.5 uppercase">
            CHRONOLOGICAL SYSTEM AUDIT TRAIL LOGS
          </h3>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">RECORD DATE/TIME</th>
                  <th className="py-2.5 px-3">EMPLOYEE EMAIL</th>
                  <th className="py-2.5 px-3">ACTION CATEGORY</th>
                  <th className="py-2.5 px-3">OPERATION DESCRIPTIVE DETAIL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-805">
                {audits.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 text-xs font-medium">
                      No system events tracked yet. Log operations to create audit logs.
                    </td>
                  </tr>
                ) : (
                  audits.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 font-bold">
                        {new Date(log.created_at).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-650">{log.user_email}</td>
                      <td className="py-2.5 px-3 font-bold uppercase text-[9px]">
                        <span className="bg-slate-105 text-slate-600 inline-block px-1.5 py-0.5 rounded-sm">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-bold">
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
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-200 flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                Cloud Sync Active
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
                        <span className="text-slate-400 font-medium block text-[10px]">AUTH SYSTEM EMAIL</span>
                        <span className="font-bold text-slate-805 truncate block">{firebaseUser.email}</span>
                      </div>
                      <div>
                        <span className="text-slate-404 font-medium block text-[10px]">ESTABLISHED UNIQUE UID</span>
                        <span className="font-mono text-[10px] text-slate-600 truncate block">{firebaseUser.uid}</span>
                      </div>
                      <div>
                        <span className="text-slate-404 font-medium block text-[10px]">FIRESTORE DATABASE NAME</span>
                        <span className="font-bold text-blue-700 block">gen-lang-client-0377985094 (Default)</span>
                      </div>
                      <div>
                        <span className="text-slate-404 font-medium block text-[10px]">REGIONAL DEPLOY NODE</span>
                        <span className="font-bold text-slate-850 block">AP-SOUTH-1 (Mumbai Area)</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleGoogleSignOut}
                      className="inline-flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-705 text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" /> Stop Cloud Sync
                    </button>
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

                    <button
                      onClick={handleGoogleSignIn}
                      disabled={isLoggingIn}
                      className="inline-flex items-center gap-2 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-xs font-bold py-3 px-5 rounded-xl transition cursor-pointer shadow-sm shadow-[#1A2E4A]/10 disabled:opacity-50"
                    >
                      {isLoggingIn ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Connection...
                        </>
                      ) : (
                        <>
                          <LogIn className="w-4 h-4" /> Authenticate & Sync with Google Account
                        </>
                      )}
                    </button>
                  </div>
                )}

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
