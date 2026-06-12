/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Master, Material, Challan } from '../types';
import { generateChallanPDF, formatINR } from '../utils/exportUtils';
import { 
  Plus, 
  Trash2, 
  Printer, 
  Download,
  CheckCircle, 
  AlertTriangle, 
  FileSpreadsheet, 
  Calculator,
  RotateCcw,
  User,
  Search
} from 'lucide-react';

interface ChallanFormItem {
  id: string;
  material_id: string;
  qty: number | string;
  rate: number | string;
  unit: string;
  amount: number;
  stockWarning: boolean;
}

export const IssueChallanView: React.FC = () => {
  const [masters, setMasters] = useState<Master[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  
  const [selectedMasterId, setSelectedMasterId] = useState<string>('');
  const [challanNo, setChallanNo] = useState<string>('');
  const [issuedDate, setIssuedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');

  // Search filters
  const [masterSearch, setMasterSearch] = useState<string>('');
  const [showMasterList, setShowMasterList] = useState<boolean>(false);

  // Line items state
  const [items, setItems] = useState<ChallanFormItem[]>([]);
  const [runningTotal, setRunningTotal] = useState<number>(0);

  // Submission / Success states
  const [loading, setLoading] = useState<boolean>(false);
  const [successChallan, setSuccessChallan] = useState<Challan | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [overrideConfirm, setOverrideConfirm] = useState<boolean>(false);
  
  // Loaded materials search for rows
  const [rowSearchTerms, setRowSearchTerms] = useState<{ [rowId: string]: string }>({});
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

  const loadChallanMastersData = () => {
    const activeMasters = db.getMasters().filter(m => m.is_active);
    const activeMaterials = db.getMaterials().filter(m => m.is_active);
    setMasters(activeMasters);
    setMaterials(activeMaterials);

    // Set auto-increment seq
    setChallanNo(db.getNextChallanNo());
  };

  const createBlankRows = (count: number, startIdx: number = 0): ChallanFormItem[] => {
    const newRows: ChallanFormItem[] = [];
    const baseTime = Date.now();
    for (let i = 0; i < count; i++) {
      const newId = `row-${baseTime}-${startIdx + i}-${Math.random().toString(36).substring(2, 7)}`;
      newRows.push({
        id: newId,
        material_id: '',
        qty: '',
        rate: '',
        unit: 'pc',
        amount: 0,
        stockWarning: false
      });
    }
    return newRows;
  };

  useEffect(() => {
    loadChallanMastersData();

    // Initialize with 20 empty rows
    setItems(createBlankRows(20));

    window.addEventListener('db_sync', loadChallanMastersData);
    return () => window.removeEventListener('db_sync', loadChallanMastersData);
  }, []);

  // Recalculates amount and total
  useEffect(() => {
    let tot = 0;
    items.forEach(item => {
      const q = parseFloat(String(item.qty)) || 0;
      const r = parseFloat(String(item.rate)) || 0;
      tot += q * r;
    });
    setRunningTotal(tot);
  }, [items]);

  const addItemRow = () => {
    setItems(prev => [...prev, ...createBlankRows(1, prev.length)]);
  };

  const add20ItemRows = () => {
    setItems(prev => [...prev, ...createBlankRows(20, prev.length)]);
  };

  const deleteItemRow = (id: string) => {
    if (items.length > 1) {
      setItems(prev => prev.filter(item => item.id !== id));
    } else {
      setItems(createBlankRows(20));
    }
  };

  const handleMasterChange = (masterId: string) => {
    setSelectedMasterId(masterId);
    setMasterSearch(masters.find(m => m.id === masterId)?.name || '');
    setShowMasterList(false);

    // Update rates in grid based on master overrides!
    setItems(currentItems => {
      return currentItems.map(item => {
        if (item.material_id) {
          const rate = db.getRateForMaster(masterId, item.material_id);
          const q = parseFloat(String(item.qty)) || 0;
          return { ...item, rate, amount: q * rate };
        }
        return item;
      });
    });
  };

  const handleMaterialSelect = (rowId: string, materialId: string) => {
    const mat = materials.find(m => m.id === materialId);
    if (!mat) return;

    // Resolve specific master rate overrides if any is set
    const rate = selectedMasterId ? db.getRateForMaster(selectedMasterId, materialId) : mat.default_rate;

    setItems(prev => prev.map(item => {
      if (item.id === rowId) {
        // Stock level warning check
        const q = parseFloat(String(item.qty)) || 0;
        const isExcess = q > mat.current_stock;
        return {
          ...item,
          material_id: materialId,
          unit: mat.unit,
          rate: rate,
          amount: q * rate,
          stockWarning: isExcess
        };
      }
      return item;
    }));

    setRowSearchTerms(prev => ({ ...prev, [rowId]: mat.name }));
    setFocusedRowId(null);
  };

  const handleQtyChange = (rowId: string, qtyVal: string) => {
    const cleaned = qtyVal.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const finalVal = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    const qtyNum = parseFloat(finalVal) || 0;

    setItems(prev => prev.map(item => {
      if (item.id === rowId) {
        let warning = false;
        if (item.material_id) {
          const mat = materials.find(m => m.id === item.material_id);
          if (mat && qtyNum > mat.current_stock) {
            warning = true;
          }
        }
        const rateNum = parseFloat(String(item.rate)) || 0;
        return { ...item, qty: finalVal, amount: qtyNum * rateNum, stockWarning: warning };
      }
      return item;
    }));
  };

  const handleRateChange = (rowId: string, rateVal: string) => {
    const cleaned = rateVal.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const finalVal = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    const rateNum = parseFloat(finalVal) || 0;

    setItems(prev => prev.map(item => {
      if (item.id === rowId) {
        const qtyNum = parseFloat(String(item.qty)) || 0;
        return { ...item, rate: finalVal, amount: qtyNum * rateNum };
      }
      return item;
    }));
  };

  // Submit the issue challan records
  const handleIssueChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedMasterId) {
      setErrorMessage('Please select a Master Stitcher before issuing.');
      return;
    }

    // Filter valid lines
    const validLines = items.filter(item => item.material_id !== '');
    if (validLines.length === 0) {
      setErrorMessage('Please add at least one material to issue.');
      return;
    }

    // Stock verification
    const hasWarnings = validLines.some(line => {
      const mat = materials.find(m => m.id === line.material_id);
      return mat && parseFloat(String(line.qty)) > mat.current_stock;
    });

    if (hasWarnings && !overrideConfirm) {
      setErrorMessage('ATTENTION: One or more rows exceed raw stock levels. Confirm below to allow stock overwrite.');
      return;
    }

    try {
      setLoading(true);
      
      const challanData = {
        challan_no: challanNo,
        master_id: selectedMasterId,
        issued_date: issuedDate,
        notes: notes
      };

      const lineItems = validLines.map(line => ({
        material_id: line.material_id,
        qty: parseFloat(String(line.qty)) || 0,
        rate: parseFloat(String(line.rate)) || 0
      }));

      // 1. Commit to DB
      const result = db.saveChallan(challanData, lineItems);

      // 2. Generate PDF & Auto Download
      const masterObj = masters.find(m => m.id === selectedMasterId)!;
      await generateChallanPDF(result, db.getChallanItems(result.id), masterObj, materials, true);

      // Save success result triggers success frame
      setSuccessChallan(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while writing the database');
    } finally {
      setLoading(false);
    }
  };

  const triggerPDFDownloadAgain = () => {
    if (successChallan) {
      const masterObj = masters.find(m => m.id === successChallan.master_id)!;
      generateChallanPDF(successChallan, db.getChallanItems(successChallan.id), masterObj, materials, true, false);
    }
  };

  const triggerDirectPrint = () => {
    if (successChallan) {
      const masterObj = masters.find(m => m.id === successChallan.master_id)!;
      generateChallanPDF(successChallan, db.getChallanItems(successChallan.id), masterObj, materials, false, true);
    }
  };

  const resetForm = () => {
    setSelectedMasterId('');
    setMasterSearch('');
    setNotes('');
    setItems([]);
    setSuccessChallan(null);
    setOverrideConfirm(false);
    setErrorMessage('');
    setChallanNo(db.getNextChallanNo());
    
    // Append 20 empty lines
    setItems(createBlankRows(20));
  };

  // Filter masters list
  const filteredMasters = masters.filter(m => 
    m.name.toLowerCase().includes(masterSearch.toLowerCase()) ||
    m.code.toLowerCase().includes(masterSearch.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-5xl mx-auto" id="issue-challan-view">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-[#1A2E4A] tracking-tight">ISSUE NEW MATERIAL CHALLAN</h2>
          <p className="text-slate-400 text-xs mt-0.5">Dispense fabrics, zips, lining and buttons to Master Stitchers</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 font-semibold font-sans">CURRENT VOUCHER</p>
          <span className="text-lg font-mono font-bold text-rose-600 block">{challanNo}</span>
        </div>
      </div>

      {successChallan ? (
        /* Success Screen */
        <div className="text-center py-10 space-y-6 max-w-md mx-auto">
          <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-xs border border-green-100">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Material Issued Successfully!</h3>
            <p className="text-slate-500 text-sm mt-1">
              Challan <strong className="font-semibold">{successChallan.challan_no}</strong> has been saved. Material stock counts have been decremented.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Master Stitcher:</span>
              <span className="font-semibold text-slate-800">{masters.find(m => m.id === successChallan.master_id)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Value:</span>
              <span className="font-bold text-[#1A2E4A]">{formatINR(runningTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Date Issued:</span>
              <span className="text-slate-600">{successChallan.issued_date.split('-').reverse().join('/')}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={triggerPDFDownloadAgain}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" /> Download PDF
            </button>
            <button
              onClick={triggerDirectPrint}
              className="flex-1 bg-[#1A2E4A] hover:bg-[#14233a] text-white font-bold py-2.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" /> Direct Print
            </button>
            <button
              onClick={resetForm}
              className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/50 font-bold py-2.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Issue Another
            </button>
          </div>
        </div>
      ) : (
        /* Form inputs start */
        <form onSubmit={handleIssueChallan} className="space-y-6">
          
          {/* Top Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            
            {/* Master picker Searchable */}
            <div className="md:col-span-6 relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" /> SELECT MASTER STITCHER <span className="text-red-500">*</span>
              </label>
              
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type name / search code (e.g. KK, FARID)..."
                  className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 pl-9 text-xs shadow-xs text-slate-800 font-semibold"
                  value={masterSearch}
                  onChange={(e) => {
                    setMasterSearch(e.target.value);
                    setShowMasterList(true);
                  }}
                  onFocus={() => setShowMasterList(true)}
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                {masterSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setMasterSearch('');
                      setSelectedMasterId('');
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-[10px]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Suggestions dropdown */}
              {showMasterList && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {filteredMasters.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400 text-center">No active Master found</p>
                  ) : (
                    filteredMasters.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleMasterChange(m.id)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 font-bold text-slate-700 hover:text-[#1A2E4A] transition flex justify-between items-center"
                      >
                        <span>{m.name}</span>
                        <span className="bg-slate-100 text-slate-500 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                          {m.type.toUpperCase()} • {m.code}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Datepicker */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">CHALLAN DATE</label>
              <input
                type="date"
                required
                className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs shadow-xs font-medium"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </div>

            {/* Auto increment text */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">CHALLAN REFERENCE</label>
              <input
                type="text"
                disabled
                className="w-full bg-slate-100/80 border border-slate-200 rounded-lg py-2 px-3 text-xs shadow-xs font-mono font-bold text-slate-600 cursor-not-allowed"
                value={challanNo}
              />
            </div>

          </div>

          {/* Line items Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 tracking-wider">CHALLAN LINE ITEMS (विवरण सूची)</h4>
            
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1A2E4A] text-white font-semibold">
                    <th className="py-3 px-3 w-10 text-center">SR</th>
                    <th className="py-3 px-3">MATERIAL SELECTOR (सामग्री विवरण)</th>
                    <th className="py-3 px-3 w-28 text-right">QUANTITY</th>
                    <th className="py-3 px-3 w-20 text-center">UNIT</th>
                    <th className="py-3 px-3 w-28 text-right">RATE (₹)</th>
                    <th className="py-3 px-3 w-32 text-right">AMOUNT (₹)</th>
                    <th className="py-3 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => {
                    const matObj = materials.find(m => m.id === item.material_id);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition">
                        
                        {/* SR */}
                        <td className="py-3 px-3 text-center align-middle font-semibold text-slate-400">
                          {index + 1}
                        </td>

                        {/* Dropdown Material Selector */}
                        <td className="py-3 px-3 align-middle">
                          <select
                            className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold cursor-pointer"
                            value={item.material_id}
                            onChange={(e) => handleMaterialSelect(item.id, e.target.value)}
                          >
                            <option value="">-- Choose Material --</option>
                            {materials.map(m => {
                              const resolvedRate = selectedMasterId ? db.getRateForMaster(selectedMasterId, m.id) : m.default_rate;
                              return (
                                <option key={m.id} value={m.id}>
                                  {m.name} [₹{resolvedRate} / Stock: {m.current_stock.toFixed(1)} {m.unit}]
                                </option>
                              );
                            })}
                          </select>
                          
                          {/* Stock warn tags */}
                          {item.stockWarning && matObj && (
                            <span className="text-[9px] text-rose-600 bg-rose-50 border border-rose-100 rounded px-1 mt-1 block w-max font-semibold flex items-center gap-0.5 animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5" /> Overdraft: {matObj.current_stock.toFixed(1)} available
                            </span>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="py-3 px-3 align-middle">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.0"
                            className="w-full text-right bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs font-mono font-semibold"
                            value={item.qty}
                            onChange={(e) => handleQtyChange(item.id, e.target.value)}
                          />
                        </td>

                        {/* Unit auto-filled */}
                        <td className="py-3 px-3 text-center align-middle text-slate-500 font-medium font-sans">
                          {item.unit}
                        </td>

                        {/* Editable Rate */}
                        <td className="py-3 px-3 align-middle">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            className="w-full text-right bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs font-mono font-semibold"
                            value={item.rate}
                            onChange={(e) => handleRateChange(item.id, e.target.value)}
                          />
                        </td>

                        {/* Calculated line amount */}
                        <td className="py-3 px-3 text-right align-middle font-mono font-bold text-slate-900">
                          {formatINR(item.amount)}
                        </td>

                        {/* Delete row */}
                        <td className="py-3 px-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => deleteItemRow(item.id)}
                            className="text-slate-400 hover:text-rose-600 transition p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add row controllers */}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={addItemRow}
                className="bg-slate-100 hover:bg-slate-200 text-slate-750 border border-slate-200 text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Row Line
              </button>
              <button
                type="button"
                onClick={add20ItemRows}
                className="bg-[#1A2E4A]/10 hover:bg-[#1A2E4A]/25 text-[#1A2E4A] border border-[#1A2E4A]/20 text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer font-sans"
              >
                <Plus className="w-4 h-4" /> Add 20 Rows
              </button>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Notes/Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              CHALLAN NOTES / JOB REMARKS (Optional)
            </label>
            <textarea
              placeholder="E.g. Velvet material for front panel work, delivery scheduled by next weekend as per supervisor"
              className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-3 text-xs min-h-[60px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Error panel / warnings */}
          {errorMessage && (
            <div className="p-4 bg-orange-50 border border-orange-250 text-orange-850 rounded-lg space-y-2 text-xs flex flex-col">
              <span className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 " /> {errorMessage}
              </span>
              {errorMessage.includes('exceed raw stock levels') && (
                <label className="flex items-center gap-2 mt-2 bg-white/80 p-2 rounded border border-orange-200">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded border-slate-300"
                    checked={overrideConfirm}
                    onChange={(e) => setOverrideConfirm(e.target.checked)}
                  />
                  <span className="font-bold text-slate-800">
                    Authorize stock override / force debit despite low levels
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Grid summary and Issue Button block */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 bg-gradient-to-r from-[#1A2E4A] to-[#2D3E5D] text-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-300" />
              <div>
                <p className="text-[10px] text-slate-300 font-bold font-sans uppercase">AGGREGATE ESTIMATED OUTFLOW</p>
                <p className="text-xl font-bold font-mono text-white">{formatINR(runningTotal)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={resetForm}
                className="bg-slate-800/40 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-lg cursor-pointer transition"
              >
                Reset Fields
              </button>
              
              <button
                type="submit"
                disabled={loading}
                className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2.5 px-6 rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                {loading ? 'Processing...' : 'Issue Challan & Print'}
              </button>
            </div>
          </div>

        </form>
      )}

    </div>
  );
};
export default IssueChallanView;
