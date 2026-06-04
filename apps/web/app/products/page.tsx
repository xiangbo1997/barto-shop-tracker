'use client';

import { Suspense, useCallback, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpDown,
  CheckCircle2,
  Database,
  Filter,
  LayoutGrid,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Star,
  Store,
  Table2,
} from 'lucide-react';
import { CATEGORY_LABELS } from '@barto/shared';
import { apiClient, type Product, type ProductGroup, type ProductSort } from '../../lib/api';
import { fmtAgo, fmtMoney, viewFreshness } from '../../lib/format';
import { SiteIcon } from '@/components/site-icon';
import { CategoryIcon } from '@/components/category-icon';

const STOCK_LABELS: Record<string, { label: string; cls: string }> = {
  in_stock: { label: '有货', cls: 'badge-green' },
  out_of_stock: { label: '缺货', cls: 'badge-red' },
  unknown: { label: '未知', cls: 'badge-gray' },
};

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'available', label: '有货优先·低价' },
  { value: 'price', label: '价格升序' },
  { value: 'updated', label: '最近更新' },
];

// 分类 tab 顺序（全部在前，其余按常见度）
const CAT_ORDER = ['chatgpt', 'claude', 'gemini', 'grok', 'api-credit', 'virtual-card', 'apple-id', 'email', 'sms', 'subscription', 'account', 'physical', 'other'];

function ProductsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const sort = (searchParams.get('sort') as ProductSort) ?? 'available';
  const category = searchParams.get('category') ?? '';
  const view = searchParams.get('view') ?? 'table';
  const stockFilter = searchParams.get('stock') ?? '';
  const minPrice = searchParams.get('minPrice') ?? '';
  const maxPrice = searchParams.get('maxPrice') ?? '';
  const favOnly = searchParams.get('favorited') === '1';

  const [qInput, setQInput] = useState(q);
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const toggleSel = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`/products?${next.toString()}`);
    },
    [router, searchParams]
  );

  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.categories(), refetchInterval: 60_000 });
  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => apiClient.listGroups(), refetchInterval: 30_000 });
  const { data, isLoading } = useQuery({
    queryKey: ['products', q, sort, category, stockFilter, minPrice, maxPrice, favOnly],
    queryFn: () =>
      apiClient.listProducts({
        q,
        sort,
        category: category || undefined,
        stock: stockFilter || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        favorited: favOnly ? '1' : undefined,
      }),
    refetchInterval: refreshingIds.size > 0 ? 2_000 : 30_000,
  });

  const refreshAll = useMutation({
    mutationFn: async () => apiClient.refreshAll(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const refreshOne = useMutation({
    mutationFn: async (id: number) => {
      setRefreshingIds((s) => new Set(s).add(id));
      try {
        return await apiClient.refreshOne(id);
      } finally {
        setTimeout(() => {
          setRefreshingIds((s) => { const n = new Set(s); n.delete(id); return n; });
          void queryClient.invalidateQueries({ queryKey: ['products'] });
        }, 25_000);
      }
    },
  });

  const delBatch = useMutation({
    mutationFn: async (ids: number[]) => apiClient.deleteProducts(ids),
    onSuccess: () => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  const delOne = useMutation({
    mutationFn: async (id: number) => apiClient.deleteProduct(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  const toggleFav = useMutation({
    mutationFn: async ({ id, favorited }: { id: number; favorited: boolean }) =>
      apiClient.toggleFavorite(id, favorited),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const products: Product[] = data?.data ?? [];
  const summary = data?.summary;
  const groups: ProductGroup[] = groupsData?.data ?? [];
  const ungrouped = products.filter((p) => p.groupId == null);
  const allSelected = ungrouped.length > 0 && ungrouped.every((p) => selected.has(p.id));
  const toggleAll = () =>
    setSelected((s) => (allSelected ? new Set() : new Set(ungrouped.map((p) => p.id))));
  const catCounts = catData?.data ?? {};
  const catTotal = catData?.total ?? 0;
  const favCount = catData?.favorited ?? 0;
  const activeCats = CAT_ORDER.filter((c) => (catCounts[c] ?? 0) > 0);
  const activeFilterCount = [stockFilter, minPrice, maxPrice].filter(Boolean).length;

  const resetFilters = () => {
    setQInput('');
    router.replace('/products');
  };

  return (
    <div>
      {/* 品牌头 + 右上 Metric（带图标卡片，对齐 PriceAI）*/}
      <div className="brand-head">
        <div className="brand-mark">
          <div className="brand-logo">🛰</div>
          <div>
            <div className="brand-name">barto</div>
            <div className="brand-sub">海淘比价雷达</div>
          </div>
        </div>
        {summary ? (
          <div className="metrics-top">
            <Metric label="商品组" value={groups.length} icon={<PackageCheck size={15} />} />
            <Metric label="报价" value={summary.total} icon={<Database size={15} />} />
            <Metric label="有货" value={summary.inStock} icon={<CheckCircle2 size={15} />} tone="green" />
            <Metric label="缺货" value={summary.outOfStock} icon={<Store size={15} />} tone="red" />
          </div>
        ) : null}
      </div>

      {/* 分类 tab 栏（带平台图标）+ 末尾「★ 收藏」页签 */}
      <div className="cat-tabs">
        <button className={`cat-tab ${!category && !favOnly ? 'active' : ''}`} onClick={() => setParam({ category: '', favorited: '' })}>
          <CategoryIcon category="all" />
          全部 <span className="cat-count">{catTotal}</span>
        </button>
        {activeCats.map((c) => (
          <button key={c} className={`cat-tab ${category === c && !favOnly ? 'active' : ''}`} onClick={() => setParam({ category: c, favorited: '' })}>
            <CategoryIcon category={c} />
            {CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c} <span className="cat-count">{catCounts[c]}</span>
          </button>
        ))}
        <button
          className={`cat-tab cat-tab-fav ${favOnly ? 'active' : ''}`}
          onClick={() => setParam({ favorited: favOnly ? '' : '1', category: '' })}
        >
          <Star size={16} className="fav-star" fill={favOnly ? 'currentColor' : 'none'} />
          收藏 <span className="cat-count">{favCount}</span>
        </button>
      </div>

      <div className="row space" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>全平台 标准商品报价</h1>
      </div>
      <p className="muted" style={{ margin: '0 0 20px', fontSize: 13 }}>主价格优先取有货最低价，缺货会明显标注</p>

      {/* 工具栏（图标化，对齐 PriceAI）*/}
      <div className="toolbar">
        <label className="search-field grow">
          <Search size={16} className="search-icon" />
          <input
            placeholder="搜索 ChatGPT、Gemini、邮箱…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setParam({ q: qInput })}
            onBlur={() => setParam({ q: qInput })}
          />
        </label>
        <button className="pill-tonal" onClick={() => setShowFilter((v) => !v)}>
          <Filter size={16} /> 筛选{activeFilterCount ? ` ${activeFilterCount}` : ''}
        </button>
        <div className="segmented">
          <button className={view === 'card' ? 'active' : ''} onClick={() => setParam({ view: 'card' })}>
            <LayoutGrid size={15} /> 卡片
          </button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setParam({ view: 'table' })}>
            <Table2 size={15} /> 表格
          </button>
        </div>
        <label className="pill-tonal sort-select">
          <ArrowUpDown size={16} />
          <select value={sort} onChange={(e) => setParam({ sort: e.target.value })}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <button className="pill-tonal" onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending}>
          <RefreshCw size={15} className={refreshAll.isPending ? 'spin' : ''} /> {refreshAll.isPending ? '触发中…' : '全量刷新'}
        </button>
        <a className="button cta" href="/import"><Plus size={16} /> 导入 URL</a>
      </div>

      {showFilter ? (
        <div className="filter-grid">
          <label className="filter-field">
            <span>商品类型</span>
            <select value={category} onChange={(e) => setParam({ category: e.target.value })}>
              <option value="">全部</option>
              {activeCats.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>库存</span>
            <select value={stockFilter} onChange={(e) => setParam({ stock: e.target.value })}>
              <option value="">全部库存</option>
              <option value="in_stock">有货</option>
              <option value="out_of_stock">缺货</option>
            </select>
          </label>
          <label className="filter-field">
            <span>最低价</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="¥"
              defaultValue={minPrice}
              onBlur={(e) => setParam({ minPrice: e.target.value.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && setParam({ minPrice: (e.target as HTMLInputElement).value.trim() })}
            />
          </label>
          <label className="filter-field">
            <span>最高价</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="¥"
              defaultValue={maxPrice}
              onBlur={(e) => setParam({ maxPrice: e.target.value.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && setParam({ maxPrice: (e.target as HTMLInputElement).value.trim() })}
            />
          </label>
          <button className="filter-reset" onClick={resetFilters}>重置筛选</button>
        </div>
      ) : null}

      {/* 商品组比价表 */}
      {groups.length > 0 ? (
        view === 'card' ? (
          <div className="group-grid">
            {groups.map((g) => <GroupCard key={g.id} group={g} />)}
          </div>
        ) : (
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>标准商品</th>
                <th>最低价</th>
                <th>库存</th>
                <th>最低渠道</th>
                <th>更新</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>{groups.map((g) => <GroupRow key={g.id} group={g} />)}</tbody>
          </table>
        )
      ) : null}

      {/* 未归组散件 */}
      <div className="section-divider">
        <span className="label">未归组商品</span>
        <span className="count">{ungrouped.length} 个</span>
        {selected.size > 0 ? (
          <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>已选 {selected.size} 项</span>
            <button
              onClick={() => {
                if (confirm(`确认删除选中的 ${selected.size} 个商品？`)) delBatch.mutate([...selected]);
              }}
              disabled={delBatch.isPending}
              style={{ color: 'var(--red)' }}
            >
              {delBatch.isPending ? '删除中…' : '删除选中'}
            </button>
            <button onClick={() => setSelected(new Set())}>取消</button>
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <div className="empty">加载中…</div>
      ) : ungrouped.length === 0 ? (
        <div className="empty">
          <div className="empty-title">{favOnly ? '还没有收藏的商品' : groups.length > 0 ? '全部已归组' : '还没有商品'}</div>
          <div>{favOnly ? '点击商品行的 ☆ 即可收藏' : <>放宽筛选，或 <a href="/import">导入第一批 URL →</a></>}</div>
        </div>
      ) : view === 'card' ? (
        <div className="group-grid">
          {ungrouped.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              refreshing={refreshingIds.has(p.id)}
              onRefresh={() => refreshOne.mutate(p.id)}
              onDelete={() => { if (confirm('删除该商品？')) delOne.mutate(p.id); }}
              onToggleFav={() => toggleFav.mutate({ id: p.id, favorited: !p.favorited })}
            />
          ))}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} title="全选" />
              </th>
              <th></th><th>商品</th><th>价格</th><th>库存</th><th>更新</th><th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>{ungrouped.map((p) => (
            <ProductRow
              key={p.id}
              p={p}
              refreshing={refreshingIds.has(p.id)}
              onRefresh={() => refreshOne.mutate(p.id)}
              selected={selected.has(p.id)}
              onToggleSel={() => toggleSel(p.id)}
              onDelete={() => { if (confirm('删除该商品？')) delOne.mutate(p.id); }}
              onToggleFav={() => toggleFav.mutate({ id: p.id, favorited: !p.favorited })}
            />
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone?: 'green' | 'red' }) {
  return (
    <div className="metric-top">
      <span className="label">{icon}{label}</span>
      <span className={`value ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

function catLabel(c: string | null): string {
  if (!c) return '其他';
  return CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c;
}

function GroupRow({ group }: { group: ProductGroup }) {
  const hasPrice = group.lowestPrice != null;
  const { inStock, outOfStock, total } = group.stats;
  const ch = group.lowestChannel;
  return (
    <tr>
      <td><span className="site-icon">{group.canonicalTitle.slice(0, 1)}</span></td>
      <td><a href={`/groups/${group.id}`} className="group-title" style={{ color: 'var(--ink)' }}>{group.canonicalTitle}</a></td>
      <td>{hasPrice ? <span className="price available">{fmtMoney(group.lowestPrice, group.lowestPriceCurrency)}</span> : <span className="price unavailable">¥ --</span>}</td>
      <td>
        <span className="status-inline">
          {inStock > 0 ? <span className="status-chip in">有货 {inStock}</span> : null}
          {outOfStock > 0 ? <span className="status-chip out">缺货 {outOfStock}</span> : null}
          <span>· 渠道 {total}</span>
        </span>
      </td>
      <td style={{ fontSize: 12, maxWidth: 200 }}>
        {ch ? (
          <div>
            <div style={{ color: 'var(--ink)' }}>{ch.sourceSite}</div>
            <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title ?? ''}</div>
          </div>
        ) : <span className="muted">—</span>}
      </td>
      <td className="muted" style={{ fontSize: 12 }}><span suppressHydrationWarning>{fmtAgo(group.updatedAt)}</span></td>
      <td style={{ textAlign: 'right' }}><a className="btn-outline" href={`/groups/${group.id}`}>查看对比</a></td>
    </tr>
  );
}

function GroupCard({ group }: { group: ProductGroup }) {
  const hasPrice = group.lowestPrice != null;
  const { inStock, outOfStock, total } = group.stats;
  const ch = group.lowestChannel;
  const outOnly = !hasPrice && outOfStock > 0;
  return (
    <a href={`/groups/${group.id}`} className={`gcard ${outOnly ? 'out' : ''}`}>
      <div className="gcard-head">
        <span className="site-icon">{group.canonicalTitle.slice(0, 1)}</span>
        <span className="gcard-title">{group.canonicalTitle}</span>
      </div>
      <div>
        {hasPrice ? (
          <div className="gcard-price">{fmtMoney(group.lowestPrice, group.lowestPriceCurrency)}</div>
        ) : (
          <div className="gcard-price na">¥ --</div>
        )}
        <div className="gcard-status">
          {inStock > 0 ? <span className="status-chip in">有货 {inStock}</span> : null}
          {outOfStock > 0 ? <span className="status-chip out">缺货 {outOfStock}</span> : null}
          <span className="muted" style={{ fontSize: 12 }}>· 渠道 {total}</span>
        </div>
      </div>
      {ch ? (
        <div className="gcard-channel">
          <div className="lbl">最低渠道</div>
          <div className="val">
            <SiteIcon sourceSite={ch.sourceSite} />
            <span className="t">{ch.sourceSite}{ch.title ? ` · ${ch.title}` : ''}</span>
          </div>
        </div>
      ) : null}
      <div className="gcard-foot">
        <span className="muted" style={{ fontSize: 12 }} suppressHydrationWarning>{fmtAgo(group.updatedAt)}</span>
        <span className="btn-outline">查看对比</span>
      </div>
    </a>
  );
}

function ProductCard({ p, refreshing, onRefresh, onDelete, onToggleFav }: { p: Product; refreshing: boolean; onRefresh: () => void; onDelete: () => void; onToggleFav: () => void }) {
  const inStock = p.stockStatus === 'in_stock';
  const fresh = viewFreshness(p);
  const sl = STOCK_LABELS[p.stockStatus] ?? STOCK_LABELS.unknown!;
  const outOnly = p.stockStatus === 'out_of_stock';
  return (
    <div className={`gcard ${outOnly ? 'out' : ''}`}>
      <div className="gcard-head">
        <SiteIcon sourceSite={p.sourceSite} />
        <span className="gcard-title">{p.title ?? <span className="muted">(无标题)</span>}</span>
        <button
          className={`fav-btn ${p.favorited ? 'on' : ''}`}
          onClick={onToggleFav}
          title={p.favorited ? '取消收藏' : '收藏'}
          style={{ marginLeft: 'auto' }}
        >
          <Star size={16} fill={p.favorited ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div>
        <div className={`gcard-price ${inStock && p.currentPrice ? '' : 'na'}`}>{fmtMoney(p.currentPrice, p.currency)}</div>
        <div className="gcard-status">
          <span className={`badge ${sl.cls}`}>{sl.label}</span>
          <span className="muted" style={{ fontSize: 12 }}>· {catLabel(p.category)}</span>
        </div>
      </div>
      {p.fetchError ? (
        <div style={{ fontSize: 11, color: 'var(--red)' }}>{p.fetchError}</div>
      ) : (
        <div className="gcard-channel">
          <div className="lbl">来源</div>
          <div className="val"><SiteIcon sourceSite={p.sourceSite} /><span className="t">{p.sourceSite}</span></div>
        </div>
      )}
      <div className="gcard-foot">
        <span className="muted" style={{ fontSize: 12 }} suppressHydrationWarning>{fmtAgo(p.verifiedAt ?? p.lastFetchedAt)}</span>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon" onClick={onRefresh} disabled={refreshing} title="刷新">{refreshing ? <span className="spinner" /> : '↻'}</button>
          <a className="button icon" href={p.url} target="_blank" rel="noreferrer" title="跳转原站">↗</a>
          <button className="icon" onClick={onDelete} title="删除" style={{ color: 'var(--red)' }}>✕</button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ p, refreshing, onRefresh, selected, onToggleSel, onDelete, onToggleFav }: { p: Product; refreshing: boolean; onRefresh: () => void; selected: boolean; onToggleSel: () => void; onDelete: () => void; onToggleFav: () => void }) {
  const inStock = p.stockStatus === 'in_stock';
  const fresh = viewFreshness(p);
  const sl = STOCK_LABELS[p.stockStatus] ?? STOCK_LABELS.unknown!;
  return (
    <tr className={p.stockStatus === 'out_of_stock' ? 'out-of-stock' : ''}>
      <td style={{ width: 36 }}><input type="checkbox" checked={selected} onChange={onToggleSel} /></td>
      <td style={{ width: 56 }}><SiteIcon sourceSite={p.sourceSite} /></td>
      <td>
        <div className="group-title" style={{ fontWeight: 600 }}>{p.title ?? <span className="muted">(无标题)</span>}</div>
        {p.fetchError ? <div style={{ fontSize: 11, color: 'var(--red)' }}>{p.fetchError}</div> : <div className="muted" style={{ fontSize: 11 }}>{catLabel(p.category)} · {p.sourceSite}</div>}
      </td>
      <td><span className={`price ${inStock && p.currentPrice ? 'available' : 'unavailable'}`} style={{ fontSize: 15 }}>{fmtMoney(p.currentPrice, p.currency)}</span></td>
      <td><span className={`badge ${sl.cls}`}>{sl.label}</span></td>
      <td className="muted" style={{ fontSize: 12 }}>
        <span suppressHydrationWarning>{fmtAgo(p.verifiedAt ?? p.lastFetchedAt)}</span>
        {fresh.isDegraded && fresh.label ? <div className="fresh-note">{fresh.label}</div> : null}
      </td>
      <td style={{ textAlign: 'right' }}>
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <button className={`icon fav-btn ${p.favorited ? 'on' : ''}`} onClick={onToggleFav} title={p.favorited ? '取消收藏' : '收藏'}>
            <Star size={15} fill={p.favorited ? 'currentColor' : 'none'} />
          </button>
          <button className="icon" onClick={onRefresh} disabled={refreshing} title="刷新">{refreshing ? <span className="spinner" /> : '↻'}</button>
          <a className="button icon" href={p.url} target="_blank" rel="noreferrer" title="跳转原站">↗</a>
          <button className="icon" onClick={onDelete} title="删除" style={{ color: 'var(--red)' }}>✕</button>
        </div>
      </td>
    </tr>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="empty">加载中…</div>}>
      <ProductsInner />
    </Suspense>
  );
}
