import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { BillStatus } from '../types';

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  company: text('company'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zip: text('zip'),
  country: text('country').notNull().default('US'),
  notes: text('notes'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const bills = sqliteTable(
  'bills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bill_number: text('bill_number').notNull().unique(),
    customer_id: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    status: text('status').$type<BillStatus>().notNull().default('draft'),
    carrier: text('carrier'),
    tracking_number: text('tracking_number'),
    service_type: text('service_type'),
    freight_class: text('freight_class'),
    origin_address: text('origin_address'),
    origin_city: text('origin_city'),
    origin_state: text('origin_state'),
    origin_zip: text('origin_zip'),
    destination_address: text('destination_address'),
    destination_city: text('destination_city'),
    destination_state: text('destination_state'),
    destination_zip: text('destination_zip'),
    weight: real('weight'),
    weight_unit: text('weight_unit').notNull().default('lbs'),
    pieces: integer('pieces'),
    description: text('description'),
    amount: real('amount'),
    currency: text('currency').notNull().default('USD'),
    pickup_date: text('pickup_date'),
    estimated_delivery: text('estimated_delivery'),
    actual_delivery: text('actual_delivery'),
    created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
    updated_at: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_bills_customer_id').on(table.customer_id),
    index('idx_bills_status').on(table.status),
    index('idx_bills_bill_number').on(table.bill_number),
  ]
);

export const billDocuments = sqliteTable(
  'bill_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bill_id: integer('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    r2_object_key: text('r2_object_key').notNull(),
    uploaded_at: text('uploaded_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_bill_documents_bill_id').on(table.bill_id)]
);

export const billEvents = sqliteTable(
  'bill_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bill_id: integer('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    event_type: text('event_type').notNull(),
    from_status: text('from_status'),
    to_status: text('to_status'),
    description: text('description'),
    created_by: text('created_by').notNull().default('system'),
    created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_bill_events_bill_id').on(table.bill_id)]
);
