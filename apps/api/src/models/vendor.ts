export type PaymentTerms = 'NET_30' | 'NET_60' | 'NET_90';

export interface VendorRow {
  id: string;
  name: string;
  contact_email: string | null;
  phone: string | null;
  payment_terms: PaymentTerms | null;
  lead_time_days: number | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactEmail: string | null;
  phone: string | null;
  paymentTerms: PaymentTerms | null;
  leadTimeDays: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    name: row.name,
    contactEmail: row.contact_email,
    phone: row.phone,
    paymentTerms: row.payment_terms,
    leadTimeDays: row.lead_time_days,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
