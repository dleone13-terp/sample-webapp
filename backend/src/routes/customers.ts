import { Hono } from 'hono';
import type { Env } from '../types';
import type { Customer } from '../types';

const customers = new Hono<{ Bindings: Env }>();

// GET /api/customers
customers.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM customers ORDER BY name ASC'
  ).all<Customer>();
  return c.json(results);
});

// GET /api/customers/:id
customers.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const customer = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE id = ?'
  )
    .bind(id)
    .first<Customer>();

  if (!customer) return c.json({ error: 'Customer not found' }, 404);
  return c.json(customer);
});

// POST /api/customers
customers.post('/', async (c) => {
  const body = await c.req.json<Partial<Customer>>();

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO customers (name, email, phone, company, address, city, state, zip, country, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      body.name.trim(),
      body.email ?? null,
      body.phone ?? null,
      body.company ?? null,
      body.address ?? null,
      body.city ?? null,
      body.state ?? null,
      body.zip ?? null,
      body.country ?? 'US',
      body.notes ?? null
    )
    .first<Customer>();

  return c.json(result, 201);
});

// PUT /api/customers/:id
customers.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<Customer>>();

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }

  const result = await c.env.DB.prepare(
    `UPDATE customers
     SET name = ?, email = ?, phone = ?, company = ?, address = ?, city = ?, state = ?, zip = ?, country = ?, notes = ?,
         updated_at = datetime('now')
     WHERE id = ?
     RETURNING *`
  )
    .bind(
      body.name.trim(),
      body.email ?? null,
      body.phone ?? null,
      body.company ?? null,
      body.address ?? null,
      body.city ?? null,
      body.state ?? null,
      body.zip ?? null,
      body.country ?? 'US',
      body.notes ?? null,
      id
    )
    .first<Customer>();

  if (!result) return c.json({ error: 'Customer not found' }, 404);
  return c.json(result);
});

// DELETE /api/customers/:id
customers.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));

  const existing = await c.env.DB.prepare(
    'SELECT id FROM customers WHERE id = ?'
  )
    .bind(id)
    .first();

  if (!existing) return c.json({ error: 'Customer not found' }, 404);

  await c.env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default customers;
