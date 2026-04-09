import { Hono } from 'hono';
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
  const status = c.req.query('status');
  const customerId = c.req.query('customer_id');
  const search = c.req.query('search');

  let query = `
    SELECT b.*, c.name as customer_name, c.company as customer_company
    FROM bills b
    LEFT JOIN customers c ON b.customer_id = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }
  if (customerId) {
    query += ' AND b.customer_id = ?';
    params.push(Number(customerId));
  }
  if (search) {
    query += ' AND (b.bill_number LIKE ? OR b.tracking_number LIKE ? OR b.carrier LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY b.created_at DESC';

  const { results } = await c.env.DB.prepare(query)
    .bind(...params)
    .all<Bill & { customer_name: string; customer_company: string }>();

  return c.json(results);
});

// GET /api/bills/:id
bills.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));

  const bill = await c.env.DB.prepare(
    `SELECT b.*, c.name as customer_name, c.company as customer_company,
            c.email as customer_email, c.phone as customer_phone
     FROM bills b
     LEFT JOIN customers c ON b.customer_id = c.id
     WHERE b.id = ?`
  )
    .bind(id)
    .first<Bill & { customer_name: string; customer_company: string; customer_email: string; customer_phone: string }>();

  if (!bill) return c.json({ error: 'Bill not found' }, 404);

  // Fetch documents and events
  const { results: documents } = await c.env.DB.prepare(
    'SELECT * FROM bill_documents WHERE bill_id = ? ORDER BY uploaded_at DESC'
  )
    .bind(id)
    .all();

  const { results: events } = await c.env.DB.prepare(
    'SELECT * FROM bill_events WHERE bill_id = ? ORDER BY created_at ASC'
  )
    .bind(id)
    .all();

  return c.json({ ...bill, documents, events });
});

// POST /api/bills
bills.post('/', async (c) => {
  const body = await c.req.json<Partial<Bill>>();

  const billNumber = body.bill_number?.trim() || generateBillNumber();

  const result = await c.env.DB.prepare(
    `INSERT INTO bills (
       bill_number, customer_id, status, carrier, tracking_number, service_type,
       freight_class, origin_address, origin_city, origin_state, origin_zip,
       destination_address, destination_city, destination_state, destination_zip,
       weight, weight_unit, pieces, description, amount, currency,
       pickup_date, estimated_delivery
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      billNumber,
      body.customer_id ?? null,
      'draft',
      body.carrier ?? null,
      body.tracking_number ?? null,
      body.service_type ?? null,
      body.freight_class ?? null,
      body.origin_address ?? null,
      body.origin_city ?? null,
      body.origin_state ?? null,
      body.origin_zip ?? null,
      body.destination_address ?? null,
      body.destination_city ?? null,
      body.destination_state ?? null,
      body.destination_zip ?? null,
      body.weight ?? null,
      body.weight_unit ?? 'lbs',
      body.pieces ?? null,
      body.description ?? null,
      body.amount ?? null,
      body.currency ?? 'USD',
      body.pickup_date ?? null,
      body.estimated_delivery ?? null
    )
    .first<Bill>();

  // Record creation event
  if (result) {
    await c.env.DB.prepare(
      `INSERT INTO bill_events (bill_id, event_type, to_status, description)
       VALUES (?, 'created', 'draft', 'Bill created')`
    )
      .bind(result.id)
      .run();
  }

  return c.json(result, 201);
});

// PUT /api/bills/:id
bills.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<Bill>>();

  const existing = await c.env.DB.prepare('SELECT * FROM bills WHERE id = ?')
    .bind(id)
    .first<Bill>();

  if (!existing) return c.json({ error: 'Bill not found' }, 404);

  const result = await c.env.DB.prepare(
    `UPDATE bills SET
       customer_id = ?, carrier = ?, tracking_number = ?, service_type = ?,
       freight_class = ?, origin_address = ?, origin_city = ?, origin_state = ?, origin_zip = ?,
       destination_address = ?, destination_city = ?, destination_state = ?, destination_zip = ?,
       weight = ?, weight_unit = ?, pieces = ?, description = ?, amount = ?, currency = ?,
       pickup_date = ?, estimated_delivery = ?, actual_delivery = ?,
       updated_at = datetime('now')
     WHERE id = ?
     RETURNING *`
  )
    .bind(
      body.customer_id ?? existing.customer_id,
      body.carrier ?? existing.carrier,
      body.tracking_number ?? existing.tracking_number,
      body.service_type ?? existing.service_type,
      body.freight_class ?? existing.freight_class,
      body.origin_address ?? existing.origin_address,
      body.origin_city ?? existing.origin_city,
      body.origin_state ?? existing.origin_state,
      body.origin_zip ?? existing.origin_zip,
      body.destination_address ?? existing.destination_address,
      body.destination_city ?? existing.destination_city,
      body.destination_state ?? existing.destination_state,
      body.destination_zip ?? existing.destination_zip,
      body.weight ?? existing.weight,
      body.weight_unit ?? existing.weight_unit,
      body.pieces ?? existing.pieces,
      body.description ?? existing.description,
      body.amount ?? existing.amount,
      body.currency ?? existing.currency,
      body.pickup_date ?? existing.pickup_date,
      body.estimated_delivery ?? existing.estimated_delivery,
      body.actual_delivery ?? existing.actual_delivery,
      id
    )
    .first<Bill>();

  return c.json(result);
});

// PUT /api/bills/:id/status
bills.put('/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const { status, description, created_by } = await c.req.json<{
    status: BillStatus;
    description?: string;
    created_by?: string;
  }>();

  const bill = await c.env.DB.prepare('SELECT * FROM bills WHERE id = ?')
    .bind(id)
    .first<Bill>();

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

  // Set actual_delivery if transitioning to delivered
  const actualDelivery =
    status === 'delivered' ? `datetime('now')` : 'actual_delivery';

  const result = await c.env.DB.prepare(
    `UPDATE bills
     SET status = ?,
         actual_delivery = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE actual_delivery END,
         updated_at = datetime('now')
     WHERE id = ?
     RETURNING *`
  )
    .bind(status, status, id)
    .first<Bill>();

  // Record event
  await c.env.DB.prepare(
    `INSERT INTO bill_events (bill_id, event_type, from_status, to_status, description, created_by)
     VALUES (?, 'status_change', ?, ?, ?, ?)`
  )
    .bind(
      id,
      bill.status,
      status,
      description ?? `Status changed to ${status}`,
      created_by ?? 'user'
    )
    .run();

  return c.json(result);
});

// DELETE /api/bills/:id
bills.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));

  const existing = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) return c.json({ error: 'Bill not found' }, 404);

  await c.env.DB.prepare('DELETE FROM bills WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// GET /api/bills/:id/events
bills.get('/:id/events', async (c) => {
  const id = Number(c.req.param('id'));

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM bill_events WHERE bill_id = ? ORDER BY created_at ASC'
  )
    .bind(id)
    .all();

  return c.json(results);
});

// GET /api/bills/:id/documents
bills.get('/:id/documents', async (c) => {
  const id = Number(c.req.param('id'));

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM bill_documents WHERE bill_id = ? ORDER BY uploaded_at DESC'
  )
    .bind(id)
    .all();

  return c.json(results);
});

// POST /api/bills/:id/documents
bills.post('/:id/documents', async (c) => {
  const id = Number(c.req.param('id'));

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(id)
    .first();

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

  const result = await c.env.DB.prepare(
    `INSERT INTO bill_documents (bill_id, filename, content_type, file_size, document_type, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      id,
      body.filename.trim(),
      body.content_type ?? null,
      body.file_size ?? null,
      body.document_type ?? null,
      body.notes ?? null
    )
    .first();

  // Record event
  await c.env.DB.prepare(
    `INSERT INTO bill_events (bill_id, event_type, description)
     VALUES (?, 'document_added', ?)`
  )
    .bind(id, `Document uploaded: ${body.filename}`)
    .run();

  return c.json(result, 201);
});

// DELETE /api/bills/:id/documents/:docId
bills.delete('/:id/documents/:docId', async (c) => {
  const billId = Number(c.req.param('id'));
  const docId = Number(c.req.param('docId'));

  const existing = await c.env.DB.prepare(
    'SELECT * FROM bill_documents WHERE id = ? AND bill_id = ?'
  )
    .bind(docId, billId)
    .first<{ filename: string }>();

  if (!existing) return c.json({ error: 'Document not found' }, 404);

  await c.env.DB.prepare('DELETE FROM bill_documents WHERE id = ?')
    .bind(docId)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO bill_events (bill_id, event_type, description)
     VALUES (?, 'document_removed', ?)`
  )
    .bind(billId, `Document removed: ${existing.filename}`)
    .run();

  return c.json({ success: true });
});

export default bills;
