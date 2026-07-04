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
  AlertCircle,
  Lock,
  ShieldCheck,
  ChevronDown,
  History
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
  const isKunalUser = 
    currentUser?.email?.toLowerCase().includes('kunal') || 
    currentUser?.email?.toLowerCase() === 'k64561148@gmail.com' ||
    currentUser?.name?.toLowerCase().includes('kunal') || 
    currentUser?.displayName?.toLowerCase().includes('kunal') ||
    (currentUser as any)?.username?.toLowerCase().includes('kunal');

  // Stock correction states
  const [negativeStockMaterials, setNegativeStockMaterials] = useState<Material[]>([]);
  const [selectedMaterialToCorrect, setSelectedMaterialToCorrect] = useState<string>('');
  const [correctedValue, setCorrectedValue] = useState<number>(0);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

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
  const [expandedChallans, setExpandedChallans] = useState<Record<string, boolean>>({});

  const [voidingChallan, setVoidingChallan] = useState<Challan | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Post-billing adjustment states (Requirement 8)
  const [adjustingChallan, setAdjustingChallan] = useState<Challan | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustRefNo, setAdjustRefNo] = useState('');
  const [adjustError, setAdjustError] = useState('');
  const [adjustSuccess, setAdjustSuccess] = useState('');

  const loadDashboardData = () => {
    // 1. Fetch Today's Challans
    const todayStr = new Date().toISOString().split('T')[0];
    const challans = db.getChallans();
    const todayList = challans.filter(c => c.issued_date === todayStr && c.status !== 'voided');
    setTodayChallans(todayList);

    // 2. This Month's Issued Materials Total Value from central normalized transactions list
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentMonthStr = String(currentMonth).padStart(2, '0');
    const monthPattern = `${currentYear}-${currentMonthStr}`;
    const allTransactions = db.getTransactions();

    const totalVal = allTransactions
      .filter(tx => tx.type === 'MATERIAL_ISSUE' && tx.date.startsWith(monthPattern))
      .reduce((acc, curr) => acc + curr.amount, 0);

    setThisMonthMaterialValue(totalVal);

    // 3. Pending Invoices (Draft Status) from central normalized transactions list
    const pendingList = allTransactions.filter(tx => tx.type === 'BILL_DRAFT');
    setPendingInvoicesCount(pendingList.length);

    // 4. Low Stock Alerts (Stock < 15)
    const materialsList = db.getMaterials();
    const alerts = materialsList.filter(m => m.is_active && m.current_stock < 15);
    setLowStockAlerts(alerts);

    // 4b. Find and track existing negative stock items
    const negatives = materialsList.filter(m => m.current_stock < 0);
    setNegativeStockMaterials(negatives);
    if (negatives.length > 0) {
      setSelectedMaterialToCorrect(prev => {
        const stillInNegatives = negatives.some(n => n.id === prev);
        return stillInNegatives ? prev : negatives[0].id;
      });
    }

    // 5. Recent Challans
    // Sort challans chronologically desc, so fresh ones appear first
    const sortedChallans = [...challans].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRecentChallans(sortedChallans);
  };

  const handleApplyCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    setCorrectionError(null);

    if (!selectedMaterialToCorrect) {
      setCorrectionError("Please select a material to correct.");
      return;
    }
    if (correctedValue < 0) {
      setCorrectionError("Corrected stock level must be non-negative (0 or higher).");
      return;
    }
    if (!correctionReason.trim()) {
      setCorrectionError("Please describe a valid reason or error explanation for this correction.");
      return;
    }

    try {
      db.saveStockCorrection(selectedMaterialToCorrect, correctedValue, correctionReason.trim());
      setCorrectionReason('');
      setCorrectedValue(0);
      setAlertMsg({ text: "Stock correction saved successfully. Material counts and audit logs consolidated." });
      loadDashboardData();
    } catch (err: any) {
      setCorrectionError(err.message || "Failed to submit correction.");
    }
  };

  useEffect(() => {
    loadDashboardData();
    window.addEventListener('db_sync', loadDashboardData);
    return () => window.removeEventListener('db_sync', loadDashboardData);
  }, []);

  const getMasterName = (masterId: string, challan?: Challan): string => {
    const masters = db.getMasters();
    const c = challan || db.getChallans().find(ch => ch.id === masterId || ch.master_id === masterId);
    if (c) {
      if (c.masterSnapshot?.name) return c.masterSnapshot.name;
      if (c.masterDisplayName) return c.masterDisplayName;
      if (c.masterName) return c.masterName;
    }
    const foundMaster = masters.find(m => m.id === masterId);
    if (foundMaster) {
      return foundMaster.name;
    }
    if (db.isCloudSyncEnabled && masters.length === 0) {
      return "Loading master...";
    }
    return 'Unknown Master';
  };

  const handleDownloadChallan = async (c: Challan) => {
    setAlertMsg({ text: `Compiling PDF binary for Challan ${c.challan_no}... Please wait.` });
    try {
      const masters = db.getMasters();
      const materials = db.getMaterials();
      const masterObj = masters.find(m => m.id === c.master_id);
      if (!masterObj) {
        setAlertMsg({ text: 'Error: Stitching Master not set on challan.', isError: true });
        return;
      }
      const items = db.getChallanItems(c.id);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF download timed out (15 seconds limit). Please check your browser connection.')), 15000)
      );

      await Promise.race([
        generateChallanPDF(c, items, masterObj, materials, true, false),
        timeoutPromise
      ]);

      setAlertMsg({ text: `Challan ${c.challan_no} successfully downloaded as structured PDF.` });
    } catch (e: any) {
      console.error('Failed to trigger download', e);
      setAlertMsg({ text: `Failed to compile PDF for Challan ${c.challan_no}: ${e.message || e}`, isError: true });
    }
  };

  const handlePrintChallan = async (c: Challan) => {
    setAlertMsg({ text: `Compiling print preview layout for Challan ${c.challan_no}... Please wait.` });
    try {
      const masters = db.getMasters();
      const materials = db.getMaterials();
      const masterObj = masters.find(m => m.id === c.master_id);
      if (!masterObj) {
        setAlertMsg({ text: 'Error: Stitching Master not set on challan.', isError: true });
        return;
      }
      const items = db.getChallanItems(c.id);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Print layout generation timed out (15 seconds limit). Please try again.')), 15000)
      );

      await Promise.race([
        generateChallanPDF(c, items, masterObj, materials, false, true),
        timeoutPromise
      ]);

      setAlertMsg({ text: `Challan ${c.challan_no} ready in browser print queue.` });
    } catch (e: any) {
      console.error('Failed to print challan', e);
      setAlertMsg({ text: `Failed to print Challan ${c.challan_no}: ${e.message || e}`, isError: true });
    }
  };

  // Administrative triggers
  const triggerDelete = (c: Challan) => {
    const masterName = getMasterName(c.master_id, c);
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
    // Filter out completely empty/unselected material rows to prevent issues
    const validEditItems = editItems.filter(i => i.material_id && i.material_id !== '');
    if (validEditItems.length === 0) {
      alert('Must configure at least one material line item.');
      return;
    }
    const hasInvalidRows = validEditItems.some(i => i.qty < 0 || i.rate < 0);
    if (hasInvalidRows) {
      alert('Please configure non-negative quantities and rates on all lines.');
      return;
    }

    try {
      db.editChallan(editingChallan.id, validEditItems, editNotes, editReason.trim());

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

  const triggerBilledAdjustment = (ch: Challan) => {
    setAdjustingChallan(ch);
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustRefNo(`CN-${ch.challan_no}-${Math.floor(1000 + Math.random() * 9000)}`);
    setAdjustError('');
    setAdjustSuccess('');
  };

  const handleConfirmAdjustment = () => {
    setAdjustError('');
    setAdjustSuccess('');

    if (!adjustingChallan) return;
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt <= 0) {
      setAdjustError('Please specify a valid credit / adjustment amount greater than ₹0.');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('Please specify a clear justification for this adjustment / credit note.');
      return;
    }
    if (!adjustRefNo.trim()) {
      setAdjustError('Reference voucher or Credit Note number is mandatory.');
      return;
    }

    try {
      db.adjustBilledChallan(adjustingChallan.id, amt, adjustRefNo.trim(), adjustReason.trim());

      setAdjustSuccess(`Credit Note & Adjustment of ₹${amt} successfully registered with full security logs!`);
      setTimeout(() => {
        setAdjustingChallan(null);
        loadDashboardData();
        // Emit trigger sync event
        window.dispatchEvent(new Event('db_sync'));
      }, 2000);
    } catch (err: any) {
      setAdjustError(err?.message || 'Error occurred while saving ledger adjustment.');
    }
  };

  // Perform search & filters on challans collection
  const filteredChallans = recentChallans.filter(c => {
    const mName = getMasterName(c.master_id, c);
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

      {/* Stock Correction Needed Panel removed as per user request */}

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
        
        {/* Left Side: Actions and Low stock items (now spans full-width) */}
        <div className="lg:col-span-12 space-y-6">
          
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
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-700 transition group text-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer hover:border-[#2D3E5D]/30"
              >
                <Receipt className="w-6 h-6 text-[#2D3E5D] mb-2 group-hover:scale-110 transition" />
                <span className="text-xs font-bold">Billing Module</span>
                <span className="text-[10px] text-slate-400 mt-1">Stitching Settlements</span>
              </button>

              <button 
                onClick={() => onNavigate('checklist')}
                disabled={currentUser.role === 'issue_dept'}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-700 transition group text-center disabled:opacity-50 disabled:pointer-events-none cursor-pointer hover:border-emerald-300"
              >
                <ShieldCheck className="w-6 h-6 text-emerald-650 mb-2 group-hover:scale-110 transition" />
                <span className="text-xs font-bold">Go-Live System</span>
                <span className="text-[10px] text-slate-400 mt-1">Operational Diagnostics</span>
              </button>

            </div>
          </div>

          {/* Feedback messages */}
          {alertMsg && (
            <div className={`border rounded-xl p-4 flex gap-2.5 items-start ${alertMsg.isError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
              <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alertMsg.isError ? 'text-rose-600' : 'text-blue-600'}`} />
              <div className="text-xs font-semibold">
                {alertMsg.text}
              </div>
              <button onClick={() => setAlertMsg(null)} className={`ml-auto cursor-pointer transition ${alertMsg.isError ? 'text-rose-500 hover:text-rose-800' : 'text-blue-500 hover:text-blue-800'}`}>
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
                      const isExpanded = !!expandedChallans[c.id];
                      return (
                        <React.Fragment key={c.id}>
                          <tr className={`hover:bg-slate-50 text-slate-700 transition ${isVoided ? 'bg-red-50/15 line-through decoration-red-500/80 decoration-1 text-slate-400' : ''}`}>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <span>{c.challan_no}</span>
                                {c.lastEditedAt && (
                                  <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-amber-200">
                                    EDITED
                                  </span>
                                )}
                              </div>
                              {c.lastEditedAt && (
                                <div className="text-[10px] text-slate-550 mt-1 font-medium leading-tight">
                                  <div>Edited by: <span className="font-bold">{c.lastEditedBy}</span></div>
                                  <div className="text-slate-400">At: {new Date(c.lastEditedAt).toLocaleString('en-IN')}</div>
                                </div>
                              )}
                              {c.lastEditedAt && c.editReason && (
                                <div className="mt-1.5 text-[10.5px] bg-amber-50/80 border border-amber-100 text-amber-900 p-1.5 px-2 rounded font-medium max-w-[220px] break-words">
                                  <span className="font-bold text-amber-950">Reason:</span> "{c.editReason}"
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 font-medium">{getMasterName(c.master_id, c)}</td>
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
                                {/* Expand / Collapse Toggle */}
                                <button
                                  onClick={() => {
                                    setExpandedChallans(prev => ({
                                      ...prev,
                                      [c.id]: !prev[c.id]
                                    }));
                                  }}
                                  title={isExpanded ? "Collapse Details" : "View Latest Items & Version History"}
                                  className={`p-1 rounded transition cursor-pointer flex items-center justify-center ${
                                    isExpanded ? 'bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white border border-[#1A2E4A]' : 'hover:bg-slate-200 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  <ChevronDown className={`w-3.5 h-3.5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>

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
                                    {c.status === 'billed' ? (
                                      <div 
                                        className="flex items-center gap-1 text-[10px] text-slate-450 bg-slate-50 border border-slate-150 rounded px-1.5 py-0.5 select-none"
                                        title={c.billedInvoiceId ? `Billed under Invoice ID ${c.billedInvoiceId} on ${c.billedAt ? new Date(c.billedAt).toLocaleDateString() : 'unknown'} by ${c.billedBy || 'unknown'}` : 'Locked: Billed'}
                                      >
                                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                                        <span>BILLED LINK</span>
                                      </div>
                                    ) : (
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
                                        {c.status === 'voided' && isKunalUser && (
                                          <button
                                            onClick={() => triggerDelete(c)}
                                            title="[Developer Only] Permanently Purge Voided Challan Record"
                                            className="p-1 hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 rounded transition cursor-pointer flex items-center justify-center px-1.5"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-bold ml-1 hidden lg:inline">PURGE RECORD</span>
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/40">
                              <td colSpan={6} className="p-4">
                                <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-4 text-xs">
                                  {/* Section 1: Latest Items Panel */}
                                  <div>
                                    <div className="flex items-center gap-1.5 border-b pb-2 mb-2 text-[#1A2E4A] font-bold text-xs">
                                      <span className="uppercase tracking-wider">Current / Latest Material Items</span>
                                      <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-full font-bold">Active Value</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-[11px] border-collapse bg-slate-50/30 rounded-lg">
                                        <thead>
                                          <tr className="border-b border-slate-200/60 text-slate-450 font-bold">
                                            <th className="py-2 px-3">Material Name</th>
                                            <th className="py-2 px-3 text-right">Quantity</th>
                                            <th className="py-2 px-3 text-right">Rate</th>
                                            <th className="py-2 px-3 text-right">Total Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {(() => {
                                            const items = db.getChallanItems(c.id);
                                            const materials = db.getMaterials();
                                            if (items.length === 0) {
                                              return (
                                                <tr>
                                                  <td colSpan={4} className="py-3 px-3 text-center text-slate-400">No items in this challan</td>
                                                </tr>
                                              );
                                            }
                                            const totalAmt = items.reduce((sum, item) => sum + item.amount, 0);
                                            return (
                                              <>
                                                {items.map(item => {
                                                  const mat = materials.find(m => m.id === item.material_id);
                                                  return (
                                                    <tr key={item.id} className="text-slate-705 font-medium hover:bg-slate-50/20">
                                                      <td className="py-2 px-3 font-semibold text-slate-800">
                                                        {mat ? mat.name : 'Unknown Material'} {mat?.unit ? `(${mat.unit})` : ''}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{item.qty}</td>
                                                      <td className="py-2 px-3 text-right font-mono text-slate-505">₹{item.rate.toFixed(2)}</td>
                                                      <td className="py-2 px-3 text-right font-mono font-extrabold text-[#1A2E4A]">₹{item.amount.toFixed(2)}</td>
                                                    </tr>
                                                  );
                                                })}
                                                <tr className="bg-slate-50 font-bold border-t border-slate-200">
                                                  <td className="py-2 px-3 uppercase text-[#1A2E4A] font-bold" colSpan={3}>Grand Total Amount</td>
                                                  <td className="py-2 px-3 text-right font-mono text-[#1A2E4A] font-extrabold text-xs">₹{totalAmt.toFixed(2)}</td>
                                                </tr>
                                              </>
                                            );
                                          })()}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Section 2: Edit Version History */}
                                  {c.editHistory && c.editHistory.length > 0 ? (
                                    <div className="space-y-3 pt-2">
                                      <div className="flex items-center gap-1.5 border-b pb-2 mb-1.5 text-indigo-900 font-bold text-xs">
                                        <History className="w-3.5 h-3.5 text-indigo-600" />
                                        <span className="uppercase tracking-wider">Audit Edit Version History ({c.editHistory.length})</span>
                                      </div>
                                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                        {c.editHistory.slice().reverse().map((ver, idx) => {
                                          const materials = db.getMaterials();
                                          return (
                                            <div key={ver.id || idx} className="p-3 bg-indigo-50/25 hover:bg-indigo-50/40 rounded-lg border border-indigo-100/50 space-y-2">
                                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-indigo-100/40 pb-1.5 text-[10.5px]">
                                                <span className="font-bold text-indigo-900 uppercase">Version {c.editHistory!.length - idx}: Correction Update</span>
                                                <div className="flex items-center gap-2 text-slate-405 font-mono text-[10px]">
                                                  <span>User: <strong className="text-slate-700 font-bold">{ver.user}</strong></span>
                                                  <span>•</span>
                                                  <span>{new Date(ver.timestamp).toLocaleString('en-IN')}</span>
                                                </div>
                                              </div>
                                              
                                              <div className="text-[11px] text-slate-70 bg-white p-2 border border-slate-200/50 rounded-lg shadow-sm">
                                                <p className="font-semibold text-slate-800 leading-tight">Reason for edit: <strong className="font-bold text-rose-700">"{ver.reason}"</strong></p>
                                                {ver.changedFields && ver.changedFields.length > 0 && (
                                                  <div className="mt-1.5 flex items-start gap-1.5 flex-col">
                                                    <span className="font-bold text-slate-450 text-[9px] uppercase tracking-wider">Changed Fields &amp; Actions:</span>
                                                    <div className="flex flex-wrap gap-1">
                                                      {ver.changedFields.map((field, fIdx) => (
                                                        <span key={fIdx} className="bg-indigo-50/50 border border-indigo-100/50 text-[10px] px-1.5 py-0.2 rounded font-mono text-indigo-850 font-semibold">
                                                          {field}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Stock Delta Details */}
                                              {ver.stockDelta && ver.stockDelta.length > 0 && (
                                                <div className="bg-slate-100/60 p-2 rounded-lg border border-slate-200/60">
                                                  <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Stock Compensation Deltas:</span>
                                                  <div className="space-y-1">
                                                    {ver.stockDelta.map((delta, dIdx) => (
                                                      <div key={dIdx} className="flex justify-between font-mono text-[10.5px] leading-tight">
                                                        <span>{delta.name}:</span>
                                                        <span className={delta.delta > 0 ? "text-green-700 font-bold" : "text-rose-600 font-bold"}>
                                                          {delta.delta > 0 ? `+${delta.delta}` : delta.delta} (Inv Adjusted)
                                                        </span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}

                                              {/* Compare Item Lists */}
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                                <div>
                                                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Previous items on this version:</span>
                                                  <div className="bg-white p-2 rounded border border-slate-150 space-y-1 leading-tight text-[10.5px] font-mono">
                                                    {ver.previousItems.map((pi, pIdx) => {
                                                      const mat = materials.find(m => m.id === pi.material_id);
                                                      return (
                                                        <div key={pIdx} className="flex justify-between text-slate-500">
                                                          <span className="truncate">{mat ? mat.name : pi.material_id}:</span>
                                                          <span className="font-bold">{pi.qty} × ₹{pi.rate}</span>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                                <div>
                                                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Newly saved items:</span>
                                                  <div className="bg-white p-2 rounded border border-indigo-150 space-y-1 leading-tight text-[10.5px] font-mono">
                                                    {ver.latestItems.map((li, lIdx) => {
                                                      const mat = materials.find(m => m.id === li.material_id);
                                                      return (
                                                        <div key={lIdx} className="flex justify-between text-[#1A2E4A]">
                                                          <span className="truncate font-semibold">{mat ? mat.name : li.material_id}:</span>
                                                          <span className="font-bold">{li.qty} × ₹{li.rate}</span>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}

                                  {/* Section 3: Owner Post-Billing Adjustment (Requirement 8) */}
                                  {c.status === 'billed' && currentUser.role === 'admin' && (
                                    <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3.5 space-y-2 mt-4 text-left">
                                      <div className="flex items-center gap-1.5 text-rose-800 font-extrabold text-[#1A2E4A] text-xs">
                                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                                        <span className="uppercase tracking-wider">Owner Post-Billing Adjustment Control</span>
                                      </div>
                                      <p className="text-slate-650 leading-relaxed text-[11px]">
                                        This material challan has been finalized in the billing settlement ledger and is locked from standard correction or voiding. Click below to issue an authorized post-billing credit adjustment/credit note.
                                      </p>
                                      <div>
                                        <button
                                          onClick={() => triggerBilledAdjustment(c)}
                                          className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer shadow-sm transition uppercase"
                                        >
                                          <Receipt className="w-3.5 h-3.5" /> Issue post-billing adjustment / credit note
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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

      {/* --- POST-BILLING SECURITY ADJUSTMENT DIALOG MODAL (Requirement 8) --- */}
      {adjustingChallan && (
        <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden">
            <div className="bg-rose-50 border-b border-rose-100 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-rose-650" />
                <h3 className="text-xs font-bold text-rose-900 tracking-wider uppercase">POST-BILLING LEDGER ADJUSTMENT</h3>
              </div>
              <button 
                onClick={() => setAdjustingChallan(null)} 
                className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="text-xs font-semibold text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-105 font-mono">
                <p>Locked Challan: <span className="font-extrabold text-slate-900">{adjustingChallan.challan_no}</span></p>
                <p>Master Account: <span className="font-extrabold text-[#1A2E4A]">{getMasterName(adjustingChallan.master_id)}</span></p>
                <p>Linked Invoice Code: <span className="font-bold text-slate-800">{adjustingChallan.billedInvoiceId || 'PRE-ESTABLISHED'}</span></p>
              </div>

              {adjustError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[10.5px] font-bold text-rose-600">{adjustError}</div>
              )}
              {adjustSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-[10.5px] font-bold text-emerald-600">{adjustSuccess}</div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Receipt credit / adjustment amount (₹) *
                  </label>
                  <input
                    type="number"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="Enter absolute correction/credit value in Rupees"
                    className="w-full text-xs bg-white border border-slate-200 p-2.5 rounded-lg font-bold text-slate-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 font-mono"
                  />
                  <p className="text-[9px] text-slate-400 mt-1">This will deduct from the Tailoring Master's outstanding billing ledger balance.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Credit Note Reference Number / Voucher ID *
                  </label>
                  <input
                    type="text"
                    value={adjustRefNo}
                    onChange={(e) => setAdjustRefNo(e.target.value)}
                    placeholder="e.g. CN-102938"
                    className="w-full text-xs bg-white border border-slate-200 p-2.5 rounded-lg font-semibold text-slate-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Formal audit correction reason *
                  </label>
                  <textarea
                    rows={2}
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="Explain billing correction discrepancy or discount rationale..."
                    className="w-full text-xs bg-white border border-slate-200 p-2.5 rounded-lg font-medium text-slate-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 flex gap-2 justify-end border-t border-slate-200/50">
              <button
                onClick={() => setAdjustingChallan(null)}
                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 transition py-2 px-3.5 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdjustment}
                disabled={!adjustAmount || !adjustReason.trim() || !adjustRefNo.trim()}
                className="text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition py-2 px-4.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                <Check className="w-4 h-4" /> Save Credit Ledger Adjustment
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
                disabled={!editReason.trim()}
                className="text-xs font-bold bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white disabled:opacity-50 disabled:cursor-not-allowed transition py-2 px-4.5 rounded-lg flex items-center gap-1 cursor-pointer"
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
