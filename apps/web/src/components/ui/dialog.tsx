'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  side = 'center',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string; side?: 'center' | 'right' | 'left' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col border border-line-strong bg-surface-1 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.6)] focus:outline-none',
          side === 'center' && 'anim-pop-in left-1/2 top-1/2 max-h-[85dvh] w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg',
          side === 'right' && 'right-0 top-0 h-dvh w-[min(100vw,32rem)] border-y-0 border-r-0',
          side === 'left' && 'anim-sheet-in left-0 top-0 h-dvh w-[min(86vw,19rem)] border-y-0 border-l-0',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-fg">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className={description ? 'mt-1 text-[13px] text-muted' : 'sr-only'}>{description ?? title}</DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="-mr-1 grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg" aria-label="Fermer">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
