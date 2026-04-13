export type BillStatus =
  | 'draft'
  | 'submitted'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'invoiced'
  | 'paid'
  | 'disputed'
  | 'cancelled';

export interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bill {
  id: number;
  bill_number: string;
  customer_id: number | null;
  customer_name?: string;
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  status: BillStatus;
  carrier: string | null;
  tracking_number: string | null;
  service_type: string | null;
  freight_class: string | null;
  origin_address: string | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_zip: string | null;
  destination_address: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_zip: string | null;
  weight: number | null;
  weight_unit: string;
  pieces: number | null;
  description: string | null;
  amount: number | null;
  currency: string;
  pickup_date: string | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  created_at: string;
  updated_at: string;
  documents?: BillDocument[];
  events?: BillEvent[];
}

export interface BillDocument {
  id: number;
  bill_id: number;
  filename: string | null;
  r2_object_key: string;
  content_type: string | null;
  file_size: number | null;
  uploaded_at: string;
}

export interface BillEvent {
  id: number;
  bill_id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
}

export const STATUS_LABELS: Record<BillStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<BillStatus, string> = {
  draft: '#6b7280',
  submitted: '#3b82f6',
  picked_up: '#8b5cf6',
  in_transit: '#f59e0b',
  out_for_delivery: '#f97316',
  delivered: '#10b981',
  invoiced: '#06b6d4',
  paid: '#22c55e',
  disputed: '#ef4444',
  cancelled: '#9ca3af',
};

export const STATUS_ORDER: BillStatus[] = [
  'draft',
  'submitted',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'invoiced',
  'paid',
];

export const STATUS_TRANSITIONS: Record<BillStatus, BillStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'cancelled', 'disputed'],
  in_transit: ['out_for_delivery', 'delivered', 'cancelled', 'disputed'],
  out_for_delivery: ['delivered', 'disputed'],
  delivered: ['invoiced', 'disputed'],
  invoiced: ['paid', 'disputed'],
  paid: [],
  disputed: ['in_transit', 'delivered', 'invoiced', 'cancelled'],
  cancelled: [],
};
