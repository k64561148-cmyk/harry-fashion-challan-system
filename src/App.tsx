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
  Cloud
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

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isCloudLoggingIn, setIsCloudLoggingIn] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

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
      // Billing can view everything except settings (some pages in settings are simulated, which is fine, but we restrict Setting subTabs)
      // They can view all reports, billing registers, inward entries, issue challan
      return tab !== 'settings'; 
    }
    if (role === 'issue_dept') {
      // Issue department can ONLY access: dashboard, issue_challan, inward_entry
      return ['dashboard', 'issue_challan', 'inward_entry'].includes(tab);
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
      
      {/* Mobile Header bar */}
      <header className="lg:hidden bg-[#1A2E4A] text-white px-4 py-3 flex items-center justify-between border-b border-[#2D3E5D] shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-400" />
          <h1 className="text-sm font-bold tracking-tight">Harry Fashion</h1>
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

          {/* Quick Active user Profile Panel */}
          <div className="p-4 border-t border-[#2D3E5D] bg-[#14233a] flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold border border-blue-400/20">
                {currentUser.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-white truncate uppercase tracking-tight">{currentUser.name}</p>
                <span className="text-[10px] text-slate-400 block truncate leading-none font-medium mt-0.5">{currentUser.email}</span>
              </div>
            </div>

            {/* Logout/Lock Station */}
            <div className="pt-2 border-t border-[#2D3E5D]/60 whitespace-nowrap">
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
                {activeTab === 'settings' && 'System Settings & Access Controls'}
              </h2>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold tracking-wide uppercase border border-blue-100">
                FY {currentTime ? (currentTime.includes('2026') ? '2026-27' : '2025-26') : '2025-26'}
              </span>
            </div>

            {/* Right clock & clock profile specs */}
            <div className="flex items-center gap-5">
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
                      onClick={handleCloudLogout}
                      className="text-[9px] font-extrabold text-[#1A2E4A] hover:text-rose-600 bg-slate-100 hover:bg-rose-50/70 border border-slate-250 hover:border-rose-200 transition py-1 px-2 rounded-md cursor-pointer ml-1 uppercase"
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
            
            {activeTab === 'dashboard' && <DashboardView onNavigate={(t) => handleTabTrigger(t)} />}
            
            {activeTab === 'issue_challan' && <IssueChallanView />}
            
            {activeTab === 'inward_entry' && <InwardEntryView />}
            
            {activeTab === 'billing' && <BillingView />}
            
            {activeTab === 'reports' && <ReportsView />}
            
            {activeTab === 'settings' && <SettingsView />}

          </div>

          {/* Bottom Activity Bar */}
          <footer className="h-10 bg-white border-t border-slate-200 flex items-center px-8 justify-between text-[10px] text-slate-400 font-medium uppercase tracking-tight select-none shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-slate-500 font-semibold">System Online: Live Sandbox Connected</span>
            </div>
            <div className="flex gap-4">
              <span>Server Local Clock Synchronized</span>
              <span>Regional Node: AP-SOUTH-1</span>
            </div>
          </footer>

        </main>

      </div>

    </div>
  );
}
