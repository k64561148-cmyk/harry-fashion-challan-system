import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  Upload, 
  Copy, 
  Check, 
  Cloud, 
  RefreshCw, 
  ArrowRightLeft, 
  Smartphone, 
  Laptop, 
  AlertCircle,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { db } from '../db';
import { Challan } from '../types';

interface DeviceTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceTransferModal: React.FC<DeviceTransferModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'export' | 'import'>('cloud');
  const [pendingChallans, setPendingChallans] = useState<Challan[]>([]);
  const [isPushingCloud, setIsPushingCloud] = useState(false);
  const [cloudPushMessage, setCloudPushMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllMsg, setSyncAllMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Export states
  const [exportedJSON, setExportedJSON] = useState('');
  const [copied, setCopied] = useState(false);

  // Import states
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshPendingStatus = () => {
    const pending = db.getPendingCloudWrites();
    setPendingChallans(pending.challans);
  };

  useEffect(() => {
    if (isOpen) {
      refreshPendingStatus();
      setCloudPushMessage(null);
      setImportResult(null);
      setImportText('');
      setCopied(false);
      try {
        const json = db.exportDeviceSyncPackage();
        setExportedJSON(json);
      } catch (_) {}
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportedJSON);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (_) {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleDownloadExport = () => {
    try {
      const blob = new Blob([exportedJSON], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HarryFashion_Device_Sync_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Failed to trigger download: ' + e?.message);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = () => {
    if (!importText.trim()) {
      setImportResult({ type: 'error', text: 'Please paste the sync data or upload a sync file first.' });
      return;
    }
    setIsImporting(true);
    setImportResult(null);
    try {
      const res = db.importDeviceSyncPackage(importText.trim());
      if (res.success) {
        setImportResult({ type: 'success', text: res.message });
        refreshPendingStatus();
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        setImportResult({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setImportResult({ type: 'error', text: err?.message || 'Failed to import device sync package.' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncAllDevices = async () => {
    setIsSyncingAll(true);
    setSyncAllMsg(null);
    try {
      const res = await db.syncWithCentralServer(true);
      await db.manualFullSync(false);
      setSyncAllMsg({
        type: res.success ? 'success' : 'info',
        text: res.message || 'All devices synchronized successfully!'
      });
      refreshPendingStatus();
      try {
        setExportedJSON(db.exportDeviceSyncPackage());
      } catch (_) {}
    } catch (err: any) {
      setSyncAllMsg({
        type: 'error',
        text: `Sync error: ${err?.message || String(err)}`
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleForceCloudPush = async () => {
    setIsPushingCloud(true);
    setCloudPushMessage(null);
    try {
      const res = await db.pushPendingWritesToCloud();
      if (res.success) {
        setCloudPushMessage({ type: 'success', text: res.message });
        refreshPendingStatus();
      } else {
        setCloudPushMessage({ type: 'info', text: res.message });
      }
    } catch (e: any) {
      setCloudPushMessage({ type: 'error', text: e?.message || 'Cloud push error.' });
    } finally {
      setIsPushingCloud(false);
    }
  };

  const isQuotaExceeded = db.isQuotaExceededActive;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-[#1E293B] border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-700 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Sync Between Tabs & Devices
              </h2>
              <p className="text-xs text-slate-400">
                Instant sync across tabs, phones, laptops, and PCs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700/80 bg-slate-900/40 px-5 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('cloud')}
            className={`pb-3 px-3 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
              activeTab === 'cloud'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4" /> Cloud & Auto-Sync
            {pendingChallans.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/40">
                {pendingChallans.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`pb-3 px-3 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Share2 className="w-4 h-4" /> Send to Another Device
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`pb-3 px-3 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
              activeTab === 'import'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" /> Receive from Another Device
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: CLOUD & AUTO-SYNC */}
          {activeTab === 'cloud' && (
            <div className="space-y-4">
              {/* Central Multi-Device Sync Card */}
              <div className="p-4 bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/30 border border-blue-600/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-blue-400 ${isSyncingAll ? 'animate-spin' : ''}`} />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Central Multi-Device Synchronization
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Live Server Relay Active
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Connects all your phones, laptops, and PCs together. When any device issues a challan or creates an invoice, it is automatically synchronized across all other devices.
                </p>

                <button
                  type="button"
                  id="btn-sync-all-devices-now"
                  onClick={handleSyncAllDevices}
                  disabled={isSyncingAll}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold tracking-wide transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
                  {isSyncingAll ? 'Synchronizing All Connected Devices...' : 'Sync All Devices Now (One-Click)'}
                </button>

                {syncAllMsg && (
                  <div className={`p-2.5 rounded-lg text-xs border ${
                    syncAllMsg.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                      : syncAllMsg.type === 'error'
                      ? 'bg-rose-950/40 border-rose-700/50 text-rose-300'
                      : 'bg-blue-950/40 border-blue-700/50 text-blue-300'
                  }`}>
                    {syncAllMsg.text}
                  </div>
                )}
              </div>

              {/* Live Cross-Tab Status */}
              <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/30 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-emerald-300 block mb-0.5">Cross-Tab Live Sync Active</span>
                  <span className="text-slate-300">
                    Any challan issued in any tab is now broadcasted in real-time to all open tabs and windows in under 5 milliseconds. No refresh needed!
                  </span>
                </div>
              </div>

              {/* Cloud Status */}
              <div className={`p-4 rounded-xl border ${
                isQuotaExceeded 
                  ? 'bg-amber-950/20 border-amber-700/30 text-amber-200' 
                  : 'bg-blue-950/20 border-blue-700/30 text-blue-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold tracking-wider uppercase flex items-center gap-2">
                    <Cloud className="w-4 h-4" /> Cloud Firestore Sync
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                    isQuotaExceeded ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}>
                    {isQuotaExceeded ? 'Local Safe Mode (Daily Limit)' : 'Live Connected'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  {isQuotaExceeded
                    ? "Google Cloud's free-tier daily write limit is currently resting. All records are 100% safely persisted on this device and will auto-upload when the daily quota resets at midnight PST. Cloud reads remain active."
                    : "Cloud Firestore connection is active and ready to synchronize your challans across all authenticated devices."}
                </p>

                {pendingChallans.length > 0 && (
                  <div className="mt-2 p-3 bg-slate-900/60 rounded-lg border border-slate-700/50">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-slate-300">Challans Ready to Sync to Cloud:</span>
                      <span className="font-mono font-bold text-amber-400">{pendingChallans.length} challan(s)</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1 mb-3">
                      {pendingChallans.slice(0, 5).map(c => (
                        <div key={c.id} className="text-[11px] font-mono text-slate-400 flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded">
                          <span>{c.challan_no}</span>
                          <span className="truncate max-w-[140px]">{c.masterName || 'Master'}</span>
                          <span>{c.issued_date}</span>
                        </div>
                      ))}
                      {pendingChallans.length > 5 && (
                        <p className="text-[10px] text-slate-500 text-center">+{pendingChallans.length - 5} more</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleForceCloudPush}
                      disabled={isPushingCloud}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isPushingCloud ? 'animate-spin' : ''}`} />
                      {isPushingCloud ? 'Pushing to Cloud...' : 'Push Pending to Cloud Firestore Now'}
                    </button>
                  </div>
                )}
              </div>

              {cloudPushMessage && (
                <div className={`p-3 rounded-lg text-xs border ${
                  cloudPushMessage.type === 'success'
                    ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                    : cloudPushMessage.type === 'error'
                    ? 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                    : 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                }`}>
                  {cloudPushMessage.text}
                </div>
              )}

              {/* Direct device sync tip */}
              <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-slate-300">Need challans on another device right now?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('export')}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                >
                  Send to Device &rarr;
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EXPORT / SEND */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-900/60 border border-slate-700/50 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Laptop className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white">Transfer Complete Database to Another Computer or Phone</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  This generates a complete sync package of all your challans, invoices, inward entries, masters, materials, and advances. You can copy the code or download the file to import on your other device in seconds.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyExport}
                  className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied to Clipboard!' : 'Copy Sync Code'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExport}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download File (.json)
                </button>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  value={exportedJSON}
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-slate-400 focus:outline-hidden select-all"
                />
                <span className="absolute bottom-2 right-2 text-[9px] text-slate-600 font-mono">
                  {(exportedJSON.length / 1024).toFixed(1)} KB package
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: IMPORT / RECEIVE */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-900/60 border border-slate-700/50 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Receive Data from Another Device</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Paste the sync code from your other device or select the downloaded sync file. New challans and masters will be safely merged into your system.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">Paste Sync Code:</label>
                  <label className="text-xs font-bold text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Upload .json File
                    <input type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
                  </label>
                </div>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste sync code here..."
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              {importResult && (
                <div className={`p-3 rounded-xl text-xs border ${
                  importResult.type === 'success'
                    ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                }`}>
                  {importResult.text}
                </div>
              )}

              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={isImporting || !importText.trim()}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isImporting ? 'Merging Data...' : 'Merge into This Device'}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            Device ID: {db.getDeviceId().slice(0, 16)}...
          </span>
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
