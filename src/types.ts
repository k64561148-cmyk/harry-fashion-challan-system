/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MasterType = 'jacket' | 'pant';
export type ChallanStatus = 'issued' | 'billed' | 'voided' | 'BILLED' | 'ISSUED' | 'VOIDED';
export type InvoiceStatus = 'draft' | 'finalised';
export type UserRole = 'issue_dept' | 'billing' | 'admin';

export interface Profile {
  uid: string;
  id: string; // compatibility fallback
  displayName: string;
  name: string; // compatibility fallback
  email: string;
  role: UserRole;
  username: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  created_at?: string; // compatibility fallback
  canCreateBackdatedChallan?: boolean;
}

export interface MasterPanAccount {
  id: string;
  label?: string; // e.g. "Brother PAN", "Main Account", "Wife Account"
  pan_name: string; // PAN/account holder name
  pan_no: string;
  bank_name: string;
  account_no: string;
  ifsc_code: string;
  branch_name?: string;
  cheque_in_favour_of?: string;
  is_default?: boolean;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Master {
  id: string;
  name: string;
  code: string;
  type: MasterType;
  is_active: boolean;
  created_at: string;
  pan_accounts?: MasterPanAccount[];
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  default_rate: number;
  current_stock: number;
  is_active: boolean;
  created_at: string;
}

export interface ChallanEditVersionItem {
  material_id: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface ChallanEditVersion {
  id: string;
  timestamp: string;
  user: string;
  reason: string;
  originalItems?: ChallanEditVersionItem[];
  previousItems: ChallanEditVersionItem[];
  latestItems: ChallanEditVersionItem[];
  changedFields: string[];
  stockDelta: { material_id: string; delta: number; name: string }[];
}

export interface Challan {
  id: string;
  challan_no: string;
  master_id: string;
  issued_date: string; // YYYY-MM-DD
  issued_by: string;
  status: ChallanStatus;
  notes: string;
  created_at: string;
  billedInvoiceId?: string;
  invoiceId?: string;
  invoiceNo?: string;
  locked?: boolean;
  billedAt?: string;
  billedBy?: string;
  lastEditedAt?: string;
  lastEditedBy?: string;
  editReason?: string;
  editHistory?: ChallanEditVersion[];
  challanDate?: string;
  createdAt?: string;
  createdBy?: string;
  backdated?: boolean;
  backdatedBy?: string;
  backdatedReason?: string;
  originalCreatedMonth?: string;
  challanMonth?: number;
  challanYear?: number;
  masterId?: string;
  masterName?: string;
  masterCode?: string;
  masterType?: string;
  masterDisplayName?: string;
  masterSnapshot?: {
    id: string;
    name: string;
    code: string;
    type?: string;
    activeStatus?: boolean;
    is_active?: boolean;
  };
  deviceId?: string;
}

export interface ChallanItem {
  id: string;
  challan_id: string;
  material_id: string;
  qty: number;
  rate: number;
  amount: number;
  created_at: string;
  materialName?: string;
  materialUnit?: string;
  materialSnapshot?: {
    id: string;
    name: string;
    unit: string;
    default_rate: number;
    current_stock: number;
    is_active: boolean;
    created_at: string;
  };
}

export interface InwardEntry {
  id: string;
  material_id: string;
  qty_received: number;
  supplier_name: string;
  bill_no: string;
  inward_date: string; // YYYY-MM-DD
  notes: string;
  created_by: string;
  created_at: string;
  materialId?: string;
  materialNameSnapshot?: string;
  unit?: string;
  quantity?: number;
  rateSnapshot?: number;
  supplier?: string;
  billNo?: string;
  date?: string;
}

export interface Invoice {
  id: string;
  invoice_no: string;
  master_id: string;
  period_month: number; // 1-12
  period_year: number;
  work_amount: number;
  material_deduction: number;
  net_payable: number;
  status: InvoiceStatus;
  created_at: string;
  pcs?: number;
  discount?: number;
  tds_amount?: number;
  grand_total?: number;
  selected_pan_no?: string;
  selected_pan_name?: string;
  selected_bank_name?: string;
  selected_account_no?: string;
  selected_ifsc_code?: string;
  selected_branch_name?: string;
  selected_cheque_in_favour_of?: string;
  selected_pan_account_id?: string;
  selected_payment_label?: string;
  paymentProfileSnapshot?: {
    id: string;
    label?: string;
    pan_name: string;
    pan_no: string;
    bank_name: string;
    account_no: string;
    ifsc_code: string;
    branch_name?: string;
    cheque_in_favour_of?: string;
  };
  stitching_deduction_amount?: number;
  stitching_deduction_reason?: string;
  base_work_amount?: number;
  advanceSetoffAmount?: number;
  advanceBalanceBefore?: number;
  advanceBalanceAfter?: number;
}

export interface MasterAdvance {
  id: string;
  masterId: string;
  masterNameSnapshot: string;
  advanceDate: string; // YYYY-MM-DD
  amount: number;
  paymentMode: 'cash' | 'bank' | 'upi' | 'cheque' | 'other';
  referenceNo: string;
  notes: string;
  status: 'active' | 'voided';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MasterAdvanceLedger {
  id: string;
  masterId: string;
  type: 'ADVANCE_GIVEN' | 'ADVANCE_SET_OFF' | 'ADVANCE_REVERSAL';
  amount: number;
  date: string; // YYYY-MM-DD
  invoiceId?: string;
  invoiceNo?: string;
  advanceId?: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface InvoiceChallan {
  invoice_id: string;
  challan_id: string;
}

export interface MasterRateOverride {
  id: string;
  master_id: string;
  material_id: string;
  rate: number;
  created_at: string;
}

export interface RateHistory {
  id: string;
  material_id: string;
  old_rate: number;
  new_rate: number;
  changed_by: string;
  created_at: string;
}

export interface StockCorrection {
  id: string;
  material_id: string;
  before_stock: number;
  after_stock: number;
  reason: string;
  admin_user: string;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  details: string;
  created_at: string;
}

export type TransactionType =
  | 'MATERIAL_ISSUE'
  | 'STOCK_INWARD'
  | 'BILL_DRAFT'
  | 'BILL_FINALIZED'
  | 'PAYMENT'
  | 'VOID'
  | 'ADJUSTMENT';

export interface LedgerTransaction {
  id: string;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  master_id?: string;
  material_id?: string;
  qty?: number;
  rate?: number;
  amount: number; // for ledger accounting
  ref_id: string;
  ref_no: string;
  notes?: string;
  created_at: string;
  // Detailed values for identical calculations
  work_amount?: number;
  material_deduction?: number;
  discount?: number;
  tds_amount?: number;
  net_payable?: number;
  period_month?: number;
  period_year?: number;
}
