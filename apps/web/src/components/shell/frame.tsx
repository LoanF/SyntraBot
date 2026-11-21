'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { LogoMark } from '@/components/brand';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { SidebarContent, type SidebarProps } from './sidebar';

/** Rail latéral fixe en ≥1024 px ; en dessous, barre supérieure + tiroir. */
export function Frame({ children, ...props }: SidebarProps & { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface-1/60 lg:block">
        <SidebarContent {...props} />
      </aside>

      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/75 lg:hidden">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="-ml-1.5 grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" aria-label="Ouvrir le menu">
            <Menu className="size-4.5" />
          </DialogTrigger>
          <DialogContent side="left" title="Navigation" className="bg-surface-1">
            <div className="min-h-0 flex-1">
              <SidebarContent {...props} onNavigate={() => setOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
        <LogoMark size={18} />
        <span className="truncate text-[13px] font-medium text-fg">{props.projectName}</span>
      </header>

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</div>
      </main>
    </div>
  );
}
