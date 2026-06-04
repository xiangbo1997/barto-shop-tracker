'use client';

import {
  CreditCard,
  Layers3,
  Mail,
  MessageSquareText,
  Package,
  Repeat,
  UserCircle2,
} from 'lucide-react';
import type { ReactNode } from 'react';

// 各分类对应的品牌 SVG（移植自 PriceAI public/brand-icons）。
const ICON_BY_CATEGORY: Record<string, string> = {
  chatgpt: '/brand-icons/chatgpt.svg',
  claude: '/brand-icons/claude.svg',
  gemini: '/brand-icons/gemini.svg',
  grok: '/brand-icons/grok.svg',
  email: '/brand-icons/gmail.svg',
};

// 无品牌 SVG 的分类用 lucide 线性图标兜底，保持视觉一致。
const LUCIDE_BY_CATEGORY: Record<string, ReactNode> = {
  'api-credit': <CreditCard size={18} className="shrink-0 text-[#5a6061]" />,
  sms: <MessageSquareText size={18} className="shrink-0 text-[#5a6061]" />,
  account: <UserCircle2 size={18} className="shrink-0 text-[#5a6061]" />,
  subscription: <Repeat size={18} className="shrink-0 text-[#5a6061]" />,
  physical: <Package size={18} className="shrink-0 text-[#5a6061]" />,
  email: <Mail size={18} className="shrink-0 text-[#5a6061]" />,
};

/**
 * 分类图标：品牌 SVG 优先（ChatGPT/Claude/Gemini/Grok/邮箱），
 * 其余用 lucide 线性图标，全部/其他用 Layers3 兜底。
 */
export function CategoryIcon({ category }: { category: string }) {
  if (!category || category === 'all' || category === 'other') {
    return <Layers3 size={18} className="shrink-0 text-[#5a6061]" />;
  }
  const src = ICON_BY_CATEGORY[category];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden="true" width={18} height={18} className="h-[18px] w-[18px] shrink-0 object-contain" />;
  }
  return (LUCIDE_BY_CATEGORY[category] as ReactNode) ?? <Layers3 size={18} className="shrink-0 text-[#5a6061]" />;
}
