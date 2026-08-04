import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Master, MasterPanAccount, Invoice } from '../types';
import { formatINR, formatDate } from '../utils/exportUtils';
import {
  CreditCard,
  Building2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  SlidersHorizontal,
  TrendingUp,
  FileText,
  Edit2,
  Plus,
  ArrowRight,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';

interface BankLimitsViewProps {
  onNavigateToSettings?: () => void;
  onNavigateToBilling?: (masterId?: string) => void;
}

export const BankLimitsView: React.FC<BankLimitsViewProps> = ({
  onNavigateToSettings,
  onNavigateToBilling
}) => {
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'exceeded' | 'near_limit' | 'normal'>('all');
  const [expandedAccountKeys, setExpandedAccountKeys] = useState<Set<string>>(new Set());
  const [editingAccount, setEditingAccount] = useState<{ masterId: string; accountId: string; currentLimit: number; accountNo: string; label: string } | null>(null);
  const [newLimitInput, setNewLimitInput] = useState<string>('');
  const [editSuccessMsg, setEditSuccessMsg] = useState<string>('');

  const refreshData = () => {
    const data = db.getAllMasterBankLimitsSummary();
    setSummaryData(data);
  };

  useEffect(() => {
    refreshData();
    const handleSync = () => refreshData();
    window.addEventListener('db_sync', handleSync);
    return () => window.removeEventListener('db_sync', handleSync);
  }, []);

  const toggleExpand = (key: string) => {
    const next = new Set(expandedAccountKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedAccountKeys(next);
  };

  const handleOpenEditLimit = (masterId: string, acc: MasterPanAccount) => {
    const limit = acc.limit_amount || 2000000;
    setEditingAccount({
      masterId,
      accountId: acc.id,
      currentLimit: limit,
      accountNo: acc.account_no,
      label: acc.label || acc.pan_name
    });
    setNewLimitInput(String(limit));
  };

  const handleSaveLimit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    const numLimit = parseFloat(newLimitInput.replace(/,/g, ''));
    if (isNaN(numLimit) || numLimit <= 0) {
      alert('Please enter a valid positive numeric limit amount.');
      return;
    }

    const success = db.updateMasterBankAccountLimit(editingAccount.masterId, editingAccount.accountId, numLimit);
    if (success) {
      setEditSuccessMsg(`Limit for Account ${editingAccount.accountNo} updated to ${formatINR(numLimit)}`);
      setTimeout(() => setEditSuccessMsg(''), 4000);
      setEditingAccount(null);
      refreshData();
    }
  };

  // Aggregated Stats
  let totalMasters = summaryData.length;
  let totalAccounts = 0;
  let totalExceededCount = 0;
  let totalNearLimitCount = 0;
  let totalDisbursedOverall = 0;

  summaryData.forEach((m) => {
    if (!m) return;
    const accs = Array.isArray(m.accounts) ? m.accounts : [];
    totalAccounts += accs.length;
    accs.forEach((accInfo: any) => {
      totalDisbursedOverall += accInfo?.totalBilled || 0;
      if (accInfo?.isExceeded) totalExceededCount++;
      else if (accInfo?.isNearLimit) totalNearLimitCount++;
    });
  });

  // Filtered Masters safely
  const filteredData = summaryData.filter((m) => {
    if (!m) return false;
    const term = (searchTerm || '').toLowerCase().trim();

    if (term) {
      const masterNameStr = (m.masterName || '').toLowerCase();
      const masterCodeStr = (m.masterCode || '').toLowerCase();
      const masterTypeStr = (m.masterType || '').toLowerCase();

      const matchesMaster =
        masterNameStr.includes(term) ||
        masterCodeStr.includes(term) ||
        masterTypeStr.includes(term);

      const matchesAccount = Array.isArray(m.accounts) && m.accounts.some((accInfo: any) => {
        const acc = accInfo?.account;
        if (!acc) return false;
        const bankName = (acc.bank_name || '').toLowerCase();
        const accountNo = (acc.account_no || '').toLowerCase();
        const panNo = (acc.pan_no || '').toLowerCase();
        const panName = (acc.pan_name || '').toLowerCase();
        const label = (acc.label || '').toLowerCase();
        const ifsc = (acc.ifsc_code || '').toLowerCase();

        return (
          bankName.includes(term) ||
          accountNo.includes(term) ||
          panNo.includes(term) ||
          panName.includes(term) ||
          label.includes(term) ||
          ifsc.includes(term)
        );
      });

      if (!matchesMaster && !matchesAccount) {
        return false;
      }
    }

    if (statusFilter === 'exceeded') {
      return !!m.hasExceededAccount;
    }
    if (statusFilter === 'near_limit') {
      return !!m.hasNearLimitAccount;
    }
    if (statusFilter === 'normal') {
      return Array.isArray(m.accounts) && m.accounts.length > 0 && !m.hasExceededAccount && !m.hasNearLimitAccount;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-[#1E293B] via-[#2D3E5D] to-[#1E293B] rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-6 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-400/30">
                <CreditCard className="w-6 h-6 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Master Bank Account Limits & Compliance
              </h1>
            </div>
            <p className="text-slate-300 text-xs max-w-2xl leading-relaxed">
              Real-time monitoring of master bank account thresholds (Default: ₹20 Lakhs per account). Tracks cumulative payouts to prevent crossing regulatory or operational banking limits.
            </p>
          </div>

          {onNavigateToSettings && (
            <button
              onClick={onNavigateToSettings}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-blue-900/30 self-start md:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Manage Master Accounts
            </button>
          )}
        </div>

        {/* Success toast alert */}
        {editSuccessMsg && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-xs text-emerald-300 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            {editSuccessMsg}
          </div>
        )}

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3.5 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Registered Bank Accounts</p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-white">{totalAccounts}</span>
              <span className="text-[10px] text-slate-400 font-medium">{totalMasters} Masters</span>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3.5 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Disbursed Payouts</p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg font-black font-mono text-emerald-400">{formatINR(totalDisbursedOverall)}</span>
            </div>
          </div>

          <div className={`bg-slate-800/80 border rounded-xl p-3.5 backdrop-blur-sm ${totalNearLimitCount > 0 ? 'border-amber-500/50 bg-amber-950/20' : 'border-slate-700/60'}`}>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" /> Approaching Limit (&gt;80%)
            </p>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl font-black ${totalNearLimitCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {totalNearLimitCount}
              </span>
              <span className="text-[10px] text-amber-300/80 font-medium">Near ₹20L Limit</span>
            </div>
          </div>

          <div className={`bg-slate-800/80 border rounded-xl p-3.5 backdrop-blur-sm ${totalExceededCount > 0 ? 'border-rose-500/60 bg-rose-950/30' : 'border-slate-700/60'}`}>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
              <XCircle className="w-3 h-3 text-rose-400" /> Limit Exceeded (&ge;100%)
            </p>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl font-black ${totalExceededCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {totalExceededCount}
              </span>
              <span className="text-[10px] text-rose-300/80 font-bold uppercase">Must Switch Acc</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search master, code, account no, bank..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3" /> Filter:
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Masters ({summaryData.length})
          </button>
          <button
            onClick={() => setStatusFilter('exceeded')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'exceeded'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" /> Exceeded ({summaryData.filter((m) => m.hasExceededAccount).length})
          </button>
          <button
            onClick={() => setStatusFilter('near_limit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'near_limit'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Near Limit ({summaryData.filter((m) => m.hasNearLimitAccount).length})
          </button>
          <button
            onClick={() => setStatusFilter('normal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
              statusFilter === 'normal'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Normal / Safe
          </button>
        </div>
      </div>

      {/* Main Masters Bank Cards Grid */}
      {filteredData.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No matching master accounts found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Try adjusting your search query or status filter to view master bank account details.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredData.map((masterData) => {
            const hasAccounts = masterData.accounts.length > 0;

            return (
              <div
                key={masterData.masterId}
                className={`bg-white rounded-2xl border transition-all shadow-sm overflow-hidden ${
                  masterData.hasExceededAccount
                    ? 'border-rose-300 ring-2 ring-rose-500/20'
                    : masterData.hasNearLimitAccount
                    ? 'border-amber-300 ring-2 ring-amber-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Master Card Header */}
                <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#2D3E5D] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                      {masterData.masterCode}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">{masterData.masterName}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-700 uppercase">
                          {masterData.masterType}
                        </span>
                        {masterData.hasExceededAccount && (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full font-extrabold bg-rose-600 text-white flex items-center gap-1 shadow-sm animate-pulse">
                            <XCircle className="w-3 h-3" /> BANK LIMIT EXCEEDED
                          </span>
                        )}
                        {!masterData.hasExceededAccount && masterData.hasNearLimitAccount && (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full font-extrabold bg-amber-500 text-white flex items-center gap-1 shadow-sm">
                            <AlertTriangle className="w-3 h-3" /> NEAR ₹20L LIMIT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {masterData.accounts.length} Registered Bank Account{masterData.accounts.length === 1 ? '' : 's'} • Total Payout: <strong className="text-slate-700 font-mono">{formatINR(masterData.totalBilledMaster)}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onNavigateToBilling && (
                      <button
                        onClick={() => onNavigateToBilling(masterData.masterId)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-500" /> Go to Billing
                      </button>
                    )}
                  </div>
                </div>

                {/* Bank Accounts Body */}
                <div className="p-4 space-y-4">
                  {!hasAccounts ? (
                    <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-800 font-medium flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>No bank account profiles registered for this stitching master yet.</span>
                      </div>
                      {onNavigateToSettings && (
                        <button
                          onClick={onNavigateToSettings}
                          className="text-xs font-bold text-amber-900 underline hover:text-amber-950 cursor-pointer shrink-0"
                        >
                          Add Bank Account
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {masterData.accounts.map((accInfo: any) => {
                        const acc: MasterPanAccount = accInfo.account;
                        const key = `${masterData.masterId}_${acc.id}`;
                        const isExpanded = expandedAccountKeys.has(key);

                        // Percent formatting
                        const pct = Math.min(100, Math.round(accInfo.percentUsed));

                        let statusBadge = (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Safe ({pct}%)
                          </span>
                        );

                        if (accInfo.isExceeded) {
                          statusBadge = (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-extrabold bg-rose-600 text-white flex items-center gap-1 shadow-sm">
                              <XCircle className="w-3.5 h-3.5 text-white" /> LIMIT EXCEEDED (STOP BILLING)
                            </span>
                          );
                        } else if (accInfo.isNearLimit) {
                          statusBadge = (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" /> Approaching Limit ({pct}%)
                            </span>
                          );
                        }

                        return (
                          <div
                            key={acc.id}
                            className={`p-4 rounded-xl border transition-all ${
                              accInfo.isExceeded
                                ? 'bg-rose-50/50 border-rose-300 ring-1 ring-rose-400'
                                : accInfo.isNearLimit
                                ? 'bg-amber-50/40 border-amber-300'
                                : 'bg-slate-50/50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-bold text-slate-900">
                                    {acc.label || acc.pan_name}
                                  </h4>
                                  {acc.is_default && (
                                    <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">
                                      DEFAULT
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                  PAN Name: <strong className="text-slate-700">{acc.pan_name}</strong> • PAN: <span className="font-mono text-slate-700">{acc.pan_no}</span>
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {statusBadge}
                                <button
                                  onClick={() => handleOpenEditLimit(masterData.masterId, acc)}
                                  title="Edit Limit Amount"
                                  className="p-1 hover:bg-slate-200 text-slate-500 rounded transition cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Bank details grid */}
                            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 text-xs space-y-1 mb-3">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Bank Name:</span>
                                <span className="font-semibold text-slate-800">{acc.bank_name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Account Number:</span>
                                <span className="font-mono font-bold text-blue-900">{acc.account_no}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">IFSC Code:</span>
                                <span className="font-mono text-slate-700">{acc.ifsc_code}</span>
                              </div>
                            </div>

                            {/* Limit Utilization Progress Bar */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-600">Total Billed Payout:</span>
                                <span className={`font-mono ${accInfo.isExceeded ? 'text-rose-600 font-black' : 'text-slate-800'}`}>
                                  {formatINR(accInfo.totalBilled)}
                                </span>
                              </div>

                              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden p-0.5">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    accInfo.isExceeded
                                      ? 'bg-rose-600'
                                      : accInfo.isNearLimit
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>

                              <div className="flex justify-between text-[11px] text-slate-500 font-medium pt-0.5">
                                <span>Limit: <strong className="text-slate-700 font-mono">{formatINR(accInfo.limitAmount)}</strong></span>
                                <span>
                                  Remaining:{' '}
                                  <strong className={`font-mono ${accInfo.isExceeded ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    {formatINR(accInfo.remainingLimit)}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            {/* Exceeded Warning Box */}
                            {accInfo.isExceeded && (
                              <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-950 font-bold flex items-start gap-2">
                                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div>
                                  <p className="leading-snug">
                                    Limit of {formatINR(accInfo.limitAmount)} has been reached for Account {acc.account_no}!
                                  </p>
                                  <p className="text-[10px] font-normal text-rose-800 mt-0.5">
                                    Do not issue further payments to this bank account. Select another active account or register a new account profile for {masterData.masterName}.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Invoice breakdown toggle */}
                            {accInfo.invoices.length > 0 && (
                              <div className="mt-3 border-t border-slate-200/80 pt-2">
                                <button
                                  onClick={() => toggleExpand(key)}
                                  className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center justify-between w-full cursor-pointer"
                                >
                                  <span>
                                    {isExpanded ? 'Hide' : 'View'} Billed Invoices ({accInfo.invoices.length})
                                  </span>
                                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-mono">
                                    {isExpanded ? '▲' : '▼'}
                                  </span>
                                </button>

                                {isExpanded && (
                                  <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {accInfo.invoices.map((inv: Invoice) => (
                                      <div
                                        key={inv.id}
                                        className="p-2 bg-white rounded border border-slate-200 text-[11px] flex justify-between items-center"
                                      >
                                        <div>
                                          <span className="font-bold text-slate-800">{inv.invoice_no}</span>
                                          <span className="text-slate-400 ml-2">
                                            {formatDate(inv.created_at.split('T')[0])}
                                          </span>
                                        </div>
                                        <span className="font-mono font-bold text-slate-700">
                                          {formatINR(inv.net_payable !== undefined ? inv.net_payable : (inv.grand_total || 0))}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Limit Modal */}
      {editingAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                Edit Bank Account Limit
              </h3>
              <button
                onClick={() => setEditingAccount(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLimit} className="space-y-4">
              <div>
                <p className="text-xs text-slate-500">
                  Account: <strong className="text-slate-800">{editingAccount.label}</strong> ({editingAccount.accountNo})
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Threshold Limit Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="50000"
                    min="100000"
                    required
                    value={newLimitInput}
                    onChange={(e) => setNewLimitInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Default limit is 20 Lakhs (₹2,000,000). You can adjust custom limit thresholds per account.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-md shadow-blue-600/30"
                >
                  Save New Limit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
