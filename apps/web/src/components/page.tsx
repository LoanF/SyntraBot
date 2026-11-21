import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PageHeader({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        <h1 className="text-balance text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Panneau : surface unique, jamais imbriquée dans une autre carte. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface-1', className)} {...props} />;
}

export function PanelHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-subtle">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/** État vide pédagogique : explique l'écran et propose la suite. */
export function EmptyState({ title, children, action, className, icon: Icon = Inbox }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="mb-4 grid size-11 place-items-center rounded-lg border border-line-strong bg-surface-2 text-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {children ? <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[12px] text-muted', className)}>{children}</span>;
}

export function relativeTime(date: Date, now = new Date()): string {
  const s = Math.round((date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(Math.round(s), 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
