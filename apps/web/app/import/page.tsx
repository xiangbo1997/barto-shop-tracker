'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';

export default function ImportPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ accepted: number; rejected: number } | null>(null);

  const ingest = useMutation({
    mutationFn: async (urls: string[]) => apiClient.ingest(urls),
    onSuccess: (data) => {
      setResult({ accepted: data.accepted, rejected: data.rejected });
      if (data.accepted > 0) setText('');
    },
  });

  const onSubmit = () => {
    const urls = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    setResult(null);
    ingest.mutate(urls);
  };

  return (
    <div>
      <h1>导入 URL</h1>
      <p className="muted">每行一个 URL，可粘贴最多 200 条。导入后会立即触发抓取。</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="https://www.uniqlo.com/jp/ja/products/...&#10;https://www.shopbop.com/..."
      />

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={onSubmit} disabled={ingest.isPending || !text.trim()}>
          {ingest.isPending ? '导入中…' : '导入并触发抓取'}
        </button>
        <span className="muted">
          {text.split('\n').filter((l) => l.trim()).length} 条 URL
        </span>
      </div>

      {ingest.error ? (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--red-soft)', borderRadius: 6 }}>
          错误：{(ingest.error as Error).message}
        </div>
      ) : null}

      {result ? (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--green-soft)', borderRadius: 6 }}>
          已入库 <strong>{result.accepted}</strong> 条，跳过 <strong>{result.rejected}</strong> 条。
          <br />
          抓取在后台进行，可去 <a href="/jobs">任务中心</a> 看进度，或 <a href="/products">商品列表</a> 等数据出现。
        </div>
      ) : null}
    </div>
  );
}
