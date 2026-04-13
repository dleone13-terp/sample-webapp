import { Hono } from 'hono';
import { and, asc, desc, eq, getTableColumns, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { getDb, schema } from '../db';
import type { Env } from '../types';
import type { Bill, BillStatus } from '../types';
import { STATUS_TRANSITIONS } from '../types';

const bills = new Hono<{ Bindings: Env }>();
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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

function sanitizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'document.bin';
}

function createDocumentObjectKey(billId: number, filename: string): string {
  const safeFilename = sanitizeFilename(filename);
  return `bills/${billId}/${Date.now()}-${crypto.randomUUID()}-${safeFilename}`;
}

function getFilenameFromObjectKey(objectKey: string): string {
  const parts = objectKey.split('/');
  const tail = parts[parts.length - 1] ?? objectKey;
  const strippedPrefix = tail.replace(/^\d+-[0-9a-fA-F-]+-/, '');
  return strippedPrefix || tail;
}

async function hydrateDocument(
  bucket: R2Bucket,
  row: typeof schema.billDocuments.$inferSelect
): Promise<{
  id: number;
  bill_id: number;
  r2_object_key: string;
  filename: string | null;
  content_type: string | null;
  file_size: number | null;
  uploaded_at: string;
}> {
  const object = await bucket.head(row.r2_object_key);
  return {
    id: row.id,
    bill_id: row.bill_id,
    r2_object_key: row.r2_object_key,
    filename:
      object?.customMetadata?.originalFilename ??
      object?.customMetadata?.filename ??
      getFilenameFromObjectKey(row.r2_object_key),
    content_type: object?.httpMetadata?.contentType ?? null,
    file_size: object?.size ?? null,
    uploaded_at: row.uploaded_at,
  };
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
  const documentRows = await db
    .select()
    .from(schema.billDocuments)
    .where(eq(schema.billDocuments.bill_id, id))
    .orderBy(desc(schema.billDocuments.uploaded_at));

  const documents = await Promise.all(
    documentRows.map((row) => hydrateDocument(c.env.DOCUMENTS_BUCKET, row))
  );

  const events = await db
    .select()
    .from(schema.billEvents)
    .where(eq(schema.billEvents.bill_id, id))
    .orderBy(asc(schema.billEvents.created_at));

  return c.json({ ...bill, documents, events });
});

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

bills.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [existing] = await db.select({ id: schema.bills.id }).from(schema.bills).where(eq(schema.bills.id, id)).limit(1);

  if (!existing) return c.json({ error: 'Bill not found' }, 404);

  const documents = await db
    .select({ r2_object_key: schema.billDocuments.r2_object_key })
    .from(schema.billDocuments)
    .where(eq(schema.billDocuments.bill_id, id));

  await Promise.all(
    documents.map(async (doc) => {
      if (!doc.r2_object_key) return;
      await c.env.DOCUMENTS_BUCKET.delete(doc.r2_object_key);
    })
  );

  await db.delete(schema.bills).where(eq(schema.bills.id, id));
  return c.json({ success: true });
});

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

bills.get('/:id/documents', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const results = await db
    .select()
    .from(schema.billDocuments)
    .where(eq(schema.billDocuments.bill_id, id))
    .orderBy(desc(schema.billDocuments.uploaded_at));

  const hydrated = await Promise.all(results.map((row) => hydrateDocument(c.env.DOCUMENTS_BUCKET, row)));

  return c.json(hydrated);
});

bills.post('/:id/documents', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [bill] = await db.select({ id: schema.bills.id }).from(schema.bills).where(eq(schema.bills.id, id)).limit(1);

  if (!bill) return c.json({ error: 'Bill not found' }, 404);

  const form = await c.req.formData();
  const fileField = form.get('file');
  if (!(fileField instanceof File)) {
    return c.json({ error: 'file is required' }, 400);
  }

  if (fileField.size <= 0) {
    return c.json({ error: 'file must not be empty' }, 400);
  }

  if (fileField.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: `file exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` }, 413);
  }

  const filename = (form.get('filename')?.toString().trim() || fileField.name || '').trim();
  if (!filename) {
    return c.json({ error: 'filename is required' }, 400);
  }

  const objectKey = createDocumentObjectKey(id, filename);
  const fileBuffer = await fileField.arrayBuffer();

  await c.env.DOCUMENTS_BUCKET.put(objectKey, fileBuffer, {
    httpMetadata: {
      contentType: fileField.type || 'application/octet-stream',
    },
    customMetadata: {
      originalFilename: filename,
    },
  });

  let result: typeof schema.billDocuments.$inferSelect | undefined;
  try {
    const inserted = await db
      .insert(schema.billDocuments)
      .values({
        bill_id: id,
        r2_object_key: objectKey,
      })
      .returning();
    [result] = inserted;
  } catch (err) {
    await c.env.DOCUMENTS_BUCKET.delete(objectKey);
    throw err;
  }

  if (!result) {
    return c.json({ error: 'Failed to persist document metadata' }, 500);
  }

  // Record event
  await db.insert(schema.billEvents).values({
    bill_id: id,
    event_type: 'document_added',
    description: `Document uploaded: ${filename}`,
  });

  const hydrated = await hydrateDocument(c.env.DOCUMENTS_BUCKET, result);
  return c.json(hydrated, 201);
});

// GET /api/bills/:id/documents/:docId/download
bills.get('/:id/documents/:docId/download', async (c) => {
  const db = getDb(c.env.DB);
  const billId = Number(c.req.param('id'));
  const docId = Number(c.req.param('docId'));

  const [existing] = await db
    .select({
      r2_object_key: schema.billDocuments.r2_object_key,
    })
    .from(schema.billDocuments)
    .where(and(eq(schema.billDocuments.id, docId), eq(schema.billDocuments.bill_id, billId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Document not found' }, 404);
  if (!existing.r2_object_key) {
    return c.json({ error: 'Document is metadata-only and has no stored file' }, 409);
  }

  const object = await c.env.DOCUMENTS_BUCKET.get(existing.r2_object_key);
  if (!object || !object.body) {
    return c.json({ error: 'Stored file not found' }, 404);
  }

  const filename =
    object.customMetadata?.originalFilename ??
    object.customMetadata?.filename ??
    getFilenameFromObjectKey(existing.r2_object_key);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);

  return new Response(object.body, { headers });
});

bills.delete('/:id/documents/:docId', async (c) => {
  const db = getDb(c.env.DB);
  const billId = Number(c.req.param('id'));
  const docId = Number(c.req.param('docId'));

  const [existing] = await db
    .select({ r2_object_key: schema.billDocuments.r2_object_key })
    .from(schema.billDocuments)
    .where(and(eq(schema.billDocuments.id, docId), eq(schema.billDocuments.bill_id, billId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Document not found' }, 404);

  if (existing.r2_object_key) {
    await c.env.DOCUMENTS_BUCKET.delete(existing.r2_object_key);
  }

  const removedName = getFilenameFromObjectKey(existing.r2_object_key);

  await db.delete(schema.billDocuments).where(eq(schema.billDocuments.id, docId));

  await db.insert(schema.billEvents).values({
    bill_id: billId,
    event_type: 'document_removed',
    description: `Document removed: ${removedName}`,
  });

  return c.json({ success: true });
});

export default bills;
