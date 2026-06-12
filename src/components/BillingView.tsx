/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Master, Material, Challan, ChallanItem, Invoice } from '../types';
import { generateInvoicePDF, formatINR, formatDate } from '../utils/exportUtils';
import { 
  Receipt, 
  ArrowRight, 
  Check, 
  Percent, 
  Scissors, 
  Trash2, 
  FileCheck, 
  AlertCircle,
  Clock,
  Printer,
  Download
} from 'lucide-react';

interface GroupedItem {
  material_id: string;
  name: string;
  unit: string;
  qty: number;
  rate: number | string;
  amount: number;
}

export const BillingView: React.FC = () => {
  const [masters, setMasters] = useState<Master[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  
  const [selectedMasterId, setSelectedMasterId] = useState<string>('');
  const [workAmountRaw, setWorkAmountRaw] = useState<string>('');
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState<number>(new Date().getFullYear());

  // Additional billing fields
  const [pcsRaw, setPcsRaw] = useState<string>('');
  const [pcs, setPcs] = useState<number>(0);
  const [discountRaw, setDiscountRaw] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);

  // Pending challans of selected master
  const [pendingChallans, setPendingChallans] = useState<Challan[]>([]);
  const [selectedChallanIds, setSelectedChallanIds] = useState<{ [id: string]: boolean }>({});

  // Grouped line items inside selected challans
  const [billingItems, setBillingItems] = useState<GroupedItem[]>([]);
  const [workAmount, setWorkAmount] = useState<number>(0);
  const [materialDeduction, setMaterialDeduction] = useState<number>(0);
  const [netPayable, setNetPayable] = useState<number>(0);

  // Selected PAN and Bank states
  const [selectedPanId, setSelectedPanId] = useState<string>('');
  const [panNo, setPanNo] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [accountNo, setAccountNo] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('');

  // Invoice success feedback
  const [loading, setLoading] = useState<boolean>(false);
  const [successInvoice, setSuccessInvoice] = useState<Invoice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Auto-fill bank and PAN details when master or specific PAN selection changes.
  useEffect(() => {
    if (!selectedMasterId) {
      setSelectedPanId('');
      setPanNo('');
      setBankName('');
      setAccountNo('');
      setIfscCode('');
      setBranchName('');
      return;
    }

    const master = masters.find(m => m.id === selectedMasterId);
    if (master && master.pan_accounts && master.pan_accounts.length > 0) {
      const selectedAccount = master.pan_accounts.find(p => p.id === selectedPanId) || master.pan_accounts[0];
      if (selectedAccount) {
        setSelectedPanId(selectedAccount.id);
        setPanNo(selectedAccount.pan_no);
        setBankName(selectedAccount.bank_name);
        setAccountNo(selectedAccount.account_no);
        setIfscCode(selectedAccount.ifsc_code);
        setBranchName(selectedAccount.branch_name || '');
      }
    } else {
      setSelectedPanId('');
      setPanNo('');
      setBankName('');
      setAccountNo('');
      setIfscCode('');
      setBranchName('');
    }
  }, [selectedMasterId, selectedPanId, masters]);

  const monthsList = [
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' }
  ];

  const loadInitialData = () => {
    setMasters(db.getMasters().filter(m => m.is_active));
    setMaterials(db.getMaterials());
  };

  useEffect(() => {
    loadInitialData();

    window.addEventListener('db_sync', loadInitialData);
    return () => window.removeEventListener('db_sync', loadInitialData);
  }, []);

  // Fetch all pending 'issued' challans when master changes
  useEffect(() => {
    if (selectedMasterId) {
      const allChallans = db.getChallans();
      const masterPending = allChallans.filter(c => c.master_id === selectedMasterId && c.status === 'issued');
      setPendingChallans(masterPending);

      // Auto check all by default
      const initialChecks: { [id: string]: boolean } = {};
      masterPending.forEach(c => {
        initialChecks[c.id] = true;
      });
      setSelectedChallanIds(initialChecks);
    } else {
      setPendingChallans([]);
      setSelectedChallanIds({});
      setBillingItems([]);
    }
    setWorkAmount(0);
    setWorkAmountRaw('');
    setPcs(0);
    setPcsRaw('');
    setDiscount(0);
    setDiscountRaw('');
    setSuccessInvoice(null);
    setErrorMsg('');
  }, [selectedMasterId]);

  // Aggregate item lines when selected challan ids or checked lines change
  useEffect(() => {
    if (!selectedMasterId) return;

    const checkedChallanIds = Object.keys(selectedChallanIds).filter(id => selectedChallanIds[id]);
    const allChallanItems = db.getChallanItems();
    
    // Group items by material_id
    const itemMap: { [matId: string]: GroupedItem } = {};

    checkedChallanIds.forEach(cid => {
      const cItems = allChallanItems.filter(item => item.challan_id === cid);
      cItems.forEach(item => {
        const mat = materials.find(m => m.id === item.material_id);
        if (mat) {
          if (!itemMap[mat.id]) {
            itemMap[mat.id] = {
              material_id: mat.id,
              name: mat.name,
              unit: mat.unit,
              qty: 0,
              rate: item.rate, // uses rate captured on the challan
              amount: 0
            };
          }
          itemMap[mat.id].qty += item.qty;
          itemMap[mat.id].amount += item.qty * (parseFloat(String(itemMap[mat.id].rate)) || 0);
        }
      });
    });

    const groupedList = Object.values(itemMap);
    setBillingItems(groupedList);

    // Compute materials deduction
    const deductionSum = groupedList.reduce((acc, curr) => acc + curr.amount, 0);
    setMaterialDeduction(deductionSum);
  }, [selectedChallanIds, materials, selectedMasterId]);

  // Recalculates net payables
  useEffect(() => {
    setNetPayable(workAmount - materialDeduction);
  }, [workAmount, materialDeduction]);

  // Derived calculation variables according to professional accounting
  const subTotal = workAmount - materialDeduction - discount;
  const tdsAmount = subTotal > 0 ? parseFloat((subTotal * 0.01).toFixed(2)) : 0;
  const preciseGrandTotal = subTotal - tdsAmount;
  const roundedOffGrandTotal = Math.round(preciseGrandTotal);

  const handleChallanToggle = (id: string) => {
    setSelectedChallanIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleInlineRateChange = (materialId: string, rateStr: string) => {
    const cleaned = rateStr.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const finalVal = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    const rateNum = parseFloat(finalVal) || 0;
    
    setBillingItems(prev => {
      const updated = prev.map(item => {
        if (item.material_id === materialId) {
          return { ...item, rate: finalVal, amount: item.qty * rateNum };
        }
        return item;
      });

      // Recalculate material deduction sum
      const deductionSum = updated.reduce((acc, curr) => acc + curr.amount, 0);
      setMaterialDeduction(deductionSum);

      return updated;
    });
  };

  // Create invoice and finalize
  const handleGenerateInvoice = async (status: 'draft' | 'finalised') => {
    try {
      setErrorMsg('');
      setLoading(true);

      const activeChallanIds = Object.keys(selectedChallanIds).filter(id => selectedChallanIds[id]);
      if (activeChallanIds.length === 0) {
        setErrorMsg('At least one Challan must be checked to generate an Invoice.');
        return;
      }

      if (workAmount <= 0) {
        setErrorMsg('Stitching job earnings (Work Amount) must be configured.');
        return;
      }

      const invoicePayload = {
        master_id: selectedMasterId,
        period_month: periodMonth,
        period_year: periodYear,
        work_amount: workAmount,
        material_deduction: materialDeduction,
        net_payable: roundedOffGrandTotal,
        status: status,
        pcs: pcs,
        discount: discount,
        tds_amount: tdsAmount,
        grand_total: preciseGrandTotal,
        selected_pan_no: panNo || undefined,
        selected_bank_name: bankName || undefined,
        selected_account_no: accountNo || undefined,
        selected_ifsc_code: ifscCode || undefined,
        selected_branch_name: branchName || undefined
      };

      // 1. Commit and get compiled invoice Record
      const invoiceResult = db.saveInvoice(invoicePayload, activeChallanIds);

      // 2. Generate PDF download
      const masterObj = masters.find(m => m.id === selectedMasterId)!;
      const chList = db.getChallans().filter(c => activeChallanIds.includes(c.id));
      const allItems = db.getChallanItems();
      
      await generateInvoicePDF(invoiceResult, chList, allItems, masterObj, materials, true);

      // Trigger success panel
      setSuccessInvoice(invoiceResult);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred writing billing registers');
    } finally {
      setLoading(false);
    }
  };

  const triggerPDFDownloadAgain = () => {
    if (successInvoice) {
      const masterObj = masters.find(m => m.id === successInvoice.master_id)!;
      const icList = db.getInvoiceChallans(successInvoice.id).map(ic => ic.challan_id);
      const chList = db.getChallans().filter(c => icList.includes(c.id));
      const allItems = db.getChallanItems();
      generateInvoicePDF(successInvoice, chList, allItems, masterObj, materials, true, false);
    }
  };

  const triggerDirectPrint = () => {
    if (successInvoice) {
      const masterObj = masters.find(m => m.id === successInvoice.master_id)!;
      const icList = db.getInvoiceChallans(successInvoice.id).map(ic => ic.challan_id);
      const chList = db.getChallans().filter(c => icList.includes(c.id));
      const allItems = db.getChallanItems();
      generateInvoicePDF(successInvoice, chList, allItems, masterObj, materials, false, true);
    }
  };

  const resetForm = () => {
    setSelectedMasterId('');
    setWorkAmount(0);
    setWorkAmountRaw('');
    setPcs(0);
    setPcsRaw('');
    setDiscount(0);
    setDiscountRaw('');
    setMaterialDeduction(0);
    setNetPayable(0);
    setSuccessInvoice(null);
    setErrorMsg('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6" id="billing-view">
      
      {/* Search Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <div className="p-2 bg-blue-50 text-[#1A2E4A] rounded-lg">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">MASTER MONTHLY STITCHING SETTLE BILL</h3>
            <p className="text-[10px] text-slate-400 font-sans">Accumulate material challans, enter stitching jobwork earnings, settle balances</p>
          </div>
        </div>

        {/* Filters and inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">SELECT MASTER</label>
            <select
              className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs text-slate-800 font-bold"
              value={selectedMasterId}
              onChange={(e) => setSelectedMasterId(e.target.value)}
            >
              <option value="">-- Choose master craftsman --</option>
              {masters.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.type.toUpperCase()})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">BILLING MONTH</label>
            <select
              className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-bold"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(parseInt(e.target.value, 10))}
            >
              {monthsList.map(m => (
                <option key={m.value} value={m.value}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">BILLING YEAR</label>
            <select
              className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-bold"
              value={periodYear}
              onChange={(e) => setPeriodYear(parseInt(e.target.value, 10))}
            >
              <option value={2025}>F.Y. 2024-25</option>
              <option value={2026}>F.Y. 2025-26</option>
              <option value={2027}>F.Y. 2026-27</option>
            </select>
          </div>

        </div>

      </div>

      {selectedMasterId && (
        <>
          {successInvoice ? (
            /* Success screen context */
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-center max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 bg-blue-50 text-[#1A2E4A] rounded-full flex items-center justify-center mx-auto shadow-xs border border-blue-100">
                <Check className="w-6 h-6 font-bold" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Invoice Draft Compiled</h4>
                <p className="text-slate-500 text-xs mt-1">
                  Settlement <strong className="font-bold">{successInvoice.invoice_no}</strong> for {monthsList.find(m => m.value === successInvoice.period_month)?.name} {successInvoice.period_year} is generated. Referenced challans status changed to billed!
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl text-left text-xs space-y-1.5 border border-slate-250">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Pieces Finished:</span>
                  <span className="font-semibold text-slate-700 font-mono">{successInvoice.pcs || 0} pcs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Credit (Jobs):</span>
                  <span className="font-semibold text-slate-700 font-mono">{formatINR(successInvoice.work_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Material Deductions (Vouchers):</span>
                  <span className="font-semibold text-rose-600 font-mono">- {formatINR(successInvoice.material_deduction)}</span>
                </div>
                {successInvoice.discount ? (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Discount Given:</span>
                    <span className="font-semibold text-rose-600 font-mono">- {formatINR(successInvoice.discount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-slate-200/50 pt-1">
                  <span className="text-slate-400">Sub Total:</span>
                  <span className="font-semibold text-slate-705 font-mono">{formatINR(successInvoice.work_amount - successInvoice.material_deduction - (successInvoice.discount || 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">TDS Deduction (1%):</span>
                  <span className="font-semibold text-rose-500 font-mono">- {formatINR(successInvoice.tds_amount || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1 font-bold">
                  <span className="text-[#1A2E4A]">Grand Total (Rounded):</span>
                  <span className="text-green-700 font-sans">{formatINR(successInvoice.net_payable)}</span>
                </div>
              </div>

              {/* Selected Disbursement Info */}
              {(successInvoice.selected_pan_no || successInvoice.selected_account_no) && (
                <div className="p-3 bg-[#1A2E4A]/5 border border-[#1A2E4A]/10 rounded-xl text-left text-[11px] space-y-1">
                  <p className="font-bold text-[#1A2E4A] tracking-wider uppercase text-[9px]">Disbursement Credentials On Invoice:</p>
                  <div className="text-slate-650 font-mono">
                    {successInvoice.selected_pan_no && <div className="flex justify-between"><span>PAN CARD NO:</span> <span className="font-bold text-slate-800">{successInvoice.selected_pan_no}</span></div>}
                    {successInvoice.selected_account_no && (
                      <div className="mt-1 pt-1 border-t border-slate-100 space-y-0.5">
                        <div className="flex justify-between"><span>BANK NAME:</span> <span className="font-bold text-slate-800">{successInvoice.selected_bank_name}</span></div>
                        <div className="flex justify-between"><span>ACCOUNT NO:</span> <span className="font-bold text-slate-800">{successInvoice.selected_account_no}</span></div>
                        <div className="flex justify-between"><span>IFSC CODE:</span> <span className="font-bold text-slate-800">{successInvoice.selected_ifsc_code}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={triggerPDFDownloadAgain}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={triggerDirectPrint}
                  className="bg-[#1A2E4A] hover:bg-[#14233a] text-white text-xs font-bold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" /> Direct Print
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/50 text-xs font-bold py-2.5 px-3 rounded-lg cursor-pointer transition"
                >
                  Settle More
                </button>
              </div>
            </div>
          ) : (
            /* Main Form UI */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: List of pending challans selection */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#1A2E4A] mb-3 border-b border-slate-100 pb-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="uppercase tracking-wider">SELECT PENDING CHALLANS TO ADD</span>
                  </div>

                  {pendingChallans.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      No active 'issued' material challans found for this Master.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {pendingChallans.map(ch => (
                        <label 
                          key={ch.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                            selectedChallanIds[ch.id] 
                              ? 'bg-slate-50 border-[#1A2E4A]/30 shadow-xs' 
                              : 'bg-white border-slate-150 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 w-4 h-4 text-[#1A2E4A] focus:ring-[#2D3E5D] rounded border-slate-300 cursor-pointer"
                            checked={!!selectedChallanIds[ch.id]}
                            onChange={() => handleChallanToggle(ch.id)}
                          />
                          <div className="flex-1 text-xs">
                            <div className="flex justify-between items-center font-bold text-slate-900">
                              <span>{ch.challan_no}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{formatDate(ch.issued_date)}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 truncate">
                              Issued By: {ch.issued_by}
                            </p>
                            {ch.notes && (
                              <p className="text-[9px] text-slate-400 italic mt-0.5 max-w-[190px] truncate">
                                "{ch.notes}"
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Deduction aggregate and Work input */}
              <div className="lg:col-span-7 space-y-4">
                
                {/* Aggregate list */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <span className="text-[9px] font-bold tracking-widest text-[#1A2E4A] uppercase">SECTION I</span>
                  <h4 className="text-xs font-bold text-slate-800 tracking-tight mb-3 uppercase">AGGREGATE MATERIALS DEDUCTIONS SUMMARY</h4>

                  {billingItems.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      Check pending challans on the left to compute material deductions automatically.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#1A2E4A] text-white font-bold border-b border-slate-200">
                            <th className="py-2.5 px-3">MATERIAL NAME</th>
                            <th className="py-2.5 px-3 text-right">QTY CONS</th>
                            <th className="py-2.5 px-3 text-right w-24">RATE ( दर )</th>
                            <th className="py-2.5 px-3 text-right">AMOUNT ( रक्कम )</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {billingItems.map(item => (
                            <tr key={item.material_id} className="hover:bg-slate-50/55">
                              <td className="py-2 px-3 font-bold text-slate-800">{item.name}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600 font-semibold">{item.qty.toFixed(1)} {item.unit}</td>
                              <td className="py-2 px-3 text-right">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="w-full text-right bg-white border border-slate-200 focus:outline-none focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] rounded px-1.5 py-0.5 text-xs font-mono font-semibold"
                                  value={item.rate}
                                  onChange={(e) => handleInlineRateChange(item.material_id, e.target.value)}
                                />
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatINR(item.amount)}</td>
                            </tr>
                          ))}
                          <tr className="bg-rose-50/50 font-bold border-t border-rose-100 text-rose-950 text-xs">
                            <td colSpan={3} className="py-2.5 px-3 uppercase">TOTAL MATERIAL DEDUCTIONS (A)</td>
                            <td className="py-2.5 px-3 text-right font-mono text-rose-800 font-bold">{formatINR(materialDeduction)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Settle Earnings Panel */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <span className="text-[9px] font-bold tracking-widest text-[#1A2E4A] uppercase">SECTION II</span>
                  <h4 className="text-xs font-bold text-slate-800 tracking-tight uppercase">STITCHING JOB EARNINGS SUMMARY</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-705 mb-1">
                        TOTAL PCS MADE <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Pieces, e.g. 124"
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-mono font-bold text-slate-800"
                        value={pcsRaw}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val;
                          setPcsRaw(cleaned);
                          setPcs(parseFloat(cleaned) || 0);
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-705 mb-1">
                        AMOUNT TO PAY (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Earned, e.g. 210100"
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-mono font-bold text-slate-800"
                        value={workAmountRaw}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val;
                          setWorkAmountRaw(cleaned);
                          setWorkAmount(parseFloat(cleaned) || 0);
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-705 mb-1">
                        DISCOUNT GIVEN (₹)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Discount, e.g. 0"
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-mono font-bold text-slate-800"
                        value={discountRaw}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val;
                          setDiscountRaw(cleaned);
                          setDiscount(parseFloat(cleaned) || 0);
                        }}
                      />
                    </div>
                  </div>

                  {/* SECTION III: Disbursement details with PAN configuration */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <span className="text-[9px] font-bold tracking-widest text-[#1A2E4A] uppercase">SECTION III</span>
                    <h4 className="text-xs font-bold text-slate-800 tracking-tight uppercase">PAN & BANK ACCOUNT DISBURSEMENT DESIGNATION</h4>

                    {(() => {
                      const masterObj = masters.find(m => m.id === selectedMasterId);
                      const hasPanDetails = masterObj && masterObj.pan_accounts && masterObj.pan_accounts.length > 0;

                      return (
                        <div className="space-y-3">
                          {hasPanDetails ? (
                            <div>
                              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                SELECT ACTIVE PAN ACCOUNT <span className="text-red-500">*</span>
                              </span>
                              <select
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-bold text-[#1A2E4A]"
                                value={selectedPanId}
                                onChange={(e) => setSelectedPanId(e.target.value)}
                              >
                                {masterObj.pan_accounts!.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.pan_no} | {p.bank_name} ({p.account_no.slice(-4).padStart(p.account_no.length, '*')})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-850 rounded-lg text-[11px] leading-relaxed space-y-1">
                              <p className="font-bold">No registered bank/PAN accounts found under craftsman file!</p>
                              <p className="text-slate-650">
                                You can configure permanent accounts in <strong className="font-semibold">Settings / Masters Control</strong>. For now, you can input interim credentials below:
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">PAN Card No</label>
                              <input
                                type="text"
                                placeholder="E.g. ABCDE1234F"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs font-mono font-bold uppercase mt-0.5"
                                value={panNo}
                                onChange={(e) => setPanNo(e.target.value.toUpperCase())}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">Bank Name</label>
                              <input
                                type="text"
                                placeholder="E.g. HDFC Bank"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs mt-0.5 font-semibold text-slate-800"
                                value={bankName}
                                onChange={(e) => setBankName(e.target.value)}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">Account Number</label>
                              <input
                                type="text"
                                placeholder="E.g. 50100234567"
                                className="w-full bg-slate-50 border border-slate-201 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs font-mono font-bold mt-0.5"
                                value={accountNo}
                                onChange={(e) => setAccountNo(e.target.value)}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">IFSC Code</label>
                              <input
                                type="text"
                                placeholder="E.g. HDFC0000123"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs font-mono font-bold uppercase mt-0.5"
                                value={ifscCode}
                                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                              />
                            </div>
                          </div>

                          {branchName && (
                            <div className="text-[10px] text-slate-400 font-medium font-mono">
                              Associated branch: <span className="font-semibold text-slate-700">{branchName}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 text-xs border border-slate-200 space-y-2">
                    <p className="text-[10px] text-slate-500 font-bold tracking-wide uppercase">FINAL PAYMENT SETTLEMENT CALCULATION</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Stitching Pieces:</span>
                          <span className="font-semibold text-slate-850 font-mono">{pcs} pcs</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Stitching Work Earnings (Total):</span>
                          <span className="font-semibold text-slate-850 font-mono">{formatINR(workAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Vouchers / Material Deductions (-):</span>
                          <span className="font-semibold text-rose-600 font-mono">- {formatINR(materialDeduction)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Discount Given (-):</span>
                          <span className="font-semibold text-rose-600 font-mono">- {formatINR(discount)}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 border-t sm:border-t-0 sm:border-l border-slate-250/20 pt-2 sm:pt-0 sm:pl-4">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-semibold">Sub Total:</span>
                          <span className="font-semibold text-slate-850 font-mono">{formatINR(subTotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>TDS Deduction (1%):</span>
                          <span className="font-semibold text-orange-700 font-mono">{formatINR(tdsAmount)}</span>
                        </div>
                        <hr className="border-slate-200/60 my-1" />
                        <div className="flex justify-between font-bold text-[#1A2E4A]">
                          <span>Grand Total (Net to Pay):</span>
                          <span className="font-mono">{formatINR(preciseGrandTotal)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-green-700">
                          <span>Rounded off to nearest ₹:</span>
                          <span className="font-mono">{formatINR(roundedOffGrandTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-rose-650" /> {errorMsg}
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleGenerateInvoice('draft')}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-4 rounded-lg text-xs border border-slate-250 cursor-pointer transition"
                    >
                      Save Draft Bill
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleGenerateInvoice('finalised')}
                      className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs shadow-sm cursor-pointer transition uppercase tracking-wider"
                    >
                      Finalise & Print Bill
                    </button>
                  </div>

                </div>

              </div>

            </div>
          )}
        </>
      )}

    </div>
  );
};
export default BillingView;
