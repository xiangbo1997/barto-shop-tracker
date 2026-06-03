'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

function LoginInner() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/products';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        // 整页导航，让新 session cookie 在下次请求带上（middleware 据此放行）。
        window.location.href = from;
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || '登录失败');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-head">
          <div className="login-brand">barto</div>
          <div className="login-sub">海淘商品聚合比价</div>
        </div>

        <label className="login-field">
          <span>用户名</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>

        <label className="login-field">
          <span>密码</span>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              title={showPw ? '隐藏密码' : '显示密码'}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                height: 32, width: 32, padding: 0, background: 'transparent', border: 'none',
              }}
            >
              {showPw ? '🙈' : '👁'}
            </button>
          </div>
        </label>

        {error ? (
          <div className="login-error" role="alert">
            ⚠ {error}
          </div>
        ) : null}

        <Button type="submit" variant="primary" disabled={loading} className="login-submit">
          {loading ? '登录中…' : '登录'}
        </Button>

        <div className="login-foot">自用工具 · 仅限授权访问</div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
