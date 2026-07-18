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
  AlertTriangle,
  Clock,
  Printer,
  Download,
  Edit3,
  Search,
  X
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
  const currentUser = db.getCurrentUser();
  const [activeBillingTab, setActiveBillingTab] = useState<'create' | 'manage'>('create');
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  
  // Settle & Manage filters
  const [filterMasterId, setFilterMasterId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Edit invoice inline controls
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editPcs, setEditPcs] = useState<number>(0);
  const [editWorkAmount, setEditWorkAmount] = useState<number>(0);
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editPanNo, setEditPanNo] = useState<string>('');
  const [editPanName, setEditPanName] = useState<string>('');
  const [editBankName, setEditBankName] = useState<string>('');
  const [editAccountNo, setEditAccountNo] = useState<string>('');
  const [editIfscCode, setEditIfscCode] = useState<string>('');
  const [editBranchName, setEditBranchName] = useState<string>('');
  const [editChequeInFavourOf, setEditChequeInFavourOf] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'draft' | 'finalised'>('draft');

  const [masters, setMasters] = useState<Master[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  
  const [selectedMasterId, setSelectedMasterId] = useState<string>('');
  const [workAmountRaw, setWorkAmountRaw] = useState<string>('');
  const [baseWorkAmountRaw, setBaseWorkAmountRaw] = useState<string>('');
  const [baseWorkAmount, setBaseWorkAmount] = useState<number>(0);
  const [stitchingDeductionReason, setStitchingDeductionReason] = useState<string>('');
  const [stitchingDeductionAmountRaw, setStitchingDeductionAmountRaw] = useState<string>('');
  const [stitchingDeductionAmount, setStitchingDeductionAmount] = useState<number>(0);
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState<number>(new Date().getFullYear());

  // Additional billing fields
  const [pcsRaw, setPcsRaw] = useState<string>('');
  const [pcs, setPcs] = useState<number>(0);
  const [discountRaw, setDiscountRaw] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);

  // Pending challans of selected master
  const [pendingChallans, setPendingChallans] = useState<Challan[]>([]);
  const [settledChallans, setSettledChallans] = useState<Challan[]>([]);
  const [selectedChallanIds, setSelectedChallanIds] = useState<{ [id: string]: boolean }>({});
  const [challansVersion, setChallansVersion] = useState<number>(0);

  // Grouped line items inside selected challans
  const [billingItems, setBillingItems] = useState<GroupedItem[]>([]);
  const [workAmount, setWorkAmount] = useState<number>(0);
  const [materialDeduction, setMaterialDeduction] = useState<number>(0);
  const [netPayable, setNetPayable] = useState<number>(0);

  // Selected PAN and Bank states
  const [selectedPanId, setSelectedPanId] = useState<string>('');
  const [panName, setPanName] = useState<string>('');
  const [panNo, setPanNo] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [accountNo, setAccountNo] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('');
  const [chequeInFavourOf, setChequeInFavourOf] = useState<string>('');

  // Invoice success feedback
  const [loading, setLoading] = useState<boolean>(false);
  const [successInvoice, setSuccessInvoice] = useState<Invoice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [pdfActionStatus, setPdfActionStatus] = useState<{ text: string; isError?: boolean } | null>(null);

  // Owner override states for negative net payable
  const [ownerOverride, setOwnerOverride] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');

  // Keyboard navigation & search states
  const inputRefs = React.useRef<{ [key: string]: HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement | null }>({});
  const [masterSearchQuery, setMasterSearchQuery] = useState<string>('');
  const [showMasterDropdown, setShowMasterDropdown] = useState<boolean>(false);
  const [highlightedMasterIndex, setHighlightedMasterIndex] = useState<number>(0);
  const [focusedChallanIndex, setFocusedChallanIndex] = useState<number>(-1);
  const [isChallanListFocused, setIsChallanListFocused] = useState<boolean>(false);

  // Modal dialog states
  const [showInvoiceFinalizeConfirm, setShowInvoiceFinalizeConfirm] = useState<boolean>(false);
  const [showDeleteInvoiceConfirm, setShowDeleteInvoiceConfirm] = useState<string | null>(null);
  const [showVoidInvoiceConfirm, setShowVoidInvoiceConfirm] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [viewingChallanDetails, setViewingChallanDetails] = useState<Challan | null>(null);
  const [viewingChallanDetailsItems, setViewingChallanDetailsItems] = useState<ChallanItem[]>([]);

  const getFilteredMasters = () => {
    if (!masterSearchQuery) return masters;
    const query = masterSearchQuery.toLowerCase();
    return masters.filter(m => 
      m.name.toLowerCase().includes(query) || 
      m.code.toLowerCase().includes(query) ||
      m.type.toLowerCase().includes(query)
    );
  };

  const getFlatMasterOptions = () => {
    const list: Array<{ masterId: string; panId: string; displayName: string; type: string; code: string }> = [];
    const filteredMasters = getFilteredMasters();
    
    filteredMasters.forEach(m => {
      if (m.pan_accounts && m.pan_accounts.length > 0) {
        m.pan_accounts.forEach((p, idx) => {
          const panLabel = `${m.code.toUpperCase()}-${idx + 1}`;
          const displayLabel = p.pan_name 
            ? `${m.name} (${panLabel}: ${p.pan_name})` 
            : `${m.name} (${panLabel}: ${p.pan_no})`;
          list.push({
            masterId: m.id,
            panId: p.id,
            displayName: displayLabel,
            type: m.type,
            code: m.code
          });
        });
      } else {
        list.push({
          masterId: m.id,
          panId: '',
          displayName: `${m.name} (${m.code.toUpperCase()})`,
          type: m.type,
          code: m.code
        });
      }
    });
    return list;
  };

  const handleMasterSearchSelect = (masterId: string, panId: string) => {
    setSelectedMasterId(masterId);
    setSelectedPanId(panId);
    setShowMasterDropdown(false);
    setMasterSearchQuery('');
    setFocusedChallanIndex(-1);
    setIsChallanListFocused(false);
  };

  // Auto-fill bank and PAN details when master changes.
  useEffect(() => {
    if (!selectedMasterId) {
      setSelectedPanId('');
      setPanName('');
      setPanNo('');
      setBankName('');
      setAccountNo('');
      setIfscCode('');
      setBranchName('');
      setChequeInFavourOf('');
      return;
    }

    const master = masters.find(m => m.id === selectedMasterId);
    if (master && master.pan_accounts && master.pan_accounts.length > 0) {
      const activeProfiles = master.pan_accounts.filter(p => p.is_active !== false);
      const defaultProfile = activeProfiles.find(p => p.is_default);
      if (defaultProfile) {
        setSelectedPanId(defaultProfile.id);
        setPanName(defaultProfile.pan_name || '');
        setPanNo(defaultProfile.pan_no);
        setBankName(defaultProfile.bank_name);
        setAccountNo(defaultProfile.account_no);
        setIfscCode(defaultProfile.ifsc_code);
        setBranchName(defaultProfile.branch_name || '');
        setChequeInFavourOf(defaultProfile.cheque_in_favour_of || '');
      } else {
        setSelectedPanId('');
        setPanName('');
        setPanNo('');
        setBankName('');
        setAccountNo('');
        setIfscCode('');
        setBranchName('');
        setChequeInFavourOf('');
      }
    } else {
      setSelectedPanId('');
      setPanName('');
      setPanNo('');
      setBankName('');
      setAccountNo('');
      setIfscCode('');
      setBranchName('');
      setChequeInFavourOf('');
    }
  }, [selectedMasterId, masters]);

  const handlePanProfileChange = (panId: string) => {
    setSelectedPanId(panId);
    if (!panId) {
      setPanName('');
      setPanNo('');
      setBankName('');
      setAccountNo('');
      setIfscCode('');
      setBranchName('');
      setChequeInFavourOf('');
      return;
    }
    const master = masters.find(m => m.id === selectedMasterId);
    if (master && master.pan_accounts) {
      const selectedAccount = master.pan_accounts.find(p => p.id === panId);
      if (selectedAccount) {
        setPanName(selectedAccount.pan_name || '');
        setPanNo(selectedAccount.pan_no);
        setBankName(selectedAccount.bank_name);
        setAccountNo(selectedAccount.account_no);
        setIfscCode(selectedAccount.ifsc_code);
        setBranchName(selectedAccount.branch_name || '');
        setChequeInFavourOf(selectedAccount.cheque_in_favour_of || '');
      }
    }
  };

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
    setAllInvoices(db.getInvoices());
    setChallansVersion(v => v + 1);
  };

  useEffect(() => {
    loadInitialData();

    window.addEventListener('db_sync', loadInitialData);
    return () => window.removeEventListener('db_sync', loadInitialData);
  }, []);

  // Fetch line items for viewed challan details
  useEffect(() => {
    if (viewingChallanDetails) {
      const items = db.getChallanItems(viewingChallanDetails.id);
      setViewingChallanDetailsItems(items);
    } else {
      setViewingChallanDetailsItems([]);
    }
  }, [viewingChallanDetails]);

  // Global keydown listeners for BillingView keyboard flow
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Esc key closes modals
      if (e.key === 'Escape') {
        setShowInvoiceFinalizeConfirm(false);
        setShowDeleteInvoiceConfirm(null);
        setShowVoidInvoiceConfirm(null);
        setViewingChallanDetails(null);
        if (showMasterDropdown) {
          e.preventDefault();
          setShowMasterDropdown(false);
          inputRefs.current['masterSearchQuery']?.focus();
        }
        return;
      }

      // 2. Active modal captures keys
      if (showInvoiceFinalizeConfirm || showDeleteInvoiceConfirm || showVoidInvoiceConfirm || viewingChallanDetails) {
        return;
      }

      // 3. Ctrl+A to select all visible pending challans
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        // Only if we are on the 'create' tab and selectedMasterId is active
        if (activeBillingTab === 'create' && selectedMasterId && pendingChallans.length > 0) {
          e.preventDefault();
          const bulk: { [id: string]: boolean } = {};
          pendingChallans.forEach(ch => {
            bulk[ch.id] = true;
          });
          setSelectedChallanIds(bulk);
        }
        return;
      }

      // 4. Pending Challan List navigation
      if (activeBillingTab === 'create' && selectedMasterId && pendingChallans.length > 0) {
        // If focused elements are input/textarea/select, let them handle basic keys unless they explicitly focus list
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const activeId = document.activeElement?.id;
        
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
          // If master search input is focused, don't hijack unless it's arrow keys on the master search dropdown
          if (activeId === 'master-search-input') {
            return;
          }
          // If workAmountRaw/discountRaw/pcsRaw etc. are focused, don't hijack!
          if (activeId !== 'challan-list-container') {
            return;
          }
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setIsChallanListFocused(true);
          setFocusedChallanIndex(prev => {
            const nextIdx = prev + 1;
            return nextIdx < pendingChallans.length ? nextIdx : prev;
          });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setIsChallanListFocused(true);
          setFocusedChallanIndex(prev => {
            const nextIdx = prev - 1;
            return nextIdx >= 0 ? nextIdx : 0;
          });
        } else if (e.key === ' ' && focusedChallanIndex >= 0 && focusedChallanIndex < pendingChallans.length) {
          e.preventDefault(); // prevent scroll
          const targetedCh = pendingChallans[focusedChallanIndex];
          handleChallanToggle(targetedCh.id);
        } else if (e.key === 'Enter' && focusedChallanIndex >= 0 && focusedChallanIndex < pendingChallans.length) {
          e.preventDefault();
          const targetedCh = pendingChallans[focusedChallanIndex];
          setViewingChallanDetails(targetedCh);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeBillingTab, selectedMasterId, pendingChallans, focusedChallanIndex, showInvoiceFinalizeConfirm, showDeleteInvoiceConfirm, showVoidInvoiceConfirm, viewingChallanDetails, showMasterDropdown]);

  // Fetch all pending 'issued' and unbilled challans when master, monthly period, or database version changes
  useEffect(() => {
    if (selectedMasterId) {
      const allChallans = db.getChallans();
      const invoiceChallans = db.getInvoiceChallans();
      const linkedChallanIds = new Set(invoiceChallans.map(ic => ic.challan_id));

      const masterPending = allChallans.filter(c => {
        const statusLower = ((c.status as any) || '').toLowerCase();
        // Must match master, must be in 'issued' state (not billed, not voided), and must not be currently linked to any invoice
        if (c.master_id !== selectedMasterId || statusLower !== 'issued' || statusLower === 'voided' || statusLower === 'void') {
          return false;
        }
        // Any challan with billed/settled status or invoice link must never appear in pending billing
        if (c.invoiceId || c.billedInvoiceId || (c as any).invoice_id || linkedChallanIds.has(c.id)) {
          return false;
        }
        // Match selected month and year from YYYY-MM-DD
        const parts = (c.issued_date || '').split('-');
        if (parts.length < 3) return false;
        const cYear = parseInt(parts[0], 10);
        const cMonth = parseInt(parts[1], 10);
        return cYear === periodYear && cMonth === periodMonth;
      });
      setPendingChallans(masterPending);

      // Fetch all billed challans for this master and period
      const masterSettled = allChallans.filter(c => {
        const statusLower = (c.status || '').toLowerCase();
        if (c.master_id !== selectedMasterId || statusLower !== 'billed') {
          return false;
        }
        const parts = (c.issued_date || '').split('-');
        if (parts.length < 3) return false;
        const cYear = parseInt(parts[0], 10);
        const cMonth = parseInt(parts[1], 10);
        return cYear === periodYear && cMonth === periodMonth;
      });
      setSettledChallans(masterSettled);

      // Auto check all by default
      const initialChecks: { [id: string]: boolean } = {};
      masterPending.forEach(c => {
        initialChecks[c.id] = true;
      });
      setSelectedChallanIds(initialChecks);
    } else {
      setPendingChallans([]);
      setSettledChallans([]);
      setSelectedChallanIds({});
      setBillingItems([]);
    }
    setWorkAmount(0);
    setWorkAmountRaw('');
    setBaseWorkAmount(0);
    setBaseWorkAmountRaw('');
    setStitchingDeductionReason('');
    setStitchingDeductionAmountRaw('');
    setStitchingDeductionAmount(0);
    setPcs(0);
    setPcsRaw('');
    setDiscount(0);
    setDiscountRaw('');
    setSuccessInvoice(null);
    setErrorMsg('');
  }, [selectedMasterId, periodMonth, periodYear, challansVersion]);

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

  // Recalculates final workAmount by deducting stitchingDeductionAmount from baseWorkAmount
  useEffect(() => {
    setWorkAmount(Math.max(0, baseWorkAmount - stitchingDeductionAmount));
  }, [baseWorkAmount, stitchingDeductionAmount]);

  // Recalculates net payables
  useEffect(() => {
    setNetPayable(workAmount - materialDeduction);
  }, [workAmount, materialDeduction]);

  // Derived calculation variables according to professional accounting
  const subTotal = workAmount - materialDeduction - discount;
  const tdsAmount = subTotal > 0 ? parseFloat((subTotal * 0.01).toFixed(2)) : 0;
  const preciseGrandTotal = subTotal - tdsAmount;
  const roundedOffGrandTotal = Math.round(preciseGrandTotal);

  const activeChallanIds = Object.keys(selectedChallanIds).filter(id => selectedChallanIds[id]);
  const isMasterSelected = !!selectedMasterId;
  const isAnyChallanSelected = activeChallanIds.length > 0;
  const isPcsValid = pcs > 0;
  const isEarningValid = workAmount > 0;

  const isPanValid = true;
  const isIfscValid = true;
  const isAccountValid = true;
  const isBankValid = true;
  const isBankPanValid = true;

  const isNetPayableNegative = roundedOffGrandTotal < 0;
  const isOverrideApproved = !isNetPayableNegative || (ownerOverride && overrideReason.trim().length >= 5);

  const isBillingValid = 
    isMasterSelected && 
    isAnyChallanSelected && 
    isPcsValid && 
    isEarningValid && 
    isBankPanValid && 
    isOverrideApproved;

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

      if (status === 'finalised') {
        if (db.isSyncFailed()) {
          setErrorMsg('Sync failed! Cloud write permission failure has blocked finalisation. Resolve permissions or cloud connection to proceed.');
          return;
        }
        if (!isMasterSelected) {
          setErrorMsg('Stitching Master must be selected.');
          return;
        }
        if (!isAnyChallanSelected) {
          setErrorMsg('At least one material challan must be selected.');
          return;
        }
        if (!isPcsValid) {
          setErrorMsg('Total pieces finished must be greater than zero.');
          return;
        }
        if (!isEarningValid) {
          setErrorMsg('Stitching earning amount (Work Amount) must be greater than zero.');
          return;
        }
        if (isNetPayableNegative && !isOverrideApproved) {
          setErrorMsg('Net payable is negative and requires owner override confirmation and reason (min 5 chars).');
          return;
        }
      }

      const masterObj = masters.find(m => m.id === selectedMasterId);
      const activeProfiles = masterObj?.pan_accounts?.filter(p => p.is_active !== false) || [];
      if (activeProfiles.length > 0 && !selectedPanId) {
        setErrorMsg('Stitching master has active payment profiles registered. You must explicitly select one from the dropdown menu to proceed.');
        return;
      }

      if (!panName.trim() || !panNo.trim() || !bankName.trim() || !accountNo.trim() || !ifscCode.trim()) {
        setErrorMsg('All disbursement details (Holder Name, PAN, Bank Name, Account No, and IFSC Code) are required fields.');
        return;
      }

      const activeChallanIds = Object.keys(selectedChallanIds).filter(id => selectedChallanIds[id]);
      if (activeChallanIds.length === 0) {
        setErrorMsg('At least one Challan must be checked to generate an Invoice.');
        return;
      }

      if (status === 'finalised') {
        const alreadySettledInvoiceNo = await db.checkDuplicateChallans(activeChallanIds);
        if (alreadySettledInvoiceNo) {
          setErrorMsg(`Challan already settled under invoice ${alreadySettledInvoiceNo}`);
          return;
        }
      }

      if (workAmount <= 0) {
        setErrorMsg('Stitching job earnings (Work Amount) must be configured.');
        return;
      }

      const selectedProfile = activeProfiles.find(p => p.id === selectedPanId);

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
        selected_pan_name: panName || undefined,
        selected_bank_name: bankName || undefined,
        selected_account_no: accountNo || undefined,
        selected_ifsc_code: ifscCode || undefined,
        selected_branch_name: branchName || undefined,
        selected_cheque_in_favour_of: chequeInFavourOf || undefined,
        selected_pan_account_id: selectedPanId || undefined,
        selected_payment_label: selectedProfile?.label || undefined,
        paymentProfileSnapshot: selectedProfile ? {
          id: selectedProfile.id,
          label: selectedProfile.label,
          pan_name: selectedProfile.pan_name,
          pan_no: selectedProfile.pan_no,
          bank_name: selectedProfile.bank_name,
          account_no: selectedProfile.account_no,
          ifsc_code: selectedProfile.ifsc_code,
          branch_name: selectedProfile.branch_name,
          cheque_in_favour_of: selectedProfile.cheque_in_favour_of
        } : {
          id: 'manual',
          pan_name: panName.trim(),
          pan_no: panNo.trim().toUpperCase(),
          bank_name: bankName.trim(),
          account_no: accountNo.trim(),
          ifsc_code: ifscCode.trim().toUpperCase(),
          branch_name: branchName ? branchName.trim() : undefined,
          cheque_in_favour_of: chequeInFavourOf ? chequeInFavourOf.trim() : undefined
        },
        stitching_deduction_amount: stitchingDeductionAmount,
        stitching_deduction_reason: stitchingDeductionReason,
        base_work_amount: baseWorkAmount
      };

      if (status === 'finalised') {
        const maskPan = (no: string) => {
          const clean = (no || '').trim();
          return clean.length > 4 ? '*'.repeat(clean.length - 4) + clean.slice(-4) : clean;
        };
        const panIdForAudit = selectedPanId || 'manual';
        const auditDetails = `masterId: ${selectedMasterId}, masterName: ${masterObj?.name || ''}, panAccountId: ${panIdForAudit}, panName: ${panName.trim()}, panNo: ${maskPan(panNo)}, changedBy: ${currentUser?.email || 'system'}, changedAt: ${new Date().toISOString()}`;
        db.addAuditLog(currentUser?.email || 'system', 'Invoice finalized with PAN/bank profile', auditDetails);
      }

      // 1. Commit and get compiled invoice Record
      const invoiceResult = await db.saveInvoice(invoicePayload, activeChallanIds);

      // Reload local data and notify other components
      loadInitialData();
      window.dispatchEvent(new Event('db_sync'));

      // 2. Generate PDF download
      const masterObjForPDF = masterObj || masters.find(m => m.id === selectedMasterId)!;
      const chList = db.getChallans().filter(c => activeChallanIds.includes(c.id));
      const allItems = db.getChallanItems();
      
      await generateInvoicePDF(invoiceResult, chList, allItems, masterObjForPDF, materials, true);

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
    setBaseWorkAmount(0);
    setBaseWorkAmountRaw('');
    setStitchingDeductionReason('');
    setStitchingDeductionAmountRaw('');
    setStitchingDeductionAmount(0);
    setPcs(0);
    setPcsRaw('');
    setDiscount(0);
    setDiscountRaw('');
    setMaterialDeduction(0);
    setNetPayable(0);
    setSuccessInvoice(null);
    setErrorMsg('');
  };

  // Start Invoice Editing Context
  const handleStartEdit = (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditPcs(inv.pcs || 0);
    setEditWorkAmount(inv.work_amount || 0);
    setEditDiscount(inv.discount || 0);
    setEditPanNo(inv.selected_pan_no || '');
    setEditPanName((inv as any).selected_pan_name || '');
    setEditBankName(inv.selected_bank_name || '');
    setEditAccountNo(inv.selected_account_no || '');
    setEditIfscCode(inv.selected_ifsc_code || '');
    setEditBranchName(inv.selected_branch_name || '');
    setEditChequeInFavourOf((inv as any).selected_cheque_in_favour_of || '');
    setEditStatus(inv.status);
  };

  // Safely save edited invoice totals & details
  const handleSaveEditInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;

    try {
      const master = masters.find(m => m.id === editingInvoice.master_id);
      const matchedProfile = master?.pan_accounts?.find(
        p => p.pan_no.toUpperCase() === editPanNo.toUpperCase() && p.account_no === editAccountNo
      );

      db.editInvoice(editingInvoice.id, {
        pcs: editPcs,
        work_amount: editWorkAmount,
        discount: editDiscount,
        selected_pan_no: editPanNo || undefined,
        selected_pan_name: editPanName || undefined,
        selected_bank_name: editBankName || undefined,
        selected_account_no: editAccountNo || undefined,
        selected_ifsc_code: editIfscCode || undefined,
        selected_branch_name: editBranchName || undefined,
        selected_cheque_in_favour_of: editChequeInFavourOf || undefined,
        selected_pan_account_id: matchedProfile?.id || undefined,
        selected_payment_label: matchedProfile?.label || undefined,
        paymentProfileSnapshot: {
          id: matchedProfile?.id || 'manual',
          label: matchedProfile?.label || undefined,
          pan_name: editPanName.trim(),
          pan_no: editPanNo.trim().toUpperCase(),
          bank_name: editBankName.trim(),
          account_no: editAccountNo.trim(),
          ifsc_code: editIfscCode.trim().toUpperCase(),
          branch_name: editBranchName ? editBranchName.trim() : undefined,
          cheque_in_favour_of: editChequeInFavourOf ? editChequeInFavourOf.trim() : undefined
        },
        status: editStatus
      });

      const maskPan = (no: string) => {
        const clean = (no || '').trim();
        return clean.length > 4 ? '*'.repeat(clean.length - 4) + clean.slice(-4) : clean;
      };
      const auditDetails = `masterId: ${editingInvoice.master_id}, masterName: ${master?.name || ''}, panAccountId: ${matchedProfile?.id || 'manual'}, panName: ${editPanName.trim()}, panNo: ${maskPan(editPanNo)}, changedBy: ${currentUser?.email || 'system'}, changedAt: ${new Date().toISOString()}`;
      db.addAuditLog(currentUser?.email || 'system', 'Invoice details updated', auditDetails);

      setEditingInvoice(null);
      loadInitialData();
      window.dispatchEvent(new Event('db_sync'));
      alert("✅ Invoice updated successfully!");
    } catch (err: any) {
      alert("❌ Edit failed: " + err.message);
    }
  };

  // Void and Settle Cleanup for Administrative invoice Purging
  const handleDeleteInvoiceClick = (invoiceId: string, invoiceNo: string) => {
    setDeleteReason('');
    setShowDeleteInvoiceConfirm(invoiceId);
  };

  const handleConfirmDeleteInvoice = (invoiceId: string) => {
    if (!deleteReason.trim()) {
      alert("❌ Audit reason is required to reverse the bill.");
      return;
    }

    try {
      db.deleteInvoice(invoiceId, deleteReason.trim());
      loadInitialData();
      window.dispatchEvent(new Event('db_sync'));
      setShowDeleteInvoiceConfirm(null);
      setDeleteReason('');
      alert("✅ Invoice voided/deleted successfully. Linked challans are now active again.");
    } catch (err: any) {
      alert("❌ Deletion failed: " + err.message);
    }
  };

  // Re-download PDF helper from list
  const triggerListPDFDownload = async (inv: Invoice) => {
    setPdfActionStatus({ text: `Compiling PDF bin for Invoice Settle Bill ${inv.invoice_no}... Please wait.` });
    try {
      const masterObj = db.getMasters().find(m => m.id === inv.master_id);
      if (!masterObj) {
        setPdfActionStatus({ text: 'Error: Master profile not found in database.', isError: true });
        return;
      }
      const icList = db.getInvoiceChallans(inv.id).map(ic => ic.challan_id);
      const chList = db.getChallans().filter(c => icList.includes(c.id));
      const allItems = db.getChallanItems();

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Invoice PDF generation timed out (15 second limit). Please try again.')), 15000)
      );

      await Promise.race([
        generateInvoicePDF(inv, chList, allItems, masterObj, materials, true, false),
        timeoutPromise
      ]);

      setPdfActionStatus({ text: `Invoice ${inv.invoice_no} successfully downloaded.` });
    } catch (err: any) {
      console.error(err);
      setPdfActionStatus({ text: `Failed generating document download: ${err.message || err}`, isError: true });
    }
  };

  // Direct print PDF helper from list
  const triggerListPDFPrint = async (inv: Invoice) => {
    setPdfActionStatus({ text: `Compiling layout print preview for Invoice ${inv.invoice_no}... Please wait.` });
    try {
      const masterObj = db.getMasters().find(m => m.id === inv.master_id);
      if (!masterObj) {
        setPdfActionStatus({ text: 'Error: Master profile not found in database.', isError: true });
        return;
      }
      const icList = db.getInvoiceChallans(inv.id).map(ic => ic.challan_id);
      const chList = db.getChallans().filter(c => icList.includes(c.id));
      const allItems = db.getChallanItems();

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Invoice print preview layout timed out (15 second limit). Please try again.')), 15000)
      );

      await Promise.race([
        generateInvoicePDF(inv, chList, allItems, masterObj, materials, false, true),
        timeoutPromise
      ]);

      setPdfActionStatus({ text: `Invoice ${inv.invoice_no} sent to printer queue.` });
    } catch (err: any) {
      console.error(err);
      setPdfActionStatus({ text: `Failed triggering direct print dialog: ${err.message || err}`, isError: true });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6" id="billing-view">
      
      {db.isSyncFailed() && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <div className="text-xs">
            <span className="font-bold block uppercase tracking-wider text-rose-700">Sync Failed / Cloud Save Disabled</span>
            Security/Authorization permissions failure detected with Google Firebase Firestore. Settle finalisation matches are currently blocked to prevent inconsistent local states.
          </div>
        </div>
      )}
      
      {/* Dynamic View Navigation */}
      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          onClick={() => {
            setActiveBillingTab('create');
            setSuccessInvoice(null);
          }}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer uppercase ${
            activeBillingTab === 'create' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Receipt className="w-4.5 h-4.5" /> Assemble Settle Bill
        </button>
        <button
          onClick={() => {
            setActiveBillingTab('manage');
            setEditingInvoice(null);
          }}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer uppercase ${
            activeBillingTab === 'manage' ? 'bg-[#1A2E4A] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <FileCheck className="w-4.5 h-4.5" /> Manage & Settle Registers
        </button>
      </div>

      {pdfActionStatus && (
        <div className={`border rounded-xl p-4 flex gap-2.5 items-start ${pdfActionStatus.isError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${pdfActionStatus.isError ? 'text-rose-600' : 'text-blue-600'}`} />
          <div className="text-xs font-semibold">
            {pdfActionStatus.text}
          </div>
          <button onClick={() => setPdfActionStatus(null)} className={`ml-auto cursor-pointer transition ${pdfActionStatus.isError ? 'text-rose-500 hover:text-rose-800' : 'text-blue-500 hover:text-blue-800'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeBillingTab === 'create' ? (
        <>
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
                <div className="relative">
                  <input
                    type="text"
                    id="master-search-input"
                    ref={el => { inputRefs.current['masterSearchQuery'] = el; }}
                    className="w-full bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs text-slate-800 font-bold"
                    placeholder="Type to search master..."
                    value={
                      showMasterDropdown 
                        ? masterSearchQuery 
                        : (() => {
                            if (!selectedMasterId) return '';
                            const m = masters.find(x => x.id === selectedMasterId);
                            if (!m) return '';
                            if (selectedPanId && m.pan_accounts) {
                              const p = m.pan_accounts.find(x => x.id === selectedPanId);
                              if (p) {
                                const idx = m.pan_accounts.indexOf(p);
                                const panLabel = `${m.code.toUpperCase()}-${idx + 1}`;
                                return p.pan_name 
                                  ? `${m.name} (${panLabel}: ${p.pan_name})` 
                                  : `${m.name} (${panLabel}: ${p.pan_no})`;
                              }
                            }
                            return `${m.name} (${m.code.toUpperCase()})`;
                          })()
                    }
                    onChange={(e) => {
                      setMasterSearchQuery(e.target.value);
                      setShowMasterDropdown(true);
                      setHighlightedMasterIndex(0);
                    }}
                    onFocus={() => {
                      setShowMasterDropdown(true);
                      setHighlightedMasterIndex(0);
                      // Clear query so it displays all options when focusing
                      setMasterSearchQuery('');
                    }}
                    onBlur={() => {
                      // Small delay so that options mouse clicks are processed
                      setTimeout(() => {
                        setShowMasterDropdown(false);
                      }, 250);
                    }}
                    onKeyDown={(e) => {
                      const flatOptions = getFlatMasterOptions();
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (showMasterDropdown && flatOptions.length > 0) {
                          setHighlightedMasterIndex(prev => {
                            const nextIdx = prev + 1;
                            return nextIdx < flatOptions.length ? nextIdx : prev;
                          });
                        } else {
                          setShowMasterDropdown(true);
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (showMasterDropdown && highlightedMasterIndex > 0) {
                          setHighlightedMasterIndex(prev => prev - 1);
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (showMasterDropdown && highlightedMasterIndex >= 0 && highlightedMasterIndex < flatOptions.length) {
                          const option = flatOptions[highlightedMasterIndex];
                          handleMasterSearchSelect(option.masterId, option.panId);
                        } else {
                          setShowMasterDropdown(true);
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowMasterDropdown(false);
                      }
                    }}
                  />

                  {showMasterDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden max-h-56 overflow-y-auto" role="listbox">
                      {(() => {
                        const flatOptions = getFlatMasterOptions();
                        if (flatOptions.length === 0) {
                          return <p className="p-2.5 text-xs text-slate-400 text-center">No matching masters found</p>;
                        }
                        return flatOptions.map((opt, idx) => (
                          <button
                            key={`${opt.masterId}_${opt.panId}_${idx}`}
                            type="button"
                            onMouseEnter={() => setHighlightedMasterIndex(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleMasterSearchSelect(opt.masterId, opt.panId);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-bold transition flex justify-between items-center border-b border-slate-50 last:border-0 ${
                              idx === highlightedMasterIndex
                                ? 'bg-slate-100 text-[#1A2E4A]'
                                : 'bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            role="option"
                            aria-selected={idx === highlightedMasterIndex}
                          >
                            <span>{opt.displayName}</span>
                            <span className="bg-slate-200 text-slate-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
                              {opt.type}
                            </span>
                          </button>
                        ));
                      })()}
                    </div>
                  )}
                </div>
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
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                  <option value={2028}>2028</option>
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
              {/* Left Column: Two separate lists — Pending (to bill) and Settled (billed) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
                  
                  {/* List 1: Pending Challans To Bill */}
                  <div>
                    <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#1A2E4A]">
                        <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
                        <span className="uppercase tracking-wider">Pending Challans To Bill ({pendingChallans.length})</span>
                      </div>
                      {pendingChallans.length > 0 && (
                        <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-sm">
                          Tab + Arrow Keys
                        </span>
                      )}
                    </div>

                    {pendingChallans.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-[11px] leading-relaxed bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                        No active 'issued' material challans found.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div 
                          id="challan-list-container"
                          tabIndex={0}
                          onFocus={() => {
                            setIsChallanListFocused(true);
                            if (focusedChallanIndex === -1) {
                              setFocusedChallanIndex(0);
                            }
                          }}
                          onBlur={() => setIsChallanListFocused(false)}
                          className="space-y-2 max-h-[250px] overflow-y-auto pr-1 focus:outline-2 focus:outline-blue-500 rounded-xl p-0.5"
                          title="Click here or press Tab to navigate via keyboard arrows"
                        >
                          {pendingChallans.map((ch, idx) => {
                            const cleanNotes = ch.notes ? ch.notes.split('\n').filter(line => !line.trim().startsWith('EDIT REASON:')).join(' ') : '';
                            const isFocused = idx === focusedChallanIndex && isChallanListFocused;
                            return (
                              <div
                                key={ch.id}
                                onClick={() => {
                                  setFocusedChallanIndex(idx);
                                  setIsChallanListFocused(true);
                                }}
                                className={`flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer text-left block relative ${
                                  selectedChallanIds[ch.id] 
                                    ? 'bg-slate-50 border-[#1A2E4A]/40' 
                                    : 'bg-white border-slate-150'
                                } ${isFocused ? 'ring-2 ring-blue-500 ring-offset-1 bg-blue-50/20' : ''}`}
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
                                  <p className="text-[10px] text-slate-550 mt-1">
                                    Issued By: <span className="font-semibold">{ch.issued_by}</span>
                                  </p>
                                  {cleanNotes && (
                                    <p className="text-[9.5px] text-slate-400 italic mt-1 max-w-[200px] truncate">
                                      "{cleanNotes}"
                                    </p>
                                  )}
                                  {ch.editReason && (
                                    <div className="mt-1.5 text-[9.5px] bg-amber-50/70 text-amber-900 border border-amber-100 p-1 rounded font-medium max-w-[210px] leading-relaxed">
                                      <span className="font-bold text-amber-950">Edit Reason:</span> "{ch.editReason}"
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight italic pt-1">
                          💡 <strong>Arrows</strong> to navigate, <strong>Space</strong> to select, <strong>Enter</strong> to inspect materials.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* List 2: Settled Invoices History */}
                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800 mb-3 border-b border-emerald-100 pb-2">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      <span className="uppercase tracking-wider">Settled Invoices / History</span>
                    </div>

                    {(() => {
                      const periodInvoices = allInvoices.filter(inv => 
                        inv.master_id === selectedMasterId && 
                        inv.period_month === periodMonth && 
                        inv.period_year === periodYear &&
                        inv.status === 'finalised'
                      );

                      if (periodInvoices.length === 0) {
                        return (
                          <div className="text-center py-6 text-slate-400 text-[11px] leading-relaxed bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                            No settled invoices found for this period.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                          {periodInvoices.map(inv => {
                            const allChallans = db.getChallans();
                            const includedChallans = allChallans.filter(c => c.invoiceId === inv.id || c.billedInvoiceId === inv.id);
                            const challanNoString = includedChallans.length > 0
                              ? includedChallans.map(c => c.challan_no).join(', ')
                              : 'No linked challans';

                            return (
                              <div 
                                key={inv.id}
                                className="bg-emerald-50/20 hover:bg-emerald-50/45 p-3 rounded-xl border border-emerald-100/50 text-left transition text-xs"
                              >
                                <div className="flex justify-between items-center font-bold text-slate-900 mb-1.5">
                                  <span className="text-emerald-950 flex items-center gap-1">
                                    <span>No: {inv.invoice_no}</span>
                                    <span className="text-[8px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded uppercase">Settled</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">{formatDate(inv.created_at.split('T')[0])}</span>
                                </div>
                                
                                <div className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                                  <span className="font-semibold text-slate-600">Included Challans:</span> {challanNoString}
                                </div>

                                <div className="p-2 bg-white rounded-lg border border-emerald-100/60 shadow-xs flex justify-between items-center text-[11.5px]">
                                  <div className="flex flex-col">
                                    <span className="text-[8.5px] text-slate-400 font-medium uppercase leading-none mb-0.5">Grand Total</span>
                                    <span className="font-bold font-mono text-emerald-750">
                                      ₹{inv.net_payable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 font-bold text-[10px]">
                                    <button 
                                      onClick={() => triggerListPDFPrint(inv)}
                                      className="text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-indigo-50/40 cursor-pointer"
                                      title="Print/View PDF"
                                    >
                                      <Printer className="w-2.8 h-2.8" /> View / Print
                                    </button>
                                    <span className="text-slate-200">|</span>
                                    <button 
                                      onClick={() => triggerListPDFDownload(inv)}
                                      className="text-amber-700 hover:text-amber-900 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-amber-50/40 cursor-pointer"
                                      title="Download Ledger PDF"
                                    >
                                      <Download className="w-2.8 h-2.8" /> PDF
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

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
                        STITCHING WORK EARNINGS (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Earned, e.g. 210100"
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-mono font-bold text-slate-800"
                        value={baseWorkAmountRaw}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val;
                          setBaseWorkAmountRaw(cleaned);
                          setBaseWorkAmount(parseFloat(cleaned) || 0);
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4 mt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        STITCHING WORK DEDUCTION REASON
                      </label>
                      <input
                        type="text"
                        placeholder="Reason, e.g. Stitching correction defect, rework damage"
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-medium text-slate-800 placeholder-slate-400 font-semibold"
                        value={stitchingDeductionReason}
                        onChange={(e) => setStitchingDeductionReason(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        DEDUCTION AMOUNT (₹)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Deduction value, e.g. 1500"
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg py-2 px-3 text-xs font-mono font-bold text-slate-800 placeholder-slate-400"
                        value={stitchingDeductionAmountRaw}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val;
                          setStitchingDeductionAmountRaw(cleaned);
                          setStitchingDeductionAmount(parseFloat(cleaned) || 0);
                        }}
                      />
                    </div>
                  </div>

                  {stitchingDeductionAmount > 0 && (
                    <div className="bg-amber-50 rounded-lg p-2.5 text-[11px] text-amber-850 border border-amber-200 flex justify-between items-center font-semibold">
                      <span>Stitching Sub-Total Deduction Applied:</span>
                      <span className="font-mono text-xs text-amber-900 font-bold">
                        {formatINR(baseWorkAmount)} - {formatINR(stitchingDeductionAmount)} = {formatINR(workAmount)} Net Earning
                      </span>
                    </div>
                  )}

                  {/* SECTION III: Disbursement details with PAN configuration */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <span className="text-[9px] font-bold tracking-widest text-[#1A2E4A] uppercase">SECTION III</span>
                    <h4 className="text-xs font-bold text-slate-800 tracking-tight uppercase">PAN & BANK ACCOUNT DISBURSEMENT DESIGNATION</h4>

                    {(() => {
                      const masterObj = masters.find(m => m.id === selectedMasterId);
                      const activeProfiles = masterObj?.pan_accounts?.filter(p => p.is_active !== false) || [];
                      const hasActivePanDetails = activeProfiles.length > 0;

                      return (
                        <div className="space-y-3">
                          {hasActivePanDetails ? (
                            <div>
                              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                SELECT PAN ACCOUNT *
                              </span>
                              <select
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] focus:ring-1 focus:ring-[#2D3E5D] focus:outline-none rounded-lg p-2 text-xs font-bold text-[#1A2E4A]"
                                value={selectedPanId}
                                onChange={(e) => handlePanProfileChange(e.target.value)}
                              >
                                <option value="">-- Choose active PAN/Bank Profile --</option>
                                {activeProfiles.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.label ? `${p.label.toUpperCase()} : ` : ''}{p.pan_no} | {p.bank_name} ({p.account_no.slice(-4).padStart(p.account_no.length, '*')})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-850 rounded-lg text-[11px] leading-relaxed space-y-1">
                              <p className="font-bold">No registered active bank/PAN accounts found under craftsman file!</p>
                              <p className="text-slate-650">
                                You can configure permanent accounts in <strong className="font-semibold">Settings / Masters Control</strong>. For now, you can input interim credentials below:
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">Account / PAN Holder Name *</label>
                              <input
                                type="text"
                                placeholder="E.g. John Doe"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 mt-0.5"
                                value={panName}
                                onChange={(e) => setPanName(e.target.value)}
                                disabled={hasActivePanDetails}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">PAN Card No *</label>
                              <input
                                type="text"
                                placeholder="E.g. ABCDE1234F"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs font-mono font-bold uppercase mt-0.5"
                                value={panNo}
                                onChange={(e) => setPanNo(e.target.value.toUpperCase())}
                                disabled={hasActivePanDetails}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">Bank Name *</label>
                              <input
                                type="text"
                                placeholder="E.g. HDFC Bank"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs mt-0.5 font-semibold text-slate-800"
                                value={bankName}
                                onChange={(e) => setBankName(e.target.value)}
                                disabled={hasActivePanDetails}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">Account Number *</label>
                              <input
                                type="text"
                                placeholder="E.g. 50100234567"
                                className="w-full bg-slate-50 border border-slate-201 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs font-mono font-bold mt-0.5"
                                value={accountNo}
                                onChange={(e) => setAccountNo(e.target.value)}
                                disabled={hasActivePanDetails}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">IFSC Code *</label>
                              <input
                                type="text"
                                placeholder="E.g. HDFC0000123"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-[#2D3E5D] rounded px-2.5 py-1.5 text-xs font-mono font-bold uppercase mt-0.5"
                                value={ifscCode}
                                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                                disabled={hasActivePanDetails}
                              />
                            </div>

                            {branchName && (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Branch Name</label>
                                <div className="text-xs font-mono font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 mt-0.5">
                                  {branchName}
                                </div>
                              </div>
                            )}

                            {chequeInFavourOf && (
                              <div className="col-span-full">
                                <label className="block text-[10px] font-bold text-amber-800 uppercase">Cheque in Favour Of</label>
                                <div className="text-xs font-mono font-bold text-amber-900 bg-amber-50/50 border border-amber-200/50 rounded px-2.5 py-1.5 mt-0.5">
                                  {chequeInFavourOf.toUpperCase()}
                                </div>
                              </div>
                            )}
                          </div>
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
                          <span className="text-slate-500">Stitching Work Earnings (Gross):</span>
                          <span className="font-semibold text-slate-850 font-mono">{formatINR(baseWorkAmount)}</span>
                        </div>
                        {stitchingDeductionAmount > 0 && (
                          <div className="flex justify-between text-amber-700 font-medium">
                            <span className="text-amber-800">Stitching Deductions ({stitchingDeductionReason || 'Job Deduc.'}):</span>
                            <span className="font-bold font-mono">- {formatINR(stitchingDeductionAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Stitching Work Earnings (Net):</span>
                          <span className="font-bold text-slate-900 font-mono">{formatINR(workAmount)}</span>
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

                  {/* Validation Checker Visual Slate */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <p className="font-bold text-[#1A2E4A] uppercase tracking-wider text-[10px] flex items-center justify-between border-b pb-1">
                      <span>PRE-FLIGHT BILL VALIDATION</span>
                      <span className={isBillingValid ? "text-green-600 font-extrabold" : "text-rose-500 font-extrabold"}>
                        {isBillingValid ? "PASS" : "ATTENTION REQUIRED"}
                      </span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-650">
                      <div className="flex items-center gap-1.5">
                        <span className={isMasterSelected ? "text-green-600 font-bold" : "text-rose-500 font-bold"}>
                          {isMasterSelected ? "✓" : "✗"}
                        </span>
                        Master Selected
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={isAnyChallanSelected ? "text-green-600 font-bold" : "text-rose-500 font-bold"}>
                          {isAnyChallanSelected ? "✓" : "✗"}
                        </span>
                        Challan Checked ({activeChallanIds.length})
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={isPcsValid ? "text-green-600 font-bold" : "text-rose-500 font-bold"}>
                          {isPcsValid ? "✓" : "✗"}
                        </span>
                        Pieces ({pcs || 0}) &gt; 0
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={isEarningValid ? "text-green-600 font-bold" : "text-rose-500 font-bold"}>
                          {isEarningValid ? "✓" : "✗"}
                        </span>
                        Job Wages ({formatINR(workAmount)}) &gt; 0
                      </div>
                      <div className="sm:col-span-2 flex items-center gap-1.5 border-t border-slate-200/60 pt-1.5 text-slate-500 font-medium">
                        <span className="text-green-600 font-bold">✓</span>
                        PAN &amp; Bank Disbursement Details (Optional)
                      </div>
                    </div>

                    {isNetPayableNegative && (
                      <div className="border border-amber-200 bg-amber-50/70 p-3 rounded-lg space-y-2 mt-2">
                        <p className="text-amber-800 font-bold flex items-center gap-1 leading-none text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /> NEGATIVE BALANCE DETECTED ({formatINR(roundedOffGrandTotal)})
                        </p>
                        <p className="text-slate-600 text-xs">This settlement results in a negative payable. Explicit owner check override with target reason is mandatory to finalise.</p>
                        <label className="flex items-center gap-2 text-slate-800 font-bold select-none cursor-pointer text-xs">
                          <input 
                            type="checkbox" 
                            checked={ownerOverride} 
                            onChange={(e) => setOwnerOverride(e.target.checked)} 
                            className="rounded border-slate-300 focus:ring-0 w-3.5 h-3.5"
                          />
                          Tick to confirm owner override approval
                        </label>
                        {ownerOverride && (
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Input Authorization Reason (min 5 chars):</label>
                            <input 
                              type="text" 
                              placeholder="E.g. Approved adjustment for tailoring advances or credits..." 
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              className="bg-white border border-slate-200 rounded p-1.5 text-xs w-full text-slate-850 font-medium focus:ring-1 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    )}

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
                      className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-800 font-bold py-2.5 px-4 rounded-lg text-xs border border-slate-250 cursor-pointer transition"
                    >
                      Save Draft Bill
                    </button>
                    <button
                      type="button"
                      disabled={loading || !isBillingValid}
                      onClick={() => setShowInvoiceFinalizeConfirm(true)}
                      className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg text-xs shadow-sm cursor-pointer transition uppercase tracking-wider"
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
      </>
      ) : (
        /* Settle registry lists & Edit Invoice inline form */
        <div className="space-y-6 text-left">
          {editingInvoice ? (
            /* ACTIVE EDITING CARD FOR ADMIN */
            <form onSubmit={handleSaveEditInvoice} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-[#1A2E4A] rounded-lg">
                    <Edit3 className="w-5 h-5 animate-pulse text-indigo-650" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-850">Modifier Settle Register: {editingInvoice.invoice_no}</h4>
                    <p className="text-[10px] text-slate-400">Modify pieces, wages, discounts, or bank dispatch details</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-655 text-xs py-1.5 px-3 rounded-lg font-bold"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Total Pcs</label>
                  <input
                    type="number"
                    value={editPcs}
                    onChange={(e) => setEditPcs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Gross Stitching Wages (Rs)</label>
                  <input
                    type="number"
                    value={editWorkAmount}
                    onChange={(e) => setEditWorkAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Deducted Discount (Rs)</label>
                  <input
                    type="number"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Bill Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'draft' | 'finalised')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none font-bold text-slate-705"
                  >
                    <option value="draft">DRAFT</option>
                    <option value="finalised">FINALISED</option>
                  </select>
                </div>
              </div>

              {(() => {
                const master = masters.find(m => m.id === editingInvoice.master_id);
                if (master && master.pan_accounts && master.pan_accounts.length > 0) {
                  return (
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                      <label className="block text-[11px] font-bold text-[#1A2E4A] uppercase">Select Master PAN/Bank Profile Override</label>
                      <select
                        onChange={(e) => {
                          const profile = master.pan_accounts?.find(p => p.id === e.target.value);
                          if (profile) {
                            setEditPanNo(profile.pan_no);
                            setEditPanName(profile.pan_name || '');
                            setEditBankName(profile.bank_name);
                            setEditAccountNo(profile.account_no);
                            setEditIfscCode(profile.ifsc_code);
                            setEditBranchName(profile.branch_name || '');
                          }
                        }}
                        className="w-full bg-white border border-slate-200 p-2 text-xs rounded-lg outline-none font-bold text-slate-700 cursor-pointer"
                        defaultValue={editPanNo}
                      >
                        <option value="">-- Apply custom registered bank allocation profile --</option>
                        {master.pan_accounts.map(p => (
                          <option key={p.id} value={p.id}>{p.pan_no} - {p.bank_name} ({p.account_no})</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <span className="text-[10px] font-extrabold text-[#1A2E4A] tracking-wider uppercase block">Custom Settle Dispatch Details</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">PAN Holder Name</label>
                    <input
                      type="text"
                      value={editPanName}
                      onChange={(e) => setEditPanName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">PAN Number</label>
                    <input
                      type="text"
                      value={editPanNo}
                      onChange={(e) => setEditPanNo(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-655 uppercase mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-655 uppercase mb-1">Account Number</label>
                    <input
                      type="text"
                      value={editAccountNo}
                      onChange={(e) => setEditAccountNo(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-655 uppercase mb-1">IFSC Code</label>
                    <input
                      type="text"
                      value={editIfscCode}
                      onChange={(e) => setEditIfscCode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-655 uppercase mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={editBranchName}
                      onChange={(e) => setEditBranchName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1">Cheque in Favour Of</label>
                    <input
                      type="text"
                      placeholder="THE ZURI GARMENT"
                      value={editChequeInFavourOf}
                      onChange={(e) => setEditChequeInFavourOf(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#1A2E4A] outline-none text-amber-900 font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-4 rounded-xl text-xs border border-slate-200 cursor-pointer"
                >
                  Cancel Modification
                </button>
                <button
                  type="submit"
                  className="bg-[#1A2E4A] hover:bg-[#2D3E5D] text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm"
                >
                  Save Invoice Changes
                </button>
              </div>
            </form>
          ) : (
            /* INVOICE REGISTRY GRID */
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-xs font-bold text-[#1A2E4A] uppercase tracking-wider flex items-center gap-1.5">
                    📑 Complete Settle Invoice Registry
                  </h4>
                  <p className="text-[10px] text-slate-450 font-sans">List of all saved drafts & finalized month-end stitching settlements</p>
                </div>

                {/* Registry filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <select
                      value={filterMasterId}
                      onChange={(e) => setFilterMasterId(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">All Stitching Masters</option>
                      {db.getMasters().map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">All Statuses</option>
                      <option value="draft">Draft Bills</option>
                      <option value="finalised">Finalised Bills</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Registry List Table */}
              {(() => {
                let filteredInvoices = allInvoices;
                if (filterMasterId !== 'all') {
                  filteredInvoices = filteredInvoices.filter(inv => inv.master_id === filterMasterId);
                }
                if (filterStatus !== 'all') {
                  filteredInvoices = filteredInvoices.filter(inv => inv.status === filterStatus);
                }

                if (filteredInvoices.length === 0) {
                  return (
                    <div className="p-8 text-center bg-slate-50 border border-slate-150 border-dashed rounded-xl">
                      <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 font-semibold uppercase">No invoice registers matched selection filters</p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-sans min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-250">
                          <th className="py-2.5 px-3">Bill ID</th>
                          <th className="py-2.5 px-3">Stitching Master</th>
                          <th className="py-2.5 px-3">Settle Period</th>
                          <th className="py-2.5 px-3">Total Pcs</th>
                          <th className="py-2.5 px-3 text-right">Pre-Wages</th>
                          <th className="py-2.5 px-3 text-right">Deduction</th>
                          <th className="py-2.5 px-3 text-right">Net Paid</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredInvoices.map(inv => {
                          const master = db.getMasters().find(m => m.id === inv.master_id);
                          const periodMonthName = monthsList.find(m => m.value === inv.period_month)?.name || `Month ${inv.period_month}`;
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                              <td className="py-3 px-3 font-mono font-bold text-[#1A2E4A] whitespace-nowrap">{inv.invoice_no}</td>
                              <td className="py-3 px-3">
                                <div className="font-bold text-slate-755">{master?.name || 'Unknown Master'}</div>
                                <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{master?.type === 'jacket' ? '👔 jackets tailor' : '👖 pants tailor'}</div>
                              </td>
                              <td className="py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">{periodMonthName} {inv.period_year}</td>
                              <td className="py-3 px-3 font-mono text-slate-600 font-bold">{inv.pcs || 0} pcs</td>
                              <td className="py-3 px-3 font-mono text-slate-655 text-right font-semibold">{formatINR(inv.work_amount || 0)}</td>
                              <td className="py-3 px-3 font-mono text-rose-655 text-right font-medium">{formatINR(inv.material_deduction || 0)}</td>
                              <td className="py-3 px-3 font-mono text-emerald-800 text-right font-extrabold">{formatINR(inv.net_payable)}</td>
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                  inv.status === 'finalised' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' 
                                    : 'bg-amber-50 text-amber-700 border border-amber-150'
                                }`}>
                                  {inv.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right whitespace-nowrap text-slate-700">
                                <div className="flex justify-end gap-1.5 items-center">
                                  <button
                                    onClick={() => triggerListPDFPrint(inv)}
                                    title="Direct spool to printer"
                                    className="p-1 px-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-md border border-slate-200 transition cursor-pointer"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => triggerListPDFDownload(inv)}
                                    title="Download high-quality settled PDF"
                                    className="p-1 px-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md border border-blue-200 transition cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>

                                  {currentUser.role === 'admin' ? (
                                    <>
                                      <button
                                        onClick={() => handleStartEdit(inv)}
                                        title="Recalculate or override dispatcher bank accounts (Admin only)"
                                        className="p-1 px-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md border border-indigo-200 transition cursor-pointer"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteInvoiceClick(inv.id, inv.invoice_no)}
                                        title="Void Bill & Restore Material Challans (Admin only)"
                                        className="p-1 px-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-md border border-rose-200 transition cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <span 
                                      title="Admin permissions required to modify invoice"
                                      className="text-[9px] text-slate-400 font-mono italic select-none"
                                    >
                                      🔒 locked
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* 1. VIEW CHALLAN DETAILS MODAL */}
      {viewingChallanDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-[#1A2E4A]">Material Challan Details</h4>
                <p className="text-[10px] text-slate-400 font-mono">Challan No: {viewingChallanDetails.challan_no}</p>
              </div>
              <button 
                onClick={() => setViewingChallanDetails(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs bg-slate-100 p-1 px-2.5 rounded-md cursor-pointer"
              >
                ✕ Esc
              </button>
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {viewingChallanDetailsItems.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No material line items found for this challan.</p>
              ) : (
                <div className="border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                  <div className="grid grid-cols-12 bg-slate-50 p-2 font-bold text-slate-500 uppercase text-[9px]">
                    <span className="col-span-6">Material Item</span>
                    <span className="col-span-3 text-right">Qty</span>
                    <span className="col-span-3 text-right">Captured Rate</span>
                  </div>
                  {viewingChallanDetailsItems.map(item => {
                    const mat = materials.find(m => m.id === item.material_id);
                    return (
                      <div key={item.id} className="grid grid-cols-12 p-2.5 text-slate-700 font-semibold">
                        <span className="col-span-6">{mat?.name || 'Unknown Item'}</span>
                        <span className="col-span-3 text-right font-mono text-slate-900">{item.qty} {mat?.unit}</span>
                        <span className="col-span-3 text-right font-mono text-slate-600">{formatINR(item.rate)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button 
                autoFocus
                onClick={() => setViewingChallanDetails(null)}
                className="bg-[#1A2E4A] hover:bg-[#14233a] text-white text-xs font-bold py-2 px-4 rounded-lg cursor-pointer transition shadow-xs"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. INVOICE FINALIZE CONFIRMATION MODAL */}
      {showInvoiceFinalizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-xs border border-amber-100">
                <Receipt className="w-6 h-6 animate-bounce" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Finalise monthly Stitching Bill?</h4>
              <p className="text-slate-500 text-xs">
                You are compiling a finalised billing ledger entry for <strong className="font-bold">{masters.find(m => m.id === selectedMasterId)?.name}</strong> for the period {monthsList.find(m => m.value === periodMonth)?.name} {periodYear}.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200 text-xs">
              <div className="flex justify-between font-medium">
                <span className="text-slate-400">Total Pieces:</span>
                <span className="font-semibold text-slate-700 font-mono">{pcs} pcs</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-400">Pre-Wages Credit:</span>
                <span className="font-semibold text-slate-700 font-mono">{formatINR(workAmount)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-400">Material Deductions:</span>
                <span className="font-semibold text-rose-600 font-mono">- {formatINR(materialDeduction)}</span>
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between font-extrabold text-[#1A2E4A]">
                <span>Net Grand Total:</span>
                <span className="font-mono text-sm">{formatINR(roundedOffGrandTotal)}</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 italic text-center">
              Compiling will lock linked challans. Real physical PDFs will download automatically!
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setShowInvoiceFinalizeConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-lg text-xs border border-slate-250 cursor-pointer transition"
              >
                Cancel (Esc)
              </button>
              <button 
                type="button"
                autoFocus
                onClick={() => {
                  setShowInvoiceFinalizeConfirm(false);
                  handleGenerateInvoice('finalised');
                }}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg text-xs cursor-pointer transition shadow-sm uppercase tracking-wider"
              >
                Yes, Finalise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. INVOICE DELETE/VOID AUDIT CONFIRMATION MODAL */}
      {showDeleteInvoiceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-rose-50 text-rose-700 rounded-full flex items-center justify-center mx-auto shadow-xs border border-rose-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Void & Revert Invoice?</h4>
              <p className="text-slate-500 text-xs">
                This will permanently void invoice <strong className="font-bold">{allInvoices.find(inv => inv.id === showDeleteInvoiceConfirm)?.invoice_no}</strong> and revert its referenced material challans to "Issued" state instantly.
              </p>
            </div>

            <div className="space-y-1.5 text-xs text-left">
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Input Audit Reason for Deletion:</label>
              <input 
                type="text" 
                autoFocus
                required
                placeholder="E.g. Rectifying double billing / erroneous pieces counts..." 
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deleteReason.trim().length >= 5) {
                    e.preventDefault();
                    handleConfirmDeleteInvoice(showDeleteInvoiceConfirm);
                  }
                }}
                className="bg-slate-50 focus:bg-white border border-slate-200 rounded-lg p-2.5 text-xs w-full text-slate-850 font-semibold focus:ring-1 focus:ring-rose-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400">Audit reason is strictly required (min 5 characters) to log this operation.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => {
                  setShowDeleteInvoiceConfirm(null);
                  setDeleteReason('');
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-lg text-xs border border-slate-250 cursor-pointer transition"
              >
                Cancel (Esc)
              </button>
              <button 
                type="button"
                disabled={deleteReason.trim().length < 5}
                onClick={() => handleConfirmDeleteInvoice(showDeleteInvoiceConfirm)}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg text-xs cursor-pointer transition shadow-sm uppercase tracking-wider"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default BillingView;
