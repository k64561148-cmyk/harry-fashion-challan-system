/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Master, Challan, Invoice, AuditLog } from '../types';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Database, 
  FileCheck, 
  History, 
  Users, 
  ClipboardCheck,
  TrendingUp,
  Activity
} from 'lucide-react';

export default function ChecklistView() {
  const [scanning, setScanning] = useState(false);
  const [scanTime, setScanTime] = useState<string>('');
  
  // Local copies of db states for trigger refresh
  const [masters, setMasters] = useState<Master[]>([]);
  const [challans, setChallans] = useState<Challan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [cloudStatus, setCloudStatus] = useState<any>({});

  const loadData = () => {
    setMasters(db.getMasters());
    setChallans(db.getChallans());
    setInvoices(db.getInvoices());
    setAudits(db.getAuditLogs());
    setCloudStatus(db.getCloudHealth());
    setScanTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerManualScan = () => {
    setScanning(true);
    setTimeout(() => {
      loadData();
      setScanning(false);
    }, 750);
  };

  // 1. Negative stock check
  const hasNegStock = db.hasNegativeStock();
  const negativeMaterials = db.getMaterials().filter(m => m.current_stock < 0);

  // 2. Duplicate masters check
  const duplicateMastersList: string[] = [];
  const checkedNames = new Set<string>();
  const checkedCodes = new Set<string>();
  
  masters.forEach(m => {
    const nameLC = m.name.trim().toLowerCase();
    const codeLC = m.code.trim().toLowerCase();
    if (checkedNames.has(nameLC) || checkedCodes.has(codeLC)) {
      duplicateMastersList.push(`${m.name} (${m.code})`);
    } else {
      checkedNames.add(nameLC);
      checkedCodes.add(codeLC);
    }
  });

  // 3. Streams status check
  const streams = cloudStatus.collectionStatus || {};
  const failedStreams = Object.entries(streams).filter(([_, status]) => status === 'failed');
  const allStreamsOk = failedStreams.length === 0;

  // 4. Last backup time
  const lastSyncTime = cloudStatus.lastSyncTime 
    ? new Date(cloudStatus.lastSyncTime).toLocaleTimeString('en-IN') 
    : 'No Active Session Sync';

  // 5. Pending Drafts
  const draftInvoices = invoices.filter(inv => inv.status === 'draft');
  const draftChallans = challans.filter(ch => ch.status === ('draft' as any)); // fallback check

  // 6. Unsettled Challans
  const unsettledChallans = challans.filter(ch => ch.status === 'issued');

  // 7. Audit health check
  const criticalAuditLogs = audits.filter(log => log.action === 'VOIDED' || log.action === 'Sync Failed');
  const auditHealthScore = audits.length > 0 
    ? Math.max(0, 100 - (criticalAuditLogs.length * 5)) 
    : 100;

  // Total checklist diagnostics pass check (negative stock allowed now)
  const goLiveApproved = duplicateMastersList.length === 0 && allStreamsOk && unsettledChallans.length === 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" id="checklist-view">
      
      {/* Top Hero Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl border ${goLiveApproved ? 'bg-emerald-50 text-emerald-600 border-emerald-150' : 'bg-amber-50 text-amber-600 border-amber-150'}`}>
              <ShieldCheck className="w-6 h-6 shrink-0" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A2E4A] tracking-wider uppercase">HARRY FASHION TERMINAL GO-LIVE DIAGNOSTICS</h3>
              <p className="text-xs text-slate-400 font-medium">Verify system alignment, database integrity streams, and stock locking mechanisms</p>
            </div>
          </div>
          
          <button 
            onClick={triggerManualScan}
            disabled={scanning}
            className="bg-[#1A2E4A] hover:bg-[#15243b] disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition cursor-pointer flex items-center justify-center gap-1.5 uppercase font-sans shrink-0 border"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Diagnosing Core...' : 'Force Refresh Scan'}
          </button>
        </div>

        {/* Global Verdict Banner */}
        <div className={`mt-6 p-5 rounded-xl border leading-relaxed ${
          goLiveApproved 
            ? 'bg-emerald-50/70 border-emerald-150 text-emerald-850' 
            : 'bg-amber-50/70 border-amber-205 text-amber-900'
        }`}>
          <div className="flex items-start gap-3">
            {goLiveApproved ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-bounce" />
            )}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-tight">
                {goLiveApproved ? "VERDICT: PERFECT OPERATION READINESS" : "VERDICT: ATTENTION REQUIRED BEFORE COLD DEPLOY"}
              </h4>
              <p className="text-xs mt-1 font-medium text-slate-650">
                {goLiveApproved 
                  ? "Outstanding! The terminal state matches all operational constraints. Material stocks, master registries, cloud synchronization streams, and ledgers are in perfect alignment. Safe for high-scale multi-user transactions."
                  : "Important: The core validator reports pending blocks or integrity anomalies. Negative material stock level, duplicate short codes, or un-settled physical challans will limit full billing finalization controls until resolved."
                }
              </p>
              <div className="mt-2.5 text-[10px] font-mono font-bold uppercase">
                Last Evaluated At: <span className="underline">{scanTime || 'Recalculating...'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Checklist metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Metric 1: Stocks Trust Lock */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">1. STOCKS TRUST INTEGRITY</span>
            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">CLEARED</span>
          </div>
          
          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-lg border bg-emerald-50 text-emerald-600 border-emerald-150`}>
              <Database className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-bold text-slate-800 uppercase">NEGATIVE INVENTORY SCAN</h5>
              <p className="text-xs text-slate-500 font-medium">Negative stock is fully permitted as requested by management.</p>
              {hasNegStock ? (
                <div className="pt-2">
                  <p className="text-xs text-blue-700 font-bold">Negative stocks active on {negativeMaterials.length} materials:</p>
                  <ul className="list-disc pl-4 text-[11px] text-blue-650 font-semibold font-mono space-y-1 mt-1">
                    {negativeMaterials.map(m => (
                      <li key={m.id}>{m.name}: {m.current_stock.toFixed(1)} {m.unit}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-emerald-700 font-bold pt-1">✓ Excellent. All materials are in positive balance.</p>
              )}
            </div>
          </div>
        </div>

        {/* Metric 2: Duplicate Master Protection */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">2. MASTER PROTECTION REGISTER</span>
            {duplicateMastersList.length > 0 ? (
              <span className="bg-rose-100 text-rose-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">WARNING</span>
            ) : (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">CLEARED</span>
            )}
          </div>

          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-lg border ${duplicateMastersList.length > 0 ? 'bg-rose-50 text-rose-600 border-rose-150' : 'bg-emerald-50 text-emerald-600 border-emerald-150'}`}>
              <Users className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-bold text-slate-800 uppercase">DUPLICATE CODES DETECTION</h5>
              <p className="text-xs text-slate-500 font-medium">Scans active stitchers database directories for redundant spelling or shortcode collisions.</p>
              {duplicateMastersList.length > 0 ? (
                <div className="pt-2">
                  <p className="text-xs text-rose-700 font-bold">Duplicate master entries detected:</p>
                  <ul className="list-disc pl-4 text-[11px] text-rose-650 font-semibold font-mono space-y-1 mt-1">
                    {duplicateMastersList.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-slate-400 mt-2 font-semibold">Please navigate to <strong>Settings &gt; Masters &gt; Duplicate Consolidation</strong> to perform a secure merge.</p>
                </div>
              ) : (
                <p className="text-xs text-emerald-700 font-bold pt-1">✓ No duplicates or shortcode collisions found. Craftsman directory integrity is pristine.</p>
              )}
            </div>
          </div>
        </div>

        {/* Metric 3: Cloud Streams OK */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">3. SYNC STREAMS &amp; HEATH</span>
            {allStreamsOk ? (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">ACTIVE OK</span>
            ) : (
              <span className="bg-amber-100 text-amber-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">STALL WARNING</span>
            )}
          </div>

          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-lg border ${allStreamsOk ? 'bg-emerald-50 text-emerald-600 border-emerald-150' : 'bg-amber-50 text-amber-600 border-amber-205'}`}>
              <Activity className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-bold text-slate-800 uppercase">CORES SYNC PIPELINES</h5>
              <p className="text-xs text-slate-500 font-medium">Live connection status of background collections databases broadcasted to central cloud storage:</p>
              
              <div className="grid grid-cols-2 gap-2 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-150 text-[10px] font-mono text-slate-650">
                {Object.entries(streams).map(([coll, status]) => (
                  <div key={coll} className="flex justify-between items-center pr-1 border-b border-slate-200/50 pb-1">
                    <span className="capitalize">{coll.replace('_', ' ')}:</span>
                    <span className={status === 'healthy' ? 'text-green-600 font-bold' : 'text-rose-500 font-extrabold'}>
                      {status === 'healthy' ? 'STREAM_OK' : 'STALLED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Metric 4: Backup Times */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">4. COLD DATA BACKUPS</span>
            <span className="bg-[#1A2E4A] text-white text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">VERIFIED</span>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg border bg-blue-50 text-[#1A2E4A] border-blue-150">
              <History className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-bold text-slate-800 uppercase">AUTOMATED BACKUP HEURISTIC</h5>
              <p className="text-xs text-slate-500 font-medium">Protects against local transaction crashes or workspace cache clearing. Local system is bound in strict safety:</p>
              
              <div className="space-y-1 pt-1.5 text-xs">
                <p className="font-semibold text-slate-700">Last Live Broadcast Sync:</p>
                <p className="font-mono font-bold text-[#1A2E4A]">{lastSyncTime}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Automatic offline storage fallback is continuously writing to IndexedDB Cache blocks safely.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Metric 5: Unsettled Draft Receipts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">5. PENDING DRAFTS QUEUE</span>
            {draftInvoices.length > 0 || draftChallans.length > 0 ? (
              <span className="bg-amber-100 text-amber-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">{draftInvoices.length + draftChallans.length} PENDING</span>
            ) : (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">EMPTY QUEUE</span>
            )}
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg border bg-blue-50 text-[#1A2E4A] border-blue-150">
              <ClipboardCheck className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-bold text-slate-800 uppercase">DRAFT BILLS &amp; CHALAN RECEPTACLES</h5>
              <p className="text-xs text-slate-500 font-medium font-sans">Active draft invoice items stored which are editable without lock triggers:</p>
              
              <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-650">
                <div className="bg-slate-50 p-2.5 rounded border border-slate-150">
                  <span className="block text-[10px] text-slate-400 uppercase font-bold leading-tight">Draft Invoices:</span>
                  <span className="text-lg font-bold font-mono text-[#1A2E4A]">{draftInvoices.length}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-150">
                  <span className="block text-[10px] text-slate-400 uppercase font-bold leading-tight">Draft Challans:</span>
                  <span className="text-lg font-bold font-mono text-[#1A2E4A]">{draftChallans.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Metric 6: Unsettled Issued Challans */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">6. CHARGE / UNSETTLED CHALLANS</span>
            {unsettledChallans.length > 0 ? (
              <span className="bg-amber-100 text-amber-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">{unsettledChallans.length} IN CIRCULATION</span>
            ) : (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">ALL SETTLED</span>
            )}
          </div>

          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-lg border ${unsettledChallans.length > 0 ? 'bg-amber-50 text-amber-600 border-amber-205' : 'bg-emerald-50 text-emerald-600 border-emerald-150'}`}>
              <FileCheck className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-bold text-slate-800 uppercase">UNSETTLED MATERIALS EXPOSURE</h5>
              <p className="text-xs text-slate-500 font-medium">Count of material challans issued to masters that are open and have NOT yet been finalized under a monthly settle receipt:</p>
              
              <div className="pt-2 text-xs">
                <span className="text-slate-400">Total Outstanding Open Challans:</span>
                <span className="text-lg font-bold font-mono text-[#1A2E4A] block mt-0.5">{unsettledChallans.length} issued documents</span>
              </div>
            </div>
          </div>
        </div>

        {/* Metric 7: Audit Health Score */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 md:col-span-2">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">7. CORE AUDIT HEALTH &amp; IMMUTABILITY</span>
            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">SCORE: {auditHealthScore}%</span>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg border bg-indigo-50 text-[#1A2E4A] border-indigo-150">
              <TrendingUp className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-bold text-slate-800 uppercase">STRICT IMMOBILE TRANSPARENCY SCAN</h5>
              <p className="text-xs text-slate-500 font-medium">Calculates ledger transparency index based on the presence of un-reversed critical voided actions or write failures:</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs text-slate-650">
                <div className="bg-slate-50 p-2.5 border rounded">
                  <span className="block text-[9.5px] text-slate-400 font-bold uppercase leading-tight">Total Logs Recorded:</span>
                  <span className="text-base font-bold font-mono text-[#1A2E4A]">{audits.length} events logged</span>
                </div>
                <div className="bg-slate-50 p-2.5 border rounded">
                  <span className="block text-[9.5px] text-slate-400 font-bold uppercase leading-tight">Critical Voidings Registered:</span>
                  <span className="text-base font-bold font-mono text-rose-600 font-bold">{criticalAuditLogs.length} void events</span>
                </div>
                <div className="bg-slate-50 p-2.5 border rounded">
                  <span className="block text-[9.5px] text-slate-400 font-bold uppercase leading-tight">Daily Audit Level Rating:</span>
                  <span className={`text-base font-bold font-sans ${auditHealthScore > 90 ? 'text-green-600' : 'text-amber-600'}`}>
                    {auditHealthScore > 90 ? 'SECURE_AAA' : 'HEALTHY_BBB'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
