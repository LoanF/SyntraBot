import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badge = cva('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium leading-5', {
  variants: {
    tone: {
      neutral: 'bg-surface-3 text-muted',
      brand: 'bg-accent-soft text-brand',
      success: 'bg-success/12 text-success',
      warning: 'bg-warning/12 text-warning',
      danger: 'bg-danger/12 text-danger',
      info: 'bg-info/12 text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/** Point d'état : la couleur ne porte jamais seule l'information (toujours accompagné d'un libellé). */
export function Dot({ tone = 'neutral' }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }) {
  const c = { neutral: 'bg-subtle', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', brand: 'bg-brand' }[tone];
  return <span aria-hidden className={cn('inline-block size-1.5 rounded-full', c)} />;
}
