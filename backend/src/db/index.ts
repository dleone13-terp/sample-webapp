import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export function getDb(db: D1Database) {
  return drizzle(db, { schema });
}

export { schema };
