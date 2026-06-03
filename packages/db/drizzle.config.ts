import { defineConfig } from 'drizzle-kit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.env.DATABASE_URL) {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(process.cwd(), '../.env'),
  ];
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*(#.*)?$/);
        if (match && match[1] && !process.env[match[1]]) {
          process.env[match[1]] = match[2]!.replace(/^["']|["']$/g, '');
        }
      }
      if (process.env.DATABASE_URL) break;
    } catch {}
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set; load .env before running drizzle-kit');
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
