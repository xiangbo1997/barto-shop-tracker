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
  category: string | null;
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
  listProducts: (params: { q?: string; stock?: string; source?: string; category?: string; sort?: ProductSort } = {}) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, String(v));
    }
    return api<ProductListResponse>(`/products?${search.toString()}`);
  },
  categories: () => api<{ data: Record<string, number>; total: number }>('/products/categories'),
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

  // ── 商品组 / 比价 ──
  listGroups: () => api<{ data: ProductGroup[]; count: number }>('/groups'),
  getGroup: (id: number) => api<{ data: GroupDetail }>(`/groups/${id}`),
  createGroup: (input: { title?: string; fromProductId?: number }) =>
    api<{ data: ProductGroup }>('/groups', { method: 'POST', body: JSON.stringify(input) }),
  renameGroup: (id: number, title: string) =>
    api<{ data: ProductGroup }>(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteGroup: (id: number) => api<{ deleted: number }>(`/groups/${id}`, { method: 'DELETE' }),
  addGroupMembers: (id: number, productIds: number[]) =>
    api<{ added: number }>(`/groups/${id}/members`, { method: 'POST', body: JSON.stringify({ productIds }) }),
  removeGroupMember: (id: number, productId: number) =>
    api<{ removed: boolean }>(`/groups/${id}/members/${productId}`, { method: 'DELETE' }),
  suggestGroups: () => api<{ data: GroupSuggestion[] }>('/groups/suggest'),
  setProductGroup: (productId: number, groupId: number | null) =>
    api<{ data: Product }>(`/products/${productId}`, { method: 'PATCH', body: JSON.stringify({ groupId }) }),

  // ── 运行时配置 ──
  getSettings: () => api<{ data: Record<string, SettingItem> }>('/settings'),
  saveSettings: (values: Record<string, string>) =>
    api<{ ok: boolean; saved?: number; errors?: string[] }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(values),
    }),
  testLlm: () => api<{ ok: boolean; reply?: string; error?: string }>('/settings/test-llm', { method: 'POST', body: '{}' }),

  // ── 价格历史 / 监控 ──
  priceHistory: (productId: number) => api<{ data: PricePoint[]; count: number }>(`/products/${productId}/history`),
  listAdapters: () => api<{ data: AdapterHealth[]; count: number }>('/monitor/adapters'),
  crawlRuns: (params: { host?: string; status?: string } = {}) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) s.set(k, String(v));
    return api<{ data: CrawlRun[]; count: number }>(`/monitor/crawl-runs?${s.toString()}`);
  },

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

export interface SettingItem {
  value: string;
  sensitive: boolean;
  hasValue: boolean;
  masked?: string;
}

export interface GroupStats {
  total: number;
  inStock: number;
  outOfStock: number;
}

export interface ProductGroup {
  id: number;
  canonicalTitle: string;
  lowestPrice: string | null;
  lowestPriceCurrency: string | null;
  lowestPriceProductId: number | null;
  createdAt: string;
  updatedAt: string;
  stats: GroupStats;
  lowestChannel?: { sourceSite: string; title: string | null } | null;
}

export interface GroupDetail extends ProductGroup {
  members: Product[];
}

export interface GroupSuggestion {
  suggestedTitle: string;
  members: Array<{ id: number; title: string | null; sourceSite: string }>;
}

export interface PricePoint {
  price: string | null;
  currency: string | null;
  stockStatus: StockStatus;
  fetchedAt: string;
}

export interface AdapterHealth {
  host: string;
  healthStatus: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  successfulTier: number;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastUsedAt: string | null;
}

export interface CrawlRun {
  id: number;
  host: string | null;
  productId: number | null;
  triggeredBy: string;
  status: string;
  tierUsed: number | null;
  elapsedMs: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}
