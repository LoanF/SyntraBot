'use client';
import * as T from '@radix-ui/react-tooltip';

export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="anim-pop-in z-50 max-w-64 rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs leading-snug text-fg">
            {label}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
