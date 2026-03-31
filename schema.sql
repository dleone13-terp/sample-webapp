-- Freight Bill Tracker - Cloudflare D1 Schema

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'US',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  -- Status lifecycle: draft -> submitted -> picked_up -> in_transit -> out_for_delivery -> delivered -> invoiced -> paid
  -- Side transitions: any -> disputed, any -> cancelled
  status TEXT NOT NULL DEFAULT 'draft',
  -- Freight details
  carrier TEXT,
  tracking_number TEXT,
  service_type TEXT,
  freight_class TEXT,
  origin_address TEXT,
  origin_city TEXT,
  origin_state TEXT,
  origin_zip TEXT,
  destination_address TEXT,
  destination_city TEXT,
  destination_state TEXT,
  destination_zip TEXT,
  -- Cargo
  weight REAL,
  weight_unit TEXT DEFAULT 'lbs',
  pieces INTEGER,
  description TEXT,
  -- Financial
  amount REAL,
  currency TEXT DEFAULT 'USD',
  -- Dates
  pickup_date TEXT,
  estimated_delivery TEXT,
  actual_delivery TEXT,
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER,
  document_type TEXT, -- e.g. BOL, invoice, proof_of_delivery, customs
  notes TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- status_change, note, document_added, etc.
  from_status TEXT,
  to_status TEXT,
  description TEXT,
  created_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bill_documents_bill_id ON bill_documents(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_events_bill_id ON bill_events(bill_id);
