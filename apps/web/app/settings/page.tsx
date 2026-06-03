'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, type SettingItem } from '../../lib/api';

interface Field {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'select' | 'toggle';
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  needsRestart?: boolean;
}

interface Section {
  title: string;
  desc: string;
  fields: Field[];
}

const SECTIONS: Section[] = [
  {
    title: 'LLM 配置',
    desc: '用于店铺列表页的多商品智能展开。OpenAI 兼容接口。',
    fields: [
      { key: 'FEATURE_LLM_ENABLED', label: '启用 LLM', type: 'toggle' },
      { key: 'LLM_BASE_URL', label: 'Base URL', hint: '如 https://your-relay/v1' },
      { key: 'LLM_API_KEY', label: 'API Key', type: 'password' },
      { key: 'LLM_MODEL', label: '模型', hint: '如 gpt-4o-mini' },
    ],
  },
  {
    title: 'Tier 2 反爬平台',
    desc: '本地抓取失败时的兜底（过 Cloudflare + SPA 渲染）。',
    fields: [
      { key: 'FEATURE_TIER2_SCRAPE', label: '启用 Tier 2', type: 'toggle' },
      { key: 'SCRAPE_API_URL', label: '平台 URL' },
      { key: 'SCRAPE_API_KEY', label: 'API Key', type: 'password' },
      { key: 'SCRAPE_TIMEOUT_MS', label: '超时(ms)', hint: '过盾较慢，建议 ≥120000' },
    ],
  },
  {
    title: '抓取参数',
    desc: '即时生效（下次抓取读新值）。',
    fields: [
      {
        key: 'SCRAPER_DEFAULT_TIER',
        label: '默认抓取层级',
        type: 'select',
        options: [
          { value: '0', label: 'Tier 0 静态优先' },
          { value: '1', label: 'Tier 1 浏览器（默认）' },
          { value: '2', label: 'Tier 2 反爬平台' },
        ],
      },
      { key: 'SCRAPER_TIMEOUT_MS', label: '抓取超时(ms)' },
    ],
  },
  {
    title: '定时刷新',
    desc: 'cron 与开关改动需重启服务生效；批量大小即时生效。',
    fields: [
      { key: 'FEATURE_SCHEDULED_REFRESH', label: '启用定时刷新', type: 'toggle', needsRestart: true },
      { key: 'SCHEDULE_REFRESH_CRON', label: 'Cron 表达式', hint: '如 0 3 * * *（UTC）', needsRestart: true },
      { key: 'SCHEDULE_REFRESH_BATCH', label: '每轮刷新数量' },
    ],
  },
];

export default function SettingsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // 初始化表单：非敏感项填当前值，敏感项留空（占位显示已配置）
  useEffect(() => {
    if (!data?.data) return;
    const init: Record<string, string> = {};
    for (const [k, item] of Object.entries(data.data)) {
      init[k] = item.sensitive ? '' : item.value;
    }
    setForm(init);
  }, [data]);

  const settings = data?.data ?? {};

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      // 敏感项空值不提交（保留原 key）
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        const item = settings[k];
        if (item?.sensitive && v === '') continue;
        payload[k] = v;
      }
      const res = await apiClient.saveSettings(payload);
      if (res.ok) {
        setMsg({ ok: true, text: `已保存 ${res.saved} 项` });
        void refetch();
      } else {
        setMsg({ ok: false, text: (res.errors ?? ['保存失败']).join('；') });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  }

  async function testLlm() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await apiClient.testLlm();
      setMsg(res.ok ? { ok: true, text: `LLM 连通：${res.reply ?? 'ok'}` } : { ok: false, text: res.error ?? '失败' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'LLM 测试失败' });
    } finally {
      setTesting(false);
    }
  }

  if (isLoading) return <div className="empty">加载中…</div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>设置</h1>
      <p className="muted" style={{ margin: '0 0 24px', fontSize: 13 }}>
        运行时配置，保存后即时生效（标注「需重启」的除外）。敏感项已配置时显示掩码，留空表示不修改。
      </p>

      {SECTIONS.map((sec) => (
        <div key={sec.title} className="panel" style={{ padding: 24, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>{sec.title}</h2>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 16px' }}>{sec.desc}</p>
          {sec.fields.map((f) => {
            const item: SettingItem | undefined = settings[f.key];
            return (
              <div key={f.key} className="login-field" style={{ marginBottom: 14 }}>
                <span>
                  {f.label}
                  {f.needsRestart ? <span style={{ color: 'var(--yellow)', marginLeft: 6 }}>· 需重启</span> : null}
                </span>
                {f.type === 'toggle' ? (
                  <select value={form[f.key] ?? 'false'} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                ) : f.type === 'select' ? (
                  <select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options!.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type === 'password' ? 'password' : 'text'}
                    value={form[f.key] ?? ''}
                    placeholder={item?.sensitive && item.hasValue ? `已配置 ${item.masked ?? '••••'}（留空不改）` : f.hint ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {msg ? (
        <div className={msg.ok ? '' : 'login-error'} style={{ marginBottom: 16, color: msg.ok ? 'var(--green)' : undefined }}>
          {msg.ok ? '✓ ' : '⚠ '}{msg.text}
        </div>
      ) : null}

      <div className="row">
        <button className="primary" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存配置'}</button>
        <button onClick={testLlm} disabled={testing}>{testing ? '测试中…' : '测试 LLM 连通'}</button>
      </div>
    </div>
  );
}
