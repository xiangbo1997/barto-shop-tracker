'use client';

export function LogoutButton() {
  async function logout() {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <a
      onClick={(e) => {
        e.preventDefault();
        void logout();
      }}
      href="/login"
      style={{ marginLeft: 'auto', color: 'var(--muted)', cursor: 'pointer' }}
      title="退出登录"
    >
      退出
    </a>
  );
}
