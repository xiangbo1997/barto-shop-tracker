import { Hono } from 'hono';
import { db, siteSessions, type SessionCookie } from '@barto/db';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseCookies, parseLocalStorage, maskCookies } from '../lib/session-parser.ts';
import { scrapeTier1 } from '../crawler/tier1-browser.ts';
import { recordSessionTest } from '../crawler/session-store.ts';

export const sessionsRoute = new Hono();

const upsertSchema = z.object({
  host: z.string().trim().min(1),
  label: z.string().trim().nullable().optional(),
  cookiesText: z.string().min(1),
  localStorageText: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
});

function shapeRow(row: typeof siteSessions.$inferSelect) {
  return {
    id: row.id,
    host: row.host,
    label: row.label,
    cookieCount: row.cookies.length,
    cookies: maskCookies(row.cookies),
    hasLocalStorage: Boolean(row.localStorage && Object.keys(row.localStorage).length > 0),
    localStorageKeys: row.localStorage ? Object.keys(row.localStorage) : [],
    userAgent: row.userAgent,
    note: row.note,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    lastTestedAt: row.lastTestedAt,
    lastTestStatus: row.lastTestStatus,
    lastTestError: row.lastTestError,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

sessionsRoute.get('/', async (c) => {
  const rows = await db.select().from(siteSessions).orderBy(desc(siteSessions.updatedAt));
  return c.json({ data: rows.map(shapeRow) });
});

sessionsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const cookieParse = parseCookies(parsed.data.cookiesText);
  if (!cookieParse.ok || !cookieParse.data) {
    return c.json({ error: 'cookies 解析失败', details: cookieParse.errors }, 400);
  }

  const lsParse = parseLocalStorage(parsed.data.localStorageText ?? '');
  if (!lsParse.ok) {
    return c.json({ error: 'localStorage 解析失败', details: lsParse.errors }, 400);
  }

  const cookies: SessionCookie[] = cookieParse.data;
  const localStorage = lsParse.data && Object.keys(lsParse.data).length > 0 ? lsParse.data : null;

  const inserted = await db
    .insert(siteSessions)
    .values({
      host: parsed.data.host,
      label: parsed.data.label ?? null,
      cookies,
      localStorage,
      userAgent: parsed.data.userAgent ?? null,
      note: parsed.data.note ?? null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      isActive: parsed.data.isActive,
    })
    .returning();

  const row = inserted[0];
  if (!row) return c.json({ error: 'insert failed' }, 500);

  return c.json({
    data: shapeRow(row),
    parseWarnings: [...cookieParse.warnings, ...lsParse.warnings],
  });
});

sessionsRoute.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const partial = upsertSchema.partial().safeParse(body);
  if (!partial.success) return c.json({ error: partial.error.flatten() }, 400);

  const updates: Partial<typeof siteSessions.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (partial.data.label !== undefined) updates.label = partial.data.label;
  if (partial.data.note !== undefined) updates.note = partial.data.note;
  if (partial.data.userAgent !== undefined) updates.userAgent = partial.data.userAgent;
  if (partial.data.isActive !== undefined) updates.isActive = partial.data.isActive;
  if (partial.data.expiresAt !== undefined) {
    updates.expiresAt = partial.data.expiresAt ? new Date(partial.data.expiresAt) : null;
  }

  if (partial.data.cookiesText) {
    const cookieParse = parseCookies(partial.data.cookiesText);
    if (!cookieParse.ok || !cookieParse.data) {
      return c.json({ error: 'cookies 解析失败', details: cookieParse.errors }, 400);
    }
    updates.cookies = cookieParse.data;
  }

  if (partial.data.localStorageText !== undefined) {
    const lsParse = parseLocalStorage(partial.data.localStorageText ?? '');
    if (!lsParse.ok) {
      return c.json({ error: 'localStorage 解析失败', details: lsParse.errors }, 400);
    }
    updates.localStorage = lsParse.data && Object.keys(lsParse.data).length > 0 ? lsParse.data : null;
  }

  const [row] = await db.update(siteSessions).set(updates).where(eq(siteSessions.id, id)).returning();
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ data: shapeRow(row) });
});

sessionsRoute.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const [deleted] = await db.delete(siteSessions).where(eq(siteSessions.id, id)).returning({ id: siteSessions.id });
  return c.json({ deleted: deleted ? 1 : 0 });
});

sessionsRoute.post('/:id/test', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);

  const [row] = await db.select().from(siteSessions).where(eq(siteSessions.id, id)).limit(1);
  if (!row) return c.json({ error: 'not found' }, 404);

  const testUrl = `https://${row.host}/`;
  const result = await scrapeTier1(testUrl, {
    sessionOverride: {
      id: row.id,
      host: row.host,
      cookies: row.cookies,
      localStorage: row.localStorage ?? null,
      userAgent: row.userAgent ?? null,
    },
    timeoutMs: 25_000,
  });

  const looksLikeChallenge =
    !result.hit &&
    (result.fetchError?.includes('verify') ||
      result.fetchError?.toLowerCase().includes('captcha') ||
      result.fetchError === 'no product data extracted');

  const status = result.hit ? 'ok' : looksLikeChallenge ? 'failed' : 'failed';
  const errorMsg = result.fetchError ?? null;
  await recordSessionTest(id, status, errorMsg);

  return c.json({
    status,
    elapsedMs: result.elapsedMs,
    finalUrl: result.finalUrl,
    error: errorMsg,
    note:
      status === 'ok'
        ? '会话注入成功并能拿到页面数据'
        : '注入完成但页面未通过验证 — 检查 cookie 是否过期或 host 是否匹配',
  });
});
