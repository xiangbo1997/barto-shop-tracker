'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type Session } from '../../lib/api';

const HELP = `如何复制 cookies（适用于阿里云滑块站点）：

1. 在浏览器（Chrome/Edge）打开目标商品 URL，手动通过滑块验证
2. 打开 DevTools (⌘⌥I 或 F12) → Application 选项卡
3. 左侧 Storage → Cookies → 选中目标 host
4. 选择第一行 cookie，⌘A 全选 → 右键 → Show Requests With This Cookie 不要点
   推荐做法：装个 Cookie Editor 扩展，导出 JSON 粘贴进来
5. 同一面板 → Local Storage → 复制为 JSON 也粘贴进来（可选）
6. UA 留空使用默认；填了的话必须和你浏览器的 UA 一致

提示：HttpOnly cookie 必须从 DevTools 的 Application 面板复制，document.cookie 看不到`;

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.listSessions(),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    host: '',
    label: '',
    cookiesText: '',
    localStorageText: '',
    userAgent: '',
    note: '',
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createSession({
        host: form.host.trim(),
        label: form.label.trim() || null,
        cookiesText: form.cookiesText,
        localStorageText: form.localStorageText || null,
        userAgent: form.userAgent || null,
        note: form.note || null,
      }),
    onSuccess: (res) => {
      setWarnings(res.parseWarnings);
      setError(null);
      setForm({ host: '', label: '', cookiesText: '', localStorageText: '', userAgent: '', note: '' });
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err) => {
      setError((err as Error).message);
      setWarnings([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiClient.updateSession(id, { isActive } as never),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; status: string; note: string; error: string | null } | null>(null);

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      setTestingId(id);
      try {
        return await apiClient.testSession(id);
      } finally {
        setTestingId(null);
      }
    },
    onSuccess: (res, id) => {
      setTestResult({ id, status: res.status, note: res.note, error: res.error });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const sessions = data?.data ?? [];

  return (
    <div>
      <div className="row space" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>会话保管箱 <span className="muted" style={{ fontSize: 14 }}>· {sessions.length} 个</span></h1>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '取消' : '+ 添加会话'}
        </button>
      </div>

      <div style={{ padding: 12, background: 'var(--accent-soft)', borderRadius: 6, marginBottom: 16, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>
        {HELP}
      </div>

      {showForm ? (
        <div style={{ padding: 16, background: 'white', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
          <div className="col" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 12 }}>
              <input
                placeholder="host（如 pay.ldxp.cn）"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                placeholder="标签（可选，如 'pixelshop 主店铺'）"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Cookies（JSON 数组 或 "k=v; k=v" 格式）</label>
              <textarea
                value={form.cookiesText}
                onChange={(e) => setForm({ ...form, cookiesText: e.target.value })}
                placeholder={'[{"name":"sid","value":"...","domain":".pay.ldxp.cn","path":"/","httpOnly":true}, ...]\n或：sid=abc; uid=42'}
                style={{ minHeight: 120 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>localStorage（可选 JSON 对象）</label>
              <textarea
                value={form.localStorageText}
                onChange={(e) => setForm({ ...form, localStorageText: e.target.value })}
                placeholder={'{"theme":"dark","auth_token":"..."}'}
                style={{ minHeight: 60 }}
              />
            </div>
            <div className="row" style={{ gap: 12 }}>
              <input
                placeholder="User-Agent（留空用默认）"
                value={form.userAgent}
                onChange={(e) => setForm({ ...form, userAgent: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                placeholder="备注（可选）"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
            <div className="row">
              <button className="primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.host.trim() || !form.cookiesText.trim()}>
                {createMutation.isPending ? '保存中…' : '保存会话'}
              </button>
              <button onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
          {error ? <div style={{ marginTop: 12, padding: 10, background: 'var(--red-soft)', borderRadius: 6, color: 'var(--red)', fontSize: 12 }}>{error}</div> : null}
          {warnings.length > 0 ? (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--yellow-soft)', borderRadius: 6, color: 'var(--yellow)', fontSize: 12 }}>
              <strong>提示：</strong>
              <ul style={{ margin: '4px 0 0 16px' }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {testResult ? (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            background: testResult.status === 'ok' ? 'var(--green-soft)' : 'var(--red-soft)',
            color: testResult.status === 'ok' ? 'var(--green)' : 'var(--red)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          会话 #{testResult.id} 测试结果：<strong>{testResult.status === 'ok' ? '成功' : '失败'}</strong> — {testResult.note}
          {testResult.error ? <div style={{ marginTop: 4, fontSize: 11 }}>错误：{testResult.error}</div> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="empty">加载中…</div>
      ) : sessions.length === 0 ? (
        <div className="empty">还没有会话。对带强反爬的站点（如阿里云滑块）保存一份 cookies 后可绕过验证。</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>标签</th>
              <th>Cookies</th>
              <th>状态</th>
              <th>测试</th>
              <th>最后使用</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s: Session) => (
              <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.5 }}>
                <td className="mono">{s.host}</td>
                <td>{s.label ?? <span className="muted">—</span>}</td>
                <td>
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12 }}>{s.cookieCount} 个</summary>
                    <ul style={{ margin: '4px 0 0 16px', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                      {s.cookies.slice(0, 8).map((c) => (
                        <li key={c.name}>
                          {c.name}: {c.preview}
                          {c.httpOnly ? ' [HttpOnly]' : ''}
                          {c.secure ? ' [Secure]' : ''}
                        </li>
                      ))}
                      {s.cookies.length > 8 ? <li className="muted">… 还有 {s.cookies.length - 8} 个</li> : null}
                    </ul>
                  </details>
                </td>
                <td>
                  <span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>
                    {s.isActive ? '启用' : '停用'}
                  </span>
                </td>
                <td>
                  {s.lastTestStatus ? (
                    <span className={`badge ${s.lastTestStatus === 'ok' ? 'badge-green' : 'badge-red'}`}>
                      {s.lastTestStatus === 'ok' ? '通过' : '失败'}
                    </span>
                  ) : (
                    <span className="muted">未测试</span>
                  )}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : '—'}
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      onClick={() => testMutation.mutate(s.id)}
                      disabled={testingId === s.id}
                      title="发起一次测试请求验证 cookie 是否有效"
                    >
                      {testingId === s.id ? <span className="spinner" /> : '测试'}
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })}
                      title={s.isActive ? '停用此会话' : '启用此会话'}
                    >
                      {s.isActive ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`删除 ${s.host} 的会话？`)) deleteMutation.mutate(s.id);
                      }}
                      title="删除"
                      style={{ color: 'var(--red)' }}
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
