/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MasterType = 'jacket' | 'pant';
export type ChallanStatus = 'issued' | 'billed';
export type InvoiceStatus = 'draft' | 'finalised';
export type UserRole = 'issue_dept' | 'billing' | 'admin';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  created_at?: string;
  username?: string;
  password?: string;
}

export interface MasterPanAccount {
  id: string;
  pan_no: string;
  bank_name: string;
  account_no: string;
  ifsc_code: string;
  branch_name?: string;
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

export interface Challan {
  id: string;
  challan_no: string;
  master_id: string;
  issued_date: string; // YYYY-MM-DD
  issued_by: string;
  status: ChallanStatus;
  notes: string;
  created_at: string;
}

export interface ChallanItem {
  id: string;
  challan_id: string;
  material_id: string;
  qty: number;
  rate: number;
  amount: number;
  created_at: string;
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
  selected_bank_name?: string;
  selected_account_no?: string;
  selected_ifsc_code?: string;
  selected_branch_name?: string;
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

export interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  details: string;
  created_at: string;
}
