/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, parseErrorMessage } from '../db';
import { getLocalTodayString } from '../utils/dateUtils';
import { Material, InwardEntry } from '../types';
import { formatDate } from '../utils/exportUtils';
import { 
  Truck, 
  Plus, 
  Trash2, 
  Calendar, 
  Search, 
  FileText, 
  ArrowDownCircle,
  HelpCircle
} from 'lucide-react';

interface InwardRow {
  id: string;
  material_id: string;
  qty_received: number | string;
}

export const InwardEntryView: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierName, setSupplierName] = useState<string>('');
  const [billNo, setBillNo] = useState<string>('');
  const [inwardDate, setInwardDate] = useState<string>(getLocalTodayString());
  const [notes, setNotes] = useState<string>('');

  // Row states
  const [rows, setRows] = useState<InwardRow[]>([]);
  const [rowSearchTerms, setRowSearchTerms] = useState<{ [rowId: string]: string }>({});
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

  // History list states with filters
  const [history, setHistory] = useState<InwardEntry[]>([]);
  const [filterMaterialId, setFilterMaterialId] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    loadMaterialsAndHistory();
    // Start with 1 entry row
    appendRow();

    window.addEventListener('db_sync', loadMaterialsAndHistory);
    return () => window.removeEventListener('db_sync', loadMaterialsAndHistory);
  }, []);

  const loadMaterialsAndHistory = () => {
    setMaterials(db.getMaterials().filter(m => m.is_active));
    setHistory(db.getInwardEntries());
  };

  const appendRow = () => {
    const newId = 'inw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    setRows(prev => [...prev, { id: newId, material_id: '', qty_received: '' }]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleMaterialSelect = (rowId: string, materialId: string) => {
    const mat = materials.find(m => m.id === materialId);
    if (!mat) return;

    setRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return { ...r, material_id: materialId };
      }
      return r;
    }));
    setRowSearchTerms(prev => ({ ...prev, [rowId]: mat.name }));
    setFocusedRowId(null);
  };

  const handleQtyChange = (rowId: string, qtyStr: string) => {
    const cleaned = qtyStr.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const finalVal = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;

    setRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return { ...r, qty_received: finalVal };
      }
      return r;
    }));
  };

  const handleSaveInward = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!supplierName.trim()) {
      setErrorMsg('Supplier name is required.');
      return;
    }

    // Comprehensive validation for each row in the form
    const validRowsToSave: { materialId: string; quantity: number }[] = [];

    for (const row of rows) {
      const searchVal = (rowSearchTerms[row.id] || '').trim();
      const qtyVal = String(row.qty_received).trim();

      // If anything is entered in this row (search term or quantity)
      if (searchVal || qtyVal) {
        if (!row.material_id) {
          setErrorMsg('Create SKU in Material Settings first.');
          return;
        }

        const mat = materials.find(m => m.id === row.material_id);
        if (!mat) {
          setErrorMsg('Create SKU in Material Settings first.');
          return;
        }

        // Validate the search text matches the material name
        if (searchVal.toLowerCase() !== mat.name.toLowerCase()) {
          const exactMat = materials.find(m => m.name.toLowerCase() === searchVal.toLowerCase());
          if (exactMat) {
            row.material_id = exactMat.id;
          } else {
            setErrorMsg('Create SKU in Material Settings first.');
            return;
          }
        }

        const qty = parseFloat(qtyVal);
        if (isNaN(qty) || qty <= 0) {
          setErrorMsg(`Please enter a valid quantity greater than 0 for ${mat.name}.`);
          return;
        }

        validRowsToSave.push({
          materialId: row.material_id,
          quantity: qty,
        });
      }
    }

    if (validRowsToSave.length === 0) {
      setErrorMsg('Create SKU in Material Settings first.');
      return;
    }

    try {
      setLoading(true);

      validRowsToSave.forEach((item) => {
        const mat = materials.find(m => m.id === item.materialId);
        db.saveInwardEntry({
          material_id: item.materialId,
          qty_received: item.quantity,
          supplier_name: supplierName,
          bill_no: billNo || 'CH-NA',
          inward_date: inwardDate,
          notes: notes,

          // Exact requested fields to be saved in the record
          materialId: item.materialId,
          materialNameSnapshot: mat ? mat.name : '',
          unit: mat ? mat.unit : 'pcs',
          quantity: item.quantity,
          rateSnapshot: mat ? mat.default_rate : 0,
          supplier: supplierName,
          billNo: billNo || 'CH-NA',
          date: inwardDate,
        });
      });

      setSuccessMsg(`Stock Inward recorded! Added quantities to ${validRowsToSave.length} items.`);
      setSupplierName('');
      setBillNo('');
      setNotes('');
      setRows([{ id: 'inw-first-' + Date.now(), material_id: '', qty_received: '' }]);
      setRowSearchTerms({});
      
      // Reload lists
      loadMaterialsAndHistory();
    } catch (err: any) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Filter history rows dynamically
  const filteredHistory = history.filter(item => {
    let matches = true;
    if (filterMaterialId && item.material_id !== filterMaterialId) {
      matches = false;
    }
    if (filterStartDate && item.inward_date < filterStartDate) {
      matches = false;
    }
    if (filterEndDate && item.inward_date > filterEndDate) {
      matches = false;
    }
    return matches;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto" id="inward-entry-view">
      
      {/* Grid: Adding section vs History section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Adding block */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <div className="p-2 bg-blue-50 text-[#1A2E4A] rounded-lg">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">RECORD INWARD MATERIAL ENTRY</h3>
                <p className="text-[10px] text-slate-400">Increase global stockpiles for incoming fabric shipments</p>
              </div>
            </div>

            <form onSubmit={handleSaveInward} className="space-y-4">
              
              {/* Supplier Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    SUPPLIER NAME <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. RK Fabrics Corp"
                    className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    SUPPLIER BILL / CHALAN NO
                  </label>
                  <input
                    type="text"
                    placeholder="E.g. BILL-99120"
                    className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold"
                    value={billNo}
                    onChange={(e) => setBillNo(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    INWARD DATE
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold"
                    value={inwardDate}
                    onChange={(e) => setInwardDate(e.target.value)}
                  />
                </div>

              </div>

              {/* Items grid */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-600">INCOMING ITEMS QUANTITIES</h4>
                
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {rows.map((row, index) => {
                    const search = rowSearchTerms[row.id] || '';
                    const isFocused = focusedRowId === row.id;
                    const matObj = materials.find(m => m.id === row.material_id);
                    const matchedMats = materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

                    return (
                      <div key={row.id} className="flex gap-2 items-center">
                        {/* Material Selector Row */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            placeholder="Type fabric or button box name..."
                            className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-800"
                            value={search}
                            onChange={(e) => {
                              const typed = e.target.value;
                              setRowSearchTerms(prev => ({ ...prev, [row.id]: typed }));
                              const mat = materials.find(m => m.name.toLowerCase() === typed.trim().toLowerCase());
                              setRows(prev => prev.map(r => r.id === row.id ? { ...r, material_id: mat ? mat.id : '' } : r));
                              setFocusedRowId(row.id);
                            }}
                            onFocus={() => setFocusedRowId(row.id)}
                            onBlur={() => {
                              setTimeout(() => {
                                setRows(prev => prev.map(r => {
                                  if (r.id === row.id) {
                                    const typed = (rowSearchTerms[row.id] || '').trim();
                                    const exact = materials.find(m => m.name.toLowerCase() === typed.toLowerCase());
                                    if (exact) {
                                      return { ...r, material_id: exact.id };
                                    } else if (!typed) {
                                      return { ...r, material_id: '' };
                                    }
                                  }
                                  return r;
                                }));
                                setFocusedRowId(current => current === row.id ? null : current);
                              }, 250);
                            }}
                          />

                          {isFocused && (
                            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden max-h-36 overflow-y-auto font-sans">
                              {matchedMats.length === 0 ? (
                                <p className="p-2 text-[10px] text-slate-400 text-center font-bold">Create SKU in Material Settings first.</p>
                              ) : (
                                matchedMats.map(m => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleMaterialSelect(row.id, m.id)}
                                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 text-slate-700 font-bold flex justify-between cursor-pointer"
                                  >
                                    <span>{m.name}</span>
                                    <span className="text-slate-400">({m.unit})</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>

                        {/* Quantity */}
                        <div className="w-28 flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-1.5 px-2 text-xs font-mono font-bold"
                            value={row.qty_received}
                            onChange={(e) => handleQtyChange(row.id, e.target.value)}
                          />
                          <span className="text-[10px] text-slate-400 font-sans w-8 block">{matObj ? matObj.unit : 'pcs'}</span>
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={appendRow}
                  className="text-[11px] font-bold text-[#2D3E5D] hover:text-[#1A2E4A] flex items-center gap-1 cursor-pointer pr-3"
                >
                  <Plus className="w-3.5 h-3.5" /> Append Material Item
                </button>
              </div>

              {/* Inward Comments */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">RECORD NOTES / SHIPMENT COMMENTS (OPTIONAL)</label>
                <textarea
                  placeholder="Include rack location, shipment driver name or sorting status..."
                  className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2.5 text-xs min-h-[50px] font-semibold text-slate-800"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Status responses */}
              {successMsg && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-xs font-bold flex items-center gap-1 animate-fadeIn">
                  <ArrowDownCircle className="w-4 h-4 text-green-600" /> {successMsg}
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-bold">
                  {errorMsg}
                </div>
              )}

              {/* Save */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white font-bold py-2.5 px-3 rounded-lg text-xs shadow-sm cursor-pointer transition uppercase tracking-wider"
              >
                {loading ? 'Processing...' : 'Complete Inward Stock Entry'}
              </button>

            </form>
          </div>
        </div>

        {/* Right Side: History logs */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm h-full flex flex-col">
            
            <div className="flex items-center gap-1.5 mb-3 border-b border-slate-100 pb-2">
              <Calendar className="w-5 h-5 text-[#1A2E4A]" />
              <h3 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">STOCK REPLENISHMENT HISTORY</h3>
            </div>

            {/* Quick Filters */}
            <div className="space-y-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/50 mb-3 text-[11px]">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-500 font-bold">Start Date</label>
                  <input
                    type="date"
                    className="w-full bg-white rounded border border-slate-200 py-1 px-1.5 text-xs text-slate-800 font-medium focus:border-[#2D3E5D] focus:outline-none"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold">End Date</label>
                  <input
                    type="date"
                    className="w-full bg-white rounded border border-slate-200 py-1 px-1.5 text-xs text-slate-800 font-medium focus:border-[#2D3E5D] focus:outline-none"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold">Highlight Material ID</label>
                <select
                  className="w-full bg-white rounded border border-slate-200 py-1 px-1.5 text-xs font-medium focus:border-[#2D3E5D] focus:outline-none"
                  value={filterMaterialId}
                  onChange={(e) => setFilterMaterialId(e.target.value)}
                >
                  <option value="">-- All Materials --</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto max-h-[350px] pr-1">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
                    <th className="py-2.5 px-2">DATE/REF</th>
                    <th className="py-2.5 px-2">MATERIAL ITEM</th>
                    <th className="py-2.5 px-2 text-right">RECEIVED</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-slate-400">
                        No matches found.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((item) => {
                      const matName = db.getMaterials().find(m => m.id === item.material_id)?.name || 'Deleted Mat';
                      const unit = db.getMaterials().find(m => m.id === item.material_id)?.unit || 'pc';
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition">
                          <td className="py-2 px-2">
                            <span className="font-bold block text-slate-800">{formatDate(item.inward_date)}</span>
                            <span className="text-[9px] text-slate-450 font-mono">Bill: {item.bill_no}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className="font-semibold text-slate-800 block">{matName}</span>
                            <span className="text-[9px] text-slate-450 font-sans">Supp: {item.supplier_name}</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-green-600 align-middle">
                            +{item.qty_received} {unit}
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

      </div>

    </div>
  );
};
export default InwardEntryView;
