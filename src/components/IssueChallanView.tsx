/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { getLocalTodayString } from '../utils/dateUtils';
import { Master, Material, Challan, Profile } from '../types';
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

const getFilteredAndRankedMaterials = (search: string, allMaterials: Material[]) => {
  const query = search.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!query) return allMaterials;

  return allMaterials
    .map(m => {
      const nameLower = m.name.toLowerCase().replace(/\s+/g, ' ');
      
      // 1. Exact match
      if (nameLower === query) {
        return { material: m, score: 1 };
      }
      // 2. Material name starts with search text
      if (nameLower.startsWith(query)) {
        return { material: m, score: 2 };
      }
      // 3. Any word in material name starts with search text
      const words = nameLower.split(' ');
      const anyWordStarts = words.some(w => w.startsWith(query));
      if (anyWordStarts) {
        return { material: m, score: 3 };
      }
      // 4. Material name contains search text anywhere
      if (nameLower.includes(query)) {
        return { material: m, score: 4 };
      }
      
      // No match
      return { material: m, score: 999 };
    })
    .filter(item => item.score < 999)
    .sort((a, b) => a.score - b.score)
    .map(item => item.material);
};

export const IssueChallanView: React.FC = () => {
  const hasOverStockError = false;
  const [currentUser, setCurrentUser] = useState<Profile>(db.getCurrentUser());
  const [backdatedReason, setBackdatedReason] = useState<string>('');
  const [masters, setMasters] = useState<Master[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  
  const [selectedMasterId, setSelectedMasterId] = useState<string>('');
  const [challanNo, setChallanNo] = useState<string>('');
  const [issuedDate, setIssuedDate] = useState<string>(getLocalTodayString());
  const [notes, setNotes] = useState<string>('');
  const [issuedBy, setIssuedBy] = useState<string>('');
  const [customIssuerName, setCustomIssuerName] = useState<string>('');
  const [isCustomIssuer, setIsCustomIssuer] = useState<boolean>(false);
  const [issuerNames, setIssuerNames] = useState<string[]>(['Sundar', 'Balaji', 'Shekhar', 'Sumit', 'Riyaz']);

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

  // Keyboard navigation & Suggestion Index states
  const [highlightedMasterIndex, setHighlightedMasterIndex] = useState<number>(-1);
  const [highlightedMaterialIndex, setHighlightedMaterialIndex] = useState<number>(-1);
  const inputRefs = React.useRef<{ [key: string]: HTMLElement | null }>({});

  // Custom Confirmation Modal States
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [confirmSandboxTest, setConfirmSandboxTest] = useState<boolean>(false);
  const [showIssueConfirm, setShowIssueConfirm] = useState<boolean>(false);
  const [rowToDelete, setRowToDelete] = useState<ChallanFormItem | null>(null);

  const loadChallanMastersData = () => {
    const activeMasters = db.getMasters().filter(m => m.is_active);
    const activeMaterials = db.getMaterials().filter(m => m.is_active);
    setMasters(activeMasters);
    setMaterials(activeMaterials);
    
    const user = db.getCurrentUser();
    setCurrentUser(user);

    // Set auto-increment seq
    setChallanNo(db.getNextChallanNo());

    // Populate issuer names strictly as requested
    const combined = ['Sundar', 'Balaji', 'Shekhar', 'Sumit', 'Riyaz'];
    setIssuerNames(combined);
    
    // Set initial issuedBy if empty
    setIssuedBy(prev => {
      if (prev) return prev;
      return 'Sundar';
    });
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

  // Focus Print/Download button on success
  useEffect(() => {
    if (successChallan) {
      setTimeout(() => {
        inputRefs.current['downloadBtn']?.focus();
      }, 100);
    }
  }, [successChallan]);

  // Global keydown listeners for shortcuts (Alt+N, Ctrl+Enter, Esc)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Check if any confirmation modal or dropdown is active, to handle Esc
      if (e.key === 'Escape') {
        setShowResetConfirm(false);
        setShowIssueConfirm(false);
        setRowToDelete(null);
        setShowMasterList(false);
        setFocusedRowId(null);
      }

      // Alt+N shortcut to add a new line and focus it
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setItems(prev => {
          const nextIdx = prev.length;
          const newRow = createBlankRows(1, nextIdx)[0];
          setTimeout(() => {
            inputRefs.current[`${newRow.id}-material`]?.focus();
          }, 100);
          return [...prev, newRow];
        });
      }

      // Ctrl+Enter shortcut to trigger final submission modal
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        // Trigger issue challan submit flow (validating first)
        const validLines = items.filter(item => item.material_id !== '');
        if (selectedMasterId && validLines.length > 0 && !hasOverStockError) {
          setShowIssueConfirm(true);
        } else {
          // If not valid, trigger submit so validation errors show up
          const form = document.getElementById('issue-challan-view')?.querySelector('form');
          form?.requestSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [items, selectedMasterId, hasOverStockError]);

  // Memoized aggregated requested quantities by materialId to prevent state loop updates
  const aggregatedQtys = React.useMemo(() => {
    const agg: { [matId: string]: number } = {};
    items.forEach(item => {
      if (item.material_id) {
        const q = parseFloat(String(item.qty)) || 0;
        agg[item.material_id] = (agg[item.material_id] || 0) + q;
      }
    });
    return agg;
  }, [items]);

  // Derived check if the combined total of a material exceeds available stock
  const isRowOverStock = React.useCallback((item: ChallanFormItem) => {
    return false;
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
    const row = items.find(item => item.id === id);
    if (!row) return;

    const isNonEmpty = row.material_id !== '' || (parseFloat(String(row.qty)) || 0) > 0;
    if (isNonEmpty) {
      setRowToDelete(row);
    } else {
      executeDeleteRow(id);
    }
  };

  const executeDeleteRow = (id: string) => {
    setRowToDelete(null);
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
        const q = parseFloat(String(item.qty)) || 0;
        return {
          ...item,
          material_id: materialId,
          unit: mat.unit,
          rate: rate,
          amount: q * rate,
          stockWarning: false
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
        const rateNum = parseFloat(String(item.rate)) || 0;
        return { ...item, qty: finalVal, amount: qtyNum * rateNum, stockWarning: false };
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

    // Stock verification - hard block (aggregated by material ID)
    if (hasOverStockError) {
      setErrorMessage('ATTENTION: One or more materials exceed available stock levels in aggregate. You must fix these errors before you can issue the challan.');
      return;
    }

    const todayStr = getLocalTodayString();

    // Future date block
    if (issuedDate > todayStr) {
      setErrorMessage("Future dated challans are not allowed.");
      return;
    }

    // Issuer validation
    if (isCustomIssuer && !customIssuerName.trim()) {
      setErrorMessage("Please specify the issuer name.");
      return;
    } else if (!isCustomIssuer && !issuedBy.trim()) {
      setErrorMessage("Please select an issuer.");
      return;
    }

    // Backdated logic validation
    const isBackdated = issuedDate < todayStr;
    if (isBackdated) {
      if (!currentUser.canCreateBackdatedChallan) {
        setErrorMessage("Backdated challan is allowed only for authorized user.");
        return;
      }
      if (!backdatedReason.trim()) {
        setErrorMessage("Reason is required for backdated challan.");
        return;
      }
    }

    if (db.isSandboxModeActive() && !confirmSandboxTest) {
      setErrorMessage("Sandbox testing mode is active. Issue challan is currently locked. To write to live production, disable sandbox mode in settings/profile dropdown; or check the proceed checkbox below to perform a sandbox test write.");
      return;
    }

    setShowIssueConfirm(true);
  };

  const executeIssueChallan = async () => {
    setShowIssueConfirm(false);
    setErrorMessage('');
    try {
      setLoading(true);
      
      const todayStr = getLocalTodayString();

      // Front-end sanity re-validation
      if (issuedDate > todayStr) {
        throw new Error("Future dated challans are not allowed.");
      }

      // Issuer validation
      const finalIssuer = isCustomIssuer ? customIssuerName.trim() : issuedBy;
      if (!finalIssuer) {
        throw new Error("Please select or specify the issuer name.");
      }

      const isBackdated = issuedDate < todayStr;
      if (isBackdated) {
        if (!currentUser.canCreateBackdatedChallan) {
          throw new Error("Backdated challan is allowed only for authorized user.");
        }
        if (!backdatedReason.trim()) {
          throw new Error("Reason is required for backdated challan.");
        }
      }

      const validLines = items.filter(item => item.material_id !== '');
      const challanData = {
        challan_no: challanNo,
        master_id: selectedMasterId,
        issued_date: issuedDate,
        notes: notes,
        issued_by: finalIssuer,
        backdatedReason: isBackdated ? backdatedReason.trim() : undefined
      };

      const lineItems = validLines.map(line => ({
        material_id: line.material_id,
        qty: parseFloat(String(line.qty)) || 0,
        rate: parseFloat(String(line.rate)) || 0
      }));

      // 1. Commit to DB
      const result = await db.saveChallan(challanData, lineItems, db.isSandboxModeActive() && confirmSandboxTest);

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
    setBackdatedReason('');
    setIssuedDate(getLocalTodayString());
    setChallanNo(db.getNextChallanNo());
    
    // Append 20 empty lines
    setItems(createBlankRows(20));
  };

  // Filter masters list
  const filteredMasters = masters.filter(m => 
    m.name.toLowerCase().includes(masterSearch.toLowerCase()) ||
    m.code.toLowerCase().includes(masterSearch.toLowerCase())
  );

  // List of clear error messages for materials exceeding stock
  const stockErrors: string[] = [];

  const autoMergeDuplicates = () => {
    const mergedMap: { [matId: string]: ChallanFormItem } = {};
    const otherRows: ChallanFormItem[] = [];

    items.forEach(item => {
      if (item.material_id) {
        if (!mergedMap[item.material_id]) {
          mergedMap[item.material_id] = { ...item };
        } else {
          // Combine quantity of duplicate
          const existingQty = parseFloat(String(mergedMap[item.material_id].qty)) || 0;
          const newQty = parseFloat(String(item.qty)) || 0;
          const totalQty = existingQty + newQty;

          const rate = parseFloat(String(mergedMap[item.material_id].rate)) || 0;
          mergedMap[item.material_id].qty = totalQty;
          mergedMap[item.material_id].amount = totalQty * rate;
        }
      } else {
        otherRows.push(item);
      }
    });

    const mergedRows = Object.values(mergedMap);
    const finalRows = [...mergedRows, ...otherRows];
    
    // Maintain minimum 20 rows
    if (finalRows.length < 20) {
      const paddingCount = 20 - finalRows.length;
      finalRows.push(...createBlankRows(paddingCount, finalRows.length));
    }

    setItems(finalRows);
  };

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
                  ref={el => { inputRefs.current['masterSearch'] = el; }}
                  className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 pl-9 text-xs shadow-xs text-slate-800 font-semibold"
                  value={masterSearch}
                  onChange={(e) => {
                    setMasterSearch(e.target.value);
                    setShowMasterList(true);
                    setHighlightedMasterIndex(0);
                  }}
                  onFocus={() => {
                    setShowMasterList(true);
                    setHighlightedMasterIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedMasterIndex(prev => {
                        const nextIdx = prev + 1;
                        return nextIdx < filteredMasters.length ? nextIdx : prev;
                      });
                      setShowMasterList(true);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedMasterIndex(prev => {
                        const prevIdx = prev - 1;
                        return prevIdx >= 0 ? prevIdx : 0;
                      });
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (showMasterList && highlightedMasterIndex >= 0 && highlightedMasterIndex < filteredMasters.length) {
                        handleMasterChange(filteredMasters[highlightedMasterIndex].id);
                        setHighlightedMasterIndex(-1);
                        setTimeout(() => {
                          inputRefs.current[`${items[0].id}-material`]?.focus();
                        }, 50);
                      } else {
                        setShowMasterList(false);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowMasterList(false);
                      setHighlightedMasterIndex(-1);
                    }
                  }}
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                {masterSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setMasterSearch('');
                      setSelectedMasterId('');
                      setHighlightedMasterIndex(-1);
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-[10px]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Suggestions dropdown */}
              {showMasterList && (
                <div 
                  className="absolute z-30 w-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden max-h-48 overflow-y-auto"
                  role="listbox"
                >
                  {filteredMasters.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400 text-center">No active Master found</p>
                  ) : (
                    filteredMasters.map((m, idx) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          handleMasterChange(m.id);
                          setTimeout(() => {
                            inputRefs.current[`${items[0].id}-material`]?.focus();
                          }, 50);
                        }}
                        onMouseEnter={() => setHighlightedMasterIndex(idx)}
                        className={`w-full text-left px-3 py-2 text-xs font-bold transition flex justify-between items-center ${
                          idx === highlightedMasterIndex 
                            ? 'bg-slate-100 text-[#1A2E4A]' 
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        role="option"
                        aria-selected={idx === highlightedMasterIndex}
                      >
                        <span>{m.name}</span>
                        <span className="bg-slate-200 text-slate-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                          {m.type.toUpperCase()} • {m.code}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Issuer name select / input */}
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" /> ISSUED BY <span className="text-red-500">*</span>
              </label>
              {!isCustomIssuer ? (
                <div className="relative">
                  <select
                    required
                    className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs shadow-xs font-semibold text-slate-800"
                    value={issuedBy}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomIssuer(true);
                      } else {
                        setIssuedBy(e.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>-- Select Issuer Name --</option>
                    {issuerNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    <option value="__custom__" className="text-[#1A2E4A] font-bold">+ Add Custom Name...</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Enter custom issuer's real name..."
                    className="flex-1 bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs shadow-xs font-semibold text-slate-800"
                    value={customIssuerName}
                    onChange={(e) => setCustomIssuerName(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomIssuer(false);
                      setCustomIssuerName('');
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-2 rounded-lg text-xs border border-slate-200 transition"
                  >
                    Select List
                  </button>
                </div>
              )}
            </div>

            {/* Datepicker */}
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-slate-700 mb-1">CHALLAN DATE</label>
              <input
                type="date"
                required
                disabled={!currentUser.canCreateBackdatedChallan}
                max={getLocalTodayString()}
                className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs shadow-xs font-medium"
                value={issuedDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setIssuedDate(newDate);
                  const todayStr = getLocalTodayString();
                  const isBack = newDate < todayStr;
                  setChallanNo(db.getNextChallanNo(isBack));
                }}
              />
            </div>

            {/* Auto increment text */}
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-slate-700 mb-1">CHALLAN REFERENCE</label>
              <input
                type="text"
                disabled
                className="w-full bg-slate-100/80 border border-slate-200 rounded-lg py-2 px-3 text-xs shadow-xs font-mono font-bold text-slate-600 cursor-not-allowed"
                value={challanNo}
              />
            </div>

            {/* Backdated Reason */}
            {currentUser.canCreateBackdatedChallan && issuedDate < getLocalTodayString() && (
              <div className="md:col-span-12 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <label className="block text-xs font-bold text-amber-800 uppercase">Reason for backdated challan <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Reason for backdated challan (e.g. June reconciliation / manual entry backlog)"
                  className="w-full bg-white border border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none rounded-lg py-2 px-3 text-xs shadow-xs font-semibold text-amber-900"
                  value={backdatedReason}
                  onChange={(e) => setBackdatedReason(e.target.value)}
                />
              </div>
            )}

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

                        {/* Autocomplete Material Selector */}
                        <td className="py-3 px-3 align-middle relative">
                          <div className="relative">
                            <input
                              type="text"
                              ref={el => { inputRefs.current[`${item.id}-material`] = el; }}
                              className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold animate-none"
                              placeholder="Type to search material..."
                              value={rowSearchTerms[item.id] !== undefined ? rowSearchTerms[item.id] : (materials.find(m => m.id === item.material_id)?.name || '')}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRowSearchTerms(prev => ({ ...prev, [item.id]: val }));
                                if (!val) {
                                  // Clear selected material if cleared
                                  setItems(prevItems => prevItems.map(prevItem => {
                                    if (prevItem.id === item.id) {
                                      return { ...prevItem, material_id: '', rate: '', amount: 0, stockWarning: false };
                                    }
                                    return prevItem;
                                  }));
                                } else {
                                  // If there is an exact match while typing, select it automatically
                                  const exactMat = materials.find(m => m.name.toLowerCase() === val.toLowerCase());
                                  if (exactMat) {
                                    handleMaterialSelect(item.id, exactMat.id);
                                  }
                                }
                                setFocusedRowId(item.id);
                                setHighlightedMaterialIndex(0);
                              }}
                              onFocus={() => {
                                setFocusedRowId(item.id);
                                setHighlightedMaterialIndex(0);
                                if (rowSearchTerms[item.id] === undefined) {
                                  const existingName = materials.find(m => m.id === item.material_id)?.name || '';
                                  setRowSearchTerms(prev => ({ ...prev, [item.id]: existingName }));
                                }
                              }}
                              onBlur={() => {
                                // Delay slightly so clicks in dropdown register
                                setTimeout(() => {
                                  setFocusedRowId(current => current === item.id ? null : current);
                                }, 250);
                              }}
                              onKeyDown={(e) => {
                                const currentSearch = rowSearchTerms[item.id] || '';
                                const filtered = getFilteredAndRankedMaterials(currentSearch, materials);

                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  if (focusedRowId === item.id && filtered.length > 0) {
                                    setHighlightedMaterialIndex(prev => {
                                      const nextIdx = prev + 1;
                                      return nextIdx < filtered.length ? nextIdx : prev;
                                    });
                                  } else {
                                    const nextIdx = index + 1;
                                    if (nextIdx < items.length) {
                                      inputRefs.current[`${items[nextIdx].id}-material`]?.focus();
                                    }
                                  }
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  if (focusedRowId === item.id && highlightedMaterialIndex > 0) {
                                    setHighlightedMaterialIndex(prev => prev - 1);
                                  } else {
                                    const prevIdx = index - 1;
                                    if (prevIdx >= 0) {
                                      inputRefs.current[`${items[prevIdx].id}-material`]?.focus();
                                    } else {
                                      inputRefs.current['masterSearch']?.focus();
                                    }
                                  }
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (focusedRowId === item.id && highlightedMaterialIndex >= 0 && highlightedMaterialIndex < filtered.length) {
                                    const selectedMat = filtered[highlightedMaterialIndex];
                                    handleMaterialSelect(item.id, selectedMat.id);
                                    setHighlightedMaterialIndex(-1);
                                    setTimeout(() => {
                                      inputRefs.current[`${item.id}-qty`]?.focus();
                                    }, 100);
                                  } else {
                                    inputRefs.current[`${item.id}-qty`]?.focus();
                                  }
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setFocusedRowId(null);
                                  setHighlightedMaterialIndex(-1);
                                }
                              }}
                            />
                            
                            {/* Suggestions Dropdown */}
                            {focusedRowId === item.id && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden max-h-56 overflow-y-auto" role="listbox">
                                {(() => {
                                  const currentSearch = rowSearchTerms[item.id] || '';
                                  const filtered = getFilteredAndRankedMaterials(currentSearch, materials);
                                  
                                  if (filtered.length === 0) {
                                    return <p className="p-2.5 text-[11px] text-slate-400 text-center">No matching materials found</p>;
                                  }

                                  return filtered.map((m, idx) => {
                                    const resolvedRate = selectedMasterId ? db.getRateForMaster(selectedMasterId, m.id) : m.default_rate;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onMouseEnter={() => setHighlightedMaterialIndex(idx)}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handleMaterialSelect(item.id, m.id);
                                          setHighlightedMaterialIndex(-1);
                                          setTimeout(() => {
                                            inputRefs.current[`${item.id}-qty`]?.focus();
                                          }, 100);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs font-bold transition flex justify-between items-center border-b border-slate-50 last:border-0 ${
                                          idx === highlightedMaterialIndex
                                            ? 'bg-slate-100 text-[#1A2E4A]'
                                            : 'bg-white text-slate-700 hover:bg-slate-50'
                                        }`}
                                        role="option"
                                        aria-selected={idx === highlightedMaterialIndex}
                                      >
                                        <span>{m.name}</span>
                                        <span className="bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-bold">
                                          ₹{resolvedRate}
                                        </span>
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="py-3 px-3 align-middle">
                          <input
                            type="text"
                            inputMode="decimal"
                            ref={el => { inputRefs.current[`${item.id}-qty`] = el; }}
                            placeholder="0.0"
                            className="w-full text-right bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs font-mono font-semibold"
                            value={item.qty}
                            onChange={(e) => handleQtyChange(item.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const nextIdx = index + 1;
                                if (nextIdx < items.length) {
                                  inputRefs.current[`${items[nextIdx].id}-qty`]?.focus();
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const prevIdx = index - 1;
                                if (prevIdx >= 0) {
                                  inputRefs.current[`${items[prevIdx].id}-qty`]?.focus();
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                const nextIdx = index + 1;
                                if (nextIdx < items.length) {
                                  inputRefs.current[`${items[nextIdx].id}-material`]?.focus();
                                } else {
                                  addItemRow();
                                  setTimeout(() => {
                                    setItems(currentItems => {
                                      const lastItem = currentItems[currentItems.length - 1];
                                      setTimeout(() => {
                                        inputRefs.current[`${lastItem.id}-material`]?.focus();
                                      }, 50);
                                      return currentItems;
                                    });
                                  }, 50);
                                }
                              }
                            }}
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
                            ref={el => { inputRefs.current[`${item.id}-rate`] = el; }}
                            placeholder="0.00"
                            className="w-full text-right bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs font-mono font-semibold"
                            value={item.rate}
                            onChange={(e) => handleRateChange(item.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const nextIdx = index + 1;
                                if (nextIdx < items.length) {
                                  inputRefs.current[`${items[nextIdx].id}-rate`]?.focus();
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const prevIdx = index - 1;
                                if (prevIdx >= 0) {
                                  inputRefs.current[`${items[prevIdx].id}-rate`]?.focus();
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                const nextIdx = index + 1;
                                if (nextIdx < items.length) {
                                  inputRefs.current[`${items[nextIdx].id}-material`]?.focus();
                                } else {
                                  addItemRow();
                                  setTimeout(() => {
                                    setItems(currentItems => {
                                      const lastItem = currentItems[currentItems.length - 1];
                                      setTimeout(() => {
                                        inputRefs.current[`${lastItem.id}-material`]?.focus();
                                      }, 50);
                                      return currentItems;
                                    });
                                  }, 50);
                                }
                              }
                            }}
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
                            ref={el => { inputRefs.current[`${item.id}-delete`] = el; }}
                            onClick={() => deleteItemRow(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter') {
                                e.preventDefault();
                                deleteItemRow(item.id);
                              }
                            }}
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
                onClick={autoMergeDuplicates}
                className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Auto-Merge Duplicates
              </button>
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
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg space-y-1.5 text-xs flex flex-col">
              <span className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce" /> Warning / Validation Error
              </span>
              <p className="text-rose-700 leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Sandbox warning banner */}
          {db.isSandboxModeActive() && (
            <div className="p-4 bg-red-900/10 border-2 border-red-500 text-red-900 rounded-xl space-y-3 text-xs flex flex-col">
              <span className="font-extrabold flex items-center gap-2 uppercase tracking-widest text-red-700">
                <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" /> Sandbox Testing Mode Active
              </span>
              <p className="text-red-800 leading-relaxed font-medium">
                You are currently in developer sandbox mode. Issue Challan is locked to prevent accidental test entries in the live database. 
                To write real production data, disable Sandbox Mode in the profile/settings dropdown.
              </p>
              <div className="flex items-center gap-2.5 pt-1.5 border-t border-red-200">
                <input
                  type="checkbox"
                  id="confirmSandboxTestCheckbox"
                  checked={confirmSandboxTest}
                  onChange={(e) => setConfirmSandboxTest(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-600 cursor-pointer rounded"
                />
                <label htmlFor="confirmSandboxTestCheckbox" className="font-bold text-red-900 cursor-pointer select-none">
                  Proceed with Sandbox test write (writes to temporary sandbox collection)
                </label>
              </div>
            </div>
          )}

          {/* Grid summary and Issue Button block */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 bg-gradient-to-r from-[#1A2E4A] to-[#2D3E5D] text-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-300" />
              <div>
                <p className="text-[10px] text-slate-300 font-bold font-sans uppercase">TOTAL OUTFLOW AMOUNT</p>
                <p className="text-xl font-bold font-mono text-white">{formatINR(runningTotal)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="bg-slate-800/40 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-lg cursor-pointer transition"
              >
                Reset Fields
              </button>
              
              <button
                type="submit"
                disabled={loading || (db.isSandboxModeActive() && !confirmSandboxTest)}
                className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-500 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 px-6 rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                {loading ? 'Processing...' : 'Issue Challan & Print'}
              </button>
            </div>
          </div>

        </form>
      )}

      {/* Confirmation Modals */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 shadow-xl space-y-4 text-left animate-none">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 uppercase">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Confirm Reset Fields
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to reset all fields? This will clear the current master selection and all entered line items.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setShowResetConfirm(false);
                  resetForm();
                }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {showIssueConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4 text-left animate-none">
            <h3 className="text-sm font-bold text-[#1A2E4A] flex items-center gap-1.5 uppercase border-b border-slate-100 pb-2">
              📝 Finalize & Issue Material Challans
            </h3>
            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex justify-between border-b border-slate-50 pb-1.5">
                <span className="text-slate-400">Master Stitcher:</span>
                <span className="font-bold text-slate-800">{masters.find(m => m.id === selectedMasterId)?.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-1.5">
                <span className="text-slate-400">Total Outflow Value:</span>
                <span className="font-bold text-[#1A2E4A] text-sm">{formatINR(runningTotal)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-1.5">
                <span className="text-slate-400">Date Issued:</span>
                <span className="font-semibold text-slate-800">{issuedDate.split('-').reverse().join('/')}</span>
              </div>
              {notes && (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] italic">
                  " {notes} "
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowIssueConfirm(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  executeIssueChallan();
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
              >
                Confirm & Issue Voucher
              </button>
            </div>
          </div>
        </div>
      )}

      {rowToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 shadow-xl space-y-4 text-left animate-none">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 uppercase">
              <AlertTriangle className="w-4 h-4 text-rose-600" /> Confirm Row Deletion
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete the line item for <strong>{materials.find(m => m.id === rowToDelete.material_id)?.name || 'selected material'}</strong> with quantity <strong>{rowToDelete.qty} {rowToDelete.unit}</strong>?
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRowToDelete(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  executeDeleteRow(rowToDelete.id);
                }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Delete Row
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default IssueChallanView;
