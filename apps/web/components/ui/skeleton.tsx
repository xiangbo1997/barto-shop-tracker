import { cn } from '@/lib/utils';

/** 骨架占位块。配合 animate-pulse-soft 提供低强度脉动，符合 PRODUCT "motion minimal" 原则。 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse-soft rounded-md bg-black/10', className)} {...props} />;
}
