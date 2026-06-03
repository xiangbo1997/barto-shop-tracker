import type { FreshnessStatus, StockStatus } from '@barto/shared';

export interface Product {
  id: number;
  url: string;
  sourceSite: string;
  title: string | null;
  imageUrl: string | null;
  brand: string | null;
  sku: string | null;
  currentPrice: string | null;
  currency: string | null;
  stockStatus: StockStatus;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  freshnessStatus: FreshnessStatus;
  fetchError: string | null;
  fetchTierUsed: number | null;
  groupId: number | null;
  userNote: string | null;
  manuallyEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductSort = 'available' | 'price' | 'updated' | 'created';

export interface ProductListSummary {
  total: number;
  inStock: number;
  outOfStock: number;
  unknown: number;
}

export interface ProductListResponse {
  data: Product[];
  count: number;
  summary: ProductListSummary;
  limit: number;
  offset: number;
  sort: ProductSort;
}

export interface JobEvent {
  type: 'job.started' | 'job.completed' | 'job.failed';
  productId: number;
  jobId: string | null;
  url: string;
  error?: string | null;
  hit?: boolean;
  at: number;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  listProducts: (params: { q?: string; stock?: string; source?: string; sort?: ProductSort } = {}) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, String(v));
    }
    return api<ProductListResponse>(`/products?${search.toString()}`);
  },
  ingest: (urls: string[]) =>
    api<{ accepted: number; rejected: number; items: Array<{ id: number; url: string; isNew: boolean }>; failed: Array<{ url: string; reason: string }> }>(
      '/ingest',
      { method: 'POST', body: JSON.stringify({ urls, triggerRefresh: true }) }
    ),
  refreshOne: (id: number) =>
    api<{ enqueued: boolean; jobId: string | null }>(`/refresh/${id}`, { method: 'POST', body: '{}' }),
  refreshAll: () =>
    api<{ total: number; enqueued: number; skipped: number }>(`/refresh`, {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    }),
  recentJobs: () => api<{ data: JobEvent[] }>('/jobs/recent'),

  listSessions: () => api<{ data: Session[] }>('/sessions'),
  createSession: (input: SessionUpsert) =>
    api<{ data: Session; parseWarnings: string[] }>('/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSession: (id: number, input: Partial<SessionUpsert>) =>
    api<{ data: Session }>(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteSession: (id: number) =>
    api<{ deleted: number }>(`/sessions/${id}`, { method: 'DELETE' }),
  testSession: (id: number) =>
    api<{ status: 'ok' | 'failed'; elapsedMs: number; finalUrl: string; error: string | null; note: string }>(
      `/sessions/${id}/test`,
      { method: 'POST', body: '{}' }
    ),
};

export interface Session {
  id: number;
  host: string;
  label: string | null;
  cookieCount: number;
  cookies: Array<{ name: string; preview: string; httpOnly?: boolean; secure?: boolean }>;
  hasLocalStorage: boolean;
  localStorageKeys: string[];
  userAgent: string | null;
  note: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUpsert {
  host: string;
  label?: string | null;
  cookiesText: string;
  localStorageText?: string | null;
  userAgent?: string | null;
  note?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
}
