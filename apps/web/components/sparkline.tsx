'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';

/**
 * 轻量价格趋势图（纯 SVG，不引图表库）。
 * 拉取 product 的 price_history，绘制折线 + 面积。数据点 <2 不绘制。
 */
export function PriceSparkline({ productId }: { productId: number }) {
  const { data } = useQuery({
    queryKey: ['history', productId],
    queryFn: () => apiClient.priceHistory(productId),
    staleTime: 60_000,
  });

  const points = (data?.data ?? [])
    .map((p) => (p.price != null ? Number(p.price) : null))
    .filter((n): n is number => n != null && Number.isFinite(n));

  if (points.length < 2) {
    return <div className="muted" style={{ fontSize: 12 }}>暂无足够价格历史</div>;
  }

  const w = 320;
  const h = 64;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1]![0].toFixed(1)},${h - pad} L${coords[0]![0].toFixed(1)},${h - pad} Z`;

  return (
    <div>
      <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path className="area" d={area} />
        <path className="line" d={line} />
      </svg>
      <div className="row space" style={{ fontSize: 11 }}>
        <span className="muted">最低 {min.toLocaleString()}</span>
        <span className="muted">最高 {max.toLocaleString()}</span>
        <span className="muted">{points.length} 个数据点</span>
      </div>
    </div>
  );
}
