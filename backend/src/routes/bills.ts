import { Hono } from 'hono';
import { and, asc, desc, eq, getTableColumns, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { getDb, schema } from '../db';
import type { Env } from '../types';
import type { Bill, BillStatus } from '../types';
import { STATUS_TRANSITIONS } from '../types';

const bills = new Hono<{ Bindings: Env }>();

// Helper to generate bill numbers
function generateBillNumber(): string {
  const date = new Date();
  const prefix = 'FRT';
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, '0');
  return `${prefix}-${year}${month}-${random}`;
}

// GET /api/bills
bills.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const status = c.req.query('status');
  const customerId = c.req.query('customer_id');
  const search = c.req.query('search');

  const filters: SQL[] = [];
  if (status) {
    filters.push(eq(schema.bills.status, status as BillStatus));
  }
  if (customerId) {
    filters.push(eq(schema.bills.customer_id, Number(customerId)));
  }
  if (search) {
    const pattern = `%${search}%`;
    filters.push(
      or(
        like(schema.bills.bill_number, pattern),
        like(schema.bills.tracking_number, pattern),
        like(schema.bills.carrier, pattern)
      ) as SQL
    );
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;
  const billColumns = getTableColumns(schema.bills);

  const results = await db
    .select({
      ...billColumns,
      customer_name: schema.customers.name,
      customer_company: schema.customers.company,
    })
    .from(schema.bills)
    .leftJoin(schema.customers, eq(schema.bills.customer_id, schema.customers.id))
    .where(whereClause)
    .orderBy(desc(schema.bills.created_at));

  return c.json(results);
});

// GET /api/bills/:id
bills.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const billColumns = getTableColumns(schema.bills);
  const [bill] = await db
    .select({
      ...billColumns,
      customer_name: schema.customers.name,
      customer_company: schema.customers.company,
      customer_email: schema.customers.email,
      customer_phone: schema.customers.phone,
    })
    .from(schema.bills)
    .leftJoin(schema.customers, eq(schema.bills.customer_id, schema.customers.id))
    .where(eq(schema.bills.id, id))
    .limit(1);

  if (!bill) return c.json({ error: 'Bill not found' }, 404);

  // Fetch documents and events
  const documents = await db
    .select()
    .from(schema.billDocuments)
    .where(eq(schema.billDocuments.bill_id, id))
    .orderBy(desc(schema.billDocuments.uploaded_at));

  const events = await db
    .select()
    .from(schema.billEvents)
    .where(eq(schema.billEvents.bill_id, id))
    .orderBy(asc(schema.billEvents.created_at));

  return c.json({ ...bill, documents, events });
});

// POST /api/bills
bills.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<Bill>>();

  const billNumber = body.bill_number?.trim() || generateBillNumber();

  const [result] = await db
    .insert(schema.bills)
    .values({
      bill_number: billNumber,
      customer_id: body.customer_id ?? null,
      status: 'draft',
      carrier: body.carrier ?? null,
      tracking_number: body.tracking_number ?? null,
      service_type: body.service_type ?? null,
      freight_class: body.freight_class ?? null,
      origin_address: body.origin_address ?? null,
      origin_city: body.origin_city ?? null,
      origin_state: body.origin_state ?? null,
      origin_zip: body.origin_zip ?? null,
      destination_address: body.destination_address ?? null,
      destination_city: body.destination_city ?? null,
      destination_state: body.destination_state ?? null,
      destination_zip: body.destination_zip ?? null,
      weight: body.weight ?? null,
      weight_unit: body.weight_unit ?? 'lbs',
      pieces: body.pieces ?? null,
      description: body.description ?? null,
      amount: body.amount ?? null,
      currency: body.currency ?? 'USD',
      pickup_date: body.pickup_date ?? null,
      estimated_delivery: body.estimated_delivery ?? null,
    })
    .returning();

  // Record creation event
  if (result) {
    await db.insert(schema.billEvents).values({
      bill_id: result.id,
      event_type: 'created',
      to_status: 'draft',
      description: 'Bill created',
    });
  }

  return c.json(result, 201);
});

// PUT /api/bills/:id
bills.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<Bill>>();

  const [existing] = await db.select().from(schema.bills).where(eq(schema.bills.id, id)).limit(1);

  if (!existing) return c.json({ error: 'Bill not found' }, 404);

  const [result] = await db
    .update(schema.bills)
    .set({
      customer_id: body.customer_id ?? existing.customer_id,
      carrier: body.carrier ?? existing.carrier,
      tracking_number: body.tracking_number ?? existing.tracking_number,
      service_type: body.service_type ?? existing.service_type,
      freight_class: body.freight_class ?? existing.freight_class,
      origin_address: body.origin_address ?? existing.origin_address,
      origin_city: body.origin_city ?? existing.origin_city,
      origin_state: body.origin_state ?? existing.origin_state,
      origin_zip: body.origin_zip ?? existing.origin_zip,
      destination_address: body.destination_address ?? existing.destination_address,
      destination_city: body.destination_city ?? existing.destination_city,
      destination_state: body.destination_state ?? existing.destination_state,
      destination_zip: body.destination_zip ?? existing.destination_zip,
      weight: body.weight ?? existing.weight,
      weight_unit: body.weight_unit ?? existing.weight_unit,
      pieces: body.pieces ?? existing.pieces,
      description: body.description ?? existing.description,
      amount: body.amount ?? existing.amount,
      currency: body.currency ?? existing.currency,
      pickup_date: body.pickup_date ?? existing.pickup_date,
      estimated_delivery: body.estimated_delivery ?? existing.estimated_delivery,
      actual_delivery: body.actual_delivery ?? existing.actual_delivery,
      updated_at: sql`datetime('now')`,
    })
    .where(eq(schema.bills.id, id))
    .returning();

  return c.json(result);
});

// PUT /api/bills/:id/status
bills.put('/:id/status', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));
  const { status, description, created_by } = await c.req.json<{
    status: BillStatus;
    description?: string;
    created_by?: string;
  }>();

  const [bill] = await db.select().from(schema.bills).where(eq(schema.bills.id, id)).limit(1);

  if (!bill) return c.json({ error: 'Bill not found' }, 404);

  const allowedTransitions = STATUS_TRANSITIONS[bill.status];
  if (!allowedTransitions.includes(status)) {
    return c.json(
      {
        error: `Invalid transition from '${bill.status}' to '${status}'`,
        allowed: allowedTransitions,
      },
      422
    );
  }

  const [result] = await db
    .update(schema.bills)
    .set({
      status,
      actual_delivery: status === 'delivered' ? sql`datetime('now')` : bill.actual_delivery,
      updated_at: sql`datetime('now')`,
    })
    .where(eq(schema.bills.id, id))
    .returning();

  // Record event
  await db.insert(schema.billEvents).values({
    bill_id: id,
    event_type: 'status_change',
    from_status: bill.status,
    to_status: status,
    description: description ?? `Status changed to ${status}`,
    created_by: created_by ?? 'user',
  });

  return c.json(result);
});

// DELETE /api/bills/:id
bills.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [existing] = await db.select({ id: schema.bills.id }).from(schema.bills).where(eq(schema.bills.id, id)).limit(1);

  if (!existing) return c.json({ error: 'Bill not found' }, 404);

  await db.delete(schema.bills).where(eq(schema.bills.id, id));
  return c.json({ success: true });
});

// GET /api/bills/:id/events
bills.get('/:id/events', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const results = await db
    .select()
    .from(schema.billEvents)
    .where(eq(schema.billEvents.bill_id, id))
    .orderBy(asc(schema.billEvents.created_at));

  return c.json(results);
});

// GET /api/bills/:id/documents
bills.get('/:id/documents', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const results = await db
    .select()
    .from(schema.billDocuments)
    .where(eq(schema.billDocuments.bill_id, id))
    .orderBy(desc(schema.billDocuments.uploaded_at));

  return c.json(results);
});

// POST /api/bills/:id/documents
bills.post('/:id/documents', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [bill] = await db.select({ id: schema.bills.id }).from(schema.bills).where(eq(schema.bills.id, id)).limit(1);

  if (!bill) return c.json({ error: 'Bill not found' }, 404);

  const body = await c.req.json<{
    filename: string;
    content_type?: string;
    file_size?: number;
    document_type?: string;
    notes?: string;
  }>();

  if (!body.filename?.trim()) {
    return c.json({ error: 'filename is required' }, 400);
  }

  const [result] = await db
    .insert(schema.billDocuments)
    .values({
      bill_id: id,
      filename: body.filename.trim(),
      content_type: body.content_type ?? null,
      file_size: body.file_size ?? null,
      document_type: body.document_type ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  // Record event
  await db.insert(schema.billEvents).values({
    bill_id: id,
    event_type: 'document_added',
    description: `Document uploaded: ${body.filename}`,
  });

  return c.json(result, 201);
});

// DELETE /api/bills/:id/documents/:docId
bills.delete('/:id/documents/:docId', async (c) => {
  const db = getDb(c.env.DB);
  const billId = Number(c.req.param('id'));
  const docId = Number(c.req.param('docId'));

  const [existing] = await db
    .select({ filename: schema.billDocuments.filename })
    .from(schema.billDocuments)
    .where(and(eq(schema.billDocuments.id, docId), eq(schema.billDocuments.bill_id, billId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Document not found' }, 404);

  await db.delete(schema.billDocuments).where(eq(schema.billDocuments.id, docId));

  await db.insert(schema.billEvents).values({
    bill_id: billId,
    event_type: 'document_removed',
    description: `Document removed: ${existing.filename}`,
  });

  return c.json({ success: true });
});

export default bills;
