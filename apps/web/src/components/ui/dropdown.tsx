'use client';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';

export const DropdownMenu = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({ className, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={6}
        className={cn('anim-pop-in z-50 min-w-56 rounded-lg border border-line-strong bg-surface-2 p-1 shadow-[0_16px_40px_-8px_rgb(0_0_0/0.6)]', className)}
        {...props}
      />
    </Menu.Portal>
  );
}
export function DropdownItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn('flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-fg outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover', className)}
      {...props}
    />
  );
}
export const DropdownLabel = ({ children }: { children: React.ReactNode }) => (
  <Menu.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-subtle">{children}</Menu.Label>
);
export const DropdownSeparator = () => <Menu.Separator className="my-1 h-px bg-line" />;
