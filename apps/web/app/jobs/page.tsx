'use client';

import { useEffect, useState } from 'react';
import type { JobEvent } from '../../lib/api';

const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  'job.started': { label: '开始', cls: 'badge-yellow' },
  'job.completed': { label: '成功', cls: 'badge-green' },
  'job.failed': { label: '失败', cls: 'badge-red' },
};

export default function JobsPage() {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/jobs/recent')
      .then((r) => r.json())
      .then((d: { data: JobEvent[] }) => {
        if (!cancelled) setEvents(d.data ?? []);
      });

    const es = new EventSource('/api/jobs/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const onMsg = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as JobEvent;
        setEvents((prev) => [...prev, event].slice(-200));
      } catch {}
    };
    es.addEventListener('job.started', onMsg);
    es.addEventListener('job.completed', onMsg);
    es.addEventListener('job.failed', onMsg);

    return () => {
      cancelled = true;
      es.close();
    };
  }, []);

  const reversed = [...events].reverse();

  return (
    <div>
      <div className="row space" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>任务中心</h1>
        <span className={`badge ${connected ? 'badge-green' : 'badge-gray'}`}>
          {connected ? '实时连接中' : '未连接'}
        </span>
      </div>

      {reversed.length === 0 ? (
        <div className="empty">暂无任务记录。导入 URL 或触发刷新后会显示在这里。</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>商品</th>
              <th>URL</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            {reversed.map((e, idx) => {
              const meta = TYPE_LABELS[e.type] ?? TYPE_LABELS['job.failed']!;
              return (
                <tr key={`${e.at}-${idx}`}>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {new Date(e.at).toLocaleTimeString()}
                  </td>
                  <td>
                    <span className={`badge ${meta.cls}`}>{meta.label}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>#{e.productId}</td>
                  <td className="muted" style={{ fontSize: 11, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.url}
                  </td>
                  <td style={{ color: 'var(--red)', fontSize: 11 }}>{e.error ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
