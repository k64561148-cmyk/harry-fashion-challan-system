/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import db from './db';
import { UserRole, Profile } from './types';
import DashboardView from './components/DashboardView';
import IssueChallanView from './components/IssueChallanView';
import InwardEntryView from './components/InwardEntryView';
import BillingView from './components/BillingView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import ChecklistView from './components/ChecklistView';
import { BankLimitsView } from './components/BankLimitsView';
import LoginGate from './components/LoginGate';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Truck, 
  Receipt, 
  BarChart3, 
  Settings, 
  Lock, 
  Menu, 
  X,
  Sparkles,
  User,
  ShieldCheck,
  CalendarCheck,
  Cloud,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { auth, googleProvider, signInWithPopup, signOut } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('hf_session_logged_in') === 'true';
  });
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [currentUser, setCurrentUser] = useState<Profile>(db.getCurrentUser());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  const isKunalUser = 
    currentUser?.email?.toLowerCase().includes('kunal') || 
    currentUser?.name?.toLowerCase().includes('kunal') || 
    currentUser?.displayName?.toLowerCase().includes('kunal') ||
    (currentUser as any)?.username?.toLowerCase().includes('kunal');

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isCloudLoggingIn, setIsCloudLoggingIn] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudHealth, setCloudHealth] = useState(() => db.getCloudHealth());
  const [isSandboxActive, setIsSandboxActive] = useState<boolean>(() => db.isSandboxModeActive());
  const [isPromoting, setIsPromoting] = useState<boolean>(false);
  const [showPromoteModal, setShowPromoteModal] = useState<boolean>(false);
  const [promoteStatus, setPromoteStatus] = useState<string>('');
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [syncBannerMsg, setSyncBannerMsg] = useState<string | null>(null);

  const handleManualFullSync = async () => {
    setIsManualSyncing(true);
    try {
      const res = await db.manualFullSync();
      setCloudHealth(db.getCloudHealth());
      if (res.success) {
        setSyncBannerMsg(`✓ Full Sync Success: ${res.totalFetched} records fetched from cloud, ${res.totalUploaded} uploaded.`);
      } else {
        setSyncBannerMsg(`⚠️ Sync Notice: ${res.message}`);
      }
      setTimeout(() => setSyncBannerMsg(null), 7000);
    } catch (e: any) {
      setSyncBannerMsg(`Sync error: ${e?.message || String(e)}`);
      setTimeout(() => setSyncBannerMsg(null), 7000);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleToggleSandbox = (val: boolean) => {
    db.setSandboxMode(val);
    setIsSandboxActive(val);
    db.reinitializeCloudListeners();
    window.dispatchEvent(new Event('db_sync'));
  };

  const handlePromoteSandbox = async () => {
    setIsPromoting(true);
    setPromoteStatus('Publishing all sandbox changes to the live production database...');
    try {
      await db.promoteSandboxToLive();
      setPromoteStatus('Success! All tested sandbox data is now live and sandbox mode has been switched off.');
      setTimeout(() => {
        setShowPromoteModal(false);
        setIsPromoting(false);
        setPromoteStatus('');
        setIsSandboxActive(false);
      }, 2500);
    } catch (err: any) {
      console.error(err);
      setPromoteStatus(`Promotion failed: ${err?.message || String(err)}`);
      setIsPromoting(false);
    }
  };

  useEffect(() => {
    const handleSync = () => {
      setCloudHealth(db.getCloudHealth());
      setIsSandboxActive(db.isSandboxModeActive());
    };
    window.addEventListener('db_sync', handleSync);
    return () => window.removeEventListener('db_sync', handleSync);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleCloudLogin = async () => {
    setIsCloudLoggingIn(true);
    setCloudError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      db.addAuditLog(currentUser.email, 'Cloud Sync Enabled', 'Linked browser terminal instance to Firebase cloud synchronizer.');
    } catch (err: any) {
      console.error(err);
      setCloudError(err.message || 'Verification rejected.');
    } finally {
      setIsCloudLoggingIn(false);
    }
  };

  const handleCloudLogout = async () => {
    try {
      await signOut(auth);
      db.addAuditLog(currentUser.email, 'Cloud Sync Disabled', 'Unlinked browser terminal instance from Firebase cloud.');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hf_session_logged_in');
    localStorage.removeItem('hf_session_user_id');
    db.addAuditLog(currentUser.email, 'User Authentication', `User ${currentUser.name} signed out of the terminal.`);
    setIsLoggedIn(false);
    setActiveTab('dashboard');
  };

  useEffect(() => {
    // Clock tick
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    // Automatically execute the developer-only data repair process
    db.runDataRepair();

    return () => clearInterval(interval);
  }, []);

  // Listen to profile swap events dynamically
  useEffect(() => {
    const handleSwap = () => {
      setCurrentUser(db.getCurrentUser());
    };
    window.addEventListener('storage', handleSwap);
    return () => window.removeEventListener('storage', handleSwap);
  }, []);

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'billing': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'issue_dept': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  // Main Access checks for tabs
  const hasAccess = (tab: string): boolean => {
    const role = currentUser.role;
    if (role === 'admin') return true;
    if (role === 'billing') {
      // Billing can view everything except settings
      return tab !== 'settings'; 
    }
    if (role === 'issue_dept') {
      // Issue department can access dashboard, issue_challan, inward_entry, and settings (restricted sub-tabs inside)
      return ['dashboard', 'issue_challan', 'inward_entry', 'settings'].includes(tab);
    }
    return false;
  };

  // Tab controller helpers
  const handleTabTrigger = (tab: string) => {
    if (hasAccess(tab)) {
      setActiveTab(tab);
    }
    setIsMobileMenuOpen(false);
  };

  if (!isLoggedIn) {
    return (
      <LoginGate 
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setIsLoggedIn(true);
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans" id="harry-fashion-app">
      
      {/* Sandbox Alert Banner */}
      {isKunalUser && isSandboxActive && (
        <div className="bg-amber-600 text-white font-bold text-[11px] sm:text-xs py-2 px-4 text-center flex items-center justify-center flex-wrap gap-2 shadow-inner select-none z-50">
          <span className="flex items-center gap-1.5 uppercase font-sans">
            <span className="inline-block w-2 h-2 rounded-full bg-white animate-ping"></span>
            🛠️ <strong>Sandbox Testing Mode Active</strong>:
          </span>
          <span className="opacity-95 text-[11px] font-medium font-sans">You are in an isolated playground. Issuing test challans or rates here will NOT affect live production data.</span>
          <div className="flex items-center gap-2 flex-nowrap ml-1">
            <button 
              onClick={() => handleToggleSandbox(false)}
              className="bg-white text-amber-950 px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider hover:bg-amber-50 transition uppercase cursor-pointer"
            >
              Switch to Live Mode
            </button>
            <button 
              onClick={() => setShowPromoteModal(true)}
              className="bg-emerald-600 text-white px-2.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider hover:bg-emerald-500 transition uppercase cursor-pointer border border-emerald-500 shadow-sm"
            >
              🚀 Publish changes to Live app
            </button>
          </div>
        </div>
      )}

      {/* Mobile Header bar */}
      <header className="lg:hidden bg-[#1A2E4A] text-white px-4 py-3 flex items-center justify-between border-b border-[#2D3E5D] shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-400" />
          <h1 className="text-sm font-bold tracking-tight">Harry Fashion</h1>
          {isKunalUser && isSandboxActive && (
            <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse select-none">
              Sandbox
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(currentUser.role)}`}>
            {currentUser.role.replace('_', ' ').toUpperCase()}
          </span>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1 hover:bg-[#2D3E5D] rounded cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
          </button>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 flex relative">
        
        {/* SIDEBAR NAVIGATION BAR */}
        <aside className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-[#1A2E4A] text-slate-300 flex flex-col border-r border-[#2D3E5D] shadow-xl transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:h-auto
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          
          {/* Logo Brand Brandings */}
          <div className="h-16 flex items-center gap-2.5 px-6 border-b border-[#2D3E5D] bg-[#14233a]">
            <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
            <div>
              <h2 className="text-sm font-bold text-white tracking-widest font-sans">HARRY FASHION</h2>
              <p className="text-[10px] text-[#A0ABC0] font-bold uppercase tracking-widest mt-1">CHALLAN & BILLS</p>
            </div>
          </div>

          {/* Nav groups */}
          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            
            <div className="px-3 mb-2">
              <p className="text-[10px] text-[#A0ABC0] font-bold uppercase tracking-wider">Main Menu</p>
            </div>

            <button
              onClick={() => handleTabTrigger('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboard Home
            </button>

            <button
              onClick={() => handleTabTrigger('issue_challan')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'issue_challan' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <PlusCircle className="w-4 h-4" /> Issue Challan
              </span>
              <span className="text-[9px] bg-[#14233a] text-blue-400 px-1.5 py-0.2 rounded-full font-bold">DAILY</span>
            </button>

            <button
              onClick={() => handleTabTrigger('inward_entry')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'inward_entry' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
              }`}
            >
              <Truck className="w-4 h-4" /> Stock Inward Entry
            </button>

            {/* Administration / Secondary Modules header */}
            <div className="px-3 mb-2 mt-6">
              <p className="text-[10px] text-[#A0ABC0] font-bold uppercase tracking-wider">Administration</p>
            </div>

            {/* Settle Monthly Stitching bills */}
            {hasAccess('billing') ? (
              <button
                onClick={() => handleTabTrigger('billing')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'billing' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
                }`}
              >
                <Receipt className="w-4 h-4" /> Billing Modules
              </button>
            ) : (
              <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold text-slate-500 opacity-40 cursor-not-allowed">
                <span className="flex items-center gap-3">
                  <Receipt className="w-4 h-4" /> Billing Modules
                </span>
                <Lock className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Reports tab */}
            {hasAccess('billing') ? (
              <button
                onClick={() => handleTabTrigger('reports')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'reports' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-4 h-4" /> Reports
              </button>
            ) : (
              <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold text-slate-500 opacity-40 cursor-not-allowed">
                <span className="flex items-center gap-3">
                  <BarChart3 className="w-4 h-4" /> Reports
                </span>
                <Lock className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Bank Account Limits Monitor tab */}
            {hasAccess('billing') ? (
              <button
                onClick={() => handleTabTrigger('bank_limits')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'bank_limits' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-blue-400" /> Bank Limits Monitor
                </span>
                <span className="text-[9px] bg-[#14233a] text-blue-400 px-1.5 py-0.2 rounded-full font-bold">20L LIMIT</span>
              </button>
            ) : (
              <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold text-slate-500 opacity-40 cursor-not-allowed">
                <span className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4" /> Bank Limits Monitor
                </span>
                <Lock className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Go-Live Diagnostics tab */}
            {hasAccess('billing') ? (
              <button
                onClick={() => handleTabTrigger('checklist')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'checklist' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Go-Live Diagnostics
                </span>
                <span className="text-[9px] bg-[#14233a] text-emerald-400 px-1.5 py-0.2 rounded-full font-bold">HEALTH</span>
              </button>
            ) : (
              <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold text-slate-500 opacity-40 cursor-not-allowed">
                <span className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4" /> Go-Live Diagnostics
                </span>
                <Lock className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Admin Settings manager */}
            {hasAccess('settings') ? (
              <button
                onClick={() => handleTabTrigger('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'settings' ? 'bg-[#2D3E5D] text-white' : 'hover:bg-[#2D3E5D] text-slate-400 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4" /> Settings
              </button>
            ) : (
              <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold text-slate-500 opacity-40 cursor-not-allowed">
                <span className="flex items-center gap-3">
                  <Settings className="w-4 h-4" /> Settings
                </span>
                <Lock className="w-3.5 h-3.5" />
              </div>
            )}

          </nav>

          {/* Cloud Health Panel */}
          <div className="mx-4 mb-4 p-3.5 bg-[#14233a]/80 rounded-xl border border-[#2D3E5D]/80 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase flex items-center gap-1.5 font-sans">
                <Cloud className={`w-3.5 h-3.5 ${(cloudHealth.syncFailed || Object.values(cloudHealth.collectionStatus || {}).some(status => status === 'failed')) ? 'text-rose-500 animate-pulse' : 'text-blue-400'}`} />
                Cloud Health Status
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="btn-force-sync"
                  onClick={() => {
                    db.reinitializeCloudListeners();
                    setCloudHealth(db.getCloudHealth());
                  }}
                  title="Force Sync / Reconnect Live Stream"
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded transition-all"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                  Object.values(cloudHealth.collectionStatus || {}).some(status => status === 'failed')
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : cloudHealth.syncFailed
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {Object.values(cloudHealth.collectionStatus || {}).some(status => status === 'failed')
                    ? 'Sync Warning'
                    : cloudHealth.syncFailed
                      ? 'Sync Failed'
                      : 'Healthy'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-350 font-mono mt-1 border-t border-[#2D3E5D]/40 pt-2">
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">Last Write</span>
                <span className="font-semibold text-slate-200">
                  {cloudHealth.lastSuccessfulWrite ? new Date(cloudHealth.lastSuccessfulWrite).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
                </span>
              </div>
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">Last Read</span>
                <span className="font-semibold text-slate-200">
                  {cloudHealth.lastRead ? new Date(cloudHealth.lastRead).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
                </span>
              </div>
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">Queue Size</span>
                <span className={`font-semibold ${cloudHealth.pendingOfflineWrites > 0 ? 'text-amber-400 font-bold' : 'text-slate-200'}`}>
                  {cloudHealth.pendingOfflineWrites} writes
                </span>
              </div>
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">Device Node</span>
                <span className="font-semibold text-slate-400 truncate block max-w-[95px]" title={db.getCloudHealth().deviceId}>
                  Terminal Client
                </span>
              </div>
            </div>

            {/* Collection Sync Streams Grid */}
            {cloudHealth.collectionStatus && (
              <div className="mt-2 border-t border-[#2D3E5D]/40 pt-2 text-[9px] font-mono leading-tight">
                <span className="block text-[8px] text-slate-500 font-extrabold uppercase tracking-wider mb-1.5 font-sans">Streams Monitor</span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1 text-[9px] font-mono select-none">
                  {Object.entries(cloudHealth.collectionStatus).map(([collName, status]) => (
                    <div key={collName} className="flex items-center justify-between pb-0.5 border-b border-white/[0.04]">
                      <span className="text-slate-300 capitalize truncate max-w-[80px]" title={collName}>{collName.replace('_', ' ')}</span>
                      <span className={`font-bold px-1.5 py-0.2 rounded text-[8px] uppercase tracking-wider ${
                        status === 'healthy' 
                          ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30' 
                          : status === 'failed' 
                            ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30 font-extrabold animate-pulse' 
                            : 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30'
                      }`}>
                        {status === 'failed' ? 'ERR' : 'ACTIVE'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cloudHealth.lastError && (
              <div className="mt-1.5 p-2 bg-rose-950/30 border border-rose-800/30 rounded-lg text-[9px] text-rose-300 leading-normal font-mono select-text break-all max-h-[80px] overflow-y-auto">
                <span className="font-bold text-rose-400 block mb-0.5 uppercase tracking-wider">Write Exception:</span>
                {cloudHealth.lastError}
              </div>
            )}

            {/* Manual Full Sync Action Button */}
            <button
              type="button"
              id="btn-manual-full-sync"
              onClick={handleManualFullSync}
              disabled={isManualSyncing}
              className="w-full mt-2 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold tracking-wider uppercase transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isManualSyncing ? 'animate-spin' : ''}`} />
              {isManualSyncing ? 'Synchronizing Cloud...' : 'Manual Full Sync (Fetch All)'}
            </button>
          </div>

          {/* Quick Active user Profile Panel */}
          <div className="p-4 border-t border-[#2D3E5D] bg-[#14233a] flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold border border-blue-400/20">
                {currentUser.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-white truncate uppercase tracking-tight">{currentUser.name}</p>
                <span className="text-[10px] text-slate-400 block truncate leading-none font-medium mt-0.5">{currentUser.email}</span>
              </div>
            </div>

            {/* Sidebar Sandbox Toggle controls */}
            {isKunalUser && (
              <div className="pt-2 border-t border-[#2D3E5D]/40 flex flex-col gap-1.5">
                <button
                  onClick={() => handleToggleSandbox(!isSandboxActive)}
                  className={`w-full flex items-center justify-between py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer border ${
                    isSandboxActive 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20' 
                      : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`relative flex h-1.5 w-1.5`}>
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSandboxActive ? 'bg-amber-400' : 'bg-slate-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isSandboxActive ? 'bg-amber-500' : 'bg-slate-550'}`}></span>
                    </span>
                    <span>Sandbox (Testing)</span>
                  </span>
                  <span className={`text-[8px] font-black uppercase px-1 rounded ${isSandboxActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                    {isSandboxActive ? 'ON' : 'OFF'}
                  </span>
                </button>

                {isSandboxActive && (
                  <button
                    onClick={() => setShowPromoteModal(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-sm uppercase text-[10px]"
                  >
                    <span>🚀 Publish to Live</span>
                  </button>
                )}
              </div>
            )}

            {/* Logout/Lock Station */}
            <div className="pt-1 whitespace-nowrap">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/35 hover:border-rose-700/50 rounded-lg text-rose-300 text-xs font-bold transition cursor-pointer"
                title="Lock terminal and sign out"
              >
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                Sign Out Terminal
              </button>
            </div>
          </div>

        </aside>

        {/* Content Section panels container */}
        <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
          
          {/* Top Desktop navigation bar wrapper */}
          <header className="hidden lg:flex items-center justify-between h-16 bg-white border-b border-slate-200 px-8 select-none z-10 shadow-sm shrink-0">
            
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-[#1A2E4A]">
                {activeTab === 'dashboard' && 'Business Intelligence Dashboard'}
                {activeTab === 'issue_challan' && 'Issue New Material Challan'}
                {activeTab === 'inward_entry' && 'Stock Inward Register Form'}
                {activeTab === 'billing' && 'Billing & Stitched Settlements Table'}
                {activeTab === 'reports' && 'Executive Analytics & Ledger Reports'}
                {activeTab === 'bank_limits' && 'Master Bank Account Limits & Compliance Dashboard'}
                {activeTab === 'checklist' && 'Go-Live Diagnostics & Security Audits'}
                {activeTab === 'settings' && 'System Settings & Access Controls'}
              </h2>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold tracking-wide uppercase border border-blue-100">
                FY {currentTime ? (currentTime.includes('2026') ? '2026-27' : '2025-26') : '2025-26'}
              </span>
            </div>

            {/* Right clock & clock profile specs */}
            <div className="flex items-center gap-5">
                        {/* Sandbox Toggle Mode button */}
              {isKunalUser && (
                <div className="flex items-center gap-2 pr-5 border-r border-slate-200">
                  <button
                    onClick={() => handleToggleSandbox(!isSandboxActive)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer border ${
                      isSandboxActive 
                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-xs' 
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                    title={isSandboxActive ? "Switch to Live production database" : "Switch to isolated sandbox database for testing"}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSandboxActive ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isSandboxActive ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                    </span>
                    <span>{isSandboxActive ? 'Sandbox Testing' : 'Live Production'}</span>
                  </button>

                  {isSandboxActive && (
                    <button
                      onClick={() => setShowPromoteModal(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-500 shadow-sm"
                      title="Promote and publish all verified sandbox changes to the Live Production database"
                    >
                      <span>🚀 Publish to Live</span>
                    </button>
                  )}
                </div>
              )}

              {/* Cloud Sync Status available to all employees to bridge isolated sessions */}
              <div className="flex items-center gap-2 pr-5 border-r border-slate-250 relative">
                {firebaseUser ? (
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${firebaseUser.isAnonymous ? 'bg-indigo-400' : 'bg-emerald-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${firebaseUser.isAnonymous ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
                    </span>
                    <div className="text-left">
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider leading-none">Cloud Sync</span>
                      <span className={`text-[10px] font-bold block mt-0.5 ${firebaseUser.isAnonymous ? 'text-indigo-600' : 'text-emerald-600'}`} title={firebaseUser.isAnonymous ? 'Connected anonymously to the shared database' : `Connected as ${firebaseUser.email}`}>
                        {firebaseUser.isAnonymous ? 'Shared Auto-Sync' : 'Personal Sync'}
                      </span>
                    </div>
                    <button
                      onClick={handleManualFullSync}
                      disabled={isManualSyncing}
                      title="Force Full Sync all records between this PC and Google Cloud"
                      className="text-[9px] font-extrabold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition py-1 px-2 rounded-md cursor-pointer ml-1 uppercase flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isManualSyncing ? 'animate-spin' : ''}`} /> {isManualSyncing ? 'Syncing...' : 'Sync'}
                    </button>
                    <button
                      onClick={handleCloudLogout}
                      className="text-[9px] font-extrabold text-[#1A2E4A] hover:text-rose-600 bg-slate-100 hover:bg-rose-50/70 border border-slate-250 hover:border-rose-200 transition py-1 px-2 rounded-md cursor-pointer uppercase"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0"></span>
                    <div className="text-left">
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider leading-none">Cloud Sync</span>
                      <span className="text-[10px] font-bold text-amber-600 block mt-0.5">
                        Offline Cache
                      </span>
                    </div>
                    <button
                      onClick={handleCloudLogin}
                      disabled={isCloudLoggingIn}
                      className="bg-amber-50 hover:bg-amber-100 border border-amber-200/70 hover:border-amber-300 text-amber-800 text-[9px] font-extrabold py-1 px-2.5 rounded-md transition flex items-center gap-0.5 cursor-pointer uppercase"
                    >
                      <Cloud className="w-3 h-3" /> {isCloudLoggingIn ? 'Sync...' : 'Link'}
                    </button>
                    {cloudError && (
                      <span className="text-[9px] text-rose-500 font-bold max-w-[50px] truncate" title={cloudError}>
                        ⚠️ Err
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold border-r border-slate-200 pr-5">
                <CalendarCheck className="w-4 h-4 text-slate-400" />
                <span>System Clock:</span>
                <span className="text-[#1A2E4A] font-mono font-bold ml-1">{currentTime}</span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleLogout}
                  className="bg-rose-50 hover:bg-rose-100/85 text-rose-700 border border-rose-205 text-[11px] font-extrabold py-1.5 px-3 rounded-lg hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title="Lock terminal session"
                >
                  <Lock className="w-3.5 h-3.5" /> Sign Out
                </button>

                <div className="flex items-center gap-3 select-text border-l border-slate-200 pl-4">
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-800">{currentUser.name}</p>
                    <span className={`inline-block text-[9px] font-bold px-2 py-0.5 mt-0.5 rounded-full border uppercase ${getRoleBadgeColor(currentUser.role)}`}>
                      {currentUser.role.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#1A2E4A] text-white flex items-center justify-center text-xs font-bold border border-[#2D3E5D]">
                    {currentUser.name.substring(0, 2).toUpperCase()}
                  </div>
                </div>
              </div>
            </div>

          </header>

          {/* Tab Pages rendering body */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-12">
            {syncBannerMsg && (
              <div className="mb-4 p-3.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-fade-in">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{syncBannerMsg}</span>
                </div>
                <button
                  onClick={() => setSyncBannerMsg(null)}
                  className="text-blue-500 hover:text-blue-800 text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
            
            {activeTab === 'dashboard' && <DashboardView onNavigate={(t) => handleTabTrigger(t)} />}
            
            {activeTab === 'issue_challan' && <IssueChallanView />}
            
            {activeTab === 'inward_entry' && <InwardEntryView />}
            
            {activeTab === 'billing' && <BillingView />}
            
            {activeTab === 'reports' && <ReportsView />}
            
            {activeTab === 'bank_limits' && (
              <BankLimitsView
                onNavigateToSettings={() => handleTabTrigger('settings')}
                onNavigateToBilling={(masterId) => handleTabTrigger('billing')}
              />
            )}
            
            {activeTab === 'checklist' && <ChecklistView />}
            
            {activeTab === 'settings' && <SettingsView />}

          </div>

          {/* Bottom Activity Bar with rich live diagnostics */}
          <footer className="bg-white border-t border-slate-200 p-4 px-6 md:px-8 text-[10px] text-slate-500 font-sans tracking-tight shrink-0 select-text">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              
              {/* Left Column: Cloud Connection & Warnings */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${cloudHealth.syncFailed ? 'bg-red-500' : 'bg-green-500'}`}></span>
                  <span className="text-slate-700 font-semibold uppercase tracking-wider text-[9px]">
                    {cloudHealth.syncFailed ? 'Sync Status: DEGRADED' : 'Sync Status: HEALTHY'}
                  </span>
                </div>
                {isSandboxActive && (
                  <span className="bg-red-600 text-white font-bold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse text-[8px]">
                    Environment Mismatch: Sandbox Active
                  </span>
                )}
              </div>

              {/* Right Column / Center: Structured Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2 text-slate-400 font-mono text-[9px] uppercase">
                <div>
                  <span className="text-slate-500 font-bold block text-[8px] tracking-wider">Firebase Project ID:</span>
                  <span className="text-slate-600 truncate block max-w-[150px]" title="ai-studio-8cf63be5-8c2c-4ac4-9bc5-3f05fd20bdfb">
                    ai-studio-8cf63be5-8c2c-4ac4-9bc5-3f05fd20bdfb
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block text-[8px] tracking-wider">Environment:</span>
                  <span className={`font-black block ${isSandboxActive ? 'text-red-600' : 'text-emerald-600'}`}>
                    {isSandboxActive ? 'SANDBOX (PLAYGROUND)' : 'PRODUCTION (LIVE)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block text-[8px] tracking-wider">Challans Path:</span>
                  <span className="text-slate-600 font-bold block">
                    {isSandboxActive ? 'sandbox_kunal_challans' : 'challans'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block text-[8px] tracking-wider">Device ID:</span>
                  <span className="text-slate-600 block truncate max-w-[120px]" title={cloudHealth.deviceId || 'Unknown'}>
                    {cloudHealth.deviceId || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block text-[8px] tracking-wider">Last Cloud Write:</span>
                  <span className="text-slate-600 block">
                    {cloudHealth.lastSuccessfulWrite ? new Date(cloudHealth.lastSuccessfulWrite).toLocaleTimeString('en-IN') : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block text-[8px] tracking-wider">Last Cloud Read:</span>
                  <span className="text-slate-600 block">
                    {cloudHealth.lastRead ? new Date(cloudHealth.lastRead).toLocaleTimeString('en-IN') : 'N/A'}
                  </span>
                </div>
              </div>

            </div>

            {/* Environment Mismatch warning if Sandbox Mode is ON */}
            {isSandboxActive && (
              <div className="mt-2.5 bg-red-50 border border-red-200 text-red-700 px-3.5 py-2 rounded-lg flex items-center gap-2 font-semibold text-[10px] shadow-sm">
                <span className="text-red-500 text-xs animate-bounce">⚠️</span>
                <span>Environment mismatch. This device is not connected to production data.</span>
              </div>
            )}
          </footer>

        </main>

      </div>

      {/* Custom React Dialog Modal for Sandbox Promotion to Live */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 select-none">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3.5 mb-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#1A2E4A] font-sans">
                    Publish Sandbox changes to Live App?
                  </h3>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">
                    Tested environment to production deployment
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 mb-5 text-xs text-amber-900 font-sans leading-relaxed">
                <strong>Attention Kunal:</strong> Promoting sandbox data will merge/overwrite live master rates, material entries, challans, and invoices with your current sandbox state. This operation is permanent and live production mode will be instantly reactivated.
              </div>

              {promoteStatus ? (
                <div className="py-4 px-3 bg-slate-50 border border-slate-150 rounded-lg flex flex-col items-center justify-center gap-3.5 mb-2">
                  <div className={`w-8 h-8 rounded-full border-3 ${isPromoting ? 'border-t-emerald-600 border-r-emerald-200 border-b-emerald-200 border-l-emerald-200 animate-spin' : 'bg-emerald-100 border-emerald-500 text-emerald-600 flex items-center justify-center'}`}>
                    {!isPromoting && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-bold text-center text-[#1A2E4A] leading-normal font-sans px-2">
                    {promoteStatus}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowPromoteModal(false)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 cursor-pointer transition uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePromoteSandbox}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition uppercase shadow-sm border border-emerald-500"
                  >
                    Confirm & Publish
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
