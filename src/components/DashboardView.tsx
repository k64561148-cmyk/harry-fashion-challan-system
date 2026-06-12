/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Challan, Invoice, Material } from '../types';
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
  Download
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

  const loadDashboardData = () => {
    // 1. Fetch Today's Challans
    const todayStr = new Date().toISOString().split('T')[0];
    const challans = db.getChallans();
    const todayList = challans.filter(c => c.issued_date === todayStr);
    setTodayChallans(todayList);

    // 2. This Month's Issued Materials Total Value
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const items = db.getChallanItems();
    
    let totalVal = 0;
    challans.forEach(c => {
      const cDate = new Date(c.issued_date);
      if (cDate.getFullYear() === currentYear && (cDate.getMonth() + 1) === currentMonth) {
        const cItems = items.filter(item => item.challan_id === c.id);
        const sum = cItems.reduce((acc, curr) => acc + curr.amount, 0);
        totalVal += sum;
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
    setRecentChallans(challans.slice(0, 5));
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
      console.error('Failed to trigger print dispatch', e);
    }
  };

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

          {/* Recent Challans List */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">RECENTLY CREATED CHALLANS</h4>
              <button 
                onClick={() => onNavigate('reports')}
                className="text-xs text-[#2D3E5D] hover:text-[#1A2E4A] font-bold flex items-center gap-1 cursor-pointer"
              >
                View all activity <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
                    <th className="py-2.5 px-3">CHALLAN NO</th>
                    <th className="py-2.5 px-3">MASTER NAME</th>
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">ISSUED BY</th>
                    <th className="py-2.5 px-3 text-right">STATUS</th>
                    <th className="py-2.5 px-3 text-right" style={{ width: '100px' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentChallans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                        No material challans created yet. Press "Issue Challan" to begin.
                      </td>
                    </tr>
                  ) : (
                    recentChallans.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 text-slate-700 transition">
                        <td className="py-3 px-3 font-semibold text-slate-900">{c.challan_no}</td>
                        <td className="py-3 px-3 font-medium">{getMasterName(c.master_id)}</td>
                        <td className="py-3 px-3 text-slate-500">{c.issued_date.split('-').reverse().join('/')}</td>
                        <td className="py-3 px-3 text-slate-500">{c.issued_by}</td>
                        <td className="py-3 px-3 text-right">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                            c.status === 'issued' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-green-50 text-green-700 border border-green-100'
                          }`}>
                            {c.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
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
                          </div>
                        </td>
                      </tr>
                    ))
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
              <h4 className="text-xs font-bold text-[#1A2E4A] tracking-wider uppercase">MATERIAL CRITICAL ROOMS</h4>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 max-h-[360px] pr-1">
              {lowStockAlerts.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
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
    </div>
  );
};
export default DashboardView;
