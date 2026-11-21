'use client';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-surface-3 transition-colors duration-150 hover:bg-switch-hover data-[state=checked]:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-[3px] rounded-full bg-muted shadow-[0_1px_2px_rgb(0_0_0/0.4)] transition-transform duration-150 data-[state=checked]:translate-x-[19px] data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  );
}
