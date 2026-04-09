import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { customers as customersTable } from '../db/schema';
import type { Env } from '../types';
import type { Customer } from '../types';

const customers = new Hono<{ Bindings: Env }>();

// GET /api/customers
customers.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const results = await db.select().from(customersTable).orderBy(customersTable.name);
  return c.json(results as Customer[]);
});

// GET /api/customers/:id
customers.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id)).limit(1);

  if (!customer) return c.json({ error: 'Customer not found' }, 404);
  return c.json(customer as Customer);
});

// POST /api/customers
customers.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<Customer>>();

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }

  const [result] = await db
    .insert(customersTable)
    .values({
      name: body.name.trim(),
      email: body.email ?? null,
      phone: body.phone ?? null,
      company: body.company ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      country: body.country ?? 'US',
      notes: body.notes ?? null,
    })
    .returning();

  return c.json(result as Customer, 201);
});

// PUT /api/customers/:id
customers.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<Customer>>();

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }

  const [result] = await db
    .update(customersTable)
    .set({
      name: body.name.trim(),
      email: body.email ?? null,
      phone: body.phone ?? null,
      company: body.company ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      country: body.country ?? 'US',
      notes: body.notes ?? null,
      updated_at: sql`datetime('now')`,
    })
    .where(eq(customersTable.id, id))
    .returning();

  if (!result) return c.json({ error: 'Customer not found' }, 404);
  return c.json(result as Customer);
});

// DELETE /api/customers/:id
customers.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param('id'));

  const [existing] = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, id)).limit(1);

  if (!existing) return c.json({ error: 'Customer not found' }, 404);

  await db.delete(customersTable).where(eq(customersTable.id, id));
  return c.json({ success: true });
});

export default customers;
