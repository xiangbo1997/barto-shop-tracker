'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import { fmtAgo } from '../../lib/format';
import { SiteIcon } from '@/components/site-icon';

const HEALTH_LABELS: Record<string, { label: string; cls: string }> = {
  healthy: { label: '健康', cls: 'badge-green' },
  failing: { label: '异常', cls: 'badge-red' },
  unknown: { label: '未知', cls: 'badge-gray' },
};

const TIER_NAMES: Record<number, string> = { 0: '静态', 1: '浏览器', 2: '反爬平台' };

export default function HealthPage() {
  const { data: adaptersData, isLoading: la } = useQuery({
    queryKey: ['adapters'],
    queryFn: () => apiClient.listAdapters(),
    refetchInterval: 30_000,
  });
  const { data: runsData, isLoading: lr } = useQuery({
    queryKey: ['crawl-runs'],
    queryFn: () => apiClient.crawlRuns(),
    refetchInterval: 30_000,
  });

  const adapters = adaptersData?.data ?? [];
  const runs = runsData?.data ?? [];

  return (
    <div>
      <h1>渠道健康</h1>
      <p className="muted" style={{ margin: '0 0 20px', fontSize: 13 }}>
        来源采集健康状态与最近抓取日志。连续失败 ≥3 次的来源会被标记异常，定时刷新自动跳过。
      </p>

      <h2>来源健康状态</h2>
      {la ? (
        <div className="empty">加载中…</div>
      ) : adapters.length === 0 ? (
        <div className="empty"><div className="empty-title">暂无来源记录</div><div>抓取若干商品后这里会显示各来源的健康状态。</div></div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>来源</th>
              <th>状态</th>
              <th>成功层级</th>
              <th>成功 / 失败</th>
              <th>连续失败</th>
              <th>最近成功</th>
              <th>最近错误</th>
            </tr>
          </thead>
          <tbody>
            {adapters.map((a) => {
              const hl = HEALTH_LABELS[a.healthStatus] ?? HEALTH_LABELS.unknown!;
              return (
                <tr key={a.host} className={a.healthStatus === 'failing' ? 'out-of-stock' : ''}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <SiteIcon sourceSite={a.host} />
                      <span style={{ fontSize: 13 }}>{a.host}</span>
                    </div>
                  </td>
                  <td><span className={`badge ${hl.cls}`}>{hl.label}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{TIER_NAMES[a.successfulTier] ?? `T${a.successfulTier}`}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--green)' }}>{a.successCount}</span>
                    {' / '}
                    <span style={{ color: 'var(--red)' }}>{a.failureCount}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 12, color: a.consecutiveFailures >= 3 ? 'var(--red)' : undefined }}>
                    {a.consecutiveFailures}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    <span suppressHydrationWarning>{fmtAgo(a.lastSuccessAt)}</span>
                  </td>
                  <td className="muted" style={{ fontSize: 11, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.lastError ?? ''}>
                    {a.lastError ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 32 }}>最近采集日志</h2>
      {lr ? (
        <div className="empty">加载中…</div>
      ) : runs.length === 0 ? (
        <div className="empty">暂无采集日志</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>状态</th>
              <th>来源</th>
              <th>触发</th>
              <th>层级</th>
              <th>耗时</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className={r.status === 'failed' ? 'out-of-stock' : ''}>
                <td className="muted" style={{ fontSize: 12 }}>
                  <span suppressHydrationWarning>{fmtAgo(r.startedAt)}</span>
                </td>
                <td><span className={`badge ${r.status === 'success' ? 'badge-green' : 'badge-red'}`}>{r.status === 'success' ? '成功' : '失败'}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{r.host ?? '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.triggeredBy}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.tierUsed != null ? (TIER_NAMES[r.tierUsed] ?? `T${r.tierUsed}`) : '—'}</td>
                <td className="mono muted" style={{ fontSize: 12 }}>{r.elapsedMs != null ? `${(r.elapsedMs / 1000).toFixed(1)}s` : '—'}</td>
                <td className="muted" style={{ fontSize: 11, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error ?? ''}>
                  {r.error ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
