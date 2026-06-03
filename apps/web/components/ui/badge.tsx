import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// 语义徽章。库存色借鉴 PriceAI DESIGN.md：浅底深字，确保对比度。
// 关键规则（PRODUCT "Status Text Rule"）：颜色绝不单独表达状态，必须配文字。
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight',
  {
    variants: {
      variant: {
        inStock: 'bg-stock-in-bg text-stock-in-text',
        outOfStock: 'bg-stock-out-bg text-stock-out-text',
        unknown: 'bg-stock-unknown-bg text-stock-unknown-text',
        warning: 'bg-fresh-aging-bg text-fresh-aging',
        neutral: 'bg-black/5 text-stock-unknown-text',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
