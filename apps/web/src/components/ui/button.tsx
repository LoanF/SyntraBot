import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export const buttonStyles = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-ink hover:bg-brand-hover',
        secondary: 'border border-line-strong bg-surface-2 text-fg hover:border-line-hover hover:bg-surface-3',
        ghost: 'text-muted hover:bg-hover hover:text-fg',
        danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
      },
      size: { sm: 'h-7 px-2.5 text-[13px]', md: 'h-8 px-3 text-[13px]', lg: 'h-10 px-4 text-sm', icon: 'size-8' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, disabled, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonStyles({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
