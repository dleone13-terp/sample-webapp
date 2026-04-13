import { Hono } from 'hono';
import type { Env } from './types';
import customers from './routes/customers';
import bills from './routes/bills';
import { requireCloudflareAccessAuth } from './middleware/accessAuth';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', requireCloudflareAccessAuth);

// API routes
app.route('/api/customers', customers);
app.route('/api/bills', bills);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 for unmatched API routes
app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
