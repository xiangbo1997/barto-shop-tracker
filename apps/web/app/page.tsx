import { redirect } from 'next/navigation';

// 首页直达商品列表（比价是核心任务，不应藏在导航页之后）。
// 借鉴 PRODUCT.md："Do not bury comparison behind multiple clicks."
export default function HomePage() {
  redirect('/products');
}
