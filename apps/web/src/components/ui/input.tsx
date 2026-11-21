import { cn } from '@/lib/cn';

/** Chaîne de style unique des champs : repos, survol, focus, désactivé et invalide. */
const field =
  'w-full rounded-md border border-line-strong bg-surface-1 px-3 text-[13px] text-fg placeholder:text-subtle transition-colors hover:border-line-hover focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger';

export const selectClass = cn(field, 'h-8 px-2.5');

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-8', className)} {...props} />;
}
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(selectClass, className)} {...props} />;
}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'min-h-20 py-2 leading-relaxed', className)} {...props} />;
}
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-[13px] font-medium text-fg', className)} {...props} />;
}
export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-snug text-subtle">{children}</p>;
}
