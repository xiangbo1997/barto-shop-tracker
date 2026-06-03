import { db, siteSessions, type SiteSession, type SessionCookie } from '@barto/db';
import { and, desc, eq } from 'drizzle-orm';

export interface InjectableSession {
  id: number;
  host: string;
  cookies: SessionCookie[];
  localStorage: Record<string, string> | null;
  userAgent: string | null;
}

export async function findActiveSessionForHost(host: string): Promise<InjectableSession | null> {
  const rows = await db
    .select()
    .from(siteSessions)
    .where(and(eq(siteSessions.host, host), eq(siteSessions.isActive, true)))
    .orderBy(desc(siteSessions.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    id: row.id,
    host: row.host,
    cookies: row.cookies,
    localStorage: row.localStorage ?? null,
    userAgent: row.userAgent ?? null,
  };
}

export async function markSessionUsed(id: number): Promise<void> {
  await db
    .update(siteSessions)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(siteSessions.id, id));
}

export async function recordSessionTest(
  id: number,
  status: 'ok' | 'failed',
  error: string | null
): Promise<void> {
  await db
    .update(siteSessions)
    .set({
      lastTestedAt: new Date(),
      lastTestStatus: status,
      lastTestError: error,
      updatedAt: new Date(),
    })
    .where(eq(siteSessions.id, id));
}

export type { SiteSession };
