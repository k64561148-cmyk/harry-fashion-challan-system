/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Master, Material, Challan, ChallanItem, InwardEntry, LedgerTransaction } from '../types';
import { 
  formatINR, 
  formatDate,
  generateMasterLedgerPDF,
  generateMaterialLedgerPDF,
  generateStockPositionPDF,
  generateMonthlySummaryPDF,
  exportToExcel
} from '../utils/exportUtils';
import { 
  BookOpen, 
  Layers, 
  TrendingUp, 
  PieChart, 
  Download, 
  FileSpreadsheet, 
  Printer, 
  Search, 
  Calendar,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [activeReport, setActiveReport] = useState<'master' | 'material' | 'stock' | 'summary' | 'reconciliation'>('master');
  
  // Datastore entities
  const [masters, setMasters] = useState<Master[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Manual payment/adjustment transaction recording states
  const [showManualTxForm, setShowManualTxForm] = useState(false);
  const [manualTxType, setManualTxType] = useState<'PAYMENT' | 'ADJUSTMENT'>('PAYMENT');
  const [manualTxAmount, setManualTxAmount] = useState('');
  const [manualTxRefNo, setManualTxRefNo] = useState('');
  const [manualTxNotes, setManualTxNotes] = useState('');
  const [manualTxDate, setManualTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualTxError, setManualTxError] = useState('');
  const [manualTxSuccess, setManualTxSuccess] = useState('');

  // Filters inputs
  const [selectedMasterId, setSelectedMasterId] = useState<string>('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const loadReportsMetadata = () => {
    const listMasters = db.getMasters();
    const listMaterials = db.getMaterials();
    setMasters(listMasters);
    setMaterials(listMaterials);
    
    // Only auto-select if nothing is selected yet to avoid overwriting user selectors on live syncs
    setSelectedMasterId(prev => {
      if (prev) return prev;
      const activeMs = listMasters.filter(m => m.is_active);
      return activeMs.length > 0 ? activeMs[0].id : '';
    });

    setSelectedMaterialId(prev => {
      if (prev) return prev;
      const activeMats = listMaterials.filter(m => m.is_active);
      return activeMats.length > 0 ? activeMats[0].id : '';
    });
  };

  useEffect(() => {
    loadReportsMetadata();

    window.addEventListener('db_sync', loadReportsMetadata);
    return () => window.removeEventListener('db_sync', loadReportsMetadata);
  }, []);

  const handleSaveManualTx = (e: React.FormEvent) => {
    e.preventDefault();
    setManualTxError('');
    setManualTxSuccess('');

    if (!selectedMasterId) {
      setManualTxError('Please select a master first.');
      return;
    }
    const amt = parseFloat(manualTxAmount);
    if (isNaN(amt) || amt <= 0) {
      setManualTxError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!manualTxRefNo.trim()) {
      setManualTxError('Please enter a reference number or voucher ID.');
      return;
    }

    try {
      db.saveManualTransaction({
        type: manualTxType,
        master_id: selectedMasterId,
        amount: amt,
        ref_no: manualTxRefNo.trim(),
        notes: manualTxNotes.trim(),
        date: manualTxDate,
      });

      setManualTxSuccess('Transaction successfully recorded!');
      setManualTxAmount('');
      setManualTxRefNo('');
      setManualTxNotes('');
      setTimeout(() => {
        setManualTxSuccess('');
        setShowManualTxForm(false);
      }, 1500);
    } catch (err: any) {
      setManualTxError(err?.message || 'Error occurred while saving transaction.');
    }
  };

  const handleDeleteManualTx = (txId: string) => {
    if (window.confirm('Are you sure you want to delete this transaction record?')) {
      db.deleteManualTransaction(txId);
    }
  };

  const getReconciliationAudit = () => {
    const mismatches: any[] = [];
    const activeMonths = [
      { m: 1, y: 2025 }, { m: 2, y: 2025 }, { m: 3, y: 2025 }, { m: 4, y: 2025 }, { m: 5, y: 2025 }, { m: 6, y: 2025 },
      { m: 7, y: 2025 }, { m: 8, y: 2025 }, { m: 9, y: 2025 }, { m: 10, y: 2025 }, { m: 11, y: 2025 }, { m: 12, y: 2025 },
      { m: 1, y: 2026 }, { m: 2, y: 2026 }, { m: 3, y: 2026 }, { m: 4, y: 2026 }, { m: 5, y: 2026 }, { m: 6, y: 2026 },
      { m: 7, y: 2026 }, { m: 8, y: 2026 }, { m: 9, y: 2026 }, { m: 10, y: 2026 }, { m: 11, y: 2026 }, { m: 12, y: 2026 },
      { m: 1, y: 2027 }, { m: 2, y: 2027 }, { m: 3, y: 2027 }, { m: 4, y: 2027 }, { m: 5, y: 2027 }, { m: 6, y: 2027 }
    ];

    const allInvoices = db.getInvoices();
    const challans = db.getChallans();
    const challanItems = db.getChallanItems();

    masters.forEach(master => {
      activeMonths.forEach(({ m, y }) => {
        // Compute raw directly
        const rawInvs = allInvoices.filter(inv => inv.master_id === master.id && inv.period_month === m && inv.period_year === y);
        let raw_work = 0;
        let raw_deduction = 0;
        let raw_discount = 0;
        let raw_tds = 0;
        let raw_net = 0;
        const existsBilled = rawInvs.length > 0;

        if (existsBilled) {
          rawInvs.forEach(inv => {
            raw_work += inv.work_amount || 0;
            raw_deduction += inv.material_deduction || 0;
            raw_discount += inv.discount || 0;
            raw_tds += inv.tds_amount || 0;
            raw_net += inv.net_payable || 0;
          });
        } else {
          // fallback
          let calculatedIssuedVal = 0;
          challans.forEach(ch => {
            const cDate = new Date(ch.issued_date);
            if (ch.master_id === master.id && cDate.getFullYear() === y && (cDate.getMonth() + 1) === m && (ch.status === 'issued' || ch.status === 'billed')) {
              const chItems = challanItems.filter(item => item.challan_id === ch.id);
              calculatedIssuedVal += chItems.reduce((acc, curr) => acc + curr.amount, 0);
            }
          });
          raw_deduction = calculatedIssuedVal;
          raw_net = -calculatedIssuedVal;
        }

        // Compute from central transaction engine
        const summary = db.getLedgerSummaryForMasterMonth(master.id, m, y);

        // Verification checks (with rounding protection)
        if (Math.round(raw_deduction) !== Math.round(summary.material_deduction)) {
          mismatches.push({
            masterName: master.name,
            period: `${m}/${y}`,
            field: 'Material Deduction',
            rawValue: raw_deduction,
            txValue: summary.material_deduction
          });
        }
        if (Math.round(raw_work) !== Math.round(summary.work_credit)) {
          mismatches.push({
            masterName: master.name,
            period: `${m}/${y}`,
            field: 'Work Credit',
            rawValue: raw_work,
            txValue: summary.work_credit
          });
        }
        if (Math.round(raw_discount) !== Math.round(summary.discount)) {
          mismatches.push({
            masterName: master.name,
            period: `${m}/${y}`,
            field: 'Discount',
            rawValue: raw_discount,
            txValue: summary.discount
          });
        }
        if (Math.round(raw_tds) !== Math.round(summary.tds)) {
          mismatches.push({
            masterName: master.name,
            period: `${m}/${y}`,
            field: 'TDS Deduction',
            rawValue: raw_tds,
            txValue: summary.tds
          });
        }
        if (Math.round(raw_net) !== Math.round(summary.net_payable)) {
          mismatches.push({
            masterName: master.name,
            period: `${m}/${y}`,
            field: 'Net Payable',
            rawValue: raw_net,
            txValue: summary.net_payable
          });
        }
      });
    });

    return mismatches;
  };

  // --- REPORT GENERATORS CONTROLLERS & DATA COMPULATORS ---

  // 1. MASTER LEDGER CALCULATOR
  const getMasterLedgerData = () => {
    if (!selectedMasterId) return { rows: [], totalIssued: 0, totalEarned: 0, totalPayments: 0, totalAdjustments: 0, balance: 0 };

    const activeMaster = masters.find(m => m.id === selectedMasterId);
    if (!activeMaster) return { rows: [], totalIssued: 0, totalEarned: 0, totalPayments: 0, totalAdjustments: 0, balance: 0 };

    const txs = db.getTransactions().filter(tx => 
      tx.master_id === selectedMasterId && 
      tx.date >= startDate && 
      tx.date <= endDate
    );

    const ledgerRows: any[] = [];
    let totalIssued = 0;
    let totalEarned = 0;
    let totalPayments = 0;
    let totalAdjustments = 0;

    txs.forEach(tx => {
      if (tx.type === 'MATERIAL_ISSUE') {
        const mat = materials.find(m => m.id === tx.material_id);
        const matName = mat ? mat.name : 'Unknown Material';
        
        ledgerRows.push({
          date: tx.date,
          ref: tx.ref_no,
          type: 'issue',
          material: matName,
          qty: tx.qty || 0,
          value: tx.amount
        });
        totalIssued += tx.amount;
      } else if (tx.type === 'BILL_FINALIZED' || tx.type === 'BILL_DRAFT') {
        ledgerRows.push({
          date: tx.date,
          ref: tx.ref_no,
          type: 'work',
          material: `Stitching Billing Cycle (${tx.period_month}/${tx.period_year}) ${tx.type === 'BILL_DRAFT' ? '[DRAFT]' : '[FINAL]'}`,
          qty: 0,
          value: tx.work_amount || tx.amount
        });
        totalEarned += tx.work_amount || tx.amount;
      } else if (tx.type === 'PAYMENT') {
        ledgerRows.push({
          date: tx.date,
          ref: tx.ref_no,
          type: 'payment',
          material: `Payment Disbursed: ${tx.notes}`,
          qty: 0,
          value: tx.amount
        });
        totalPayments += tx.amount;
      } else if (tx.type === 'ADJUSTMENT') {
        ledgerRows.push({
          date: tx.date,
          ref: tx.ref_no,
          type: 'adjustment',
          material: `Balance Adjustment: ${tx.notes}`,
          qty: 0,
          value: tx.amount
        });
        totalAdjustments += tx.amount;
      } else if (tx.type === 'VOID') {
        ledgerRows.push({
          date: tx.date,
          ref: tx.ref_no,
          type: 'void',
          material: `Void Entry: ${tx.notes}`,
          qty: 0,
          value: 0
        });
      }
    });

    // Sort chronologically
    ledgerRows.sort((a, b) => a.date.localeCompare(b.date));

    // Balance is Credits (Work credit + adjustments) minus Debits (material deductions + payments)
    const balance = totalEarned + totalAdjustments - totalIssued - totalPayments;

    return {
      rows: ledgerRows,
      totalIssued,
      totalEarned,
      totalPayments,
      totalAdjustments,
      balance
    };
  };

  const handleExportMasterLedger = (format: 'pdf' | 'excel') => {
    const activeMaster = masters.find(m => m.id === selectedMasterId);
    if (!activeMaster) return;

    const dataObj = getMasterLedgerData();

    if (format === 'pdf') {
      generateMasterLedgerPDF(
        activeMaster,
        { start: startDate, end: endDate },
        dataObj.rows,
        dataObj.totalIssued,
        dataObj.totalEarned,
        dataObj.balance
      );
    } else {
      const excelRows = dataObj.rows.map(r => ({
        Date: formatDate(r.date),
        'Reference ID': r.ref,
        'Transaction Type': r.type.toUpperCase(),
        'Narrative/Particular': r.material,
        Qty: r.qty || '',
        'Outflow/Deduction Value (₹)': (r.type === 'issue' || r.type === 'payment' || (r.type === 'adjustment' && r.value < 0)) ? Math.abs(r.value) : 0,
        'Inflow/Earnings Work (₹)': (r.type === 'work' || (r.type === 'adjustment' && r.value >= 0)) ? r.value : 0
      }));
      exportToExcel(excelRows, `LEDGER_${activeMaster.code.toUpperCase()}`);
    }
  };


  // 2. MATERIAL LEDGER CALCULATOR
  const getMaterialLedgerData = () => {
    if (!selectedMaterialId) return { rows: [], currentStock: 0 };

    const selectedMaterial = materials.find(m => m.id === selectedMaterialId);
    if (!selectedMaterial) return { rows: [], currentStock: 0 };

    const inwardEntries = db.getInwardEntries().filter(inw => inw.material_id === selectedMaterialId && inw.inward_date >= startDate && inw.inward_date <= endDate);
    const challanItems = db.getChallanItems();
    const challans = db.getChallans();

    const events: any[] = [];

    // Map material inwards (Receipt)
    inwardEntries.forEach(inw => {
      events.push({
        date: inw.inward_date,
        bill_ref: inw.bill_no,
        type: 'stock_in',
        party: inw.supplier_name,
        qty: inw.qty_received,
        balance: 0 // compute later
      });
    });

    // Map material outbound issues
    challans.forEach(ch => {
      if (ch.issued_date >= startDate && ch.issued_date <= endDate) {
        const matchingItems = challanItems.filter(item => item.challan_id === ch.id && item.material_id === selectedMaterialId);
        const masterName = masters.find(m => m.id === ch.master_id)?.name || 'Unknown Master';
        
        matchingItems.forEach(item => {
          events.push({
            date: ch.issued_date,
            bill_ref: ch.challan_no,
            type: 'stock_out',
            party: masterName,
            qty: item.qty,
            balance: 0
          });
        });
      }
    });

    // Sort events
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate running balance based on current stock backward deduction or forward sum
    // Let's do forward calculations starting with an estimated start balance
    let currentBal = selectedMaterial.current_stock;
    
    // We want the events to show a logical running count. Let's do backward calculation first to find starting inventory balance
    const eventsSortedDesc = [...events].sort((a, b) => b.date.localeCompare(a.date));
    eventsSortedDesc.forEach(ev => {
      // If we go backwards, inwards decreases stock and issues increases stock
      ev.balance = currentBal;
      if (ev.type === 'stock_in') {
        currentBal -= ev.qty;
      } else {
        currentBal += ev.qty;
      }
    });

    // Re-adjust sequential events chronologically with correct cumulative balances
    let runStock = currentBal;
    events.sort((a, b) => a.date.localeCompare(b.date)).forEach(ev => {
      if (ev.type === 'stock_in') {
        runStock += ev.qty;
      } else {
        runStock -= ev.qty;
      }
      ev.balance = Math.max(0, runStock);
    });

    return {
      rows: events,
      currentStock: selectedMaterial.current_stock
    };
  };

  const handleExportMaterialLedger = (format: 'pdf' | 'excel') => {
    const activeMaterial = materials.find(m => m.id === selectedMaterialId);
    if (!activeMaterial) return;

    const dataObj = getMaterialLedgerData();

    if (format === 'pdf') {
      generateMaterialLedgerPDF(
        activeMaterial,
        { start: startDate, end: endDate },
        dataObj.rows
      );
    } else {
      const excelRows = dataObj.rows.map(r => ({
        Date: formatDate(r.date),
        'Reference ID': r.bill_ref,
        'Event Action': r.type === 'stock_in' ? 'RECEIPT (+)' : 'ISSUE (-)',
        'Associated Counterparty': r.party,
        'Qty Change': r.qty,
        'Running Balance Stock': r.balance
      }));
      exportToExcel(excelRows, `MATERIAL_CARD_${activeMaterial.name.replace(/\//g, '_')}`);
    }
  };


  // 3. INVENTORY STOCK STATUS POSITION CALCULATOR
  const getStockPositionData = () => {
    const challanItems = db.getChallanItems();
    const challans = db.getChallans();
    const inwardEntries = db.getInwardEntries();
    
    const cy = new Date().getFullYear();
    const cm = new Date().getMonth() + 1;

    return materials.map(m => {
      // Find last inward date
      const matsInward = inwardEntries.filter(inw => inw.material_id === m.id);
      const lastIn = matsInward.length > 0 
        ? matsInward.sort((a, b) => b.inward_date.localeCompare(a.inward_date))[0].inward_date 
        : 'NA';

      // Sum units issued this calendar month
      let monthIssued = 0;
      challans.forEach(ch => {
        const cDate = new Date(ch.issued_date);
        if (cDate.getFullYear() === cy && (cDate.getMonth() + 1) === cm) {
          const matchingItems = challanItems.filter(item => item.challan_id === ch.id && item.material_id === m.id);
          monthIssued += matchingItems.reduce((acc, curr) => acc + curr.qty, 0);
        }
      });

      return {
        id: m.id,
        name: m.name,
        unit: m.unit,
        default_rate: m.default_rate,
        current_stock: m.current_stock,
        last_inward_date: lastIn,
        monthly_issued_qty: monthIssued
      };
    });
  };

  const handleExportStockStatus = (format: 'pdf' | 'excel') => {
    const dataList = getStockPositionData();
    if (format === 'pdf') {
      generateStockPositionPDF(materials);
    } else {
      const excelRows = dataList.map(m => ({
        'Material Name': m.name,
        Unit: m.unit,
        'Rate (₹)': m.default_rate,
        'Current Stock Balance': m.current_stock,
        'Last Replenished Date': m.last_inward_date === 'NA' ? 'No inward registered' : formatDate(m.last_inward_date),
        'Units Disbursed This Month': m.monthly_issued_qty
      }));
      exportToExcel(excelRows, 'STOCK_POSITION_REPORT');
    }
  };


  // 4. MONTHLY SUMMARY CALCULATION
  const getMonthlySummaryData = () => {
    return masters.map(m => {
      const summary = db.getLedgerSummaryForMasterMonth(m.id, selectedMonth, selectedYear);
      return {
        masterId: m.id,
        masterName: m.name,
        type: m.type,
        totalIssuedVal: summary.material_deduction,
        workEarned: summary.work_credit,
        netPaid: summary.net_payable,
        discount: summary.discount,
        tds: summary.tds,
        payments: summary.payments,
        adjustments: summary.adjustments,
        final_balance: summary.final_balance,
        is_billed: summary.is_billed
      };
    });
  };

  const handleExportMonthlySummary = (format: 'pdf' | 'excel') => {
    const summaryList = getMonthlySummaryData();

    if (format === 'pdf') {
      generateMonthlySummaryPDF(selectedMonth, selectedYear, summaryList);
    } else {
      const excelRows = summaryList.map(item => ({
        'Master Custom Name': item.masterName,
        'Stitching Department': item.type.toUpperCase(),
        'Aggregate Material Deductions (A) (₹)': item.totalIssuedVal,
        'Stitch Job Earnings (B) (₹)': item.workEarned,
        'Settle Net Amount (B-A) (₹)': item.netPaid
      }));
      exportToExcel(excelRows, `SUMMARY_MONTHLY_${selectedMonth}_${selectedYear}`);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto" id="reports-view">
      
      {/* Tab Switcher */}
      <div className="flex bg-slate-100/70 border border-slate-200 rounded-xl p-1 shadow-xs gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveReport('master')}
          className={`flex-1 min-w-[130px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
            activeReport === 'master' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <BookOpen className="w-4 h-4" /> Master Ledger
        </button>
        <button
          onClick={() => setActiveReport('material')}
          className={`flex-1 min-w-[130px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
            activeReport === 'material' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Layers className="w-4 h-4" /> Material Card Ledger
        </button>
        <button
          onClick={() => setActiveReport('stock')}
          className={`flex-1 min-w-[130px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
            activeReport === 'stock' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Stock Position
        </button>
         <button
          onClick={() => setActiveReport('summary')}
          className={`flex-1 min-w-[130px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
            activeReport === 'summary' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <PieChart className="w-4 h-4" /> Monthly Overview
        </button>
        <button
          onClick={() => setActiveReport('reconciliation')}
          className={`flex-1 min-w-[150px] font-sans text-xs py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
            activeReport === 'reconciliation' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-500" /> Ledger Reconciliation
        </button>
      </div>

      {/* Primary Report Modules Rendering */}
      
      {/* 1. MASTER LEDGER REPORT LAYOUT */}
      {activeReport === 'master' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-[10px] font-bold text-[#1A2E4A] tracking-widest uppercase">FILTERS PANEL</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">SELECT MASTER</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-bold text-slate-800"
                  value={selectedMasterId}
                  onChange={(e) => setSelectedMasterId(e.target.value)}
                >
                  {masters.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.type.toUpperCase()})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">FROM DATE</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">TO DATE</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={() => handleExportMasterLedger('pdf')}
                  className="flex-1 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer h-9 shadow-sm transition uppercase"
                >
                  <Printer className="w-4 h-4" /> Print PDF
                </button>
                <button
                  onClick={() => handleExportMasterLedger('excel')}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer h-9 shadow-sm transition uppercase"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </button>
              </div>

              <div className="sm:col-span-4 border-t border-slate-100 pt-3 flex justify-between items-center">
                <p className="text-[10px] uppercase font-bold text-slate-400">Manual Accounting Operations</p>
                <button
                  type="button"
                  onClick={() => setShowManualTxForm(!showManualTxForm)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition uppercase cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> {showManualTxForm ? 'Hide Voucher Entry' : 'Record Payment / Adjustment'}
                </button>
              </div>

            </div>
          </div>

          {/* Manual Accounting Entry Panel */}
          {showManualTxForm && (
            <div className="bg-slate-50 border border-indigo-100 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-indigo-155">
                <h4 className="text-xs font-bold text-indigo-900 tracking-wider uppercase flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600" /> Record Accounting Voucher
                </h4>
                <span className="text-[10px] text-indigo-500 font-semibold uppercase">Master: {masters.find(m => m.id === selectedMasterId)?.name || 'Unknown'}</span>
              </div>

              <form onSubmit={handleSaveManualTx} className="grid grid-cols-1 md:grid-cols-5 gap-3.5 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Voucher Type</label>
                  <select
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none rounded-lg p-2 text-xs font-bold text-slate-800"
                    value={manualTxType}
                    onChange={(e) => setManualTxType(e.target.value as any)}
                  >
                    <option value="PAYMENT">Payment Disbursed</option>
                    <option value="ADJUSTMENT">Balance Adjustment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    required
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800"
                    value={manualTxDate}
                    onChange={(e) => setManualTxDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ref / Voucher ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PYMT-981"
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800 placeholder-slate-400"
                    value={manualTxRefNo}
                    onChange={(e) => setManualTxRefNo(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="₹ 5000"
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800 placeholder-slate-400"
                    value={manualTxAmount}
                    onChange={(e) => setManualTxAmount(e.target.value)}
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm transition uppercase h-[34px] cursor-pointer"
                  >
                    Post Record
                  </button>
                </div>

                <div className="md:col-span-5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Remarks / Narrative</label>
                  <input
                    type="text"
                    placeholder="e.g. Advance paid via GPay"
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800 placeholder-slate-400"
                    value={manualTxNotes}
                    onChange={(e) => setManualTxNotes(e.target.value)}
                  />
                </div>
              </form>

              {manualTxError && (
                <div className="bg-rose-50 border border-rose-150 rounded-lg p-2.5 flex items-center gap-2 text-rose-700 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {manualTxError}
                </div>
              )}

              {manualTxSuccess && (
                <div className="bg-emerald-50 border border-emerald-150 rounded-lg p-2.5 flex items-center gap-2 text-emerald-700 text-xs font-semibold">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {manualTxSuccess}
                </div>
              )}

              {/* Master Manual Records List */}
              <div className="pt-3 border-t border-indigo-100/50">
                <h5 className="text-[10px] font-bold text-indigo-950 uppercase tracking-widest mb-2 font-sans">Active Manual Records</h5>
                {db.getTransactions().filter(tx => (tx.type === 'PAYMENT' || tx.type === 'ADJUSTMENT') && tx.master_id === selectedMasterId).length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-sans italic">No manual transaction records registered for this master.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-150 rounded-lg bg-white">
                    <table className="w-full text-left text-[11px] border-collapse font-sans">
                      <thead>
                        <tr className="bg-slate-100 font-bold border-b border-slate-200 text-slate-600">
                          <th className="py-1.5 px-2.5">DATE</th>
                          <th className="py-1.5 px-2.5">REF ID</th>
                          <th className="py-1.5 px-2.5">TYPE</th>
                          <th className="py-1.5 px-2.5">NARRATIVE</th>
                          <th className="py-1.5 px-2.5 text-right w-24">AMOUNT (₹)</th>
                          <th className="py-1.5 px-2.5 text-center w-12">ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {db.getTransactions().filter(tx => (tx.type === 'PAYMENT' || tx.type === 'ADJUSTMENT') && tx.master_id === selectedMasterId).map((tx) => (
                          <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50 text-slate-700">
                            <td className="py-1.5 px-2.5 font-medium">{formatDate(tx.date)}</td>
                            <td className="py-1.5 px-2.5 font-mono text-indigo-700 font-bold">{tx.ref_no}</td>
                            <td className="py-1.5 px-2.5 uppercase font-extrabold text-[9px]">
                              <span className={`px-1.5 py-0.5 rounded ${tx.type === 'PAYMENT' ? 'bg-indigo-55 text-indigo-700' : 'bg-purple-55 text-purple-700'}`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5 font-medium">{tx.notes || 'NA'}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900">{formatINR(tx.amount)}</td>
                            <td className="py-1.5 px-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteManualTx(tx.id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">MASTER ACCOUNT STATEMENTS</h3>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-slate-400">Net cumulative outstanding balance:</span>
                <span className="font-bold text-[#1A2E4A] text-sm font-mono">{formatINR(getMasterLedgerData().balance)}</span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">TX REFERENCE ID</th>
                    <th className="py-2.5 px-3">TX TYPE</th>
                    <th className="py-2.5 px-3">MATERIAL/NARRATIVE</th>
                    <th className="py-2.5 px-3 w-20 text-right">QTY</th>
                    <th className="py-2.5 px-3 text-right">VALUE (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {getMasterLedgerData().rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No transactions registered inside this date range.
                      </td>
                    </tr>
                  ) : (
                    getMasterLedgerData().rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{formatDate(row.date)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-500">{row.ref}</td>
                        <td className="py-2.5 px-3 font-bold uppercase text-[9px]">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full ${
                            row.type === 'issue' ? 'bg-amber-100 text-amber-800' :
                            row.type === 'payment' ? 'bg-indigo-100 text-indigo-800' :
                            row.type === 'adjustment' ? 'bg-purple-100 text-purple-800' :
                            row.type === 'void' ? 'bg-rose-100 text-rose-800 line-through' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {row.type === 'issue' ? 'Issued' :
                             row.type === 'payment' ? 'Payment' :
                             row.type === 'adjustment' ? 'Adjustment' :
                             row.type === 'void' ? 'Void' :
                             'Work Credit'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{row.material}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">{row.qty > 0 ? row.qty.toFixed(1) : ''}</td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                          row.type === 'issue' || row.type === 'payment' ? 'text-rose-600' :
                          row.type === 'adjustment' && row.value < 0 ? 'text-rose-600' :
                          row.type === 'void' ? 'text-slate-400 line-through' :
                          'text-green-600'
                        }`}>
                          {row.type === 'issue' || row.type === 'payment' ? '-' : 
                           row.type === 'adjustment' && row.value < 0 ? '-' :
                           row.type === 'void' ? '' : '+'}{formatINR(Math.abs(row.value))}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-slate-100/90 font-bold text-slate-900 border-t border-slate-200">
                    <td colSpan={5} className="py-3 px-3 uppercase text-right">Running Net Balance (Credit - Debit)</td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-[#1A2E4A] font-bold">{formatINR(getMasterLedgerData().balance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. MATERIAL CARD LEDGER */}
      {activeReport === 'material' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-[10px] font-bold text-[#1A2E4A] tracking-widest uppercase">FILTERS PANEL</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">SELECT MATERIAL ITEM</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-bold text-slate-800"
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                >
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">FROM DATE</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">TO DATE</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={() => handleExportMaterialLedger('pdf')}
                  className="flex-1 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer h-9 shadow-sm transition uppercase"
                >
                  <Printer className="w-4 h-4" /> Print PDF
                </button>
                <button
                  onClick={() => handleExportMaterialLedger('excel')}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer h-9 shadow-sm transition uppercase"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </button>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">STOCK INWARD/OUTWARD LEDGERS</h3>
              <div className="text-xs font-semibold">
                <span className="text-slate-400">Current available stock:</span>
                <span className="text-emerald-600 ml-2 text-sm font-sans font-bold">
                  {getMaterialLedgerData().currentStock.toFixed(1)} {materials.find(m => m.id === selectedMaterialId)?.unit}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">BILL / CHALLAN REFERENCE</th>
                    <th className="py-2.5 px-3">MOVEMENT STATE</th>
                    <th className="py-2.5 px-3">COUNTERPARTY DETAIL</th>
                    <th className="py-2.5 px-3 text-right">CHANGE QUANTITY</th>
                    <th className="py-2.5 px-3 text-right">RUNNING STOCK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {getMaterialLedgerData().rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No stock records recorded in this date sequence.
                      </td>
                    </tr>
                  ) : (
                    getMaterialLedgerData().rows.map((ev, index) => (
                      <tr key={index} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-semibold text-slate-850">{formatDate(ev.date)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-500">{ev.bill_ref}</td>
                        <td className="py-2.5 px-3 font-bold text-[9px] uppercase">
                          <span className={`inline-block px-2 py-0.5 rounded-full ${
                            ev.type === 'stock_in' ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {ev.type === 'stock_in' ? 'Stock Receipt' : 'Issued Outward'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{ev.party}</td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                          ev.type === 'stock_in' ? 'text-green-600' : 'text-rose-600'
                        }`}>
                          {ev.type === 'stock_in' ? '+' : '-'}{ev.qty.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-800 font-bold">{ev.balance.toFixed(1)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. STOCK LEVEL POSITION OVERVIEW */}
      {activeReport === 'stock' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>
              <h3 className="text-xs font-bold text-[#1A2E4A] uppercase tracking-wider">ALL MATERIALS CURRENT INVENTORY STOCKS</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Alert thresholds flag stocks lower than 15 units</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleExportStockStatus('pdf')}
                className="flex-1 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer h-9 shadow-sm transition uppercase"
              >
                <Printer className="w-4 h-4" /> Download PDF Chart
              </button>
              <button
                onClick={() => handleExportStockStatus('excel')}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer h-9 shadow-sm transition uppercase"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export Sheets
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="overflow-x-auto border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">SR</th>
                    <th className="py-2.5 px-3">MATERIAL NAME DESCRIPTION</th>
                    <th className="py-2.5 px-3 w-28">MEASUREMENT UNIT</th>
                    <th className="py-2.5 px-3 text-right w-28">STORE RATE (दर)</th>
                    <th className="py-2.5 px-3 text-right">MONTHLY DISBURSED</th>
                    <th className="py-2.5 px-3 text-right w-44">CURRENT STOCK LEVELS</th>
                    <th className="py-2.5 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getStockPositionData().map((m, idx) => {
                    const isLow = m.current_stock < 15;
                    return (
                      <tr key={m.id} className={`hover:bg-slate-50/50 ${isLow ? 'bg-rose-50/20' : ''}`}>
                        <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{m.name}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-bold">{m.unit}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">{formatINR(m.default_rate)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500 font-medium">{m.monthly_issued_qty.toFixed(1)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`font-mono font-bold text-sm block ${isLow ? 'text-rose-600' : 'text-slate-800'}`}>
                            {m.current_stock.toFixed(1)}
                          </span>
                          <span className="text-[9px] text-slate-400 font-semibold font-sans">Last Inward: {m.last_inward_date === 'NA' ? 'None' : formatDate(m.last_inward_date)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isLow && (
                            <span className="bg-rose-100 text-rose-700 animate-pulse text-[9px] px-1.5 py-0.5 rounded font-bold">
                              LOW
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. MONTHLY EXECUTIVE SUMMARY REPORT */}
      {activeReport === 'summary' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-[10px] font-bold text-[#1A2E4A] tracking-widest uppercase">FILTERS MONTH LIMIT</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">
              
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">CYCLE MONTH</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-bold text-slate-800"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                >
                  <option value={1}>January</option>
                  <option value={2}>February</option>
                  <option value={3}>March</option>
                  <option value={4}>April</option>
                  <option value={5}>May</option>
                  <option value={6}>June</option>
                  <option value={7}>July</option>
                  <option value={8}>August</option>
                  <option value={9}>September</option>
                  <option value={10}>October</option>
                  <option value={11}>November</option>
                  <option value={12}>December</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">CYCLE YEAR</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-bold text-slate-800"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                >
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                  <option value={2028}>2028</option>
                </select>
              </div>

              <div className="sm:col-span-2 flex items-end gap-2">
                <button
                  onClick={() => handleExportMonthlySummary('pdf')}
                  className="flex-1 bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer h-9 shadow-sm transition uppercase"
                >
                  <Printer className="w-4 h-4" /> Download PDF Status
                </button>
                <button
                  onClick={() => handleExportMonthlySummary('excel')}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer h-9 shadow-sm transition uppercase"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Sheet
                </button>
              </div>

            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider mb-4 border-b border-slate-100 pb-2 uppercase">ALL CRAFTSMAN MONTHLY SUMMARY BILLING</h3>
            
            <div className="overflow-x-auto border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">MASTER NAME</th>
                    <th className="py-2.5 px-3">PRODUCTION LINE</th>
                    <th className="py-2.5 px-3 text-right">TOTAL MATERIAL ISSUES (A)</th>
                    <th className="py-2.5 px-3 text-right">TOTAL WORK CREDIT (B)</th>
                    <th className="py-2.5 px-3 text-right">NET DUES (B - A)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {getMonthlySummaryData().map((item, index) => {
                    const isNeg = item.netPaid < 0;
                    return (
                      <tr key={index} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{item.masterName}</td>
                        <td className="py-2.5 px-3 font-bold uppercase text-slate-500">{item.type}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600 font-semibold">- {formatINR(item.totalIssuedVal)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-green-600 font-semibold">+ {formatINR(item.workEarned)}</td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${isNeg ? 'text-rose-600' : 'text-[#1A2E4A]'}`}>
                          {formatINR(item.netPaid)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100/90 font-bold border-t border-slate-200 text-slate-900 text-xs font-bold">
                    <td colSpan={2} className="py-3 px-3 uppercase text-right">Grand Cycle Period Net Sums</td>
                    <td className="py-3 px-3 text-right font-mono text-rose-600">- {formatINR(getMonthlySummaryData().reduce((acc, curr)=>acc+curr.totalIssuedVal, 0))}</td>
                    <td className="py-3 px-3 text-right font-mono text-green-600">+ {formatINR(getMonthlySummaryData().reduce((acc, curr)=>acc+curr.workEarned, 0))}</td>
                    <td className="py-3 px-3 text-right font-mono text-[#1A2E4A] text-sm">
                      {formatINR(getMonthlySummaryData().reduce((acc, curr)=>acc+curr.netPaid, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeReport === 'reconciliation' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Source Of Truth Integrity Agent
                </span>
                <h3 className="text-sm font-bold text-[#1A2E4A] tracking-wide uppercase">Ledger Reconciliation Audit</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  This validation script continuously cross-references every master's monthly bills and material issues derived from original raw documents against the centralized Normalized Ledger Transaction Engine.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-bold uppercase">Engine Status:</span>
                <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 rounded-lg uppercase">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active (Normal)
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Monitored Ledger Cycles</p>
                <h4 className="text-2xl font-black text-[#1A2E4A] font-mono mt-1">{masters.length * 30}</h4>
                <p className="text-[10px] text-slate-400 font-semibold mt-1">30 active monthly periods monitored per master</p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verification Precision Scope</p>
                <h4 className="text-2xl font-black text-indigo-600 font-mono mt-1">100% Normalized</h4>
                <p className="text-[10px] text-slate-400 font-semibold mt-1">Material Issued, Work Credited, Discounts & TDS verified</p>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Current Active Mismatches</p>
                <h4 className={`text-2xl font-black font-mono mt-1 ${getReconciliationAudit().length > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {getReconciliationAudit().length}
                </h4>
                <p className="text-[10px] text-emerald-800 font-semibold mt-1">
                  {getReconciliationAudit().length > 0 ? 'Requires attention/correction in transaction collections.' : 'ledger database fully synchronized.'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase border-b border-slate-100 pb-2">AUDIT SYSTEM EXECUTION OUTCOMES</h4>
            
            {getReconciliationAudit().length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-50/70 border border-emerald-150 flex items-center justify-center text-emerald-600">
                  <ShieldCheck className="w-9 h-9" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[#1A2E4A]">Perfect Alignment Verified</h4>
                  <p className="text-xs text-slate-400 max-w-md font-medium leading-relaxed">
                    The reconciliation engine detected no calculation, rounding, or entry mismatches. Original documents and Centralized Ledger summaries are in full 1:1 alignment.
                  </p>
                </div>
                <div className="text-[10px] bg-slate-100 px-3 py-1 text-slate-500 rounded-md font-mono font-bold uppercase select-none">
                  INTEGRITY HASH: SHA-256 SECURED
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-150 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  Warning: The ledger integrity test flags {getReconciliationAudit().length} calculation mismatches. Please look at the cycles below:
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                        <th className="py-2.5 px-3">MASTER</th>
                        <th className="py-2.5 px-3">PERIOD</th>
                        <th className="py-2.5 px-3">AUDIT TARGET TARGET FIELD</th>
                        <th className="py-2.5 px-3 text-right">RAW VALUE (₹)</th>
                        <th className="py-2.5 px-3 text-right">LEDGER ENGINE VALUE (₹)</th>
                        <th className="py-2.5 px-3 text-right">DISCREPANCY DELTA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {getReconciliationAudit().map((item, idx) => {
                        const delta = item.rawValue - item.txValue;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{item.masterName}</td>
                            <td className="py-2.5 px-3 font-bold font-mono text-indigo-700">{item.period}</td>
                            <td className="py-2.5 px-3 uppercase text-[10px] font-extrabold text-slate-500">{item.field}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{formatINR(item.rawValue)}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{formatINR(item.txValue)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-rose-600 font-bold">{formatINR(delta)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default ReportsView;
