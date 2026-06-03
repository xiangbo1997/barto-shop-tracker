import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const queryClient = postgres(databaseUrl, { max: 10 });
export const db = drizzle(queryClient, { schema });
export { schema };
export * from './schema.ts';
export * from './health.ts';
