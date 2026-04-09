import { Hono } from 'hono';
import { and, asc, desc, eq, getTableColumns, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { getDb } from '../db';
import {
  bills as billsTable,
  billDocuments,
  billEvents,
  customers as customersTable,
} from '../db/schema';
import type { Env } from '../types';
import type { Bill, BillStatus } from '../types';
import { STATUS_TRANSITIONS } from '../types';

const bills = new Hono<{ Bindings: Env }>();

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

bills.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const status = c.req.query('status');
  const customerId = c.req.query('customer_id');
  const search = c.req.query('search');

  const conditions: SQL[] = [];

  if (status) {
    conditions.push(eq(billsTable.status, status as BillStatus));
  }

  if (customerId) {
    conditions.push(eq(billsTable.customer_id, Number(customerId)));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(billsTable.bill_number, pattern),
        like(billsTable.tracking_number, pattern),
        like(billsTable.carrier, pattern)
      )!
    );
  }

  const results = await db
    .select({
      ...getTableColumns(billsTable),
      customer_name: customersTable.name,
      customer_company: customersTable.company,
    })
    .from(billsTable)
    .leftJoin(customersTable, eq(billsTable.customer_id, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(billsTable.created_at));

  return c.json(results);
});

bills.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [bill] = await db
    .select({
      ...getTableColumns(billsTable),
      customer_name: customersTable.name,
      customer_company: customersTable.company,
      customer_email: customersTable.email,
      customer_phone: customersTable.phone,
    })
    .from(billsTable)
    .leftJoin(customersTable, eq(billsTable.customer_id, customersTable.id))
    .where(eq(billsTable.id, id))
    .limit(1);

  if (!bill) return c.json({ error: 'Bill not found' }, 404);

  const documents = await db
    .select()
    .from(billDocuments)
    .where(eq(billDocuments.bill_id, id))
    .orderBy(desc(billDocuments.uploaded_at));

  const events = await db
    .select()
    .from(billEvents)
    .where(eq(billEvents.bill_id, id))
    .orderBy(asc(billEvents.created_at));

  return c.json({ ...bill, documents, events });
});

bills.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<Bill>>();

  const billNumber = body.bill_number?.trim() || generateBillNumber();

  const [result] = await db
    .insert(billsTable)
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

  if (result) {
    await db.insert(billEvents).values({
      bill_id: result.id,
      event_type: 'created',
      to_status: 'draft',
      description: 'Bill created',
      created_by: 'system',
    });
  }

  return c.json(result, 201);
});

bills.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<Bill>>();

  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, id)).limit(1);

  if (!existing) return c.json({ error: 'Bill not found' }, 404);

  const [result] = await db
    .update(billsTable)
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
    .where(eq(billsTable.id, id))
    .returning();

  return c.json(result);
});

bills.put('/:id/status', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));
  const { status, description, created_by } = await c.req.json<{
    status: BillStatus;
    description?: string;
    created_by?: string;
  }>();

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id)).limit(1);

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

  const updateValues: {
    status: BillStatus;
    updated_at: ReturnType<typeof sql>;
    actual_delivery?: ReturnType<typeof sql>;
  } = {
    status,
    updated_at: sql`datetime('now')`,
  };
  if (status === 'delivered') {
    updateValues.actual_delivery = sql`datetime('now')`;
  }

  const [result] = await db
    .update(billsTable)
    .set(updateValues)
    .where(eq(billsTable.id, id))
    .returning();

  await db.insert(billEvents).values({
    bill_id: id,
    event_type: 'status_change',
    from_status: bill.status,
    to_status: status,
    description: description ?? `Status changed to ${status}`,
    created_by: created_by ?? 'user',
  });

  return c.json(result);
});

bills.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [existing] = await db.select({ id: billsTable.id }).from(billsTable).where(eq(billsTable.id, id)).limit(1);

  if (!existing) return c.json({ error: 'Bill not found' }, 404);

  await db.delete(billsTable).where(eq(billsTable.id, id));
  return c.json({ success: true });
});

bills.get('/:id/events', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const results = await db
    .select()
    .from(billEvents)
    .where(eq(billEvents.bill_id, id))
    .orderBy(asc(billEvents.created_at));

  return c.json(results);
});

bills.get('/:id/documents', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const results = await db
    .select()
    .from(billDocuments)
    .where(eq(billDocuments.bill_id, id))
    .orderBy(desc(billDocuments.uploaded_at));

  return c.json(results);
});

bills.post('/:id/documents', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [bill] = await db.select({ id: billsTable.id }).from(billsTable).where(eq(billsTable.id, id)).limit(1);

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
    .insert(billDocuments)
    .values({
      bill_id: id,
      filename: body.filename.trim(),
      content_type: body.content_type ?? null,
      file_size: body.file_size ?? null,
      document_type: body.document_type ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  await db.insert(billEvents).values({
    bill_id: id,
    event_type: 'document_added',
    description: `Document uploaded: ${body.filename}`,
    created_by: 'system',
  });

  return c.json(result, 201);
});

bills.delete('/:id/documents/:docId', async (c) => {
  const db = getDb(c.env.DB);
  const billId = Number(c.req.param('id'));
  const docId = Number(c.req.param('docId'));

  const [existing] = await db
    .select({ filename: billDocuments.filename })
    .from(billDocuments)
    .where(and(eq(billDocuments.id, docId), eq(billDocuments.bill_id, billId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Document not found' }, 404);

  await db.delete(billDocuments).where(eq(billDocuments.id, docId));

  await db.insert(billEvents).values({
    bill_id: billId,
    event_type: 'document_removed',
    description: `Document removed: ${existing.filename}`,
    created_by: 'system',
  });

  return c.json({ success: true });
});

export default bills;
