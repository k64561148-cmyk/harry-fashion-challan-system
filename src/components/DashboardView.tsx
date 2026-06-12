/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Challan, Invoice, Material, ChallanItem } from '../types';
import { formatINR, generateChallanPDF } from '../utils/exportUtils';
import { 
  FileText, 
  TrendingUp, 
  AlertTriangle, 
  Layers, 
  ArrowRight, 
  PlusCircle, 
  Truck, 
  Receipt,
  UserCheck,
  Printer,
  Download,
  Search,
  Trash2,
  Ban,
  Edit,
  X,
  Plus,
  Minus,
  Check,
  AlertCircle
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [todayChallans, setTodayChallans] = useState<Challan[]>([]);
  const [thisMonthMaterialValue, setThisMonthMaterialValue] = useState<number>(0);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState<number>(0);
  const [lowStockAlerts, setLowStockAlerts] = useState<Material[]>([]);
  const [recentChallans, setRecentChallans] = useState<Challan[]>([]);
  const currentUser = db.getCurrentUser();

  // Search, filter, and view toggles
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'billed' | 'voided'>('all');
  const [showAll, setShowAll] = useState(false);

  // Administrative actions feedback and state
  const [alertMsg, setAlertMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Modals state
  const [editingChallan, setEditingChallan] = useState<Challan | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editItems, setEditItems] = useState<{ material_id: string; qty: number; rate: number }[]>([]);

  const [voidingChallan, setVoidingChallan] = useState<Challan | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const loadDashboardData = () => {
    // 1. Fetch Today's Challans
    const todayStr = new Date().toISOString().split('T')[0];
    const challans = db.getChallans();
    const todayList = challans.filter(c => c.issued_date === todayStr && c.status !== 'voided');
    setTodayChallans(todayList);

    // 2. This Month's Issued Materials Total Value
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const items = db.getChallanItems();
    
    let totalVal = 0;
    challans.forEach(c => {
      if (c.status !== 'voided') {
        const cDate = new Date(c.issued_date);
        if (cDate.getFullYear() === currentYear && (cDate.getMonth() + 1) === currentMonth) {
          const cItems = items.filter(item => item.challan_id === c.id);
          const sum = cItems.reduce((acc, curr) => acc + curr.amount, 0);
          totalVal += sum;
        }
      }
    });
    setThisMonthMaterialValue(totalVal);

    // 3. Pending Invoices (Draft Status)
    const invoices = db.getInvoices();
    const pendingList = invoices.filter(inv => inv.status === 'draft');
    setPendingInvoicesCount(pendingList.length);

    // 4. Low Stock Alerts (Stock < 15)
    const materialsList = db.getMaterials();
    const alerts = materialsList.filter(m => m.is_active && m.current_stock < 15);
    setLowStockAlerts(alerts);

    // 5. Recent Challans
    // Sort challans chronologically desc, so fresh ones appear first
    const sortedChallans = [...challans].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRecentChallans(sortedChallans);
  };

  useEffect(() => {
    loadDashboardData();
    window.addEventListener('db_sync', loadDashboardData);
    return () => window.removeEventListener('db_sync', loadDashboardData);
  }, []);

  const getMasterName = (masterId: string): string => {
    const masters = db.getMasters();
    return masters.find(m => m.id === masterId)?.name || 'Unknown Master';
  };

  const handleDownloadChallan = async (c: Challan) => {
    try {
      const masters = db.getMasters();
      const materials = db.getMaterials();
      const masterObj = masters.find(m => m.id === c.master_id);
      if (!masterObj) return;
      const items = db.getChallanItems(c.id);
      await generateChallanPDF(c, items, masterObj, materials, true, false);
    } catch (e) {
      console.error('Failed to trigger download', e);
    }
  };

  const handlePrintChallan = async (c: Challan) => {
    try {
      const masters = db.getMasters();
      const materials = db.getMaterials();
      const masterObj = masters.find(m => m.id === c.master_id);
      if (!masterObj) return;
      const items = db.getChallanItems(c.id);
      await generateChallanPDF(c, items, masterObj, materials, false, true);
    } catch (e) {
      console.error('Failed to print challan', e);
    }
  };

  // Administrative triggers
  const triggerDelete = (c: Challan) => {
    const masterName = getMasterName(c.master_id);
    const confirmDelete = window.confirm(
      `PERMANENTLY DELETE CHALLAN?\n\nChallan Number: ${c.challan_no}\nMaster Maker: ${masterName}\n\nWarning: This action will completely purge the challan document and items from Firestore/IndexedDB. Stocks are not automatically restored. This operation is non-reversible.`
    );
    if (confirmDelete) {
      try {
        db.permanentlyDeleteChallan(c.id);
        setAlertMsg({ text: `Challan ${c.challan_no} permanently purged successfully.` });
        loadDashboardData();
      } catch (err: any) {
        setAlertMsg({ text: err.message || 'Purge action failed', isError: true });
      }
    }
  };

  const triggerVoid = (c: Challan) => {
    setVoidingChallan(c);
    setVoidReason('');
  };

  const handleConfirmVoid = async () => {
    if (!voidingChallan) return;
    if (!voidReason.trim()) {
      alert('Please explain the reason for voiding this challan.');
      return;
    }
    try {
      db.voidAndReverseChallan(voidingChallan.id, voidReason.trim());
      
      // Regenerate the PDF now marked with a watermarked 'VOIDED' status
      const updatedChallan = db.getChallans().find(c => c.id === voidingChallan.id)!;
      const masterObj = db.getMasters().find(m => m.id === updatedChallan.master_id)!;
      const materialsList = db.getMaterials();
      const items = db.getChallanItems(updatedChallan.id);
      
      // Save/Print automatically using our custom local structure + upload voided PDF
      await generateChallanPDF(updatedChallan, items, masterObj, materialsList, true, false);

      setAlertMsg({ text: `Challan ${voidingChallan.challan_no} voided, stocks restored, work reversed, and updated PDF stored.` });
      setVoidingChallan(null);
      loadDashboardData();
    } catch (err: any) {
      alert(err.message || 'Void operation failed.');
    }
  };

  const triggerEdit = (c: Challan) => {
    setEditingChallan(c);
    setEditNotes(c.notes || '');
    setEditReason('');
    
    // Populating line items
    const rawItems = db.getChallanItems(c.id);
    const mapped = rawItems.map(item => ({
      material_id: item.material_id,
      qty: item.qty,
      rate: item.rate
    }));
    setEditItems(mapped);
  };

  const handleAddEditItem = () => {
    const materials = db.getMaterials();
    if (materials.length > 0) {
      setEditItems([...editItems, { material_id: materials[0].id, qty: 1, rate: materials[0].default_rate }]);
    }
  };

  const handleRemoveEditItem = (index: number) => {
    const updated = [...editItems];
    updated.splice(index, 1);
    setEditItems(updated);
  };

  const handleEditItemChange = (index: number, key: 'material_id' | 'qty' | 'rate', value: any) => {
    const updated = [...editItems];
    updated[index] = { ...updated[index], [key]: value };
    
    if (key === 'material_id') {
      const mat = db.getMaterials().find(m => m.id === value);
      if (mat) {
        const override = db.getMasterRateOverrides().find(
          o => o.master_id === editingChallan?.master_id && o.material_id === value
        );
        updated[index].rate = override ? override.rate : mat.default_rate;
      }
    }
    setEditItems(updated);
  };

  const handleConfirmEdit = async () => {
    if (!editingChallan) return;
    if (!editReason.trim()) {
      alert('Please explain the reason for editing this challan.');
      return;
    }
    if (editItems.length === 0) {
      alert('Must configure at least one material line item.');
      return;
    }
    const hasInvalidRows = editItems.some(i => !i.material_id || i.qty <= 0 || i.rate < 0);
    if (hasInvalidRows) {
      alert('Please configure non-negative quantities and rates on all lines.');
      return;
    }

    try {
      db.editChallan(editingChallan.id, editItems, editNotes, editReason.trim());

      // Regenerate PDF with updated values automatically
      const updatedChallan = db.getChallans().find(c => c.id === editingChallan.id)!;
      const masterObj = db.getMasters().find(m => m.id === updatedChallan.master_id)!;
      const materialsList = db.getMaterials();
      const items = db.getChallanItems(updatedChallan.id);
      
      await generateChallanPDF(updatedChallan, items, masterObj, materialsList, true, false);

      setAlertMsg({ text: `Challan ${editingChallan.challan_no} edited, stocks reallocated, and updated PDF successfully saved.` });
      setEditingChallan(null);
      loadDashboardData();
    } catch (err: any) {
      alert(err.message || 'Edit operation failed.');
    }
  };

  // Perform search & filters on challans collection
  const filteredChallans = recentChallans.filter(c => {
    const mName = getMasterName(c.master_id);
    const matchesSearch = c.challan_no.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          mName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const displayedChallans = showAll ? filteredChallans : filteredChallans.slice(0, 5);

  return (
    <div className="space-y-6" id="dashboard-tab">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1A2E4A] to-[#2D3E5D] rounded-xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Harry Fashion</h2>
            <p className="text-slate-200 text-sm mt-1">
              Garment Manufacturing Jobwork & Material Management Portal • Mumbai Office
            </p>
          </div>
          <div className="flex items-center gap-3 bg-[#14233a]/50 px-4 py-2 rounded-lg border border-[#2D3E5D]">
            <UserCheck className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-xs text-slate-350 font-medium">Logged in as:</p>
              <p className="text-sm font-semibold">{currentUser.name} ({currentUser.role.replace('_', ' ')})</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Today's Challans issued */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-[#1A2E4A] rounded-lg">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider font-sans uppercase">TODAY'S CHALLANS</p>
            <h3 className="text-2xl font-bold text-[#1A2E4A] mt-1">{todayChallans.length}</h3>
            <p className="text-[10px] text-blue-600 font-medium mt-1">issued today</p>
          </div>
        </div>

        {/* Issued Material Value */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-slate-100 text-[#2D3E5D] rounded-lg">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider font-sans uppercase">MONTHLY MATERIAL ISSUED</p>
            <h3 className="text-2xl font-bold text-[#1A2E4A] mt-1">{formatINR(thisMonthMaterialValue)}</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-1">this billing cycle</p>
          </div>
        </div>

        {/* Pending Invoices */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-700 rounded-lg">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider font-sans uppercase">PENDING BILLING INVOICES</p>
            <h3 className="text-2xl font-bold text-[#1A2E4A] mt-1">{pendingInvoicesCount}</h3>
            <p className="text-[10px] text-green-600 font-medium mt-1">draft states waiting</p>
          </div>
        </div>

        {/* Low Stock count */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className={`p-3 rounded-lg ${lowStockAlerts.length > 0 ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-slate-50 text-slate-550'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider font-sans uppercase">CRITICAL LOW STOCK ITEMS</p>
            <h3 className="text-2xl font-bold text-[#1A2E4A] mt-1">{lowStockAlerts.length}</h3>
            <p className="text-[10px] text-rose-600 font-medium mt-1">below safe margin (&lt;15)</p>
          </div>
        </div>

      </div>

      {/* Main Grid: Low stock alerts and recent list */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Actions and Low stock items */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Quick Shortcuts */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-xs font-bold text-[#1A2E4A] tracking-wider mb-4 uppercase">QUICK SYSTEM OPERATIONS</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              
              <button 
                onClick={() => onNavigate('issue_challan')}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-700 transition group text-center cursor-pointer"
              >
                <PlusCircle className="w-6 h-6 text-[#1A2E4A] mb-2 group-hover:scale-110 transition" />
                <span className="text-xs font-bold">Issue Challan</span>
                <span className="text-[10px] text-slate-400 mt-1">Material Dispensation</span>
              </button>

              <button 
                onClick={() => onNavigate('inward_entry')}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-700 transition group text-center cursor-pointer"
              >
                <Truck className="w-6 h-6 text-green-600 mb-2 group-hover:scale-110 transition" />
                <span className="text-xs font-bold">Inward Entry</span>
                <span className="text-[10px] text-slate-400 mt-1">Stock Replenishment</span>
              </button>

              <button 
                onClick={() => onNavigate('billing')}
                disabled={currentUser.role === 'issue_dept'}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-700 transition group text-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                <Receipt className="w-6 h-6 text-[#2D3E5D] mb-2 group-hover:scale-110 transition" />
                <span className="text-xs font-bold">Billing Module</span>
                <span className="text-[10px] text-slate-400 mt-1">Stitching Settlements</span>
              </button>

            </div>
          </div>

          {/* Feedback messages */}
          {alertMsg && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-2.5 items-start">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs font-semibold text-blue-800">
                {alertMsg.text}
              </div>
              <button onClick={() => setAlertMsg(null)} className="ml-auto text-blue-500 hover:text-blue-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Recent Challans List */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h4 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">MATERIAL ISSUED CHALLANS REPOSITORY</h4>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs text-[#2D3E5D] hover:text-[#1A2E4A] font-bold flex items-center gap-1 cursor-pointer transition border border-slate-200 py-1 px-2.5 rounded-lg hover:bg-slate-50"
                >
                  {showAll ? 'Show Recent 5' : 'View All Challans'}
                </button>
              </div>
            </div>

            {/* Filter Sub-toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input 
                  type="text"
                  placeholder="Query Challan reference # or Master Stitcher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 font-medium text-slate-800 outline-none focus:border-slate-350"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="text-xs bg-white border border-slate-200 rounded-lg py-1 px-2.5 font-bold text-slate-700 outline-none cursor-pointer focus:border-slate-300"
                >
                  <option value="all">ALL STATUSES</option>
                  <option value="issued">ISSUED</option>
                  <option value="billed">BILLED (SETTLED)</option>
                  <option value="voided">VOIDED (REVERSED)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-450 font-bold bg-slate-50/50">
                    <th className="py-2.5 px-3">CHALLAN NO</th>
                    <th className="py-2.5 px-3">MASTER NAME</th>
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">ISSUED BY</th>
                    <th className="py-2.5 px-3 text-right">STATUS</th>
                    <th className="py-2.5 px-3 text-right" style={{ minWidth: '150px' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedChallans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                        No matches found. Select correct status or expand the query.
                      </td>
                    </tr>
                  ) : (
                    displayedChallans.map((c) => {
                      const isVoided = c.status === 'voided';
                      return (
                        <tr key={c.id} className={`hover:bg-slate-50 text-slate-700 transition ${isVoided ? 'bg-red-50/15 line-through decoration-red-500/80 decoration-1 text-slate-400' : ''}`}>
                          <td className="py-3 px-3 font-semibold text-slate-900">{c.challan_no}</td>
                          <td className="py-3 px-3 font-medium">{getMasterName(c.master_id)}</td>
                          <td className="py-3 px-3 font-mono text-[10.5px] text-slate-500">{c.issued_date.split('-').reverse().join('/')}</td>
                          <td className="py-3 px-3 text-slate-500">{c.issued_by}</td>
                          <td className="py-3 px-3 text-right">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                              c.status === 'issued' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                              c.status === 'voided' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 
                              'bg-green-50 text-green-700 border border-green-100'
                            }`}>
                              {c.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {/* View / Download Actions */}
                              <button
                                onClick={() => handlePrintChallan(c)}
                                title="Direct Print"
                                className="p-1 hover:bg-[#1A2E4A]/10 text-[#1A2E4A] rounded transition cursor-pointer flex items-center justify-center"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDownloadChallan(c)}
                                title="Download PDF"
                                className="p-1 hover:bg-slate-200 text-slate-600 rounded transition cursor-pointer flex items-center justify-center"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              {/* Admin Exclusive Controls */}
                              {currentUser.role === 'admin' && (
                                <>
                                  {c.status === 'issued' && (
                                    <>
                                      <button
                                        onClick={() => triggerEdit(c)}
                                        title="Edit items in Challan"
                                        className="p-1 hover:bg-blue-50 text-blue-600 border border-transparent hover:border-blue-200 rounded transition cursor-pointer flex items-center justify-center"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => triggerVoid(c)}
                                        title="Void & Reverse Challan stocks"
                                        className="p-1 hover:bg-amber-50 text-amber-600 border border-transparent hover:border-amber-200 rounded transition cursor-pointer flex items-center justify-center"
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => triggerDelete(c)}
                                    title="Permanently Delete Challan Document"
                                    className="p-1 hover:bg-rose-50 text-rose-600 border border-transparent hover:border-rose-200 rounded transition cursor-pointer flex items-center justify-center"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
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

        {/* Right Side: Stock Alert Indicators */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
              <Layers className="w-5 h-5 text-[#1A2E4A]" />
              <h4 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">MATERIAL STOCK ROOM</h4>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 max-h-[420px] pr-1">
              {lowStockAlerts.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs font-medium">
                  All materials have healthy stock levels. Beautiful!
                </div>
              ) : (
                lowStockAlerts.map(m => {
                  const percent = Math.min(100, (m.current_stock / 15) * 100);
                  return (
                    <div key={m.id} className="p-3 bg-rose-50/50 rounded-lg border border-rose-100/40">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{m.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Standard Rate: ₹{m.default_rate}</p>
                        </div>
                        <span className="text-xs font-bold text-rose-600 font-mono">
                          {m.current_stock.toFixed(1)} {m.unit}
                        </span>
                      </div>
                      
                      {/* stock level micro-progress */}
                      <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div 
                          className="bg-rose-500 h-1.5 rounded-full" 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button 
              onClick={() => onNavigate('inward_entry')}
              className="mt-4 w-full bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-xs py-2.5 px-3 rounded-lg font-bold flex items-center justify-center gap-1 cursor-pointer transition shadow-xs"
            >
              <Truck className="w-4 h-4" /> Go to Stock Inward Entry
            </button>
          </div>
        </div>

      </div>

      {/* --- VOID REASON DIALOG MODAL --- */}
      {voidingChallan && (
        <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-100 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-amber-600" />
                <h3 className="text-xs font-bold text-amber-900 tracking-wider uppercase">VOID & REVERSE MATERIAL CHALLAN</h3>
              </div>
              <button 
                onClick={() => setVoidingChallan(null)} 
                className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="text-xs font-semibold text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p>Challan reference: <span className="font-bold text-slate-900">{voidingChallan.challan_no}</span></p>
                <p>Stitching Master: <span className="font-bold text-slate-900">{getMasterName(voidingChallan.master_id)}</span></p>
                <p>Issue Date: <span className="font-bold text-slate-900">{voidingChallan.issued_date.split('-').reverse().join('/')}</span></p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Explain cancellation reason *
                </label>
                <textarea
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g., Fabric issue, Incorrect tailor assigned, Master order cancelled..."
                  className="w-full text-xs bg-white border border-slate-200 p-2.5 rounded-lg font-medium text-slate-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
                <p className="text-[10px] text-amber-700 font-bold mt-1.5 leading-relaxed">
                  Notice: Reversing matches and increases material storeroom counts immediately. A VOIDED watermark occurs permanently on the regenerated PDF file.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 flex gap-2 justify-end border-t border-slate-200/50">
              <button
                onClick={() => setVoidingChallan(null)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 transition py-2 px-3.5 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVoid}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition py-2 px-4.5 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Void Challan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT CHALLAN DIALOG MODAL --- */}
      {editingChallan && (
        <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-2xl w-full my-8">
            <div className="bg-blue-50 border-b border-blue-100 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                <h3 className="text-xs font-bold text-blue-900 tracking-wider uppercase">RE-EDIT MATERIAL ISSUE CHALLAN ITEMS</h3>
              </div>
              <button 
                onClick={() => setEditingChallan(null)} 
                className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[64vh] overflow-y-auto">
              {/* Header labels */}
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <p>Challan reference: <span className="font-bold text-slate-900">{editingChallan.challan_no}</span></p>
                  <p>Issue Date: <span className="font-bold text-slate-900">{editingChallan.issued_date.split('-').reverse().join('/')}</span></p>
                </div>
                <div>
                  <p>Master Stitcher: <span className="font-bold text-slate-950">{getMasterName(editingChallan.master_id)}</span></p>
                  <p>Restricted Fields: <span className="text-slate-400 font-normal">No name, code, or date edits.</span></p>
                </div>
              </div>

              {/* Line Items Edits list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DISPENSED MATERIALS LIST</h5>
                  <button
                    onClick={handleAddEditItem}
                    className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold flex items-center gap-1 border border-blue-200 py-1 px-2 rounded cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Item Line
                  </button>
                </div>

                {editItems.map((item, idx) => (
                  <div key={idx} className="flex gap-3 items-center border-b border-slate-100 pb-2.5">
                    <div className="flex-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Material</label>
                      <select
                        value={item.material_id}
                        onChange={(e) => handleEditItemChange(idx, 'material_id', e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 py-1.5 px-2 rounded-lg font-semibold text-slate-700 outline-none"
                      >
                        {db.getMaterials().filter(m => m.is_active).map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                        ))}
                      </select>
                    </div>

                    <div className="w-24">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Issue Qty</label>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        value={item.qty}
                        onChange={(e) => handleEditItemChange(idx, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-full text-xs text-right bg-white border border-slate-200 py-1.5 px-2 rounded-lg font-bold"
                      />
                    </div>

                    <div className="w-28">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Item Rate (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.rate}
                        onChange={(e) => handleEditItemChange(idx, 'rate', parseFloat(e.target.value) || 0)}
                        className="w-full text-xs text-right bg-white border border-slate-200 py-1.5 px-2 rounded-lg font-bold text-[#1A2E4A]"
                      />
                    </div>

                    <div className="w-24 text-right">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Value (₹)</label>
                      <span className="block text-xs font-bold text-slate-800 pt-1.5 font-mono">
                        {(item.qty * item.rate).toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleRemoveEditItem(idx)}
                      disabled={editItems.length <= 1}
                      className="text-rose-500 hover:text-rose-800 disabled:opacity-30 pt-4 cursor-pointer"
                    >
                      <Minus className="w-4 h-4 border border-rose-100 rounded p-0.5 hover:bg-rose-50" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Edit Reason and Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Edit/Correction Reason *
                  </label>
                  <textarea
                    rows={2}
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Provide correction reason (e.g. quantity adjustment, corrected rate error)..."
                    className="w-full text-xs bg-white border border-slate-200 p-2 rounded-lg font-medium outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    General Challan Notes
                  </label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="General description / remarks..."
                    className="w-full text-xs bg-white border border-slate-200 p-2 rounded-lg font-medium outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <p className="text-[10px] text-blue-700 font-bold leading-relaxed bg-blue-50 py-2 px-3 rounded-lg">
                Important: Saving this file reconciles stock rooms instantly by adding back previous quantities and deducting newly allocated ones. The PDF is regenerated under the same path in your local folders and cloud storage.
              </p>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 flex gap-2 justify-end border-t border-slate-200/50">
              <button
                onClick={() => setEditingChallan(null)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 transition py-2 px-3.5 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEdit}
                className="text-xs font-bold bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white transition py-2 px-4.5 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Save Corrections
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardView;
